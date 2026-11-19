import crypto from 'node:crypto';
import net from 'node:net';
import type {CookieOptions, NextFunction, Request, Response} from 'express';
import {getDb} from './db.ts';
import type {UserRole} from './constants.ts';
import {getRuntimeConfig} from './runtime.ts';
import {passwordConcurrency, passwordQueueMax, WRITE_LIMITS, writeLimitScale, type WriteKind} from './limits.ts';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : EPHEMERAL_SECRET;
}

export const SESSION_COOKIE_NAME = 'agri_session';
export const ANON_COOKIE_NAME = 'agri_anon';
export const CSRF_COOKIE_NAME = 'agri_csrf';

export interface SessionUser {
  id: number;
  displayName: string;
  phone: string;
  email: string | null;
  status: string;
  roles: UserRole[];
  county: string;
  preferredLanguage: string;
  cropsOfInterest: string[];
  expertStatus?: string | null;
  expertSpecialty?: string | null;
}

export interface AuthedRequest extends Request {
  user?: SessionUser | null;
  anonToken?: string;
  csrfToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

/** Synchronous check. Only for start-up and operator scripts; request handlers use verifyPasswordAsync so the event loop is never blocked. */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Non-blocking password hashing. scryptSync holds the single Node.js thread for ~80 ms per call, so a burst of sign-ins froze every other request.
// crypto.scrypt runs on the libuv worker pool; a small semaphore bounds how many run at once and how many may wait, so a flood is answered "busy"
// (503) instead of exhausting memory or the worker pool. Same algorithm and parameters as before: existing hashes verify unchanged.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export class PasswordBusyError extends Error {
  constructor() { super('Too many password checks in progress.'); this.name = 'PasswordBusyError'; }
}

let hashActive = 0;
const hashWaiters: (() => void)[] = [];

async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (hashActive < passwordConcurrency()) {
    hashActive++;
  } else {
    if (hashWaiters.length >= passwordQueueMax()) throw new PasswordBusyError();
    await new Promise<void>((resolve) => hashWaiters.push(resolve)); // the slot is handed to us by the releaser (hashActive stays counted)
  }
  try {
    return await fn();
  } finally {
    const next = hashWaiters.shift();
    if (next) next(); else hashActive--;
  }
}

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
}

