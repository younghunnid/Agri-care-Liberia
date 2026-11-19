import crypto from 'node:crypto';
import {Router, type NextFunction, type Request, type Response} from 'express';
import {getDb} from '../db.ts';
import {getAuthConfig} from '../authConfig.ts';
import {normalizeLiberianPhone} from '../../src/lib/phone.ts';
import {
  type AuthedRequest, PasswordBusyError, SESSION_COOKIE_NAME, asyncRoute, checkAndRecordRateLimit, clearCookieOptions, clientAddress, isSharedDemoAccount, cookieOptions, hashIdentifier, hashPasswordAsync, loadUserById, requireAuth, signSessionToken,
  verifyPasswordAsync, writeAuditLog,
} from '../security.ts';
import {
  CHALLENGE_COOKIE, CLAIM_COOKIE, DEVICE_COOKIE, bumpSessionVersion, challengeCookieOptions, createTrustedDevice, deviceCookieOptions, findTrustedDevice, getSessionVersion,
  hasPhoneOnFile, listDevices, passwordProblem, phoneHolder, placeClaimHold, releaseUnverifiedPhone, revokeAllDevices, revokeDevice,
} from '../authSecurity.ts';
import {
  OtpError, consumeVerified, describe, findChallenge, keyHash, maskPhone, parseChallengeCookie, peekVerified, resendChallenge, startChallenge, supersedeAllForUser, takeRate, verifyChallenge,
  type Started,
} from '../otp.ts';
import {getSmsProvider, SimulatedSmsProvider} from '../sms/index.ts';

/**
 * Authentication-security routes (Node reference): code verification, new-device sign-in, password recovery, phone ownership, trusted devices,
 * account security and the development-only simulated SMS inbox. Mounted on /api/v1 behind the global CSRF check.
 * No route here ever returns, logs or stores a plaintext code. Challenge secrets travel only in an HttpOnly cookie.
 */
export const authSecurityRouter = Router();

const DUMMY_PHONE = '+231000000000'; // sentinel for challenges that never send anything (equal behaviour for unknown accounts)
const GRANT_MS = 10 * 60 * 1000;

