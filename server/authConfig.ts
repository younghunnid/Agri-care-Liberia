import crypto from 'node:crypto';

/**
 * Configuration of the SMS-verification features (Node reference). Fail-closed: invalid or dangerous settings stop the server at start-up
 * (createApp calls getAuthConfig()). Error messages name settings, never values.
 *
 * "Production" = NODE_ENV=production AND APP_ENV is not "test" (the black-box harness runs with NODE_ENV=production + APP_ENV=test on a disposable DB).
 * In production the simulated provider, the simulated inbox and the demo operator token are REFUSED, so they can never operate there.
 */
export interface AuthConfig {
  production: boolean;
  smsProvider: 'none' | 'simulated';
  simulatedInbox: boolean;
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
  const production = env.NODE_ENV === 'production' && env.APP_ENV !== 'test';

  const providerRaw = (env.SMS_PROVIDER ?? 'none').trim().toLowerCase() || 'none';
  if (!['none', 'simulated'].includes(providerRaw)) problems.push('SMS_PROVIDER must be none or simulated (no live provider exists yet)');
  const smsProvider: 'none' | 'simulated' = providerRaw === 'simulated' ? 'simulated' : 'none';
  const simulatedInbox = flag(env.SIMULATED_INBOX, 'SIMULATED_INBOX', problems);
  const operatorRaw = (env.DEMO_OPERATOR_TOKEN ?? '').trim();

  if (production) {
    if (smsProvider === 'simulated') problems.push('SMS_PROVIDER=simulated is refused in production');
    if (simulatedInbox) problems.push('SIMULATED_INBOX is refused in production');
    if (operatorRaw) problems.push('DEMO_OPERATOR_TOKEN must not be set in production');
  }
  const otpRaw = env.OTP_HMAC_SECRET ?? '';
  if (production && (otpRaw.length < 32 || weak(otpRaw))) problems.push('OTP_HMAC_SECRET is required in production (at least 32 random characters)');
  if (!production && otpRaw && (otpRaw.length < 16 || weak(otpRaw))) problems.push('OTP_HMAC_SECRET is too short or looks like a placeholder');
  if (otpRaw && env.SESSION_SECRET && otpRaw === env.SESSION_SECRET) problems.push('OTP_HMAC_SECRET must differ from SESSION_SECRET');

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
    production, smsProvider, simulatedInbox, operatorToken,
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