export function hashPasswordAsync(password: string): Promise<string> {
  return withHashSlot(async () => {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${(await scryptAsync(password, salt)).toString('hex')}`;
  });
}

export function verifyPasswordAsync(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return Promise.resolve(false);
  const [salt, expectedHex] = parts;
  return withHashSlot(async () => {
    const derived = await scryptAsync(password, salt);
    const expected = Buffer.from(expectedHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  });
}

let dummyHash: Promise<string> | null = null;
/**
 * Checks a password against a throw-away hash so that "no such account" costs the same time as "wrong password" (account-enumeration timing).
 * Always returns false.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPasswordAsync(crypto.randomBytes(24).toString('hex'));
  await verifyPasswordAsync(password, await dummyHash);
  return false;
}

/** Express 4 does not catch rejected promises: this forwards them to the error handler (JSON 500, no internals). */
export function asyncRoute<R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: R, res: Response, next: NextFunction): void => { fn(req, res, next).catch(next); };
}

const OWNER_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isValidOwnerKey(key: unknown): key is string {
  return typeof key === 'string' && OWNER_KEY_PATTERN.test(key);
}

/**
 * A device key that looks randomly generated: valid shape and at least 10 different characters. The app generates 256-bit random hex keys (64 characters, virtually always 10+ different), so this only turns away
 * keys such as "aaaa...a" or "123456789123456789123456789123456789" that anybody could guess and then read a private conversation or manage a listing with.
 * Used on the harvest-market surfaces; keys that older features already accepted keep working there.
 */
export function isStrongDeviceKey(key: unknown): key is string {
  return isValidOwnerKey(key) && new Set(key).size >= 10;
}

/** Keyed hash of a listing owner secret. The secret itself is never stored. */
export function hashOwnerKey(key: string): string {
  // Must be stable across restarts (unlike the ephemeral session fallback), or every listing would lose its owner.
  // Production sets SESSION_SECRET; rotating it invalidates existing owner keys.
  const hmacKey =
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : 'agri-owner-key-dev-fallback';
  return crypto.createHmac('sha256', hmacKey).update(`listing-owner-v1:${key}`).digest('hex');
}

/** Constant-time check. An empty stored hash (legacy listing) never matches anything. */
export function verifyOwnerKey(key: unknown, storedHash: string): boolean {
  if (!storedHash || !isValidOwnerKey(key)) return false;
  const a = Buffer.from(hashOwnerKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Keyed hash of a device's expert-request secret (domain-separated from listing owner keys). */
export function hashRequesterKey(key: string): string {
  const hmacKey =
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : 'agri-owner-key-dev-fallback';
  return crypto.createHmac('sha256', hmacKey).update(`expert-requester-v1:${key}`).digest('hex');
}

export function verifyRequesterKey(key: unknown, storedHash: string): boolean {
  if (!storedHash || !isValidOwnerKey(key)) return false;
  const a = Buffer.from(hashRequesterKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hashIdentifier(value: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex').slice(0, 24);
}

interface SessionPayload {
  uid: number;
  exp: number;
  /** users.session_version at issue time. A bump (password reset/change, device revoke-all, phone change) invalidates every older cookie. */
  sv: number;
}

export function signSessionToken(userId: number, sessionVersion: number, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    sv: sessionVersion,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || !parsed.exp || !Number.isInteger(parsed.sv) || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export type PreviewCookieOptions = CookieOptions & {partitioned?: boolean};

/**
 * Is this request HTTPS? Only what Express itself determined: `req.secure` is true for a TLS connection, or, when `trust proxy` covers the sender,
 * for X-Forwarded-Proto: https. The client-supplied Origin header is NOT consulted (it is attacker-controlled).
 */
export function isHttpsRequest(req: Request): boolean {
  return req.secure;
}

/**
 * first_party (default in production and the protected demo environment): SameSite=Lax, Secure always. cross_site (development, tests, embedded previews):
 * SameSite=None; Secure; Partitioned over HTTPS, Lax over HTTP.
 */
export function cookieOptions(req: Request, httpOnly = true): PreviewCookieOptions {
  const rt = getRuntimeConfig();
  if (rt.cookieMode === 'first_party') {
    return {httpOnly, sameSite: 'lax', secure: rt.strict ? true : isHttpsRequest(req), path: '/', maxAge: 1000 * 60 * 60 * 24 * 7};
  }
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    ...(isHttps ? {partitioned: true} : {}),
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

export function clearCookieOptions(req: Request, httpOnly = true): PreviewCookieOptions {
  const {maxAge: _maxAge, ...rest} = cookieOptions(req, httpOnly);
  return rest;
}

export function loadUserById(userId: number): SessionUser | null {
  const db = getDb();
  const userRow = db
    .prepare(
      `SELECT u.id, u.display_name, u.phone, u.email, u.status,
              fp.county, fp.preferred_language, fp.crops_of_interest,
              ep.approval_status AS expert_status, ep.specialty AS expert_specialty
       FROM users u
       LEFT JOIN farmer_profiles fp ON fp.user_id = u.id
       LEFT JOIN expert_profiles ep ON ep.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: number;
        display_name: string;
        phone: string;
        email: string | null;
        status: string;
        county: string | null;
        preferred_language: string | null;
        crops_of_interest: string | null;
        expert_status: string | null;
        expert_specialty: string | null;
      }
    | undefined;

  if (!userRow || userRow.status !== 'active') return null;

  const roleRows = db
    .prepare(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .all(userId) as {name: UserRole}[];

  let crops: string[] = [];
  try {
    crops = userRow.crops_of_interest ? (JSON.parse(userRow.crops_of_interest) as string[]) : [];
  } catch {
    crops = [];
  }

  return {
    id: userRow.id,
    displayName: userRow.display_name,
    phone: userRow.phone,
    email: userRow.email,
    status: userRow.status,
    roles: roleRows.map((r) => r.name),
    county: userRow.county || 'Montserrado',
    preferredLanguage: userRow.preferred_language || 'en',
    cropsOfInterest: crops,
    expertStatus: userRow.expert_status,
    expertSpecialty: userRow.expert_specialty,
  };
}

export function sessionMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const payload = verifySessionToken(token);
  // Server-enforced revocation: the cookie's version must equal the user's current session_version (tokens without one are rejected).
  let current: number | null = null;
  if (payload) {
    const row = getDb().prepare('SELECT session_version AS v FROM users WHERE id = ?').get(payload.uid) as {v: number} | undefined;
    current = row ? row.v : null;
  }
  req.user = payload && current !== null && payload.sv === current ? loadUserById(payload.uid) : null;

  let anonToken = req.cookies?.[ANON_COOKIE_NAME] as string | undefined;
  if (!anonToken || !/^[a-f0-9]{24,64}$/.test(anonToken)) {
    anonToken = crypto.randomBytes(16).toString('hex');
    res.cookie(ANON_COOKIE_NAME, anonToken, cookieOptions(req, true));
  }
  req.anonToken = anonToken;

  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  if (!csrfToken || csrfToken.length < 16) {
    csrfToken = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, csrfToken, cookieOptions(req, false));
  }
  req.csrfToken = csrfToken;

  next();
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken.length < 16) {
    res.status(403).json({error: {code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token.'}});
    return;
  }
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({error: {code: 'CSRF_INVALID', message: 'CSRF token mismatch.'}});
    return;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Authentication required.'}});
    return;
  }
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Authentication required.'}});
      return;
    }
    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      res.status(403).json({error: {code: 'FORBIDDEN', message: 'Insufficient permissions for this action.'}});
      return;
    }
    if (allowedRoles.includes('expert') && !req.user.roles.includes('admin')) {
      if (req.user.expertStatus !== 'approved') {
        res.status(403).json({
          error: {code: 'EXPERT_NOT_APPROVED', message: 'Expert account is pending approval or suspended.'},
        });
        return;
      }
    }
    next();
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Network address used as a rate-limit key. Only what Express itself determined (req.ip, which follows the configured trust-proxy setting) is used,
// never a header read here. IPv6 clients are keyed by their /64 (the standard end-site allocation: one household or phone can use billions of
// addresses inside it, so per-address keys would let one client rotate addresses to reset every limit). IPv4-mapped IPv6 is treated as IPv4.
// ---------------------------------------------------------------------------------------------------------------------------------------------
function expandIpv6(raw: string): number[] | null {
  let addr = raw.split('%')[0];
  if (addr.includes('.')) {
    const i = addr.lastIndexOf(':');
    const v4 = addr.slice(i + 1).split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    addr = `${addr.slice(0, i + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function limiterAddress(ip: string | undefined | null): string {
  const raw = (ip ?? '').trim().toLowerCase();
  if (!raw) return 'unknown';
  const kind = net.isIP(raw.split('%')[0]);
  if (kind === 4) return raw;
  if (kind !== 6) return 'unknown';
  const g = expandIpv6(raw);
  if (!g) return 'unknown';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`; // ::ffff:a.b.c.d
  return `v6:${g.slice(0, 4).map((x) => x.toString(16)).join(':')}`;
}

/** The key part identifying the calling network address for every limiter. */
export const clientAddress = (req: Request): string => limiterAddress(req.ip);

/**
 * Rate rows older than the longest window (24 h for the anonymous AI quota) are useless and would grow the database without bound. They are removed in
 * small batches (1000 rows) through an index on created_at, so no single call can hold the (synchronous) SQLite connection for long. While a backlog
 * exists a batch runs at most once a second, otherwise once a minute, and only while the limiter is actually in use.
 */
const RATE_ROW_RETENTION_HOURS = 25;
const PRUNE_BATCH = 1000; // deleting rows through two indexes costs about 60 microseconds each: 1000 rows is tens of milliseconds, 5000 was about 300 ms
let lastPrune = 0;
let pruneBacklog = false;
/** Test hook: allow the next rate-limit call to prune immediately. */
export function resetRateLimitPruneForTests(): void { lastPrune = 0; pruneBacklog = false; }
/** Runs one prune batch now; returns the number of rows removed. Exported for tests. */
export function pruneRateLimitBatch(): number {
  const r = getDb()
    .prepare('DELETE FROM rate_limit_attempts WHERE id IN (SELECT id FROM rate_limit_attempts WHERE created_at < datetime(\'now\', ?) LIMIT ?)')
    .run(`-${RATE_ROW_RETENTION_HOURS} hours`, PRUNE_BATCH);
  const n = Number(r.changes);
  pruneBacklog = n >= PRUNE_BATCH;
  return n;
}
function pruneRateLimitRows(): void {
  const now = Date.now();
  if (now - lastPrune < (pruneBacklog ? 1_000 : 60_000)) return;
  lastPrune = now;
  try {
    pruneRateLimitBatch();
  } catch {
    /* pruning must never break a request */
  }
}

export interface RateLimitResult {allowed: boolean; remaining: number; count: number; /** Seconds until the oldest counted attempt leaves the window (only when blocked). */ retryAfterSeconds?: number}

export function checkAndRecordRateLimit(
  rateKey: string,
  actionType: string,
  maxAttempts: number,
  windowMinutes: number,
  recordAttempt = true
): RateLimitResult {
  const db = getDb();
  pruneRateLimitRows();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM rate_limit_attempts
       WHERE rate_key = ? AND action_type = ?
         AND created_at >= datetime('now', ?)`
    )
    .get(rateKey, actionType, `-${windowMinutes} minutes`) as {cnt: number};

  const count = row?.cnt ?? 0;
  if (count >= maxAttempts) {
    const w = db
      .prepare(
        `SELECT CAST(strftime('%s', MIN(created_at)) AS INTEGER) + ? - CAST(strftime('%s', 'now') AS INTEGER) AS s
         FROM rate_limit_attempts WHERE rate_key = ? AND action_type = ? AND created_at >= datetime('now', ?)`
      )
      .get(windowMinutes * 60, rateKey, actionType, `-${windowMinutes} minutes`) as {s: number | null} | undefined;
    const retryAfterSeconds = Math.min(windowMinutes * 60, Math.max(1, Number(w?.s ?? windowMinutes * 60)));
    return {allowed: false, remaining: 0, count, retryAfterSeconds};
  }
  if (recordAttempt) {
    db.prepare('INSERT INTO rate_limit_attempts (rate_key, action_type) VALUES (?, ?)').run(
      rateKey,
      actionType
    );
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - (count + (recordAttempt ? 1 : 0))),
    count,
  };
}

/** Records one attempt without checking (used to count only FAILED sign-ins against the per-address limit). */
export function recordRateLimitAttempt(rateKey: string, actionType: string): void {
  getDb().prepare('INSERT INTO rate_limit_attempts (rate_key, action_type) VALUES (?, ?)').run(rateKey, actionType);
}

/**
 * Per-hour cap for a public write endpoint: per account for signed-in users, per network address for anonymous callers. Mount it AFTER
 * idempotent(): a replay of an already-accepted request (offline sync retry) is answered from the stored result and does not use up the allowance.
 */
export function writeLimit(kind: WriteKind) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const cfg = WRITE_LIMITS[kind];
    const scale = writeLimitScale();
    const actor = req.user ? `user:${req.user.id}` : `ip:${clientAddress(req)}`;
    const max = (req.user ? cfg.userPerHour : cfg.anonPerHour) * scale;
    const rl = checkAndRecordRateLimit(hashIdentifier(`write:${kind}:${actor}`), `write_${kind}`, max, 60, true);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds ?? 900));
      res.status(429).json({error: {code: 'RATE_LIMITED', message: 'Too many submissions from this device or account. Please wait a while and try again.', retryAfterSeconds: rl.retryAfterSeconds ?? 900}});
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Shared demonstration accounts. The two seeded demo accounts have PUBLISHED passwords (project documents). Whoever can reach a server where those
// work holds a "farmer" and an "approved expert" login. They are therefore UNTRUSTED actors: they must never read or answer other people's expert
// requests, no matter which role they hold. The account is identified by a PERMANENT flag (users.is_shared_demo) set when it is seeded or found at
// start-up. Changing its password does not clear the flag, and the account cannot change its own password, phone or recovery. (Strict environments -
// production and the protected demo - never create these accounts with the published passwords at all.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export const PUBLISHED_DEMO_ACCOUNTS: readonly {phone: string; password: string}[] = [
  {phone: '+231770000101', password: 'FarmerDemo!2026'},
  {phone: '+231770000201', password: 'ExpertDemo!2026'},
];

/** True when this user is a shared demonstration account (permanent flag; cheap indexed read). */
export function isSharedDemoAccount(userId: number): boolean {
  const row = getDb().prepare('SELECT is_shared_demo AS f FROM users WHERE id = ?').get(userId) as {f: number} | undefined;
  return row?.f === 1;
}

/**
 * Start-up backfill for databases seeded before the flag existed: an account on a documented phone number that STILL has its published password is
 * flagged now, permanently. (Once flagged it stays flagged whatever its password becomes.)
 */
export function markSharedDemoAccounts(): number {
  const db = getDb();
  let marked = 0;
  for (const {phone, password} of PUBLISHED_DEMO_ACCOUNTS) {
    const row = db.prepare('SELECT id, password_hash, is_shared_demo AS f FROM users WHERE phone = ?').get(phone) as {id: number; password_hash: string; f: number} | undefined;
    if (!row || row.f === 1) continue;
    if (verifyPassword(password, row.password_hash)) {
      db.prepare('UPDATE users SET is_shared_demo = 1 WHERE id = ?').run(row.id);
      marked++;
    }
  }
  return marked;
}

export function writeAuditLog(params: {
  actorUserId: number | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
  ip?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, details_json, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.actorUserId,
    params.actorRole,
    params.action,
    params.targetType,
    String(params.targetId ?? ''),
    JSON.stringify(params.details ?? {}),
    params.ip ? hashIdentifier(params.ip) : ''
  );
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '').trim();
}
