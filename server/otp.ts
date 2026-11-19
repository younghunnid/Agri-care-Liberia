import crypto from 'node:crypto';
import {getDb} from './db.ts';
import {getAuthConfig} from './authConfig.ts';
import {getSmsProvider, SmsRejectedError, type SmsPurpose} from './sms/index.ts';

/**
 * Server-side one-time-code service (Node reference). Reusable for every purpose; the HTTP layer only passes values in and out.
 * Rules enforced here (porting notes: docs/SIMULATED_SMS_SECURITY.md):
 *  - six digits from crypto.randomInt; 5 minutes; 5 wrong attempts per challenge; resend cooldown and caps; per phone/user/IP/global limits;
 *  - only a keyed digest is stored: HMAC-SHA256(key, challengeId|purpose|userId|phone|code): a code cannot be replayed for another user, phone,
 *    purpose or challenge;
 *  - a challenge is bound to the browser that started it by a random secret (its SHA-256 is stored, the secret travels in an HttpOnly cookie);
 *  - every state change is ONE conditional UPDATE (status='pending' AND not expired AND attempts<max ...) whose affected-row count decides success,
 *    so concurrent or replayed submissions produce exactly one success;
 *  - codes are never logged, returned, or stored in plaintext.
 */
export type Purpose = SmsPurpose;

export class OtpError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'SMS_UNAVAILABLE' | 'PHONE_NOT_ALLOWED' | 'COOLDOWN' | 'TOO_MANY_SENDS' | 'NOT_FOUND',
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export interface ChallengeRow {
  id: number;
  public_id: string;
  user_id: number | null;
  purpose: Purpose;
  phone: string;
  target_phone: string | null;
  parent_id: number | null;
  code_digest: string;
  binding_hash: string;
  status: 'pending' | 'verified' | 'consumed' | 'superseded' | 'locked' | 'expired' | 'send_failed';
  attempts: number;
  send_count: number;
  created_ms: number;
  expires_ms: number;
  last_sent_ms: number;
  verified_ms: number | null;
  consumed_ms: number | null;
  ip_hash: string;
}

const hmac = (label: string, value: string): string => crypto.createHmac('sha256', crypto.createHmac('sha256', getAuthConfig().otpSecret).update(label).digest()).update(value).digest('hex');
export const keyHash = (label: string, value: string): string => hmac(`key:${label}`, value).slice(0, 32);
const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');
const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const codeDigest = (publicId: string, purpose: Purpose, userId: number | null, phone: string, code: string): string =>
  hmac('otp-v1', `${publicId}|${purpose}|${userId ?? 0}|${phone}|${code}`);

export function generateCode(): string { return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); }

export function maskPhone(phone: string): string {
  const m = /^\+231(\d{9})$/.exec(phone);
  return m ? `+231 ••• ••• ${m[1].slice(-3)}` : 'No phone on file';
}

const smsText = (code: string): string => `Agri-Advisory Liberia: your verification code is ${code}. It expires in 5 minutes. Never share it with anyone.`;

function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try { const r = fn(); db.exec('COMMIT;'); return r; } catch (e) { db.exec('ROLLBACK;'); throw e; }
}

/** Sliding-window limiter. true = allowed (and recorded). Keys are hashes, never raw phone numbers or IPs. */
export function takeRate(bucket: string, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return tx(() => {
    const db = getDb();
    db.prepare('DELETE FROM otp_rate_events WHERE created_ms < ?').run(now - 24 * 3600 * 1000);
    const c = (db.prepare('SELECT COUNT(*) AS c FROM otp_rate_events WHERE bucket = ? AND key_hash = ? AND created_ms > ?').get(bucket, key, now - windowMs) as {c: number}).c;
    if (c >= limit) return false;
    db.prepare('INSERT INTO otp_rate_events (bucket, key_hash, created_ms) VALUES (?, ?, ?)').run(bucket, key, now);
    return true;
  });
}

function sendLimits(phone: string, userId: number | null, ip: string): void {
  const L = getAuthConfig().limits; const H = 3600 * 1000;
  const ok =
    takeRate('sms-phone', keyHash('phone', phone), L.phonePerHour, H) &&
    (userId === null || takeRate('sms-user', keyHash('user', String(userId)), L.userPerHour, H)) &&
    takeRate('sms-ip', keyHash('ip', ip || 'unknown'), L.ipPerHour, H) &&
    takeRate('sms-global', 'all', L.globalPerHour, H);
  if (!ok) throw new OtpError('RATE_LIMITED', 429, 'Too many verification messages were requested. Please wait before trying again.', 3600);
}

async function deliver(row: {id: number}, phone: string, purpose: Purpose, code: string): Promise<void> {
  try {
    await getSmsProvider().send(phone, smsText(code), purpose);
  } catch (e) {
    getDb().prepare("UPDATE verification_challenges SET status = 'send_failed' WHERE id = ? AND status = 'pending'").run(row.id);
    if (e instanceof SmsRejectedError) throw new OtpError('PHONE_NOT_ALLOWED', 422, e.message);
    throw new OtpError('SMS_UNAVAILABLE', 503, 'Verification messages cannot be sent right now. Please try again later.');
  }
}

