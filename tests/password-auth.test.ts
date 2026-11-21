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
import {AuthConfigError, loadAuthConfig} from '../server/authConfig.ts';

/**
 * Phone number + password authentication WITHOUT SMS (AUTH_REQUIRE_SMS off, the default). Real production-mode server, disposable SQLite database,
 * synthetic accounts only. Nothing is sent and no phone number is ever treated as verified.
 */
const PW = 'Garden-Harvest-7391!';
const phoneOf = (n: number) => `+2318862${String(n).padStart(5, '0')}`; // synthetic numbers on a disposable database
let proc: ChildProcess; let dir = ''; let base = ''; let out = '';
const db = () => new DatabaseSync(path.join(dir, 'p.db'));
const freePort = (): Promise<number> => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const reg = (jar: CookieJar, phone: string, name = 'Test Farmer', password = PW) =>
  req(jar, '/api/v1/auth/register', {method: 'POST', body: {displayName: name, phone, password, county: 'Bong', preferredLanguage: 'en', cropsOfInterest: ['Cassava']}});
const login = (jar: CookieJar, identifier: string, password: string) => req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier, password}});
const clearLimits = () => { const d = db(); d.prepare('DELETE FROM rate_limit_attempts').run(); d.close(); }; // the disposable database only: lets several scenarios share one address

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-pwauth-'));
  for (let attempt = 1; attempt <= 4; attempt++) {
    const port = await freePort(); out = '';
    proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', DB_PATH: path.join(dir, 'p.db'), PORT: String(port), HOST: '127.0.0.1',
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'), OTP_HMAC_SECRET: crypto.randomBytes(32).toString('hex'), TRUST_PROXY: '1'}});
    proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    if (proc.exitCode === null) break;
  }
  assert.equal(proc.exitCode, null, `server did not start: ${out}`);
  setBaseUrl(base);
});
after(() => { proc?.kill(); fs.rmSync(dir, {recursive: true, force: true}); });

test('1. registration accepts standard Liberian formats, stores the number unverified and claims nothing about SMS', async () => {
  const env = await (await fetch(`${base}/api/v1/environment`)).json();
  assert.equal(env.phoneVerification, 'none'); assert.equal(env.simulatedSms, false); assert.equal(env.demoEnvironment, false);
  const formats = ['0886 100 001', '+231 88 610 0002', '231886100003', '0555100004', '077 610 0005', '88 610 0006'];
  for (const f of formats) { const r = await reg(new CookieJar(), f, 'Format Check'); assert.equal(r.status, 201, f + JSON.stringify(r.data)); assert.match(r.data.user.phone, /^\+231\d{9}$/); clearLimits(); }
  assert.equal((await reg(new CookieJar(), '12345', 'Bad')).status, 400, 'a badly formatted number is refused');
  const jar = new CookieJar();
  assert.equal((await reg(jar, phoneOf(1))).status, 201);
  const sec = await req(jar, '/api/v1/account/security');
  assert.equal(sec.status, 200); assert.equal(sec.data.phone.verified, false); assert.equal(sec.data.smsVerification, false); assert.equal(sec.data.phone.claimExpiresAt, null);
  assert.equal(sec.data.recovery.viaVerifiedPhone, false); assert.equal(sec.data.demoMode, false);
  const row = db().prepare('SELECT phone_verified_at, phone_claim_expires_at, password_hash FROM users WHERE phone = ?').get(phoneOf(1)) as {phone_verified_at: string | null; phone_claim_expires_at: string | null; password_hash: string};
  assert.equal(row.phone_verified_at, null); assert.equal(row.phone_claim_expires_at, null);
  assert.ok(!row.password_hash.includes(PW) && row.password_hash.length > 60, 'the password is stored only as a salted hash');
  assert.ok(!out.includes(PW), 'no password in the server log');
});

test('2. password sign-in works on the same and on a new device, after logout and again, with no code and no challenge', async () => {
  clearLimits();
  const a = new CookieJar(); assert.equal((await reg(a, phoneOf(2))).status, 201);
  assert.equal((await req(a, '/api/v1/auth/logout', {method: 'POST', body: {}})).status, 200);
  assert.equal((await req(a, '/api/v1/auth/me')).data.user, null);
  for (const ident of [phoneOf(2), '0' + phoneOf(2).slice(4), phoneOf(2).slice(1), `${phoneOf(2).slice(0, 4)} ${phoneOf(2).slice(4, 6)} ${phoneOf(2).slice(6)}`]) {
    const j = new CookieJar(); const r = await login(j, ident, PW);
    assert.equal(r.status, 200, ident); assert.ok(r.data.user && !r.data.status, 'a session, never VERIFICATION_REQUIRED');
    assert.ok(j.cookies.has('agri_session') && !j.cookies.has('agri_challenge'));
    assert.equal((await req(j, '/api/v1/auth/me')).data.user.phone, phoneOf(2));
  }
  const again = new CookieJar(); assert.equal((await login(again, phoneOf(2), PW)).status, 200);
  await req(again, '/api/v1/auth/logout', {method: 'POST', body: {}});
  assert.equal((await login(again, phoneOf(2), PW)).status, 200, 'log in again after logout');
});

