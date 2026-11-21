import crypto from 'node:crypto';

/**
 * Configuration of the SMS-verification features (Node reference). Fail-closed: invalid or dangerous settings stop the server at start-up
 * (createApp calls getAuthConfig()). Error messages name settings, never values.
 *
 * "Production" = NODE_ENV=production AND APP_ENV is neither "test" (the black-box harness: NODE_ENV=production + APP_ENV=test on a disposable DB)
 * nor "demo" (an explicitly acknowledged hackathon demonstration server, see below). In production the simulated provider, both simulated inboxes and
 * the demo operator token are REFUSED, so they can never operate there.
 *
 * APP_ENV=demo is a protected hackathon environment, not a loophole: it still enforces every authentication protection (codes, expiry, attempts, rate
 * limits, device trust, session versions) and additionally REFUSES TO START unless: SMS_PROVIDER=simulated (so only synthetic numbers can ever receive
 * a message), DEMO_ENV_ACK=synthetic-accounts-only, and strong OTP_HMAC_SECRET and SESSION_SECRET (the operator inbox, if enabled, additionally needs its own token).
 */
export interface AuthConfig {
  production: boolean;
  /** APP_ENV=demo: an explicitly acknowledged, protected hackathon demonstration server (NOT production). */
  demoEnvironment: boolean;
  smsProvider: 'none' | 'simulated';
  /** AUTH_REQUIRE_SMS=1: sign-in from a new device, SMS password recovery and phone proof need an SMS code (needs an SMS provider). Default OFF: phone number + password only, numbers stay UNVERIFIED. */
  requireSms: boolean;
  simulatedInbox: boolean;
  /** In-website "Demo SMS Inbox": a browser may read ONLY the simulated message of its own pending challenge. */
  demoInlineInbox: boolean;
  operatorToken: string | null;
  otpSecret: string;
  simulatedPrefix: string;
  trustedDeviceDays: number;
  otpTtlMs: number;
  maxAttempts: number;
  resendCooldownMs: number;
  maxSendsPerChallenge: number;
  limits: {phonePerHour: number; userPerHour: number; ipPerHour: number; verifyIpPer15Min: number; globalPerHour: number; forgotPerIdentPerHour: number};
  unverifiedClaimHoursNew: number;
  claimHoldMinutes: number;
  passwordMinLength: number;
}

const EPHEMERAL_OTP_SECRET = crypto.randomBytes(32).toString('hex');
export const SYNTHETIC_PREFIX_DEFAULT = '+23177000';

