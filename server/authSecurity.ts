import crypto from 'node:crypto';
import type {Request} from 'express';
import {getDb} from './db.ts';
import {getAuthConfig} from './authConfig.ts';
import {cookieOptions, type PreviewCookieOptions} from './security.ts';

/** Trusted devices, session versions, password policy and phone-ownership rules (Node reference). Porting notes: docs/SIMULATED_SMS_SECURITY.md. */
export const DEVICE_COOKIE = 'agri_device';
export const CHALLENGE_COOKIE = 'agri_challenge';
export const CLAIM_COOKIE = 'agri_claim';
export const RELEASED_PREFIX = 'released:';

const sha256 = (v: string): string => crypto.createHash('sha256').update(v).digest('hex');
const DAY = 24 * 3600 * 1000;

// ------------------------------------------------------------------ cookies
export function deviceCookieOptions(req: Request): PreviewCookieOptions {
  return {...cookieOptions(req, true), maxAge: getAuthConfig().trustedDeviceDays * DAY};
}
export function challengeCookieOptions(req: Request): PreviewCookieOptions {
  return {...cookieOptions(req, true), maxAge: 15 * 60 * 1000};
}

// ------------------------------------------------------------------ session version (server-enforced revocation)
export function getSessionVersion(userId: number): number | null {
  const r = getDb().prepare('SELECT session_version AS v FROM users WHERE id = ?').get(userId) as {v: number} | undefined;
  return r ? r.v : null;
}
/** Invalidates every session cookie issued before this call. */
export function bumpSessionVersion(userId: number): number {
  const db = getDb();
  db.prepare('UPDATE users SET session_version = session_version + 1, updated_at = datetime(\'now\') WHERE id = ?').run(userId);
  return getSessionVersion(userId) ?? 0;
}

// ------------------------------------------------------------------ trusted devices
export function labelFromUserAgent(ua: string | undefined): string {
  const s = (ua ?? '').toLowerCase();
  const os = /android/.test(s) ? 'Android' : /iphone|ipad|ios/.test(s) ? 'iPhone/iPad' : /windows/.test(s) ? 'Windows' : /mac os|macintosh/.test(s) ? 'Mac' : /linux/.test(s) ? 'Linux' : 'Device';
  const br = /edg\//.test(s) ? 'Edge' : /firefox/.test(s) ? 'Firefox' : /chrome|crios/.test(s) ? 'Chrome' : /safari/.test(s) ? 'Safari' : 'browser';
  return `${os} ${br}`.slice(0, 40); // display only; never used to decide trust
}