/** The address used as a rate-limit key (IPv6 by /64; only req.ip, never a raw header). */
const ip = (req: Request): string => clientAddress(req);
/** Password hashing is capped (see security.ts): a flood is answered "busy" rather than queued without limit. */
/** Shared demonstration accounts (published password) cannot change their own password, phone or recovery: that would let a stranger take them over and lock the presenters out. */
const sharedRefusal = (res: Response): void => { err(res, 403, 'SHARED_DEMO_ACCOUNT', 'This is a shared demonstration account. Its password and phone number cannot be changed here.'); };
const busy = (res: Response): void => { res.setHeader('Retry-After', '3'); err(res, 503, 'SERVER_BUSY', 'The server is busy. Please try again in a moment.'); };
const err = (res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void => { res.status(status).json({error: {code, message, ...extra}}); };
const demo = (): boolean => getSmsProvider().name === 'simulated';
/** The in-website Demo SMS Inbox is on (development / protected demo environment only). */
const demoInbox = (): boolean => { const c = getAuthConfig(); return c.demoInlineInbox && !c.production && getSmsProvider() instanceof SimulatedSmsProvider; };

function handleOtpError(res: Response, e: unknown): void {
  if (e instanceof OtpError) {
    if (e.retryAfterSeconds) res.setHeader('Retry-After', String(e.retryAfterSeconds));
    err(res, e.status, e.code === 'NOT_FOUND' ? 'CHALLENGE_EXPIRED' : e.code, e.message, e.retryAfterSeconds ? {retryAfterSeconds: e.retryAfterSeconds} : {});
    return;
  }
  throw e;
}

function setChallengeCookie(req: Request, res: Response, started: Pick<Started, 'publicId' | 'bindingSecret'>): void {
  res.cookie(CHALLENGE_COOKIE, `${started.publicId}.${started.bindingSecret}`, challengeCookieOptions(req));
}
const clearChallengeCookie = (req: Request, res: Response): void => { res.clearCookie(CHALLENGE_COOKIE, clearCookieOptions(req, true)); };
const challengeFrom = (req: Request) => parseChallengeCookie(req.cookies?.[CHALLENGE_COOKIE]);

function issueSession(req: Request, res: Response, userId: number): void {
  res.cookie(SESSION_COOKIE_NAME, signSessionToken(userId, getSessionVersion(userId) ?? 0), cookieOptions(req, true));
}

function startedBody(s: Started, purpose?: string, phone?: string): Record<string, unknown> {
  const now = Date.now();
  return {
    status: 'VERIFICATION_REQUIRED', ...(purpose ? {purpose} : {}), ...(phone ? {maskedPhone: maskPhone(phone)} : {}),
    expiresInSeconds: Math.max(0, Math.ceil((s.expiresMs - now) / 1000)), resendAfterSeconds: Math.max(0, Math.ceil((s.resendAfterMs - now) / 1000)), demo: demo(), demoInbox: demoInbox(),
  };
}

/** Creates a real challenge row that sends nothing (same timers, attempts, expiry and lockout as a real one). */
function dummyChallenge(purpose: 'password_reset' | 'phone_claim', ipAddr: string): Started {
  const cfg = getAuthConfig();
  const publicId = crypto.randomBytes(16).toString('hex');
  const bindingSecret = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO verification_challenges (public_id, user_id, purpose, phone, code_digest, binding_hash, created_ms, expires_ms, last_sent_ms, ip_hash)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(publicId, purpose, DUMMY_PHONE, crypto.randomBytes(32).toString('hex'), crypto.createHash('sha256').update(bindingSecret).digest('hex'), now, now + cfg.otpTtlMs, now, keyHash('ip', ipAddr));
  return {publicId, bindingSecret, expiresMs: now + cfg.otpTtlMs, resendAfterMs: now + cfg.resendCooldownMs};
}

function failVerify(res: Response, r: Extract<ReturnType<typeof verifyChallenge>, {ok: false}>, auditAction = true): void {
  if (auditAction && r.row?.user_id) {
    writeAuditLog({actorUserId: r.row.user_id, actorRole: 'user', action: r.reason === 'locked' ? 'otp_locked' : 'otp_failed', targetType: 'user', targetId: r.row.user_id, details: {purpose: r.row.purpose}});
  }
  if (r.reason === 'rate_limited') { res.setHeader('Retry-After', '900'); err(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait before trying again.'); return; }
  if (r.reason === 'locked') { err(res, 429, 'CODE_LOCKED', 'Too many wrong codes. Please start again to get a new code.'); return; }
  err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.', r.attemptsLeft !== undefined ? {attemptsLeft: r.attemptsLeft} : {});
}

const userRowById = (id: number) =>
  getDb().prepare('SELECT id, display_name, phone, status, phone_verified_at, phone_claim_expires_at FROM users WHERE id = ?').get(id) as
    | {id: number; display_name: string; phone: string; status: string; phone_verified_at: string | null; phone_claim_expires_at: string | null}
    | undefined;

// =================================================================== sign-in on a new device
authSecurityRouter.get('/auth/challenge', (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  const row = findChallenge(publicId, secret);
  res.setHeader('Cache-Control', 'no-store');
  if (!row || !['pending', 'verified'].includes(row.status) || Date.now() >= row.expires_ms + (row.status === 'verified' ? GRANT_MS : 0)) { err(res, 404, 'NO_CHALLENGE', 'There is no verification in progress.'); return; }
  const d = describe(row);
  // Recovery challenges never show a phone (identical for existing and unknown accounts).
  const hidePhone = row.purpose === 'password_reset' || row.purpose === 'phone_claim';
  res.json({...d, maskedPhone: hidePhone ? null : d.maskedPhone, status: row.status, demo: demo(), demoInbox: demoInbox()});
});

authSecurityRouter.post('/auth/verify-device', (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  const row0 = findChallenge(publicId, secret);
  const purpose = row0?.purpose === 'phone_confirm' ? 'phone_confirm' : 'new_device_login';
  const r = verifyChallenge({publicId, secret, purpose, code: req.body?.code, ip: ip(req), onSuccess: 'consumed'});
  if (!r.ok) { failVerify(res, r); return; }
  const user = r.row.user_id ? userRowById(r.row.user_id) : undefined;
  // The challenge is bound to the number it was sent to: if the account's number changed meanwhile, it is worthless.
  if (!user || user.status !== 'active' || user.phone !== r.row.phone) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  const db = getDb();
  db.prepare("UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, datetime('now')), phone_claim_expires_at = NULL WHERE id = ?").run(user.id);
  const device = createTrustedDevice(user.id, req.get('user-agent'));
  res.cookie(DEVICE_COOKIE, device.token, deviceCookieOptions(req));
  issueSession(req, res, user.id);
  clearChallengeCookie(req, res);
  const roles = (db.prepare('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?').all(user.id) as {name: string}[]).map((x) => x.name);
  const actor = {actorUserId: user.id, actorRole: roles.join(',') || 'farmer', targetType: 'user', targetId: user.id, ip: req.ip};
  writeAuditLog({...actor, action: 'otp_verified', details: {purpose}});
  if (purpose === 'phone_confirm') writeAuditLog({...actor, action: 'phone_confirmed'});
  writeAuditLog({...actor, action: 'device_trusted', details: {deviceId: device.id}});
  writeAuditLog({...actor, action: 'login_success', details: {viaVerification: true}});
  res.json({user: loadUserById(user.id)});
});

authSecurityRouter.post('/auth/resend-code', async (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  try {
    const row = findChallenge(publicId, secret);
    if (row && row.phone === DUMMY_PHONE) { // dummy challenge: identical timers, nothing is sent
      const cfg = getAuthConfig(); const now = Date.now();
      if (row.status !== 'pending' || now >= row.expires_ms || now - row.last_sent_ms < cfg.resendCooldownMs || row.send_count >= cfg.maxSendsPerChallenge) {
        throw new OtpError(row.send_count >= cfg.maxSendsPerChallenge ? 'TOO_MANY_SENDS' : 'COOLDOWN', 429, 'Please wait before asking for another code.', 60);
      }
      getDb().prepare('UPDATE verification_challenges SET send_count = send_count + 1, last_sent_ms = ?, expires_ms = ? WHERE id = ?').run(now, now + cfg.otpTtlMs, row.id);
      res.json({ok: true, expiresInSeconds: Math.ceil(cfg.otpTtlMs / 1000), resendAfterSeconds: Math.ceil(cfg.resendCooldownMs / 1000), demo: demo(), demoInbox: demoInbox()});
      return;
    }
    const out = await resendChallenge(publicId, secret, ip(req));
    if (out.row.user_id) writeAuditLog({actorUserId: out.row.user_id, actorRole: 'user', action: 'otp_sent', targetType: 'user', targetId: out.row.user_id, details: {purpose: out.row.purpose, resend: true}, ip: req.ip});
    res.json({ok: true, expiresInSeconds: Math.max(0, Math.ceil((out.expiresMs - Date.now()) / 1000)), resendAfterSeconds: Math.max(0, Math.ceil((out.resendAfterMs - Date.now()) / 1000)), demo: demo(), demoInbox: demoInbox()});
  } catch (e) { handleOtpError(res, e); }
});

// =================================================================== password recovery (generic for existing and unknown accounts)
authSecurityRouter.post('/auth/forgot-password', async (req, res) => {
  const cfg = getAuthConfig();
  const rawIdent = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().slice(0, 120) : '';
  if (getSmsProvider().name === 'none') { err(res, 503, 'SMS_UNAVAILABLE', 'Password recovery by SMS is not available right now. Please try again later.'); return; } // same for everyone
  const ipOk = checkAndRecordRateLimit(hashIdentifier(ip(req)), 'password_reset', 5, 60, true).allowed;
  const identOk = takeRate('forgot-ident', keyHash('ident', rawIdent.toLowerCase()), cfg.limits.forgotPerIdentPerHour, 3600 * 1000);
  if (!ipOk || !identOk) { res.setHeader('Retry-After', '3600'); err(res, 429, 'RATE_LIMITED', 'Too many reset requests. Please try later.'); return; }

  const phoneIdent = normalizeLiberianPhone(rawIdent);
  const normalized = rawIdent.includes('@') ? rawIdent.toLowerCase() : phoneIdent.valid ? phoneIdent.normalized : rawIdent;
  const user = rawIdent
    ? (getDb().prepare('SELECT id, status, phone, phone_verified_at FROM users WHERE phone = ? OR lower(email) = ?').get(normalized, rawIdent.toLowerCase()) as
        | {id: number; status: string; phone: string; phone_verified_at: string | null} | undefined)
    : undefined;

  let started: Started | null = null;
  if (user && user.status === 'active' && user.phone_verified_at && hasPhoneOnFile(user.phone)) {
    try { started = await startChallenge({userId: user.id, purpose: 'password_reset', phone: user.phone, ip: ip(req)}); }
    catch { started = null; } // any failure is swallowed so the answer stays identical; the farmer simply receives no code
    if (started) writeAuditLog({actorUserId: user.id, actorRole: 'system', action: 'password_reset_requested', targetType: 'user', targetId: user.id, ip: req.ip});
  }
  started ??= dummyChallenge('password_reset', ip(req));
  setChallengeCookie(req, res, started);
  res.json({ok: true, message: 'If an account with a verified phone number matches, a verification code has been sent to it.', expiresInSeconds: Math.ceil(cfg.otpTtlMs / 1000), resendAfterSeconds: Math.ceil(cfg.resendCooldownMs / 1000), demo: demo(), demoInbox: demoInbox()});
});

authSecurityRouter.post('/auth/forgot-password/verify', (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  const r = verifyChallenge({publicId, secret, purpose: 'password_reset', code: req.body?.code, ip: ip(req), onSuccess: 'verified'});
  if (!r.ok) { failVerify(res, r); return; }
  if (r.row.user_id) writeAuditLog({actorUserId: r.row.user_id, actorRole: 'user', action: 'otp_verified', targetType: 'user', targetId: r.row.user_id, details: {purpose: 'password_reset'}, ip: req.ip});
  res.json({ok: true, graceSeconds: GRANT_MS / 1000});
});

authSecurityRouter.post('/auth/reset-password', asyncRoute(async (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  const newPassword = req.body?.newPassword;
  const grant = peekVerified(publicId, secret, 'password_reset', GRANT_MS);
  if (!grant || !grant.user_id) { err(res, 400, 'RESET_NOT_VERIFIED', 'Please verify the code first, or start the reset again.'); return; }
  const user = userRowById(grant.user_id);
  if (user && isSharedDemoAccount(user.id)) { sharedRefusal(res); return; }
  const problem = passwordProblem(newPassword, {phone: user?.phone, displayName: user?.display_name});
  if (problem) { err(res, 400, 'WEAK_PASSWORD', problem); return; }
  let newHash: string;
  try { newHash = await hashPasswordAsync(newPassword as string); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; } // before the one-time grant is consumed
  const won = consumeVerified(publicId, secret, 'password_reset', GRANT_MS); // exactly one caller can win this
  if (!won || !user) { err(res, 400, 'RESET_NOT_VERIFIED', 'Please verify the code first, or start the reset again.'); return; }
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, user.id);
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(user.id);
    bumpSessionVersion(user.id);      // every existing session ends
    revokeAllDevices(user.id);        // every trusted device must verify again
    supersedeAllForUser(user.id);     // outstanding login/recovery challenges end
    db.exec('COMMIT;');
  } catch (e) { db.exec('ROLLBACK;'); throw e; }
  writeAuditLog({actorUserId: user.id, actorRole: 'user', action: 'password_reset_completed', targetType: 'user', targetId: user.id, details: {sessionsRevoked: true, devicesRevoked: true}, ip: req.ip});
  clearChallengeCookie(req, res);
  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(req, true));
  res.clearCookie(DEVICE_COOKIE, clearCookieOptions(req, true));
  res.json({ok: true, message: 'Password updated. Please sign in with your new password.'}); // never signs the user in
}));

