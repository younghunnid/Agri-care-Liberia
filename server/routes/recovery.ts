import crypto from 'node:crypto';
import {Router} from 'express';
import {getDb} from '../db.ts';
import {getAuthConfig} from '../authConfig.ts';
import {normalizeLiberianPhone} from '../../src/lib/phone.ts';
import {RECOVERY_METHODS} from '../../src/lib/privacy.ts';
import {
  type AuthedRequest, PasswordBusyError, SESSION_COOKIE_NAME, asyncRoute, checkAndRecordRateLimit, clearCookieOptions, clientAddress, hashIdentifier, hashPasswordAsync,
  isSharedDemoAccount, isSyntheticAccount, requireRole, verifyAgainstDummy, verifyPasswordAsync, writeAuditLog,
} from '../security.ts';
import {DEVICE_COOKIE, bumpSessionVersion, passwordProblem, revokeAllDevices} from '../authSecurity.ts';
import {supersedeAllForUser} from '../otp.ts';

/**
 * ADMINISTRATOR-ASSISTED PASSWORD RECOVERY (no SMS).
 *
 * 1. An administrator first establishes who the person is OUTSIDE this website (in person, a call to a number the programme already knew, an extension office).
 *    Knowing or typing a phone number is never proof. The administrator records how, re-enters their own password, and receives a one-time recovery code.
 * 2. The administrator gives the code to the person (in person or on the known call). The code is shown once, never stored (keyed hash only), expires in
 *    30 minutes, works once, and is cancelled after 5 wrong guesses or when a newer code is issued.
 * 3. The person opens "Use a recovery code", enters their phone number, the code and a NEW password. The old password is never shown or retrievable.
 * 4. Success ends every session and trusted device, cancels outstanding codes and writes an audit record. Nobody is signed in by recovery.
 */
export const recoveryRouter = Router();

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 12;
const TTL_MINUTES = 30;
const MAX_WRONG = 5;
const err = (res: import('express').Response, status: number, code: string, message: string): void => { res.status(status).json({error: {code, message}}); };
const busy = (res: import('express').Response): void => { res.setHeader('Retry-After', '3'); err(res, 503, 'SERVER_BUSY', 'The server is busy. Please try again in a moment.'); };
const INVALID = 'That recovery code is not valid or has expired. Ask the Agricare Liberia team for a new one.';

