import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {CookieJar, req, setBaseUrl} from './harness/http.ts';

/** Backup and restore of the real application database (SQLite), including the privacy-consent and recovery tables, on disposable files only. */
const PW = 'Garden-Harvest-7391!';
const freePort = (): Promise<number> => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
async function boot(dbPath: string, secrets: {s: string; o: string}): Promise<{proc: ChildProcess; stop: () => Promise<void>}> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const port = await freePort(); let out = '';
    const proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '1', SESSION_SECRET: secrets.s, OTP_HMAC_SECRET: secrets.o}});
    proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    const exited = new Promise<void>((r) => proc.on('exit', () => r()));
    for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${port}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); setBaseUrl(`http://127.0.0.1:${port}`); return {proc, stop: async () => { proc.kill(); await exited; }}; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    proc.kill(); if (attempt === 4) assert.fail(`server did not start: ${out}`);
  }
  throw new Error('unreachable');
}
const tool = (script: string, args: string[], dbPath: string) => spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}`, ...args], {cwd: process.cwd(), env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DB_PATH: dbPath}, encoding: 'utf8'});

test('backup and restore keep accounts, passwords, privacy consents and recovery records; a damaged backup is refused; the old file is never deleted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-bkp-')); const dbPath = path.join(dir, 'live.db'); const bdir = path.join(dir, 'backups');
  const secrets = {s: crypto.randomBytes(32).toString('hex'), o: crypto.randomBytes(32).toString('hex')};
  let srv = await boot(dbPath, secrets);
  const jar = new CookieJar(); const phone = '+231886300101';
  assert.equal((await req(jar, '/api/v1/auth/register', {method: 'POST', body: {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Backup Farmer', phone, password: PW, county: 'Bong'}})).status, 201);
  const d = new DatabaseSync(dbPath); const uid = (d.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as {id: number}).id;
  d.prepare("INSERT INTO password_resets (user_id, token_hash, expires_at, verification_method) VALUES (?, ?, datetime('now','+30 minutes'), 'in_person')").run(uid, 'a'.repeat(64)); d.close();

  const b = tool('backup-db.ts', ['--to', bdir], dbPath); assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /backup ok/);
  const file = fs.readdirSync(bdir).find((f) => f.endsWith('.db'))!; const backup = path.join(bdir, file);
  assert.ok(fs.existsSync(`${backup}.sha256`)); assert.equal(fs.statSync(backup).mode & 0o077, 0, 'the backup is private (0600)'); assert.equal(fs.statSync(bdir).mode & 0o077, 0, 'the backup folder is private (0700)');

  // disaster: the account and its records disappear from the live database while the app is stopped
  await srv.stop();
  const w = new DatabaseSync(dbPath); w.exec('PRAGMA foreign_keys = OFF'); for (const t of ['privacy_consents', 'password_resets']) w.prepare(`DELETE FROM ${t}`).run(); w.prepare('DELETE FROM users WHERE id = ?').run(uid); w.close();

  // a damaged copy is refused
  const bad = path.join(bdir, 'agri-20200101-000000Z.db'); fs.copyFileSync(backup, bad); fs.copyFileSync(`${backup}.sha256`, `${bad}.sha256`);
  const bytes = fs.readFileSync(bad); bytes[bytes.length - 20] ^= 0xff; fs.writeFileSync(bad, bytes);
  const refused = tool('restore-db.ts', ['--from', bad, '--confirm'], dbPath); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /checksum mismatch/);
  assert.notEqual(tool('restore-db.ts', ['--from', backup], dbPath).status, 0, 'refuses without --confirm');
  assert.match(tool('restore-db.ts', ['--from', backup, '--dry-run'], dbPath).stdout, /dry run: nothing changed/);
  assert.equal((new DatabaseSync(dbPath, {readOnly: true}).prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?').get(uid) as {c: number}).c, 0, 'the dry run changed nothing');

  const r = tool('restore-db.ts', ['--from', backup, '--confirm'], dbPath); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /restored into/);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('live.db.before-restore-')), 'the replaced database was kept, not deleted');

  srv = await boot(dbPath, secrets);
  try {
    const again = new CookieJar(); assert.equal((await req(again, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password: PW}})).status, 200, 'the account and its password survived the restore');
    const chk = new DatabaseSync(dbPath, {readOnly: true});
    assert.equal((chk.prepare('SELECT COUNT(*) AS c FROM privacy_consents WHERE user_id = ?').get(uid) as {c: number}).c, 1, 'the privacy consent is back');
    assert.equal((chk.prepare('SELECT COUNT(*) AS c FROM password_resets WHERE user_id = ?').get(uid) as {c: number}).c, 1, 'the recovery record is back');
    assert.equal((chk.prepare('PRAGMA integrity_check').get() as {integrity_check: string}).integrity_check, 'ok'); assert.equal(chk.prepare('PRAGMA foreign_key_check').all().length, 0); chk.close();
  } finally { await srv.stop(); fs.rmSync(dir, {recursive: true, force: true}); }
});