// =================================================================== phone ownership claim (proof of possession releases an unverified claim)
authSecurityRouter.post('/auth/phone-claim/start', async (req, res) => {
  const cfg = getAuthConfig();
  if (getSmsProvider().name === 'none') { err(res, 503, 'SMS_UNAVAILABLE', 'Phone verification is not available right now. Please try again later.'); return; }
  const raw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const p = normalizeLiberianPhone(raw);
  if (!takeRate('claim-ip', keyHash('ip', ip(req)), 5, 3600 * 1000) || !takeRate('claim-phone', keyHash('phone', p.normalized || raw), 3, 3600 * 1000)) { res.setHeader('Retry-After', '3600'); err(res, 429, 'RATE_LIMITED', 'Too many requests. Please try later.'); return; }
  let started: Started | null = null;
  const holder = p.valid ? phoneHolder(p.normalized) : undefined;
  if (holder && holder.phone_verified_at === null) {
    try { started = await startChallenge({userId: null, purpose: 'phone_claim', phone: p.normalized, ip: ip(req)}); } catch { started = null; }
  }
  started ??= dummyChallenge('phone_claim', ip(req));
  setChallengeCookie(req, res, started);
  res.json({ok: true, message: 'If this number is waiting to be verified, a code has been sent to it.', expiresInSeconds: Math.ceil(cfg.otpTtlMs / 1000), resendAfterSeconds: Math.ceil(cfg.resendCooldownMs / 1000), demo: demo(), demoInbox: demoInbox()});
});

