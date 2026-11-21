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
 * Administrator-assisted password recovery, privacy consent and synthetic-account isolation, on a real production-mode server (SMS off) with a
 * disposable SQLite database and synthetic people. Nothing is sent anywhere.
 */
const PW = 'Garden-Harvest-7391!';
const NEWPW = 'Brand-New-Maize-5520!';
const phoneOf = (n: number) => `+2318863${String(n).padStart(5, '0')}`;
let proc: ChildProcess; let dir = ''; let base = ''; let out = '';
const db = () => new DatabaseSync(path.join(dir, 'p.db'));
const freePort = (): Promise<number> => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const clearLimits = () => { const d = db(); d.prepare('DELETE FROM rate_limit_attempts').run(); d.close(); };
const consent = {privacyConsent: true, privacyVersion: 'privacy-v1'};
const register = (jar: CookieJar, phone: string, name: string, extra: Record<string, unknown> = {}) =>
  req(jar, '/api/v1/auth/register', {method: 'POST', body: {...consent, displayName: name, phone, password: PW, county: 'Bong', preferredLanguage: 'en', cropsOfInterest: [], ...extra}});
const login = (jar: CookieJar, identifier: string, password: string) => req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier, password}});
const idOf = (phone: string) => (db().prepare('SELECT id FROM users WHERE phone = ?').get(phone) as {id: number}).id;
function grantRole(phone: string, role: 'admin' | 'expert', approvedExpert = false) {
  const d = db(); const id = idOf(phone);
  d.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, (SELECT id FROM roles WHERE name = ?))').run(id, role);
  if (approvedExpert) d.prepare("INSERT OR REPLACE INTO expert_profiles (user_id, specialty, county, approval_status, approved_at) VALUES (?, 'Rice', 'Bong', 'approved', datetime('now'))").run(id);
  d.close();
}
async function person(n: number, name: string, role?: 'admin' | 'expert'): Promise<{jar: CookieJar; phone: string}> {
  clearLimits(); const phone = phoneOf(n); const jar = new CookieJar();
  assert.equal((await register(jar, phone, name)).status, 201);
  if (role) { grantRole(phone, role, role === 'expert'); const j = new CookieJar(); assert.equal((await login(j, phone, PW)).status, 200); return {jar: j, phone}; }
  return {jar, phone};
}
const issue = (jar: CookieJar, userId: number, body: Record<string, unknown> = {}) =>
  req(jar, `/api/v1/admin/users/${userId}/recovery`, {method: 'POST', body: {method: 'in_person', note: 'Met at the Gbarnga extension office, checked ID card.', adminPassword: PW, identityConfirmed: true, ...body}});
