import crypto from 'node:crypto';
import type {CookieOptions, NextFunction, Request, Response} from 'express';
import {getDb} from './db.ts';
import type {UserRole} from './constants.ts';
import {getRuntimeConfig} from './runtime.ts';

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

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

const OWNER_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isValidOwnerKey(key: unknown): key is string {
  return typeof key === 'string' && OWNER_KEY_PATTERN.test(key);
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

export function checkAndRecordRateLimit(
  rateKey: string,
  actionType: string,
  maxAttempts: number,
  windowMinutes: number,
  recordAttempt = true
): {allowed: boolean; remaining: number; count: number} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM rate_limit_attempts
       WHERE rate_key = ? AND action_type = ?
         AND datetime(created_at) >= datetime('now', ?)`
    )
    .get(rateKey, actionType, `-${windowMinutes} minutes`) as {cnt: number};

  const count = row?.cnt ?? 0;
  if (count >= maxAttempts) {
    return {allowed: false, remaining: 0, count};
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