export class AuthConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid authentication configuration: ${problems.join('; ')}`);
  }
}

const intIn = (raw: string | undefined, name: string, def: number, min: number, max: number, problems: string[]): number => {
  const v = (raw ?? '').trim();
  if (v === '') return def;
  if (!/^\d{1,6}$/.test(v) || Number(v) < min || Number(v) > max) { problems.push(`${name} must be a whole number between ${min} and ${max}`); return def; }
  return Number(v);
};
const flag = (raw: string | undefined, name: string, problems: string[]): boolean => {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === '') return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  problems.push(`${name} must be 1/true/yes/on or 0/false/no/off`);
  return false;
};
const weak = (s: string): boolean => /^(change.?me|your[-_ ]|example|placeholder|replace|todo|dev[-_]|test[-_]?secret|password|secret|insecure|default|xxx)/i.test(s) || new Set(s).size < 8;

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const problems: string[] = [];
  const demoEnvironment = env.APP_ENV === 'demo';
  const production = env.NODE_ENV === 'production' && env.APP_ENV !== 'test' && !demoEnvironment;

  const providerRaw = (env.SMS_PROVIDER ?? 'none').trim().toLowerCase() || 'none';
  if (!['none', 'simulated'].includes(providerRaw)) problems.push('SMS_PROVIDER must be none or simulated (no live provider exists yet)');
  const smsProvider: 'none' | 'simulated' = providerRaw === 'simulated' ? 'simulated' : 'none';
  const simulatedInbox = flag(env.SIMULATED_INBOX, 'SIMULATED_INBOX', problems);
  const demoInlineInbox = flag(env.DEMO_INLINE_INBOX, 'DEMO_INLINE_INBOX', problems);
  const requireSms = flag(env.AUTH_REQUIRE_SMS, 'AUTH_REQUIRE_SMS', problems);
  if (requireSms && smsProvider === 'none') problems.push('AUTH_REQUIRE_SMS needs an SMS provider (SMS_PROVIDER); none is configured');
  const operatorRaw = (env.DEMO_OPERATOR_TOKEN ?? '').trim();

  if (production) {
    if (smsProvider === 'simulated') problems.push('SMS_PROVIDER=simulated is refused in production');
    if (simulatedInbox) problems.push('SIMULATED_INBOX is refused in production');
    if (demoInlineInbox) problems.push('DEMO_INLINE_INBOX is refused in production');
    if (operatorRaw) problems.push('DEMO_OPERATOR_TOKEN must not be set in production');
  }
  const otpRaw = env.OTP_HMAC_SECRET ?? '';
  if (production && (otpRaw.length < 32 || weak(otpRaw))) problems.push('OTP_HMAC_SECRET is required in production (at least 32 random characters)');
  if (!production && otpRaw && (otpRaw.length < 16 || weak(otpRaw))) problems.push('OTP_HMAC_SECRET is too short or looks like a placeholder');
  if (otpRaw && env.SESSION_SECRET && otpRaw === env.SESSION_SECRET) problems.push('OTP_HMAC_SECRET must differ from SESSION_SECRET');

  if (demoInlineInbox && smsProvider !== 'simulated') problems.push('DEMO_INLINE_INBOX requires SMS_PROVIDER=simulated');
  if (demoEnvironment) {
    if (smsProvider !== 'simulated') problems.push('APP_ENV=demo requires SMS_PROVIDER=simulated (only synthetic numbers may ever receive a message)');
    if (env.DEMO_ENV_ACK !== 'synthetic-accounts-only') problems.push('APP_ENV=demo requires DEMO_ENV_ACK=synthetic-accounts-only (confirms that only synthetic demonstration accounts are used)');
    if (otpRaw.length < 32 || weak(otpRaw)) problems.push('APP_ENV=demo requires OTP_HMAC_SECRET (at least 32 random characters)');
    if ((env.SESSION_SECRET ?? '').length < 32 || weak(env.SESSION_SECRET ?? '')) problems.push('APP_ENV=demo requires SESSION_SECRET (at least 32 random characters)');
  } else if (env.DEMO_ENV_ACK) problems.push('DEMO_ENV_ACK is only meaningful with APP_ENV=demo');

  let operatorToken: string | null = null;
  if (simulatedInbox) {
    if (smsProvider !== 'simulated') problems.push('SIMULATED_INBOX requires SMS_PROVIDER=simulated');
    if (operatorRaw.length < 32 || weak(operatorRaw)) problems.push('DEMO_OPERATOR_TOKEN must be set (at least 32 random characters) when SIMULATED_INBOX is on');
    else if (operatorRaw === otpRaw || operatorRaw === env.SESSION_SECRET) problems.push('DEMO_OPERATOR_TOKEN must be a separate secret');
    else operatorToken = operatorRaw;
  } else if (operatorRaw) problems.push('DEMO_OPERATOR_TOKEN is set but SIMULATED_INBOX is off');

  const prefix = (env.SIMULATED_SMS_ALLOWED_PREFIX ?? SYNTHETIC_PREFIX_DEFAULT).trim();
  if (!/^\+231\d{3,8}$/.test(prefix)) problems.push('SIMULATED_SMS_ALLOWED_PREFIX must look like +23177000');
  const trustedDeviceDays = intIn(env.TRUSTED_DEVICE_DAYS, 'TRUSTED_DEVICE_DAYS', 30, 1, 30, problems); // 30 days is the approved ceiling

  if (problems.length) throw new AuthConfigError(problems);
  return {
    production, demoEnvironment, smsProvider, requireSms, simulatedInbox, demoInlineInbox, operatorToken,
    otpSecret: otpRaw || EPHEMERAL_OTP_SECRET,
    simulatedPrefix: prefix,
    trustedDeviceDays,
    otpTtlMs: 5 * 60 * 1000,
    maxAttempts: 5,
    resendCooldownMs: 60 * 1000,
    maxSendsPerChallenge: 3,
    limits: {phonePerHour: 5, userPerHour: 5, ipPerHour: 20, verifyIpPer15Min: 30, globalPerHour: 200, forgotPerIdentPerHour: 3},
    unverifiedClaimHoursNew: 72,
    claimHoldMinutes: 15,
    passwordMinLength: 10,
  };
}

let cached: AuthConfig | null = null;
export function getAuthConfig(): AuthConfig { return (cached ??= loadAuthConfig()); }
/** Test hook: forget the cached configuration (tests that change process.env). */
export function resetAuthConfigForTests(): void { cached = null; }