export interface StartInput {
  userId: number | null;
  purpose: Purpose;
  /** Number the code is sent to (E.164). */
  phone: string;
  targetPhone?: string | null;
  parentId?: number | null;
  ip: string;
}
export interface Started { publicId: string; bindingSecret: string; expiresMs: number; resendAfterMs: number }

export async function startChallenge(input: StartInput): Promise<Started> {
  const cfg = getAuthConfig();
  if (getSmsProvider().name === 'none') throw new OtpError('SMS_UNAVAILABLE', 503, 'Verification messages cannot be sent right now. Please try again later.');
  sendLimits(input.phone, input.userId, input.ip);
  const publicId = crypto.randomBytes(16).toString('hex');
  const bindingSecret = crypto.randomBytes(24).toString('hex');
  const code = generateCode();
  const now = Date.now();
  const row = tx(() => {
    const db = getDb();
    if (input.userId !== null) db.prepare("UPDATE verification_challenges SET status = 'superseded' WHERE user_id = ? AND purpose = ? AND status IN ('pending', 'verified')").run(input.userId, input.purpose);
    else db.prepare("UPDATE verification_challenges SET status = 'superseded' WHERE user_id IS NULL AND phone = ? AND purpose = ? AND status IN ('pending', 'verified')").run(input.phone, input.purpose);
    const r = db.prepare(
      `INSERT INTO verification_challenges (public_id, user_id, purpose, phone, target_phone, parent_id, code_digest, binding_hash, created_ms, expires_ms, last_sent_ms, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(publicId, input.userId, input.purpose, input.phone, input.targetPhone ?? null, input.parentId ?? null,
      codeDigest(publicId, input.purpose, input.userId, input.phone, code), sha256(bindingSecret), now, now + cfg.otpTtlMs, now, keyHash('ip', input.ip || 'unknown'));
    return {id: Number(r.lastInsertRowid)};
  });
  await deliver(row, input.phone, input.purpose, code);
  return {publicId, bindingSecret, expiresMs: now + cfg.otpTtlMs, resendAfterMs: now + cfg.resendCooldownMs};
}

export function findChallenge(publicId: string | undefined, bindingSecret: string | undefined): ChallengeRow | null {
  if (!publicId || !bindingSecret || !/^[a-f0-9]{32}$/.test(publicId) || !/^[a-f0-9]{48}$/.test(bindingSecret)) return null;
  const row = getDb().prepare('SELECT * FROM verification_challenges WHERE public_id = ?').get(publicId) as ChallengeRow | undefined;
  return row && safeEqual(row.binding_hash, sha256(bindingSecret)) ? row : null;
}

/** Cookie value format: "<publicId>.<bindingSecret>". */
export function parseChallengeCookie(v: unknown): {publicId?: string; secret?: string} {
  if (typeof v !== 'string') return {};
  const [publicId, secret] = v.split('.');
  return {publicId, secret};
}

export type VerifyResult =
  | {ok: true; row: ChallengeRow}
  | {ok: false; reason: 'invalid' | 'locked' | 'rate_limited'; attemptsLeft?: number; row?: ChallengeRow};

/** `onSuccess`: 'consumed' ends the challenge; 'verified' keeps it as a single-use grant for a following step (password reset, phone change). */
export function verifyChallenge(input: {publicId?: string; secret?: string; purpose: Purpose; code: unknown; ip: string; onSuccess: 'consumed' | 'verified'}): VerifyResult {
  const cfg = getAuthConfig();
  if (!takeRate('verify-ip', keyHash('ip', input.ip || 'unknown'), cfg.limits.verifyIpPer15Min, 15 * 60 * 1000)) return {ok: false, reason: 'rate_limited'};
  return tx((): VerifyResult => {
    const db = getDb();
    const row = findChallenge(input.publicId, input.secret);
    if (!row || row.purpose !== input.purpose) return {ok: false, reason: 'invalid'};
    const now = Date.now();
    if (row.status === 'locked') return {ok: false, reason: 'locked', row};
    if (row.status !== 'pending') return {ok: false, reason: 'invalid', row};
    if (now >= row.expires_ms) {
      db.prepare("UPDATE verification_challenges SET status = 'expired' WHERE id = ? AND status = 'pending'").run(row.id);
      return {ok: false, reason: 'invalid', row};
    }
    if (row.attempts >= cfg.maxAttempts) {
      db.prepare("UPDATE verification_challenges SET status = 'locked' WHERE id = ? AND status = 'pending'").run(row.id);
      return {ok: false, reason: 'locked', row};
    }
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    const good = /^\d{6}$/.test(code) && safeEqual(row.code_digest, codeDigest(row.public_id, row.purpose, row.user_id, row.phone, code));
    if (!good) {
      // The attempt is counted only while the challenge is still pending and below the cap (one conditional UPDATE).
      db.prepare("UPDATE verification_challenges SET attempts = attempts + 1 WHERE id = ? AND status = 'pending' AND attempts < ?").run(row.id, cfg.maxAttempts);
      const left = Math.max(0, cfg.maxAttempts - (row.attempts + 1));
      if (left === 0) {
        db.prepare("UPDATE verification_challenges SET status = 'locked' WHERE id = ? AND status = 'pending'").run(row.id);
        return {ok: false, reason: 'locked', row};
      }
      return {ok: false, reason: 'invalid', attemptsLeft: left, row};
    }
    const col = input.onSuccess === 'consumed' ? 'consumed_ms' : 'verified_ms';
    const res = db.prepare(`UPDATE verification_challenges SET status = ?, ${col} = ? WHERE id = ? AND status = 'pending' AND expires_ms > ? AND attempts < ?`)
      .run(input.onSuccess, now, row.id, now, cfg.maxAttempts);
    if (Number(res.changes) !== 1) return {ok: false, reason: 'invalid', row};
    return {ok: true, row: {...row, status: input.onSuccess}};
  });
}

/** Single use of a previously verified grant (password reset / phone change). Returns the row only for the one caller that wins. */
export function consumeVerified(publicId: string | undefined, secret: string | undefined, purpose: Purpose, maxAgeMs: number): ChallengeRow | null {
  return tx(() => {
    const row = findChallenge(publicId, secret);
    if (!row || row.purpose !== purpose || row.status !== 'verified') return null;
    const now = Date.now();
    const res = getDb().prepare("UPDATE verification_challenges SET status = 'consumed', consumed_ms = ? WHERE id = ? AND status = 'verified' AND verified_ms > ?").run(now, row.id, now - maxAgeMs);
    return Number(res.changes) === 1 ? row : null;
  });
}

/** Returns the verified grant WITHOUT consuming it (used to check a prerequisite). */
export function peekVerified(publicId: string | undefined, secret: string | undefined, purpose: Purpose, maxAgeMs: number): ChallengeRow | null {
  const row = findChallenge(publicId, secret);
  if (!row || row.purpose !== purpose || row.status !== 'verified' || row.verified_ms === null || row.verified_ms <= Date.now() - maxAgeMs) return null;
  return row;
}

export async function resendChallenge(publicId: string | undefined, secret: string | undefined, ip: string): Promise<{expiresMs: number; resendAfterMs: number; row: ChallengeRow}> {
  const cfg = getAuthConfig();
  const row = findChallenge(publicId, secret);
  const now = Date.now();
  if (!row || row.status !== 'pending' || now >= row.expires_ms || row.attempts >= cfg.maxAttempts) throw new OtpError('NOT_FOUND', 400, 'This verification request has expired. Please start again.');
  if (now - row.last_sent_ms < cfg.resendCooldownMs) {
    throw new OtpError('COOLDOWN', 429, 'Please wait before asking for another code.', Math.ceil((cfg.resendCooldownMs - (now - row.last_sent_ms)) / 1000));
  }
  if (row.send_count >= cfg.maxSendsPerChallenge) throw new OtpError('TOO_MANY_SENDS', 429, 'The maximum number of codes was sent for this request. Please start again later.', 3600);
  sendLimits(row.phone, row.user_id, ip);
  const code = generateCode();
  const res = getDb().prepare(
    `UPDATE verification_challenges SET code_digest = ?, send_count = send_count + 1, last_sent_ms = ?, expires_ms = ?
     WHERE id = ? AND status = 'pending' AND send_count < ? AND last_sent_ms <= ?`
  ).run(codeDigest(row.public_id, row.purpose, row.user_id, row.phone, code), now, now + cfg.otpTtlMs, row.id, cfg.maxSendsPerChallenge, now - cfg.resendCooldownMs);
  if (Number(res.changes) !== 1) throw new OtpError('COOLDOWN', 429, 'Please wait before asking for another code.', 60);
  await deliver(row, row.phone, row.purpose, code);
  return {expiresMs: now + cfg.otpTtlMs, resendAfterMs: now + cfg.resendCooldownMs, row};
}

export function supersedeAllForUser(userId: number): void {
  getDb().prepare("UPDATE verification_challenges SET status = 'superseded' WHERE user_id = ? AND status IN ('pending', 'verified')").run(userId);
}

export function describe(row: ChallengeRow): {purpose: Purpose; maskedPhone: string; expiresInSeconds: number; resendAfterSeconds: number; attemptsLeft: number; canResend: boolean} {
  const cfg = getAuthConfig(); const now = Date.now();
  return {
    purpose: row.purpose,
    maskedPhone: maskPhone(row.phone),
    expiresInSeconds: Math.max(0, Math.ceil((row.expires_ms - now) / 1000)),
    resendAfterSeconds: Math.max(0, Math.ceil((row.last_sent_ms + cfg.resendCooldownMs - now) / 1000)),
    attemptsLeft: Math.max(0, cfg.maxAttempts - row.attempts),
    canResend: row.status === 'pending' && row.send_count < cfg.maxSendsPerChallenge,
  };
}