export function createTrustedDevice(userId: number, userAgent: string | undefined): {token: string; id: number; expiresMs: number} {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresMs = now + getAuthConfig().trustedDeviceDays * DAY;
  const r = getDb().prepare('INSERT INTO trusted_devices (user_id, token_hash, label, created_ms, last_used_ms, expires_ms) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, sha256(token), labelFromUserAgent(userAgent), now, now, expiresMs);
  return {token, id: Number(r.lastInsertRowid), expiresMs};
}

export interface DeviceRow { id: number; user_id: number; label: string; created_ms: number; last_used_ms: number; expires_ms: number; revoked_ms: number | null }

/** A device is trusted only if the presented token's hash matches an unrevoked, unexpired row of THIS user. */
export function findTrustedDevice(userId: number, token: unknown): DeviceRow | null {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = getDb().prepare('SELECT id, user_id, label, created_ms, last_used_ms, expires_ms, revoked_ms FROM trusted_devices WHERE token_hash = ?').get(sha256(token)) as DeviceRow | undefined;
  const now = Date.now();
  if (!row || row.user_id !== userId || row.revoked_ms !== null || row.expires_ms <= now) return null;
  if (now - row.last_used_ms > 3600 * 1000) getDb().prepare('UPDATE trusted_devices SET last_used_ms = ? WHERE id = ?').run(now, row.id);
  return row;
}

export function listDevices(userId: number, currentId: number | null): {id: number; label: string; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean}[] {
  const rows = getDb().prepare('SELECT id, label, created_ms, last_used_ms, expires_ms FROM trusted_devices WHERE user_id = ? AND revoked_ms IS NULL AND expires_ms > ? ORDER BY last_used_ms DESC')
    .all(userId, Date.now()) as {id: number; label: string; created_ms: number; last_used_ms: number; expires_ms: number}[];
  return rows.map((r) => ({id: r.id, label: r.label || 'Device', createdAt: new Date(r.created_ms).toISOString(), lastUsedAt: new Date(r.last_used_ms).toISOString(), expiresAt: new Date(r.expires_ms).toISOString(), current: r.id === currentId}));
}

export function revokeDevice(userId: number, deviceId: number): boolean {
  return Number(getDb().prepare('UPDATE trusted_devices SET revoked_ms = ? WHERE id = ? AND user_id = ? AND revoked_ms IS NULL').run(Date.now(), deviceId, userId).changes) === 1;
}
export function revokeAllDevices(userId: number, exceptId: number | null = null): number {
  return Number(getDb().prepare('UPDATE trusted_devices SET revoked_ms = ? WHERE user_id = ? AND revoked_ms IS NULL AND (? IS NULL OR id <> ?)').run(Date.now(), userId, exceptId, exceptId).changes);
}

// ------------------------------------------------------------------ password policy
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd123', 'qwertyuiop', 'qwerty12345', '1234567890', '12345678910', '0123456789', 'iloveyou12', 'liberia1234', 'monrovia123', 'agriadvisory', 'welcome123', 'letmein1234', 'abc1234567', 'changeme123', 'farmer12345', 'farmerdemo2026']);

/** A very common password plus digits or symbols ("password1234", "Qwerty!2026") is still a very common password. Only the exact letter part is compared, so ordinary passwords are not affected. */
const COMMON_BASES = new Set(['password', 'passw0rd', 'qwerty', 'qwertyuiop', 'iloveyou', 'letmein', 'welcome', 'changeme', 'admin', 'administrator', 'abcdefg', 'abcdef', 'monrovia', 'liberia', 'farmer', 'agricare', 'agriadvisory', 'agricareliberia', 'liberiafarmer']);

/** Returns a message when the password is not acceptable, or null. */
export function passwordProblem(password: unknown, ctx: {phone?: string; displayName?: string} = {}): string | null {
  const min = getAuthConfig().passwordMinLength;
  if (typeof password !== 'string' || password.length < min) return `Use a password of at least ${min} characters.`;
  if (password.length > 128) return 'Use a password of at most 128 characters.';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON_BASES.has(lower.replace(/[^a-z]/g, '')) || /^(.)\1+$/.test(password)) return 'That password is too easy to guess. Choose a less common one.';
  const digits = (ctx.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 7 && password.replace(/\D/g, '').includes(digits.slice(-7))) return 'Do not use your phone number in your password.';
  const name = (ctx.displayName ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (name.length >= 4 && lower.replace(/[^a-z]/g, '').includes(name)) return 'Do not use your name in your password.';
  return null;
}

// ------------------------------------------------------------------ phone ownership (expiring unverified claims)
export interface PhoneHolder { id: number; phone_verified_at: string | null; claim_expired: number }

export function phoneHolder(phone: string): PhoneHolder | undefined {
  return getDb().prepare(
    `SELECT id, phone_verified_at,
            CASE WHEN phone_verified_at IS NULL AND datetime(COALESCE(phone_claim_expires_at, datetime(created_at, '+72 hours'))) <= datetime('now') THEN 1 ELSE 0 END AS claim_expired
     FROM users WHERE phone = ?`
  ).get(phone) as PhoneHolder | undefined;
}

/**
 * Frees a number held by an UNVERIFIED account: the account keeps everything else but loses the number (tombstoned), all its sessions and devices end.
 * Never applied to a verified number.
 */
export function releaseUnverifiedPhone(userId: number): boolean {
  const db = getDb();
  const tomb = `${RELEASED_PREFIX}${userId}:${crypto.randomBytes(4).toString('hex')}`;
  const res = db.prepare("UPDATE users SET phone = ?, phone_claim_expires_at = NULL, session_version = session_version + 1, updated_at = datetime('now') WHERE id = ? AND phone_verified_at IS NULL").run(tomb, userId);
  if (Number(res.changes) !== 1) return false;
  revokeAllDevices(userId);
  db.prepare("UPDATE verification_challenges SET status = 'superseded' WHERE user_id = ? AND status IN ('pending', 'verified')").run(userId);
  return true;
}

export const hasPhoneOnFile = (phone: string): boolean => /^\+231\d{9}$/.test(phone);

const phoneKey = (phone: string): string => sha256(`claim|${phone}`);

/** After a number was released by proof of possession, only the proving browser may register it for a short time. */
export function placeClaimHold(phone: string): string {
  const grant = crypto.randomBytes(24).toString('hex');
  getDb().prepare('INSERT OR REPLACE INTO phone_claim_holds (phone_hash, grant_hash, expires_ms) VALUES (?, ?, ?)').run(phoneKey(phone), sha256(grant), Date.now() + getAuthConfig().claimHoldMinutes * 60 * 1000);
  return grant;
}
export function holdBlocks(phone: string, grant: unknown): boolean {
  const row = getDb().prepare('SELECT grant_hash, expires_ms FROM phone_claim_holds WHERE phone_hash = ?').get(phoneKey(phone)) as {grant_hash: string; expires_ms: number} | undefined;
  if (!row) return false;
  if (row.expires_ms <= Date.now()) { getDb().prepare('DELETE FROM phone_claim_holds WHERE phone_hash = ?').run(phoneKey(phone)); return false; }
  if (typeof grant !== 'string' || !/^[a-f0-9]{48}$/.test(grant)) return true;
  const a = Buffer.from(row.grant_hash); const b = Buffer.from(sha256(grant));
  return !(a.length === b.length && crypto.timingSafeEqual(a, b));
}
export function clearHold(phone: string): void { getDb().prepare('DELETE FROM phone_claim_holds WHERE phone_hash = ?').run(phoneKey(phone)); }

export type RegistrationPhone = 'free' | 'taken';
/** Decides whether a registration may use this number. May release an EXPIRED unverified claim. Never touches a verified number. */
export function resolvePhoneForRegistration(phone: string, claimGrant: unknown): RegistrationPhone {
  if (holdBlocks(phone, claimGrant)) return 'taken';
  const holder = phoneHolder(phone);
  if (!holder) return 'free';
  if (holder.phone_verified_at !== null) return 'taken';
  if (!holder.claim_expired) return 'taken';
  return releaseUnverifiedPhone(holder.id) ? 'free' : 'taken';
}
