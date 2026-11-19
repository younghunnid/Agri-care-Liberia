import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

/**
 * Consistent online backup of the SQLite database (safe while the app is running; uses VACUUM INTO, not a file copy of a live WAL database).
 *
 *   DB_PATH=/home/<user>/agri-data/agri.db node backup-db.js --to /home/<user>/agri-backups [--keep 14]
 *
 * Writes agri-YYYYMMDD-HHMMSSZ.db (+ .sha256), verifies PRAGMA integrity_check on the copy, and keeps the newest N backups (default 14).
 * Backups contain farmer data (photos, phone numbers): keep the folder private (the script creates it 0700 and the files 0600) and outside public_html.
 */
const arg = (f: string): string | undefined => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : undefined; };
const fail = (m: string): never => { console.error(`backup failed: ${m}`); process.exit(1); };

const dbPath = path.resolve(process.env.DB_PATH || '');
const to = arg('--to');
const keep = Number(arg('--keep') ?? 14);
if (!process.env.DB_PATH || !fs.existsSync(dbPath)) fail('DB_PATH must point to the existing database file');
if (!to) fail('usage: node backup-db.js --to <folder> [--keep N]');
if (!Number.isInteger(keep) || keep < 1 || keep > 365) fail('--keep must be 1 to 365');
const dir = path.resolve(to!);
if (/public_html/.test(dir)) fail('the backup folder must not be inside public_html');
fs.mkdirSync(dir, {recursive: true, mode: 0o700});

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const out = path.join(dir, `agri-${stamp}.db`);
if (fs.existsSync(out)) fail('backup file already exists');

const src = new DatabaseSync(dbPath);
try {
  src.exec('PRAGMA busy_timeout = 10000;');
  src.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
} finally { src.close(); }
fs.chmodSync(out, 0o600);

const copy = new DatabaseSync(out);
let users = -1;
try {
  const ic = (copy.prepare('PRAGMA integrity_check').get() as {integrity_check: string}).integrity_check;
  if (ic !== 'ok') { fs.unlinkSync(out); fail(`integrity check of the copy failed: ${ic}`); }
  users = (copy.prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c;
} finally { copy.close(); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
fs.writeFileSync(`${out}.sha256`, `${sha}  ${path.basename(out)}\n`, {mode: 0o600});

const all = fs.readdirSync(dir).filter((f) => /^agri-\d{8}-\d{6}Z\.db$/.test(f)).sort();
for (const old of all.slice(0, Math.max(0, all.length - keep))) { fs.unlinkSync(path.join(dir, old)); try { fs.unlinkSync(path.join(dir, `${old}.sha256`)); } catch { /* none */ } }
console.log(`backup ok: ${out} (${fs.statSync(out).size} bytes, ${users} accounts, integrity ok, sha256 ${sha.slice(0, 12)}…). Kept ${Math.min(all.length, keep)} backup(s).`);
