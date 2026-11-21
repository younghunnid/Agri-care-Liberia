import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {spawn, type ChildProcess} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {CookieJar, req, setBaseUrl} from './harness/http.ts';

/**
 * Phone number + password accounts AND *440# participant enrollment on one protected demo server (synthetic numbers only, disposable database).
 * No identity is duplicated, a phone number never grants access to anything, and enrollment never touches authentication or roles.
 */
const PW = 'Garden-Harvest-7391!';
let proc: ChildProcess; let dir = ''; let base = ''; let out = '';
const db = () => new DatabaseSync(path.join(dir, 'p.db'));
const freePort = (): Promise<number> => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const clearLimits = () => { const d = db(); d.prepare('DELETE FROM rate_limit_attempts').run(); d.close(); };
const deviceKey = () => crypto.randomBytes(24).toString('hex');
const register = (jar: CookieJar, phone: string, name: string) => req(jar, '/api/v1/auth/register', {method: 'POST', body: {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: name, phone, password: PW, county: 'Bong', preferredLanguage: 'en', cropsOfInterest: []}});
const enroll = (jar: CookieJar, key: string, body: Record<string, unknown> = {}) => req(jar, '/api/v1/participants/enroll', {method: 'POST', headers: {'X-Requester-Key': key}, body: {category: 'Farmer', county: 'Bong', consent: true, consentVersion: 'ussd-demo-v1', ...body}});
const me = (jar: CookieJar, key: string) => req(jar, '/api/v1/participants/me', {headers: {'X-Requester-Key': key}});
const count = (sql: string, ...a: string[]) => (db().prepare(sql).get(...a) as {c: number}).c;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-authussd-'));
  for (let attempt = 1; attempt <= 4; attempt++) {
    const port = await freePort(); out = '';
    proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', APP_ENV: 'demo', DEMO_ENV_ACK: 'synthetic-accounts-only', SMS_PROVIDER: 'simulated',
      DB_PATH: path.join(dir, 'p.db'), PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '1',
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'), OTP_HMAC_SECRET: crypto.randomBytes(32).toString('hex')}});
    proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    if (proc.exitCode === null) break;
  }
  assert.equal(proc.exitCode, null, `server did not start: ${out}`);
  setBaseUrl(base);
});
after(() => { proc?.kill(); fs.rmSync(dir, {recursive: true, force: true}); });

test('1. the combined server runs password-only sign-in (no SMS) with *440# enrollment available in the protected demo', async () => {
  const env = await (await fetch(`${base}/api/v1/environment`)).json();
  assert.equal(env.demoEnvironment, true); assert.equal(env.phoneVerification, 'none'); assert.equal(env.simulatedSms, false);
  const mig = db().prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {version: string}[];
  assert.ok(mig.some((m) => m.version === '011_demo_seed_keys.sql') && mig.some((m) => m.version === '20261121_ussd_440_participant_registry.sql'), 'both migration lines applied');
  assert.equal(mig[mig.length - 1].version, '20261121_ussd_440_participant_registry.sql');
});

test('2. device enrollment, then website registration and sign-in: one identity, linked once, never duplicated', async () => {
  const key = deviceKey(); const anon = new CookieJar();
  assert.equal((await enroll(anon, key)).status, 200);
  assert.equal((await enroll(anon, key)).status, 200, 'a retry reuses the same participant');
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations WHERE user_id IS NULL'), 1);
  const jar = new CookieJar(); assert.equal((await register(jar, '+231770000511', 'Linked Farmer')).status, 201);
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1, 'registering a website account does not create a participant');
  const beforeUser = db().prepare('SELECT password_hash, phone_verified_at, session_version, phone FROM users WHERE phone = ?').get('+231770000511');
  assert.equal((await me(jar, key)).data.participant, null, 'a signed-in account does not inherit an anonymous device participant until it consents');
  const linked = await enroll(jar, key); assert.equal(linked.status, 200); assert.equal(linked.data.participant.identity, 'account');
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1, 'the device participant was LINKED, not duplicated');
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations WHERE user_id IS NOT NULL'), 1);
  assert.deepEqual(db().prepare('SELECT password_hash, phone_verified_at, session_version, phone FROM users WHERE phone = ?').get('+231770000511'), beforeUser, 'enrollment changed no authentication field');
  assert.equal((await enroll(jar, key)).status, 200); assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1);
  const other = await me(jar, deviceKey()); assert.equal(other.data.participant?.identity, 'account', 'the account is recognised from a new browser: no second participant is needed');
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1);
  // a different browser profile that is signed out cannot take over the linked identity
  const stranger = await enroll(new CookieJar(), key); assert.equal(stranger.status, 403);
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1);
});

