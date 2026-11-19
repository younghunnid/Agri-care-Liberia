import {getDb, getDbPath, closeDb} from '../server/db.ts';
import {normalizeLiberianPhone} from '../src/lib/phone.ts';
import {bumpSessionVersion, phoneHolder, releaseUnverifiedPhone, revokeAllDevices} from '../server/authSecurity.ts';
import {supersedeAllForUser} from '../server/otp.ts';
import {writeAuditLog} from '../server/security.ts';

/**
 * OPERATOR RECOVERY for an account whose registered phone number cannot receive codes (lost SIM, number reassigned, tombstoned claim).
 *
 *   DB_PATH=... tsx scripts/recover-account.ts --user <current phone | email | id> --new-phone <+231...> --reason "<how identity was checked>" --confirm
 *
 * The operator MUST first verify the person's identity out of band (for example in person at an extension office or by a call to a number already
 * known to the programme). The script then: points the account at the new number as UNVERIFIED, ends every session (session_version), revokes every
 * trusted device, cancels pending codes, and writes an audit record (reason, no secrets). The farmer signs in with their password and the code goes to
 * the NEW number; only then is the number verified and the device trusted. The script never sets a password and never signs anyone in.
 */
const arg = (flag: string): string | undefined => { const i = process.argv.indexOf(flag); return i !== -1 ? process.argv[i + 1] : undefined; };
const fail = (msg: string): never => { console.error(msg); closeDb(); process.exit(2); };

const who = arg('--user');
const newPhoneRaw = arg('--new-phone');
const reason = (arg('--reason') ?? '').trim();
if (!who || !newPhoneRaw || reason.length < 10 || !process.argv.includes('--confirm')) {
  fail('usage: tsx scripts/recover-account.ts --user <phone|email|id> --new-phone <+231...> --reason "<how identity was verified, 10+ chars>" --confirm');
}
const p = normalizeLiberianPhone(newPhoneRaw!);
if (!p.valid) fail('The new phone number is not a valid Liberian number.');

const db = getDb();
console.log(`Database: ${getDbPath()}`);
const row = (/^\d+$/.test(who!)
  ? db.prepare('SELECT id, phone, status FROM users WHERE id = ?').get(Number(who))
  : db.prepare('SELECT id, phone, status FROM users WHERE phone = ? OR lower(email) = ?').get(normalizeLiberianPhone(who!).normalized || who!, who!.toLowerCase())) as {id: number; phone: string; status: string} | undefined;
if (!row) fail('No such account.');
const user = row!;
const holder = phoneHolder(p.normalized);
if (holder && holder.id !== user.id) {
  if (holder.phone_verified_at !== null) fail('That number belongs to another account with a verified phone. Choose a different number.');
  if (!holder.claim_expired && !process.argv.includes('--release-unverified')) fail('That number is held by another unverified, unexpired claim. Re-run with --release-unverified if you have verified that the person owns it.');
  if (!releaseUnverifiedPhone(holder.id)) fail('Could not release the other claim.');
}
db.exec('BEGIN IMMEDIATE;');
try {
  db.prepare("UPDATE users SET phone = ?, phone_verified_at = NULL, phone_claim_expires_at = datetime('now', '+72 hours'), updated_at = datetime('now') WHERE id = ?").run(p.normalized, user.id);
  bumpSessionVersion(user.id);
  revokeAllDevices(user.id);
  supersedeAllForUser(user.id);
  db.exec('COMMIT;');
} catch (e) {
  db.exec('ROLLBACK;');
  closeDb();
  throw e;
}
writeAuditLog({actorUserId: null, actorRole: 'operator', action: 'account_recovery_by_operator', targetType: 'user', targetId: user.id, details: {reason: reason.slice(0, 200)}});
console.log(`Account ${user.id} now points at the new number (unverified). All sessions and trusted devices were ended.`);
console.log('The farmer can sign in with the existing password; the verification code will be sent to the NEW number.');
closeDb();
