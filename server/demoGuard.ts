import {getDb} from './db.ts';
import {verifyPassword} from './security.ts';

/** Accounts that exist only in demonstrations; their passwords are PUBLISHED in project documents, so they must never be usable on a real deployment. */
const KNOWN: [string, string][] = [['+231770000101', 'FarmerDemo!2026'], ['+231770000201', 'ExpertDemo!2026']];

/** Returns the phone numbers of accounts whose password is a published demo password. */
export function findKnownDemoCredentials(): string[] {
  const db = getDb();
  const out: string[] = [];
  for (const [phone, pw] of KNOWN) {
    const row = db.prepare('SELECT password_hash FROM users WHERE phone = ?').get(phone) as {password_hash: string} | undefined;
    if (row && verifyPassword(pw, row.password_hash)) out.push(phone);
  }
  return out;
}