const hashCode = (code: string): string => crypto.createHmac('sha256', getAuthConfig().otpSecret).update(`recovery|${code}`).digest('hex');
const normalizeCode = (raw: unknown): string => (typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
function newCode(): string {
  let out = '';
  while (out.length < CODE_LENGTH) { const b = crypto.randomBytes(1)[0]; if (b < 248) out += CODE_ALPHABET[b % 31]; } // 248 = 31 * 8: no modulo bias
  return out;
}
const display = (c: string): string => c.match(/.{4}/g)!.join('-');
const maskPhone = (p: string): string => (/^\+231\d{9}$/.test(p) ? `+231 ••• ••• ${p.slice(-3)}` : '•••');

// ----------------------------------------------------------------------------------------------------------------------------- administrator: issue / cancel
recoveryRouter.post('/admin/users/:id/recovery', requireRole('admin'), asyncRoute(async (req: AuthedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const admin = req.user!;
  if (!checkAndRecordRateLimit(hashIdentifier(`recovery-issue:${admin.id}`), 'recovery_issue', 20, 60, true).allowed) { res.setHeader('Retry-After', '3600'); err(res, 429, 'RATE_LIMITED', 'Too many recovery codes issued. Please wait.'); return; }
  const targetId = Number(req.params.id);
  const {method, note, adminPassword, identityConfirmed} = req.body ?? {};
  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (identityConfirmed !== true) { err(res, 400, 'IDENTITY_NOT_CONFIRMED', 'Confirm that you checked this person\'s identity independently, not just by their phone number.'); return; }
  if (!RECOVERY_METHODS.some((m) => m.value === method)) { err(res, 400, 'VALIDATION_ERROR', 'Choose how the person\'s identity was established.'); return; }
  if (cleanNote.length < 10 || cleanNote.length > 300) { err(res, 400, 'VALIDATION_ERROR', 'Describe the identity check (10 to 300 characters). Do not write passwords or codes.'); return; }
  const adminRow = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(admin.id) as {password_hash: string} | undefined;
  let reauth = false;
  try { reauth = Boolean(adminRow) && typeof adminPassword === 'string' && (await verifyPasswordAsync(adminPassword, adminRow!.password_hash)); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; }
  if (!reauth) { writeAuditLog({actorUserId: admin.id, actorRole: 'admin', action: 'password_recovery_reauth_failed', targetType: 'user', targetId, ip: req.ip}); err(res, 401, 'INVALID_CREDENTIALS', 'Your own password is not correct.'); return; }
  const db = getDb();
  const target = Number.isInteger(targetId) ? db.prepare(`SELECT u.id, u.status, u.phone, u.display_name, GROUP_CONCAT(r.name) AS roles FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id WHERE u.id = ? GROUP BY u.id`).get(targetId) as {id: number; status: string; phone: string; display_name: string; roles: string | null} | undefined : undefined;
  if (!target) { err(res, 404, 'NOT_FOUND', 'User not found.'); return; }
  if (target.id === admin.id) { err(res, 403, 'RECOVERY_NOT_ALLOWED', 'Use Account Security to change your own password.'); return; }
  if ((target.roles ?? '').split(',').includes('admin')) { err(res, 403, 'RECOVERY_NOT_ALLOWED', 'Administrator accounts cannot be recovered here. Use the operator tools on the server.'); return; }
  if (isSharedDemoAccount(target.id) || isSyntheticAccount(target.id)) { err(res, 403, 'RECOVERY_NOT_ALLOWED', 'Demonstration accounts cannot be recovered here.'); return; }
  if (target.status !== 'active') { err(res, 409, 'ACCOUNT_INACTIVE', 'This account is suspended. Reactivate it first if that is intended.'); return; }
  const code = newCode();
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare("UPDATE password_resets SET revoked_at = datetime('now') WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL").run(target.id); // a newer code replaces older ones
    db.prepare(`INSERT INTO password_resets (user_id, token_hash, expires_at, issued_by_user_id, verification_method) VALUES (?, ?, datetime('now', ?), ?, ?)`)
      .run(target.id, hashCode(code), `+${TTL_MINUTES} minutes`, admin.id, method);
    db.exec('COMMIT;');
  } catch (e) { db.exec('ROLLBACK;'); throw e; }
  writeAuditLog({actorUserId: admin.id, actorRole: 'admin', action: 'password_recovery_started', targetType: 'user', targetId: target.id, details: {method, note: cleanNote, expiresMinutes: TTL_MINUTES}, ip: req.ip});
  const expiresAt = (db.prepare("SELECT expires_at AS e FROM password_resets WHERE token_hash = ?").get(hashCode(code)) as {e: string}).e;
  res.status(201).json({code: display(code), expiresAt, expiresInMinutes: TTL_MINUTES, user: {id: target.id, displayName: target.display_name, phone: maskPhone(target.phone)},
    instructions: 'Give this code to the person yourself (in person or on the call you used to check who they are). It is shown only now, works once, and expires. They choose their own new password.'});
}));

recoveryRouter.delete('/admin/users/:id/recovery', requireRole('admin'), (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const r = getDb().prepare("UPDATE password_resets SET revoked_at = datetime('now') WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL").run(targetId);
  writeAuditLog({actorUserId: req.user!.id, actorRole: 'admin', action: 'password_recovery_cancelled', targetType: 'user', targetId, details: {cancelled: Number(r.changes)}, ip: req.ip});
  res.json({ok: true, cancelled: Number(r.changes)});
});