const redeem = (jar: CookieJar, identifier: string, code: unknown, newPassword: unknown = NEWPW) => req(jar, '/api/v1/auth/recovery/redeem', {method: 'POST', body: {identifier, code, newPassword}});

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-recovery-'));
  for (let attempt = 1; attempt <= 4; attempt++) {
    const port = await freePort(); out = '';
    proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', DB_PATH: path.join(dir, 'p.db'), PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '1',
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

test('1. privacy consent: registration needs the current notice version and records it; the notice page is public', async () => {
  clearLimits();
  const none = await req(new CookieJar(), '/api/v1/auth/register', {method: 'POST', body: {displayName: 'No Consent', phone: phoneOf(1), password: PW, county: 'Bong'}});
  assert.equal(none.status, 400); assert.equal(none.data.error.code, 'PRIVACY_CONSENT_REQUIRED');
  for (const bad of [{privacyConsent: false, privacyVersion: 'privacy-v1'}, {privacyConsent: 'yes', privacyVersion: 'privacy-v1'}, {privacyConsent: true, privacyVersion: 'privacy-v0'}, {privacyConsent: true}]) {
    const r = await req(new CookieJar(), '/api/v1/auth/register', {method: 'POST', body: {...bad, displayName: 'Bad Consent', phone: phoneOf(1), password: PW, county: 'Bong'}}); assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((db().prepare("SELECT COUNT(*) AS c FROM users WHERE phone = ?").get(phoneOf(1)) as {c: number}).c, 0, 'a refused registration creates no account');
  const ok = await register(new CookieJar(), phoneOf(1), 'Consenting Farmer'); assert.equal(ok.status, 201);
  const row = db().prepare('SELECT notice_version, accepted_at FROM privacy_consents WHERE user_id = ?').get(idOf(phoneOf(1))) as {notice_version: string; accepted_at: string};
  assert.equal(row.notice_version, 'privacy-v1'); assert.ok(row.accepted_at);
  const page = await fetch(`${base}/privacy`); assert.equal(page.status, 200);
});

test('2. only an administrator can issue a recovery code; farmers, buyers, experts and visitors cannot reset anyone', async () => {
  const victim = await person(2, 'Victim Farmer'); const vid = idOf(victim.phone);
  const farmer = await person(3, 'Other Farmer'); const expert = await person(4, 'Expert Person', 'expert'); const admin = await person(5, 'Admin Person', 'admin');
  assert.equal((await issue(new CookieJar(), vid)).status, 401);
  for (const [who, jar] of [['farmer', farmer.jar], ['expert', expert.jar], ['the victim themselves', victim.jar]] as const) assert.equal((await issue(jar, vid)).status, 403, who);
  assert.equal((await req(farmer.jar, `/api/v1/admin/users/${vid}/recovery`, {method: 'DELETE'})).status, 403);
  assert.equal((await redeem(farmer.jar, victim.phone, 'ABCD-EFGH-JKMN')).status, 400);
  assert.equal((db().prepare('SELECT COUNT(*) AS c FROM password_resets').get() as {c: number}).c, 0, 'nothing was created by the refused requests');
  const ok = await issue(admin.jar, vid); assert.equal(ok.status, 201);
  assert.match(ok.data.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/); assert.equal(ok.data.expiresInMinutes, 30);
  assert.equal(ok.data.user.phone.includes(victim.phone.slice(-3)), true); assert.ok(!ok.data.user.phone.includes('886'), 'the phone is masked');
});

test('3. the administrator must confirm identity, describe the check and re-enter their own password; some accounts are never recoverable here', async () => {
  const admin = await person(6, 'Admin Two', 'admin'); const target = await person(7, 'Target Seven'); const tid = idOf(target.phone);
  assert.equal((await issue(admin.jar, tid, {identityConfirmed: false})).data.error.code, 'IDENTITY_NOT_CONFIRMED');
  assert.equal((await issue(admin.jar, tid, {identityConfirmed: undefined})).status, 400);
  assert.equal((await issue(admin.jar, tid, {method: 'because'})).status, 400);
  assert.equal((await issue(admin.jar, tid, {note: 'short'})).status, 400);
  const wrong = await issue(admin.jar, tid, {adminPassword: 'Not-My-Password-1!'}); assert.equal(wrong.status, 401);
  assert.equal((await issue(admin.jar, tid, {adminPassword: undefined})).status, 401);
  assert.equal((db().prepare('SELECT COUNT(*) AS c FROM password_resets WHERE user_id = ?').get(tid) as {c: number}).c, 0);
  assert.equal((await issue(admin.jar, idOf(admin.phone))).status, 403, 'not for your own account');
  const other = await person(8, 'Admin Three', 'admin'); assert.equal((await issue(admin.jar, idOf(other.phone))).status, 403, 'not for another administrator');
  const synth = await person(9, 'Synthetic Look'); const d = db(); d.prepare("UPDATE users SET phone = '+231770000333' WHERE id = ?").run(idOf(synth.phone)); d.close();
  assert.equal((await issue(admin.jar, idOf('+231770000333'))).status, 403, 'not for a demonstration account');
  assert.equal((await issue(admin.jar, 999999)).status, 404);
  const susp = await person(10, 'Suspended Person'); const d2 = db(); d2.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(idOf(susp.phone)); d2.close();
  assert.equal((await issue(admin.jar, idOf(susp.phone))).status, 409);
  assert.ok((db().prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'password_recovery_reauth_failed'").get() as {c: number}).c >= 2, 'failed re-authentication is audited');
});

test('4. full recovery: code works once, user picks a new password, old password and every old session stop working, nobody is signed in by recovery', async () => {
  const admin = await person(11, 'Admin Four', 'admin'); const user = await person(12, 'Forgetful Farmer'); const uid = idOf(user.phone);
  const second = new CookieJar(); assert.equal((await login(second, user.phone, PW)).status, 200);
  assert.equal((await req(user.jar, '/api/v1/auth/me')).data.user.displayName, 'Forgetful Farmer');
  const {data} = await issue(admin.jar, uid); const code = data.code as string;
  // the code is never stored or logged in clear
  const rows = db().prepare('SELECT token_hash, issued_by_user_id, verification_method, used_at, attempts FROM password_resets WHERE user_id = ?').all(uid) as {token_hash: string; issued_by_user_id: number; verification_method: string; used_at: string | null; attempts: number}[];
  assert.equal(rows.length, 1); assert.ok(!rows[0].token_hash.includes(code.replace(/-/g, '')) && rows[0].token_hash.length === 64); assert.equal(rows[0].issued_by_user_id, idOf(admin.phone)); assert.equal(rows[0].verification_method, 'in_person');
  assert.ok(!out.includes(code) && !out.includes(code.replace(/-/g, '')));
  const anon = new CookieJar();
  const weak = await redeem(anon, user.phone, code, 'short'); assert.equal(weak.status, 400); assert.equal(weak.data.error.code, 'WEAK_PASSWORD');
  assert.equal((await redeem(anon, user.phone, code, 'password1234')).status, 400, 'a common password is refused');
  const good = await redeem(anon, user.phone.replace('+231', '0'), code.toLowerCase().replace(/-/g, ' ')); assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.ok(!anon.cookies.get('agri_session'), 'recovery never signs anyone in (the session cookie is empty/cleared)'); assert.equal((await req(anon, '/api/v1/auth/me')).data.user, null);
  assert.equal((await login(new CookieJar(), user.phone, PW)).status, 401, 'the old password no longer works');
  assert.equal((await req(user.jar, '/api/v1/auth/me')).data.user, null, 'an existing session ended');
  assert.equal((await req(second, '/api/v1/auth/me')).data.user, null, 'every device session ended');
  assert.equal((await login(new CookieJar(), user.phone, NEWPW)).status, 200, 'the new password works');
  assert.equal((await redeem(new CookieJar(), user.phone, code, 'Another-Fresh-Pass-77!')).status, 400, 'the code works once');
  assert.equal((await login(new CookieJar(), user.phone, 'Another-Fresh-Pass-77!')).status, 401);
  const actions = (db().prepare("SELECT action FROM audit_logs WHERE target_id = ? ORDER BY id").all(String(uid)) as {action: string}[]).map((r) => r.action);
  assert.ok(actions.includes('password_recovery_started') && actions.includes('password_recovery_completed'), `audited: ${actions}`);
  const details = JSON.stringify(db().prepare("SELECT details_json FROM audit_logs WHERE action LIKE 'password_recovery%'").all());
  assert.ok(!details.includes(code) && !details.includes(NEWPW) && !details.includes(PW), 'the audit log holds no code and no password');
  assert.ok((db().prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'password_recovery_started' AND actor_user_id = ?").get(idOf(admin.phone)) as {c: number}).c >= 1);
});

test('5. wrong, expired, replaced, cancelled and over-guessed codes all fail with one identical answer; unknown numbers look the same', async () => {
  const admin = await person(13, 'Admin Five', 'admin'); const user = await person(14, 'Guess Farmer'); const uid = idOf(user.phone);
  const a = (await issue(admin.jar, uid)).data.code as string;
  const wrong = await redeem(new CookieJar(), user.phone, 'ZZZZ-ZZZZ-ZZZZ'); const unknown = await redeem(new CookieJar(), phoneOf(99999), 'ZZZZ-ZZZZ-ZZZZ');
  assert.equal(wrong.status, 400); assert.deepEqual(wrong.data, unknown.data, 'a wrong code and an unknown number answer identically');
  for (const bad of [undefined, null, 12345, '', 'ABC']) assert.equal((await redeem(new CookieJar(), user.phone, bad)).status, 400);
  assert.equal((await redeem(new CookieJar(), user.phone, a, null)).status, 400);
  // a newer code replaces the older one
  const b = (await issue(admin.jar, uid)).data.code as string; assert.notEqual(a, b);
  assert.equal((await redeem(new CookieJar(), user.phone, a)).status, 400, 'the replaced code is dead'); clearLimits();
  // expiry
  const d = db(); d.prepare("UPDATE password_resets SET expires_at = datetime('now','-1 minute') WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL").run(uid); d.close();
  assert.equal((await redeem(new CookieJar(), user.phone, b)).status, 400, 'an expired code is dead');
  // cancel
  const c = (await issue(admin.jar, uid)).data.code as string;
  assert.equal((await req(admin.jar, `/api/v1/admin/users/${uid}/recovery`, {method: 'DELETE'})).data.cancelled, 1);
  assert.equal((await redeem(new CookieJar(), user.phone, c)).status, 400, 'a cancelled code is dead'); clearLimits();
  // guessing: five wrong tries kill the code, even for the right value afterwards
  const e = (await issue(admin.jar, uid)).data.code as string;
  for (let i = 0; i < 5; i++) { assert.equal((await redeem(new CookieJar(), user.phone, `AAAA-AAAA-AAA${i + 2}`)).status, 400); }
  clearLimits();
  assert.equal((await redeem(new CookieJar(), user.phone, e)).status, 400, 'the code was locked after 5 wrong guesses');
  assert.equal((await login(new CookieJar(), user.phone, PW)).status, 200, 'the original password still works: nothing changed');
  assert.ok((db().prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action IN ('password_recovery_locked','password_recovery_failed','password_recovery_cancelled')").get() as {c: number}).c >= 3);
});

test('6. redeem is rate limited, and a phone number alone or the old reset routes never reset a password', async () => {
  clearLimits(); const user = await person(15, 'Limit Farmer');
  let limited = false;
  for (let i = 0; i < 20; i++) { const r = await redeem(new CookieJar(), user.phone, `BBBB-BBBB-BBB${(i % 8) + 2}`); if (r.status === 429) { limited = true; break; } assert.equal(r.status, 400); }
  assert.ok(limited, 'throttled after repeated attempts'); clearLimits();
  const phoneOnly = await req(new CookieJar(), '/api/v1/auth/recovery/redeem', {method: 'POST', body: {identifier: user.phone, newPassword: NEWPW}}); assert.equal(phoneOnly.status, 400);
  for (const p of ['/api/v1/auth/reset-password', '/api/v1/auth/forgot-password/verify']) assert.equal((await req(new CookieJar(), p, {method: 'POST', body: {identifier: user.phone, newPassword: NEWPW, code: '123456'}})).status, 409, p);
  const forgot = await req(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: user.phone}}); assert.equal(forgot.data.recovery, 'assisted');
  assert.equal((await login(new CookieJar(), user.phone, PW)).status, 200, 'the password is unchanged');
  const noCsrf = await req(new CookieJar(), '/api/v1/auth/recovery/redeem', {method: 'POST', body: {identifier: user.phone, code: 'ABCD-EFGH-JKMN', newPassword: NEWPW}, skipCsrf: true}); assert.equal(noCsrf.status, 403);
});

test('7. synthetic accounts cannot interact with genuine users in a real deployment', async () => {
  clearLimits();
  const reserved = await register(new CookieJar(), '+231770000444', 'Reserved Range'); assert.equal(reserved.status, 422); assert.equal(reserved.data.error.code, 'PHONE_RESERVED');
  // a genuine request from a genuine farmer
  const farmer = new CookieJar();
  const created = await req(farmer, '/api/v1/expert-requests/demo', {method: 'POST', body: {requesterKey: crypto.randomBytes(24).toString('hex'), farmerName: 'Real Farmer', category: 'Poultry farming', county: 'Margibi', title: 'Genuine question about coops', description: 'Heavy rain splashed onto wood shavings in one corner of our chicken house.'}});
  assert.equal(created.status, 201); const rid = created.data.request.id;
  // a genuine approved expert sees and answers it; a synthetic "approved expert" (old demo account on the reserved range) cannot
  const real = await person(16, 'Real Expert', 'expert'); const synth = await person(17, 'Demo Expert Look', 'expert');
  const d = db(); d.prepare("UPDATE users SET phone = '+231770000201' WHERE id = ?").run(idOf(synth.phone)); d.close();
  const synthJar = new CookieJar(); assert.equal((await login(synthJar, '+231770000201', PW)).status, 200);
  const realList = await req(real.jar, '/api/v1/expert-requests/demo'); assert.ok(realList.data.requests.some((r: {id: number}) => r.id === rid), 'the genuine expert sees the genuine request');
  const synthList = await req(synthJar, '/api/v1/expert-requests/demo'); assert.ok(!synthList.data.requests.some((r: {id: number}) => r.id === rid), 'the synthetic expert cannot see it');
  const synthReply = await req(synthJar, `/api/v1/expert-requests/demo/${rid}/reply`, {method: 'PATCH', body: {expertReply: 'Do this and that for the coop.', status: 'Answered'}}); assert.equal(synthReply.status, 403);
  assert.equal(((db().prepare('SELECT status FROM demo_expert_requests WHERE id = ?').get(rid)) as {status: string}).status, 'Submitted', 'the genuine request was not answered by a demo account');
  assert.equal((await req(real.jar, `/api/v1/expert-requests/demo/${rid}/reply`, {method: 'PATCH', body: {expertReply: 'Move the bedding and keep it dry.', status: 'Answered'}})).status, 200);
});

test('8. verified and unverified numbers are distinguished: admin list, own account, and no claim of verification anywhere', async () => {
  const admin = await person(18, 'Admin Eight', 'admin'); const user = await person(19, 'Plain User');
  const users = (await req(admin.jar, '/api/v1/admin/users')).data.users as {phone: string; phone_verified: number}[];
  assert.ok(users.length >= 3 && users.every((u) => u.phone_verified === 0), 'none of these numbers is verified');
  const d = db(); d.prepare("UPDATE users SET phone_verified_at = datetime('now') WHERE phone = ?").run(user.phone); d.close();
  const again = (await req(admin.jar, '/api/v1/admin/users')).data.users as {phone: string; phone_verified: number}[];
  assert.equal(again.find((u) => u.phone === user.phone)!.phone_verified, 1); assert.equal(again.filter((u) => u.phone_verified === 1).length, 1);
  const sec = await req(user.jar, '/api/v1/account/security'); assert.equal(sec.data.phone.verified, true);
});
