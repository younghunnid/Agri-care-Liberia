import {getDb} from './db.ts';
import {PUBLISHED_DEMO_ACCOUNTS, verifyPassword} from './security.ts';

/** Returns the phone numbers of accounts whose password is a published demo password (documented in project files, therefore not secret). */
export function findKnownDemoCredentials(): string[] {
  const db = getDb();
  const out: string[] = [];
  for (const {phone, password} of PUBLISHED_DEMO_ACCOUNTS) {
    const row = db.prepare('SELECT password_hash FROM users WHERE phone = ?').get(phone) as {password_hash: string} | undefined;
    if (row && verifyPassword(password, row.password_hash)) out.push(phone);
  }
  return out;
}