// ----------------------------------------------------------------------------------------------------------------------------- the person: redeem the code
recoveryRouter.post('/auth/recovery/redeem', asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ip = clientAddress(req);
  const {identifier, code, newPassword} = req.body ?? {};
  const rawIdent = typeof identifier === 'string' ? identifier.trim().slice(0, 120) : '';
  const phone = normalizeLiberianPhone(rawIdent);
  const subject = phone.valid ? phone.normalized : rawIdent.toLowerCase();
  const ipOk = checkAndRecordRateLimit(hashIdentifier(`recovery-ip:${ip}`), 'recovery_redeem', 15, 60, true).allowed;
  const subjectOk = checkAndRecordRateLimit(hashIdentifier(`recovery-id:${subject}`), 'recovery_redeem', 8, 60, true).allowed;
  if (!ipOk || !subjectOk) { res.setHeader('Retry-After', '3600'); err(res, 429, 'RATE_LIMITED', 'Too many attempts. Please try again later.'); return; }
  const cleanCode = normalizeCode(code);
  if (!phone.valid || cleanCode.length !== CODE_LENGTH || typeof newPassword !== 'string') { await verifyAgainstDummy('x'); err(res, 400, 'RECOVERY_INVALID', INVALID); return; }
  const db = getDb();
  const user = db.prepare('SELECT id, phone, display_name, status FROM users WHERE phone = ?').get(phone.normalized) as {id: number; phone: string; display_name: string; status: string} | undefined;
  const row = user ? db.prepare(`SELECT id, token_hash, attempts FROM password_resets WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
      ORDER BY id DESC LIMIT 1`).get(user.id) as {id: number; token_hash: string; attempts: number} | undefined : undefined;
  const given = Buffer.from(hashCode(cleanCode));
  const real = Buffer.from(row?.token_hash ?? hashCode('0'.repeat(CODE_LENGTH)));
  const match = given.length === real.length && crypto.timingSafeEqual(given, real) && Boolean(row) && user?.status === 'active';
  if (!match) {
    if (row) {
      const attempts = row.attempts + 1;
      db.prepare("UPDATE password_resets SET attempts = ?, revoked_at = CASE WHEN ? >= ? THEN datetime('now') ELSE revoked_at END WHERE id = ?").run(attempts, attempts, MAX_WRONG, row.id);
      writeAuditLog({actorUserId: user!.id, actorRole: 'user', action: attempts >= MAX_WRONG ? 'password_recovery_locked' : 'password_recovery_failed', targetType: 'user', targetId: user!.id, ip: req.ip});
    }
    err(res, 400, 'RECOVERY_INVALID', INVALID); // identical for unknown numbers, wrong codes, expired, used and cancelled codes
    return;
  }
  const problem = passwordProblem(newPassword, {phone: user!.phone, displayName: user!.display_name});
  if (problem) { err(res, 400, 'WEAK_PASSWORD', problem); return; } // the code is NOT consumed: the person can choose a better password
  let newHash: string;
  try { newHash = await hashPasswordAsync(newPassword); } catch (e) { if (e instanceof PasswordBusyError) { busy(res); return; } throw e; }
  db.exec('BEGIN IMMEDIATE;');
  try {
    const won = db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')").run(row!.id);
    if (Number(won.changes) !== 1) { db.exec('ROLLBACK;'); err(res, 400, 'RECOVERY_INVALID', INVALID); return; } // exactly one caller can spend a code
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, user!.id);
    db.prepare("UPDATE password_resets SET revoked_at = datetime('now') WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL").run(user!.id);
    bumpSessionVersion(user!.id); // every existing session ends
    revokeAllDevices(user!.id);
    supersedeAllForUser(user!.id);
    db.exec('COMMIT;');
  } catch (e) { db.exec('ROLLBACK;'); throw e; }
  writeAuditLog({actorUserId: user!.id, actorRole: 'user', action: 'password_recovery_completed', targetType: 'user', targetId: user!.id, details: {sessionsRevoked: true, devicesRevoked: true}, ip: req.ip});
  res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions(req, true));
  res.clearCookie(DEVICE_COOKIE, clearCookieOptions(req, true));
  res.json({ok: true, message: 'Your password was changed. Please sign in with your new password. All other devices were signed out.'}); // never signs the user in
}));