authSecurityRouter.post('/auth/phone-claim/verify', (req, res) => {
  const {publicId, secret} = challengeFrom(req);
  const r = verifyChallenge({publicId, secret, purpose: 'phone_claim', code: req.body?.code, ip: ip(req), onSuccess: 'consumed'});
  if (!r.ok) { failVerify(res, r, false); return; }
  const holder = phoneHolder(r.row.phone);
  let released = false;
  if (holder && holder.phone_verified_at === null) released = releaseUnverifiedPhone(holder.id);
  const grant = placeClaimHold(r.row.phone);
  res.cookie(CLAIM_COOKIE, grant, challengeCookieOptions(req));
  clearChallengeCookie(req, res);
  writeAuditLog({actorUserId: holder?.id ?? null, actorRole: 'system', action: 'phone_claim_released', targetType: 'user', targetId: holder?.id ?? '', details: {released}, ip: req.ip});
  res.json({ok: true, released, message: 'Number verified. You can now register it within 15 minutes on this device.'});
});

// =================================================================== account security (signed in)
authSecurityRouter.get('/account/security', requireAuth, (req: AuthedRequest, res) => {
  const u = userRowById(req.user!.id)!;
  const device = findTrustedDevice(u.id, req.cookies?.[DEVICE_COOKIE]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    phone: {masked: maskPhone(u.phone), onFile: hasPhoneOnFile(u.phone), verified: Boolean(u.phone_verified_at), verifiedAt: u.phone_verified_at, claimExpiresAt: u.phone_verified_at ? null : u.phone_claim_expires_at},
    devices: {count: listDevices(u.id, device?.id ?? null).length, currentTrusted: Boolean(device)},
    passwordPolicy: {minLength: getAuthConfig().passwordMinLength},
    recovery: {viaVerifiedPhone: Boolean(u.phone_verified_at), operatorRecovery: true},
    demoMode: demo(), demoInbox: demoInbox(),
  });
});