test('3. a phone number alone never identifies, links or unlocks anything', async () => {
  clearLimits();
  const key = deviceKey();
  for (const extra of [{phone: '+231770000511'}, {identifier: '+231770000511'}, {userId: 1}, {phoneVerified: true}, {phone_verified_at: '2026-01-01'}, {role: 'admin'}, {roles: ['expert']}, {password: PW}]) {
    const r = await enroll(new CookieJar(), key, extra); assert.equal(r.status, 400, JSON.stringify(extra));
  }
  assert.equal(count('SELECT COUNT(*) AS c FROM participant_registrations'), 1, 'nothing was created by the refused requests');
  assert.equal((await me(new CookieJar(), key)).data.participant, null);
  const noPw = new CookieJar(); const r = await req(noPw, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231770000511'}});
  assert.ok([400, 401].includes(r.status)); assert.equal((await req(noPw, '/api/v1/auth/me')).data.user, null);
  assert.equal((await req(noPw, '/api/v1/participants/me', {headers: {'X-Requester-Key': deviceKey()}})).data.participant, null);
});

test('4. choosing "Agricultural Expert" is only a label: no role, no approval, no expert or admin access', async () => {
  clearLimits();
  const jar = new CookieJar(); assert.equal((await register(jar, '+231770000512', 'Self Expert')).status, 201);
  assert.equal((await enroll(jar, deviceKey(), {category: 'Agricultural Expert'})).status, 200);
  const user = (await req(jar, '/api/v1/auth/me')).data.user; assert.deepEqual(user.roles, ['farmer']); assert.equal(user.expertStatus, null);
  assert.equal((await req(jar, '/api/v1/expert/profile', {method: 'PATCH', body: {specialty: 'x'}})).status, 403);
  for (const p of ['/api/v1/ministry/participants', '/api/v1/admin/overview', '/api/v1/admin/users']) assert.equal((await req(jar, p)).status, 403, p);
  assert.equal((await req(new CookieJar(), '/api/v1/ministry/participants')).status, 401);
  const row = db().prepare('SELECT phone_verified_at FROM users WHERE phone = ?').get('+231770000512') as {phone_verified_at: string | null};
  assert.equal(row.phone_verified_at, null, 'the number is still unverified');
});

test('5. the old 72-hour takeover stays closed on the combined app, and the one-account-per-number rule covers USSD-linked accounts', async () => {
  clearLimits();
  const d = db(); d.prepare("UPDATE users SET created_at = datetime('now','-30 days'), phone_claim_expires_at = datetime('now','-29 days') WHERE phone = '+231770000511'").run(); d.close();
  const late = await register(new CookieJar(), '+231770000511', 'Takeover Attempt'); assert.equal(late.status, 409);
  const ok = new CookieJar(); assert.equal((await req(ok, '/api/v1/auth/login', {method: 'POST', body: {identifier: '0770000511', password: PW}})).status, 200);
  assert.equal((await me(ok, deviceKey())).data.participant?.identity, 'account');
  assert.equal(count("SELECT COUNT(*) AS c FROM users WHERE phone LIKE 'released:%'"), 0);
});

test('6. the demo environment still refuses real (non-synthetic) numbers; the public summary stays approximate', async () => {
  clearLimits();
  const r = await register(new CookieJar(), '+231886123456', 'Real Number'); assert.equal(r.status, 422); assert.equal(r.data.error.code, 'PHONE_NOT_ALLOWED');
  const s = await req(new CookieJar(), '/api/v1/prototype/management-summary'); assert.equal(s.data.precision, 'approximate');
});