test('3. wrong passwords, unknown numbers and a phone number alone never sign anyone in; errors are identical', async () => {
  clearLimits();
  const jar = new CookieJar(); assert.equal((await reg(jar, phoneOf(3))).status, 201); await req(jar, '/api/v1/auth/logout', {method: 'POST', body: {}});
  const wrong = await login(new CookieJar(), phoneOf(3), 'Wrong-Password-1!'); const unknown = await login(new CookieJar(), phoneOf(999), 'Wrong-Password-1!');
  assert.equal(wrong.status, 401); assert.equal(unknown.status, 401); assert.deepEqual(wrong.data, unknown.data, 'no account enumeration');
  const noPw = new CookieJar();
  for (const body of [{identifier: phoneOf(3)}, {identifier: phoneOf(3), password: ''}, {identifier: phoneOf(3), password: null}, {password: PW}]) {
    const r = await req(noPw, '/api/v1/auth/login', {method: 'POST', body}); assert.ok([400, 401].includes(r.status), JSON.stringify(body)); assert.ok(!noPw.cookies.has('agri_session'));
  }
  assert.equal((await req(noPw, '/api/v1/auth/me')).data.user, null);
  assert.equal((await login(new CookieJar(), phoneOf(3), PW)).status, 200, 'the right password still works');
});

test('4. CSRF is enforced and the session cookie is HttpOnly, Secure and SameSite', async () => {
  const jar = new CookieJar(); await req(jar, '/api/v1/csrf-token');
  const noCsrf = await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phoneOf(3), password: PW}, skipCsrf: true});
  assert.equal(noCsrf.status, 403); assert.ok(!jar.cookies.has('agri_session'));
  clearLimits();
  const r = await login(new CookieJar(), phoneOf(3), PW); const sc = r.headers.getSetCookie().find((c) => c.startsWith('agri_session='))!;
  assert.match(sc, /HttpOnly/i); assert.match(sc, /Secure/i); assert.match(sc, /SameSite=Lax/i);
});

test('5. duplicate numbers: one account per number, in every spelling, forever (no 72-hour takeover, no automatic transfer)', async () => {
  clearLimits();
  const owner = new CookieJar(); assert.equal((await reg(owner, phoneOf(5), 'First Owner')).status, 201);
  for (const spelling of [phoneOf(5), '0' + phoneOf(5).slice(4), phoneOf(5).slice(1), phoneOf(5).slice(4)]) {
    const r = await reg(new CookieJar(), spelling, 'Someone Else', 'Another-Garden-4821!'); assert.equal(r.status, 409, spelling); assert.equal(r.data.error.code, 'PHONE_EXISTS'); clearLimits();
  }
  const d = db(); d.prepare("UPDATE users SET created_at = datetime('now','-30 days'), phone_claim_expires_at = datetime('now','-29 days') WHERE phone = ?").run(phoneOf(5)); d.close();
  const late = await reg(new CookieJar(), phoneOf(5), 'Late Takeover', 'Another-Garden-4821!');
  assert.equal(late.status, 409, 'an old unverified number is NOT released to a newcomer'); clearLimits();
  assert.equal((await req(owner, '/api/v1/auth/me')).data.user.displayName, 'First Owner', 'the first owner keeps the session');
  assert.equal((await login(new CookieJar(), phoneOf(5), PW)).status, 200);
  assert.equal((await login(new CookieJar(), phoneOf(5), 'Another-Garden-4821!')).status, 401, 'the newcomer password does not work');
  const row = db().prepare('SELECT phone, display_name FROM users WHERE display_name = ?').get('First Owner') as {phone: string};
  assert.equal(row.phone, phoneOf(5), 'the number was never tombstoned or moved');
  assert.equal((db().prepare("SELECT COUNT(*) AS c FROM users WHERE phone LIKE 'released:%'").get() as {c: number}).c, 0);
});

