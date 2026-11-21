import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

/**
 * Restore a backup made by backup-db.js. STOP THE APP FIRST (hPanel: stop the Node.js app) so nothing writes to the database.
 *
 *   DB_PATH=/home/<user>/agri-data/agri.db node restore-db.js --from /home/<user>/agri-backups/agri-20260101-120000Z.db --confirm [--dry-run]
 *
 * Verifies the sha256 sidecar (if present) and PRAGMA integrity_check, moves the current database aside as <db>.before-restore-<time> (never deletes it),
 * removes stale -wal/-shm files, and puts the backup in place atomically (copy to a temporary name, then rename).
 */
const arg = (f: string): string | undefined => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : undefined; };
const fail = (m: string): never => { console.error(`restore failed: ${m}`); process.exit(1); };

const from = arg('--from');
if (!from || !process.env.DB_PATH) fail('usage: DB_PATH=<database> node restore-db.js --from <backup file> --confirm [--dry-run]');
const src = path.resolve(from!);
const dst = path.resolve(process.env.DB_PATH!);
if (!fs.existsSync(src)) fail('backup file not found');
if (src === dst) fail('the backup and the live database are the same file');
const dry = process.argv.includes('--dry-run');
if (!dry && !process.argv.includes('--confirm')) fail('refusing without --confirm (use --dry-run to only verify)');

if (fs.existsSync(`${src}.sha256`)) {
  const expected = fs.readFileSync(`${src}.sha256`, 'utf8').split(/\s+/)[0];
  const actual = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  if (expected !== actual) fail('checksum mismatch: the backup file is damaged or was modified');
}
const chk = new DatabaseSync(src, {readOnly: true});
let users = -1;
try {
  const ic = (chk.prepare('PRAGMA integrity_check').get() as {integrity_check: string}).integrity_check;
  if (ic !== 'ok') fail(`integrity check failed: ${ic}`);
  users = (chk.prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c;
} catch (e) { fail(`not a valid Agricare backup (${(e as Error).message})`); } finally { chk.close(); }
console.log(`backup verified: ${users} accounts, integrity ok${fs.existsSync(`${src}.sha256`) ? ', checksum ok' : ' (no checksum file)'}.`);
if (dry) { console.log('dry run: nothing changed.'); process.exit(0); }

fs.mkdirSync(path.dirname(dst), {recursive: true});
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
if (fs.existsSync(dst)) { fs.renameSync(dst, `${dst}.before-restore-${stamp}`); console.log(`current database moved to ${dst}.before-restore-${stamp}`); }
for (const ext of ['-wal', '-shm']) { try { fs.renameSync(`${dst}${ext}`, `${dst}${ext}.before-restore-${stamp}`); } catch { /* none */ } }
const tmp = `${dst}.restoring-${process.pid}`;
fs.copyFileSync(src, tmp);
fs.chmodSync(tmp, 0o600);
fs.renameSync(tmp, dst);
console.log(`restored into ${dst}. Start the app again and run the staging checks.`);