authSecurityRouter.get('/account/devices', requireAuth, (req: AuthedRequest, res) => {
  const device = findTrustedDevice(req.user!.id, req.cookies?.[DEVICE_COOKIE]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({devices: listDevices(req.user!.id, device?.id ?? null), trustDays: getAuthConfig().trustedDeviceDays});
});

authSecurityRouter.delete('/account/devices/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const current = findTrustedDevice(req.user!.id, req.cookies?.[DEVICE_COOKIE]);
  if (!Number.isInteger(id) || id < 1 || !revokeDevice(req.user!.id, id)) { err(res, 404, 'NOT_FOUND', 'Device not found.'); return; }
  const wasCurrent = current?.id === id;
  writeAuditLog({actorUserId: req.user!.id, actorRole: 'user', action: 'device_revoked', targetType: 'device', targetId: id, ip: req.ip});
  if (wasCurrent) { res.clearCookie(DEVICE_COOKIE, clearCookieOptions(req, true)); }
  res.json({ok: true, currentDeviceRevoked: wasCurrent});
});

authSecurityRouter.post('/account/devices/revoke-all', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const n = revokeAllDevices(uid);
  bumpSessionVersion(uid); // every session, including this one, ends
  supersedeAllForUser(uid);
  writeAuditLog({actorUserId: uid, actorRole: 'user', action: 'devices_revoked_all', targetType: 'user', targetId: uid, details: {count: n}, ip: req.ip});
  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(req, true));
  res.clearCookie(DEVICE_COOKIE, clearCookieOptions(req, true));
  res.json({ok: true, revoked: n, signedOut: true});
});