test('6. recovery: no reset by phone number alone; identical answers; every code route is closed and explains verified assistance', async () => {
  clearLimits();
  const known = await req(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: phoneOf(5)}});
  const unknown = await req(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: phoneOf(998)}});
  assert.equal(known.status, 200); assert.equal(known.data.recovery, 'assisted'); assert.deepEqual(known.data, unknown.data);
  assert.match(known.data.message, /verified assistance/); assert.ok(!/code (has been|was) sent/i.test(known.data.message));
  const jar = new CookieJar();
  for (const [p, body] of [['/api/v1/auth/forgot-password/verify', {code: '123456'}], ['/api/v1/auth/reset-password', {newPassword: 'New-Garden-Pass-55!'}], ['/api/v1/auth/verify-device', {code: '123456'}], ['/api/v1/auth/resend-code', {}], ['/api/v1/auth/phone-claim/start', {phone: phoneOf(5)}], ['/api/v1/auth/phone-claim/verify', {code: '123456'}]] as const) {
    const r = await req(jar, p, {method: 'POST', body}); assert.equal(r.status, 409, p); assert.equal(r.data.error.code, 'SMS_NOT_USED');
  }
  assert.equal((await login(new CookieJar(), phoneOf(5), 'New-Garden-Pass-55!')).status, 401, 'no password was changed');
  assert.ok(!jar.cookies.has('agri_challenge'));
});

test('7. a signed-in farmer cannot change the phone number, and an unverified account gains no privileges or other people\'s records', async () => {
  clearLimits();
  const f = new CookieJar(); assert.equal((await reg(f, phoneOf(7), 'Farmer Seven')).status, 201);
  for (const p of ['/api/v1/account/phone/confirm/start', '/api/v1/account/phone/change/start']) { const r = await req(f, p, {method: 'POST', body: {currentPassword: PW, newPhone: phoneOf(70)}}); assert.equal(r.status, 409, p); }
  assert.equal((await req(f, '/api/v1/auth/me')).data.user.phone, phoneOf(7));
  const me = (await req(f, '/api/v1/auth/me')).data.user; assert.deepEqual(me.roles, ['farmer']); assert.equal(me.expertStatus, null);
  for (const p of ['/api/v1/admin/overview', '/api/v1/admin/users']) assert.equal((await req(f, p)).status, 403, p);
  assert.equal((await req(f, '/api/v1/expert/profile', {method: 'PATCH', body: {specialty: 'x'}})).status, 403);
  assert.equal((await req(f, '/api/v1/admin/demo/market-data', {method: 'POST', body: {}})).status, 403);
  const anon = new CookieJar();
  for (const p of ['/api/v1/account/security', '/api/v1/account/devices', '/api/v1/admin/overview']) assert.ok([401, 403].includes((await req(anon, p)).status), p);
  // sensitive change needs the CURRENT password
  assert.equal((await req(f, '/api/v1/account/password', {method: 'POST', body: {currentPassword: 'Not-The-Password-1!', newPassword: 'Brand-New-Garden-55!'}})).status, 401);
  // two farmers never see each other's records
  const g = new CookieJar(); assert.equal((await reg(g, phoneOf(8), 'Farmer Eight')).status, 201);
  const mine = await req(f, '/api/v1/auth/me'); const theirs = await req(g, '/api/v1/auth/me'); assert.notEqual(mine.data.user.id, theirs.data.user.id);
});

test('8. sign-in is rate limited (429 after repeated wrong passwords) and the right password is then also held back', async () => {
  clearLimits();
  const jar = new CookieJar(); assert.equal((await reg(jar, phoneOf(9), 'Limit Test')).status, 201); await req(jar, '/api/v1/auth/logout', {method: 'POST', body: {}});
  let got429 = false;
  for (let i = 0; i < 12; i++) { const r = await login(new CookieJar(), phoneOf(9), `Wrong-Guess-${i}-xY!`); if (r.status === 429) { got429 = true; break; } assert.equal(r.status, 401); }
  assert.ok(got429, 'throttled');
  assert.equal((await login(new CookieJar(), phoneOf(9), PW)).status, 429, 'the account is throttled for this address, even with the right password');
});

test('9. configuration: AUTH_REQUIRE_SMS needs a provider, and the live default is password-only', () => {
  const prod = {NODE_ENV: 'production', OTP_HMAC_SECRET: crypto.randomBytes(32).toString('hex'), SESSION_SECRET: crypto.randomBytes(32).toString('hex')} as NodeJS.ProcessEnv;
  assert.equal(loadAuthConfig(prod).requireSms, false);
  assert.throws(() => loadAuthConfig({...prod, AUTH_REQUIRE_SMS: '1'}), AuthConfigError);
  assert.equal(loadAuthConfig({...prod, APP_ENV: 'demo', DEMO_ENV_ACK: 'synthetic-accounts-only', SMS_PROVIDER: 'simulated', AUTH_REQUIRE_SMS: '1'}).requireSms, true);
});