authSecurityRouter.post('/account/password', requireAuth, asyncRoute(async (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rl = checkAndRecordRateLimit(hashIdentifier(`pw:${uid}:${ip(req)}`), 'password_change', 5, 15, true);
  if (!rl.allowed) { err(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait 15 minutes.'); return; }
  if (isSharedDemoAccount(uid)) { sharedRefusal(res); return; }
  const {currentPassword, newPassword} = req.body ?? {};
  const row = getDb().prepare('SELECT password_hash, phone, display_name FROM users WHERE id = ?').get(uid) as {password_hash: string; phone: string; display_name: string};
  let currentOk = false;
  try { currentOk = typeof currentPassword === 'string' && (await verifyPasswordAsync(currentPassword, row.password_hash)); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; }
  if (!currentOk) { err(res, 401, 'INVALID_CREDENTIALS', 'Your current password is not correct.'); return; }
  const problem = passwordProblem(newPassword, {phone: row.phone, displayName: row.display_name});
  if (problem) { err(res, 400, 'WEAK_PASSWORD', problem); return; }
  let newHash: string;
  try { newHash = await hashPasswordAsync(newPassword); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; }
  const device = findTrustedDevice(uid, req.cookies?.[DEVICE_COOKIE]);
  getDb().prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, uid);
  bumpSessionVersion(uid);
  revokeAllDevices(uid, device?.id ?? null); // other devices must verify again; this one stays trusted
  supersedeAllForUser(uid);
  issueSession(req, res, uid);
  writeAuditLog({actorUserId: uid, actorRole: 'user', action: 'password_changed', targetType: 'user', targetId: uid, ip: req.ip});
  res.json({ok: true, message: 'Password changed. Your other devices were signed out.'});
}));

authSecurityRouter.post('/account/phone/confirm/start', requireAuth, async (req: AuthedRequest, res) => {
  const u = userRowById(req.user!.id)!;
  if (u.phone_verified_at) { err(res, 409, 'ALREADY_VERIFIED', 'Your phone number is already verified.'); return; }
  if (!hasPhoneOnFile(u.phone)) { err(res, 409, 'PHONE_RECOVERY_REQUIRED', 'This account has no phone number that can receive a code.'); return; }
  try {
    const s = await startChallenge({userId: u.id, purpose: 'phone_confirm', phone: u.phone, ip: ip(req)});
    setChallengeCookie(req, res, s);
    writeAuditLog({actorUserId: u.id, actorRole: 'user', action: 'otp_sent', targetType: 'user', targetId: u.id, details: {purpose: 'phone_confirm'}, ip: req.ip});
    res.json(startedBody(s, 'phone_confirm', u.phone));
  } catch (e) { handleOtpError(res, e); }
});

authSecurityRouter.post('/account/phone/confirm/verify', requireAuth, (req: AuthedRequest, res) => {
  const {publicId, secret} = challengeFrom(req);
  const r = verifyChallenge({publicId, secret, purpose: 'phone_confirm', code: req.body?.code, ip: ip(req), onSuccess: 'consumed'});
  if (!r.ok) { failVerify(res, r); return; }
  const u = userRowById(req.user!.id)!;
  if (r.row.user_id !== u.id || r.row.phone !== u.phone) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  getDb().prepare("UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, datetime('now')), phone_claim_expires_at = NULL WHERE id = ?").run(u.id);
  clearChallengeCookie(req, res);
  writeAuditLog({actorUserId: u.id, actorRole: 'user', action: 'phone_confirmed', targetType: 'user', targetId: u.id, ip: req.ip});
  res.json({ok: true});
});

// ---- changing a verified number: password + code to the CURRENT number + code to the NEW number. Never a silent replace.
authSecurityRouter.post('/account/phone/change/start', requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rl = checkAndRecordRateLimit(hashIdentifier(`pc:${uid}:${ip(req)}`), 'phone_change', 5, 15, true);
  if (!rl.allowed) { err(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait 15 minutes.'); return; }
  if (isSharedDemoAccount(uid)) { sharedRefusal(res); return; }
  const u = userRowById(uid)!;
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(uid) as {password_hash: string};
  let currentOk = false;
  try { currentOk = typeof req.body?.currentPassword === 'string' && (await verifyPasswordAsync(req.body.currentPassword, row.password_hash)); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; }
  if (!currentOk) { err(res, 401, 'INVALID_CREDENTIALS', 'Your current password is not correct.'); return; }
  const p = normalizeLiberianPhone(typeof req.body?.newPhone === 'string' ? req.body.newPhone : '');
  if (!p.valid) { err(res, 400, 'VALIDATION_ERROR', p.error || 'Enter a valid Liberian phone number.'); return; }
  if (p.normalized === u.phone) { err(res, 400, 'VALIDATION_ERROR', 'That is already your number.'); return; }
  const holder = phoneHolder(p.normalized);
  if (holder && (holder.phone_verified_at !== null || !holder.claim_expired)) { err(res, 409, 'PHONE_UNAVAILABLE', 'That number cannot be used for this account.'); return; }
  try {
    // Pending login challenges for this user end now: a phone change must not redirect or revive them.
    supersedeAllForUser(uid);
    const s = u.phone_verified_at && hasPhoneOnFile(u.phone)
      ? await startChallenge({userId: uid, purpose: 'phone_change', phone: u.phone, targetPhone: p.normalized, ip: ip(req)})
      : await startChallenge({userId: uid, purpose: 'phone_change_new', phone: p.normalized, targetPhone: p.normalized, ip: ip(req)});
    setChallengeCookie(req, res, s);
    const step = u.phone_verified_at && hasPhoneOnFile(u.phone) ? 'verify-current' : 'verify-new';
    writeAuditLog({actorUserId: uid, actorRole: 'user', action: 'phone_change_started', targetType: 'user', targetId: uid, details: {step}, ip: req.ip});
    res.json({...startedBody(s, step === 'verify-current' ? 'phone_change' : 'phone_change_new', step === 'verify-current' ? u.phone : p.normalized), step});
  } catch (e) { handleOtpError(res, e); }
});

authSecurityRouter.post('/account/phone/change/verify-current', requireAuth, async (req: AuthedRequest, res) => {
  const {publicId, secret} = challengeFrom(req);
  const r = verifyChallenge({publicId, secret, purpose: 'phone_change', code: req.body?.code, ip: ip(req), onSuccess: 'verified'});
  if (!r.ok) { failVerify(res, r); return; }
  const u = userRowById(req.user!.id)!;
  if (r.row.user_id !== u.id || r.row.phone !== u.phone || !r.row.target_phone) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  try {
    const s = await startChallenge({userId: u.id, purpose: 'phone_change_new', phone: r.row.target_phone, targetPhone: r.row.target_phone, parentId: r.row.id, ip: ip(req)});
    setChallengeCookie(req, res, s);
    res.json({...startedBody(s, 'phone_change_new', r.row.target_phone), step: 'verify-new'});
  } catch (e) { handleOtpError(res, e); }
});

authSecurityRouter.post('/account/phone/change/verify-new', requireAuth, (req: AuthedRequest, res) => {
  const {publicId, secret} = challengeFrom(req);
  const r = verifyChallenge({publicId, secret, purpose: 'phone_change_new', code: req.body?.code, ip: ip(req), onSuccess: 'consumed'});
  if (!r.ok) { failVerify(res, r); return; }
  const uid = req.user!.id;
  const u = userRowById(uid)!;
  const target = r.row.target_phone;
  if (r.row.user_id !== uid || !target) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  const db = getDb();
  if (r.row.parent_id) { // the current number must have approved this change, and only once
    const parent = db.prepare("UPDATE verification_challenges SET status = 'consumed', consumed_ms = ? WHERE id = ? AND user_id = ? AND status = 'verified' AND verified_ms > ?").run(Date.now(), r.row.parent_id, uid, Date.now() - GRANT_MS);
    if (Number(parent.changes) !== 1) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  } else if (u.phone_verified_at) { err(res, 400, 'INVALID_CODE', 'That code is not right or has expired.'); return; }
  db.exec('BEGIN IMMEDIATE;');
  try {
    const holder = phoneHolder(target);
    if (holder && holder.id !== uid) {
      if (holder.phone_verified_at !== null || !holder.claim_expired || !releaseUnverifiedPhone(holder.id)) { db.exec('ROLLBACK;'); err(res, 409, 'PHONE_UNAVAILABLE', 'That number cannot be used for this account.'); return; }
    }
    db.prepare("UPDATE users SET phone = ?, phone_verified_at = datetime('now'), phone_claim_expires_at = NULL, updated_at = datetime('now') WHERE id = ?").run(target, uid);
    bumpSessionVersion(uid);
    const device = findTrustedDevice(uid, req.cookies?.[DEVICE_COOKIE]);
    revokeAllDevices(uid, device?.id ?? null);
    supersedeAllForUser(uid);
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    if (String((e as Error).message).includes('UNIQUE')) { err(res, 409, 'PHONE_UNAVAILABLE', 'That number cannot be used for this account.'); return; }
    throw e;
  }
  issueSession(req, res, uid);
  clearChallengeCookie(req, res);
  writeAuditLog({actorUserId: uid, actorRole: 'user', action: 'phone_changed', targetType: 'user', targetId: uid, ip: req.ip});
  res.json({ok: true});
});

// =================================================================== in-website "Demo SMS Inbox" (development / protected demo only)
/**
 * Shows the simulated message(s) caused by the CALLER'S OWN pending challenge, so a presenter or a synthetic test user can read the code inside the
 * website the way a phone would show it. Authorisation = the HttpOnly challenge cookie (a random secret that only the browser that started the
 * challenge holds, and that only exists after the account's password was accepted, or for recovery/claim after the request was made). It never lists
 * other challenges, other numbers or anything from the operator inbox; dummy challenges (unknown accounts) show an empty inbox. When the feature is off,
 * or on a production server, it behaves like a route that does not exist. The server never logs, stores or returns codes anywhere else.
 */
authSecurityRouter.get('/auth/demo-inbox', (req, res, next) => {
  const cfg = getAuthConfig();
  const provider = getSmsProvider();
  if (!cfg.demoInlineInbox || cfg.production || !(provider instanceof SimulatedSmsProvider)) { next('router'); return; }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!takeRate('demo-inbox', keyHash('ip', ip(req)), 120, 60 * 1000)) { res.setHeader('Retry-After', '30'); err(res, 429, 'RATE_LIMITED', 'Too many requests.'); return; }
  const {publicId, secret} = challengeFrom(req);
  const row = findChallenge(publicId, secret);
  if (!row || !['pending', 'verified'].includes(row.status) || Date.now() >= row.expires_ms + (row.status === 'verified' ? GRANT_MS : 0)) { err(res, 404, 'NO_CHALLENGE', 'There is no verification in progress.'); return; }
  const list = row.status === 'pending' && row.phone !== DUMMY_PHONE ? provider.listForChallenge(row.public_id) : [];
  res.json({
    notice: 'Demo mode — no real SMS was sent.',
    messages: list.map((m) => ({id: m.id, to: maskPhone(m.to), message: m.message, purpose: m.purpose, createdAt: m.createdAt})),
  });
});

// =================================================================== development-only simulated inbox (operator)
function inboxGuard(req: Request, res: Response, next: NextFunction): void {
  const cfg = getAuthConfig();
  const provider = getSmsProvider();
  // Not enabled (or production): behave exactly like a route that does not exist.
  if (!cfg.simulatedInbox || cfg.production || !(provider instanceof SimulatedSmsProvider) || !cfg.operatorToken) { next('router'); return; }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!takeRate('inbox', keyHash('ip', ip(req)), 60, 60 * 1000)) { res.setHeader('Retry-After', '60'); err(res, 429, 'RATE_LIMITED', 'Too many requests.'); return; }
  const given = String(req.get('x-demo-operator-token') ?? '');
  const a = crypto.createHash('sha256').update(given).digest(); const b = crypto.createHash('sha256').update(cfg.operatorToken).digest();
  if (!crypto.timingSafeEqual(a, b)) { err(res, 401, 'UNAUTHORIZED', 'Operator token required.'); return; }
  next();
}
authSecurityRouter.get('/dev/simulated-sms', inboxGuard, (_req, res) => {
  res.json({notice: 'Demo mode: these messages are simulated. Nothing was sent.', messages: (getSmsProvider() as SimulatedSmsProvider).list()});
});
authSecurityRouter.delete('/dev/simulated-sms', inboxGuard, (_req, res) => {
  (getSmsProvider() as SimulatedSmsProvider).clear();
  res.json({ok: true});
});

