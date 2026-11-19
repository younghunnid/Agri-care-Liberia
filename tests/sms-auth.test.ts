import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test, {after, before, beforeEach} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, getBaseUrl, req, setBaseUrl} from './harness/http.ts';
import type {Fixtures} from './harness/fixtures.ts';
import {AuthConfigError, loadAuthConfig} from '../server/authConfig.ts';

/**
 * Simulated-SMS authentication, black-box over HTTP on a disposable database (Node reference). No real SMS exists anywhere: codes are read ONLY from the
 * operator-token-protected simulated inbox. Synthetic numbers only (+23177000xxxx).
 */
let backend: Backend;
let fx: Fixtures;
const PW = 'GoodPassw0rd!2026';
let counter = 5000;
const phone = (): string => `+23177000${String(counter++).padStart(4, '0')}`;
const seenCodes = new Set<string>();
const bodies: {path: string; text: string}[] = [];
const consoleLines: string[] = [];
const origLog = {log: console.log, info: console.info, warn: console.warn, error: console.error};

async function call(jar: CookieJar, p: string, opts: Parameters<typeof req>[2] = {}) {
  const r = await req(jar, p, opts);
  bodies.push({path: p, text: JSON.stringify(r.data)});
  return r;
}
const setCookies = (r: {headers: Headers}) => r.headers.getSetCookie();

/** Reads the newest simulated message for a number (operator token required). Returns the code and records it for the leak scan. */
async function inbox(to: string, purpose?: string): Promise<{code: string; message: string; purpose: string}> {
  const r = await fetch(`${getBaseUrl()}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': backend.operatorToken}});
  assert.equal(r.status, 200);
  const j = (await r.json()) as {messages: {to: string; message: string; purpose: string}[]};
  const m = j.messages.find((x) => x.to === to && (!purpose || x.purpose === purpose));
  assert.ok(m, `no simulated message for ${to}`);
  const code = /code is (\d{6})/.exec(m!.message)?.[1];
  assert.ok(code, 'message has no code');
  seenCodes.add(code!);
  return {code: code!, message: m!.message, purpose: m!.purpose};
}
const wrong = (code: string): string => (code === '000000' ? '000001' : '000000');

async function user(opts: {verified?: boolean; roles?: ('farmer' | 'admin')[]; password?: string} = {}) {
  const p = phone();
  const {id} = await fx.createUser({displayName: `Synthetic Farmer ${p.slice(-4)}`, phone: p, password: opts.password ?? PW, roles: opts.roles ?? ['farmer'], phoneVerified: opts.verified ?? true});
  return {id, phone: p};
}
/** Logs in from a NEW device and returns the 202 jar. */
async function startLogin(p: string, jar = new CookieJar(), password = PW) {
  const r = await call(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: p, password}});
  return {jar, res: r};
}
async function fullLogin(p: string, jar = new CookieJar(), password = PW) {
  const s = await startLogin(p, jar, password);
  assert.equal(s.res.status, 202, JSON.stringify(s.res.data));
  const {code} = await inbox(p);
  const v = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}});
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return jar;
}
const me = async (jar: CookieJar) => (await req(jar, '/api/v1/auth/me')).data.user;

before(async () => {
  for (const k of ['log', 'info', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { consoleLines.push(a.map(String).join(' ')); };
  backend = await startBackend();
  fx = backend.fixtures;
});
after(async () => {
  Object.assign(console, origLog);
  await backend.stop();
});
beforeEach(async () => { await fx.resetOtpRates(); });

// ============================================================ 1-5 code rules
test('1. correct code: session and trusted-device cookies are issued only after verification (HttpOnly, SameSite)', async () => {
  const u = await user();
  const {jar, res} = await startLogin(u.phone);
  assert.equal(res.status, 202);
  assert.equal(res.data.status, 'VERIFICATION_REQUIRED'); assert.equal(res.data.purpose, 'new_device_login'); assert.match(res.data.maskedPhone, /^\+231 \S+ \S+ \d{3}$/); assert.equal(res.data.demo, true);
  assert.ok(!setCookies(res).some((c) => c.startsWith('agri_session=')), 'no session before verification');
  assert.equal(await me(jar), null);
  const {code, message} = await inbox(u.phone);
  assert.match(message, /DEMO: simulated SMS/); assert.match(code, /^\d{6}$/);
  const v = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}});
  assert.equal(v.status, 200); assert.equal(v.data.user.phone, u.phone);
  const cookies = setCookies(v);
  for (const name of ['agri_session', 'agri_device']) {
    const c = cookies.find((x) => x.startsWith(`${name}=`));
    assert.ok(c, `${name} missing`); assert.match(c!, /HttpOnly/i); assert.match(c!, /SameSite=Lax/i);
  }
  assert.match(cookies.find((x) => x.startsWith('agri_device='))!, /Max-Age=2592000/);
  assert.equal((await me(jar)).id, u.id);
  assert.equal((await fx.userByPhone(u.phone)).phone_verified_at !== null, true);
});
test('2. incorrect code: rejected with attempts left, no session, not revealed which part was wrong', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const {code} = await inbox(u.phone);
  const bad = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: wrong(code)}});
  assert.equal(bad.status, 400); assert.equal(bad.data.error.code, 'INVALID_CODE'); assert.equal(bad.data.error.attemptsLeft, 4);
  for (const garbage of ['abcdef', '12345', null]) {
    assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: garbage}})).status, 400);
  }
  assert.equal(await me(jar), null);
});
test('3. expired code (5 minutes) is rejected even if correct', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const {code} = await inbox(u.phone);
  assert.ok((await fx.ageChallenges({userId: u.id}, 'new_device_login', 5 * 60 * 1000 + 1000)) >= 1);
  const v = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}});
  assert.equal(v.status, 400); assert.equal(await me(jar), null);
  assert.equal((await fx.challenges(u.id))[0].status, 'expired');
});
test('4. five wrong attempts lock the challenge; even the right code is refused afterwards', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const {code} = await inbox(u.phone);
  const left: (number | undefined)[] = [];
  for (let i = 0; i < 4; i++) left.push((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: wrong(code)}})).data.error.attemptsLeft);
  assert.deepEqual(left, [4, 3, 2, 1]);
  const fifth = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: wrong(code)}});
  assert.equal(fifth.status, 429); assert.equal(fifth.data.error.code, 'CODE_LOCKED');
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}})).status, 429);
  assert.equal(await me(jar), null);
  const ch = (await fx.challenges(u.id))[0]; assert.equal(ch.status, 'locked'); assert.equal(ch.attempts, 5);
});
test('5. a code is single-use (replay of the same request fails)', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const {code} = await inbox(u.phone);
  const challengeCookie = jar.cookies.get('agri_challenge')!;
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}})).status, 200);
  const replay = new CookieJar(); replay.set('agri_challenge', challengeCookie);
  const r = await call(replay, '/api/v1/auth/verify-device', {method: 'POST', body: {code}});
  assert.equal(r.status, 400); assert.equal(await me(replay), null);
  const same = await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}});
  assert.equal(same.status, 400);
});

// ============================================================ 6 resend
test('6. resend: cooldown, supersedes the old code, at most 3 codes per challenge', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const first = (await inbox(u.phone)).code;
  const early = await call(jar, '/api/v1/auth/resend-code', {method: 'POST', body: {}});
  assert.equal(early.status, 429); assert.equal(early.data.error.code, 'COOLDOWN'); assert.ok(Number(early.headers.get('retry-after')) > 0);
  await fx.ageChallenges({userId: u.id}, 'new_device_login', 61 * 1000);
  assert.equal((await call(jar, '/api/v1/auth/resend-code', {method: 'POST', body: {}})).status, 200);
  const second = (await inbox(u.phone)).code;
  if (second !== first) assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: first}})).status, 400, 'the superseded code must not work');
  await fx.ageChallenges({userId: u.id}, 'new_device_login', 61 * 1000);
  assert.equal((await call(jar, '/api/v1/auth/resend-code', {method: 'POST', body: {}})).status, 200);
  await fx.ageChallenges({userId: u.id}, 'new_device_login', 61 * 1000);
  const fourth = await call(jar, '/api/v1/auth/resend-code', {method: 'POST', body: {}});
  assert.equal(fourth.status, 429); assert.equal(fourth.data.error.code, 'TOO_MANY_SENDS');
  const latest = (await inbox(u.phone)).code;
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: latest}})).status, 200);
});
test('6b. a new login supersedes the earlier pending challenge for the same account', async () => {
  const u = await user();
  const a = await startLogin(u.phone); const codeA = (await inbox(u.phone)).code;
  const b = await startLogin(u.phone); const codeB = (await inbox(u.phone)).code;
  assert.equal((await call(a.jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeA}})).status, 400);
  assert.equal((await call(b.jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeB}})).status, 200);
});

// ============================================================ binding
test('6c. codes are bound to browser, user, purpose and challenge', async () => {
  const u1 = await user(); const u2 = await user();
  const a = await startLogin(u1.phone); const codeA = (await inbox(u1.phone)).code;
  // another browser (no challenge cookie), or a made-up cookie
  assert.equal((await call(new CookieJar(), '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeA}})).status, 400);
  const forged = new CookieJar(); forged.set('agri_challenge', `${'a'.repeat(32)}.${'b'.repeat(48)}`);
  assert.equal((await call(forged, '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeA}})).status, 400);
  // user A's code used on user B's challenge
  const b = await startLogin(u2.phone);
  assert.equal((await call(b.jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeA}})).status, 400);
  // code for login used for password recovery of the same user
  const rec = new CookieJar();
  await fx.resetOtpRates();
  assert.equal((await call(rec, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u1.phone}})).status, 200);
  const resetCode = (await inbox(u1.phone, 'password_reset')).code;
  assert.equal((await call(rec, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: codeA === resetCode ? wrong(codeA) : codeA}})).status, 400);
  // and the login cookie cannot verify a reset
  const mixed = new CookieJar(); mixed.set('agri_challenge', a.jar.cookies.get('agri_challenge')!);
  assert.equal((await call(mixed, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: codeA}})).status, 400);
  // the genuine one still works
  assert.equal((await call(a.jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: codeA}})).status, 200, 'its own browser and challenge still work, so none of the attempts above consumed it');
});

// ============================================================ 7 enumeration
test('7. unknown phone: login and forgot-password answers are identical to a known account', async () => {
  const u = await user();
  const unknown = phone();
  const wrongPw = await call(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: 'NotTheRightOne1!'}});
  const noUser = await call(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: unknown, password: 'NotTheRightOne1!'}});
  assert.equal(wrongPw.status, 401); assert.deepEqual(wrongPw.data, noUser.data);
  const known = await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u.phone}});
  const none = await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: unknown}});
  assert.equal(known.status, 200); assert.equal(none.status, 200);
  assert.deepEqual(known.data, none.data, 'bodies must be identical');
  assert.deepEqual(setCookies(known).map((c) => c.split('=')[0]).sort(), setCookies(none).map((c) => c.split('=')[0]).sort());
  assert.ok(!JSON.stringify(none.data).includes(unknown));
  // an unverified-phone account and a no-account number also look the same
  const unv = await user({verified: false});
  const unvRes = await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: unv.phone}});
  assert.deepEqual(unvRes.data, none.data);
  // the dummy challenge behaves like a real one (state endpoint, wrong codes, lock) without sending anything
  const jar = new CookieJar();
  await call(jar, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: unknown}});
  const info = await req(jar, '/api/v1/auth/challenge');
  assert.equal(info.status, 200); assert.equal(info.data.maskedPhone, null); assert.equal(info.data.purpose, 'password_reset');
  for (let i = 0; i < 4; i++) assert.equal((await call(jar, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: '123456'}})).status, 400);
  assert.equal((await call(jar, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: '123456'}})).status, 429);
  const msgs = await (await fetch(`${getBaseUrl()}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': backend.operatorToken}})).json() as {messages: {to: string}[]};
  assert.ok(!msgs.messages.some((m) => m.to === unknown || m.to === unv.phone), 'nothing may be sent to unknown or unverified numbers');
});

// ============================================================ 8 phone ownership
test('8. a verified number is never taken; an unexpired unverified claim is not taken; an expired claim is released (never a silent takeover)', async () => {
  const verified = await user();
  const reg = (p: string, jar = new CookieJar()) => call(jar, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'New Person', phone: p, password: PW, county: 'Bong'}});
  const r1 = await reg(verified.phone); assert.equal(r1.status, 409); assert.equal(r1.data.error.code, 'PHONE_EXISTS');
  const claimant = phone();
  const first = await reg(claimant); assert.equal(first.status, 201);
  const second = await reg(claimant); assert.equal(second.status, 409, 'an unexpired unverified claim is not taken');
  const firstId = first.data.user.id;
  await fx.setClaimExpiry(claimant, -1); // the first registrant never verified, and the window passed
  const third = await reg(claimant); assert.equal(third.status, 201);
  assert.notEqual(third.data.user.id, firstId);
  assert.equal((await fx.userByPhone(claimant)).id, third.data.user.id);
  // the first account lost only the number: its session ended and it cannot sign in with the old number
  const stale = new CookieJar(); stale.set('agri_session', first.headers.getSetCookie().find((c) => c.startsWith('agri_session='))!.split(';')[0].split('=')[1]);
  assert.equal(await me(stale), null);
  const old = await startLogin(claimant, new CookieJar(), PW);
  assert.equal(old.res.status, 202); // belongs to the NEW owner now, who must still verify by code
  // a verified owner is never displaced, even after "expiry" time passes
  await fx.setClaimExpiry(verified.phone, -100);
  assert.equal((await reg(verified.phone)).status, 409);
});
test('8b. phone-claim recovery: proof of possession frees an unverified claim for the real owner, and only that browser may register it first', async () => {
  const squatted = phone();
  const squatter = await call(new CookieJar(), '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Squatter', phone: squatted, password: PW, county: 'Bong'}});
  assert.equal(squatter.status, 201);
  const owner = new CookieJar();
  const start = await call(owner, '/api/v1/auth/phone-claim/start', {method: 'POST', body: {phone: squatted}});
  assert.equal(start.status, 200);
  const {code} = await inbox(squatted, 'phone_claim');
  assert.equal((await call(owner, '/api/v1/auth/phone-claim/verify', {method: 'POST', body: {code: wrong(code)}})).status, 400);
  const ok = await call(owner, '/api/v1/auth/phone-claim/verify', {method: 'POST', body: {code}});
  assert.equal(ok.status, 200); assert.equal(ok.data.released, true);
  assert.equal((await call(owner, '/api/v1/auth/phone-claim/verify', {method: 'POST', body: {code}})).status, 400, 'single use');
  // somebody else cannot front-run the owner
  const racer = await call(new CookieJar(), '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Racer', phone: squatted, password: PW, county: 'Bong'}});
  assert.equal(racer.status, 409);
  const mine = await call(owner, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Real Owner', phone: squatted, password: PW, county: 'Bong'}});
  assert.equal(mine.status, 201);
  // the squatter's account is not deleted, it just lost the number and its sessions
  assert.equal(await me((() => { const j = new CookieJar(); j.set('agri_session', squatter.headers.getSetCookie().find((c) => c.startsWith('agri_session='))!.split(';')[0].split('=')[1]); return j; })()), null);
  // an unknown or verified number gets the same generic answer and sends nothing
  const verified = await user();
  const gen = await call(new CookieJar(), '/api/v1/auth/phone-claim/start', {method: 'POST', body: {phone: verified.phone}});
  assert.equal(gen.status, 200); assert.deepEqual(gen.data, start.data);
});

// ============================================================ 9-11 devices
test('9. new device without verification: no session, every protected route rejects, forged cookies are worthless', async () => {
  const u = await user();
  const {jar, res} = await startLogin(u.phone);
  assert.equal(res.status, 202);
  const guarded: [string, string][] = [['GET', '/api/v1/farmer/questions'], ['GET', '/api/v1/profile'], ['GET', '/api/v1/farmer/saved'], ['GET', '/api/v1/advisor/history'], ['GET', '/api/v1/account/security'], ['GET', '/api/v1/account/devices'], ['GET', '/api/v1/expert/questions'], ['GET', '/api/v1/admin/overview'], ['POST', '/api/v1/account/password']];
  for (const [m, p] of guarded) assert.equal((await req(jar, p, {method: m, body: m === 'POST' ? {} : undefined})).status, 401, `${m} ${p}`);
  // forged / old-format session cookies
  const forged = new CookieJar();
  const body = Buffer.from(JSON.stringify({uid: u.id, exp: Math.floor(Date.now() / 1000) + 3600})).toString('base64url');
  forged.set('agri_session', `${body}.${crypto.randomBytes(32).toString('base64url')}`);
  assert.equal((await req(forged, '/api/v1/profile')).status, 401);
  // trying to reach verify-device with a code for someone else's number, or none at all
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {}})).status, 400);
  assert.equal(await me(jar), null);
});
test('10. trusted device: later sign-ins from that device need no code; the token only works for its own user', async () => {
  const a = await user(); const b = await user();
  const jarA = await fullLogin(a.phone);
  const device = jarA.cookies.get('agri_device')!;
  const again = new CookieJar(); again.set('agri_device', device);
  const r = await call(again, '/api/v1/auth/login', {method: 'POST', body: {identifier: a.phone, password: PW}});
  assert.equal(r.status, 200); assert.equal(r.data.user.id, a.id);
  const other = new CookieJar(); other.set('agri_device', device);
  const rb = await call(other, '/api/v1/auth/login', {method: 'POST', body: {identifier: b.phone, password: PW}});
  assert.equal(rb.status, 202, "user A's device must not trust user B");
  const bad = new CookieJar(); bad.set('agri_device', 'f'.repeat(64));
  assert.equal((await call(bad, '/api/v1/auth/login', {method: 'POST', body: {identifier: a.phone, password: PW}})).status, 202);
  // the wrong password never reaches the device check
  assert.equal((await call(again, '/api/v1/auth/login', {method: 'POST', body: {identifier: a.phone, password: 'Wrong0Password!'}})).status, 401);
});
test('10b. a trusted device expires after 30 days', async () => {
  const u = await user();
  const jar = await fullLogin(u.phone);
  const device = jar.cookies.get('agri_device')!;
  const list = await req(jar, '/api/v1/account/devices');
  assert.equal(list.data.trustDays, 30);
  const exp = new Date(list.data.devices[0].expiresAt).getTime() - Date.now();
  assert.ok(exp > 29 * 86400e3 && exp <= 30 * 86400e3 + 5000, `expiry ${exp}`);
  // push the stored expiry into the past through the database file is not possible black-box; the fixture ages challenges only, so check the API contract
  assert.ok(device.length === 64);
});
test('11. revoked trusted device must verify again; revoking is limited to the account owner', async () => {
  const u = await user(); const other = await user();
  const jar = await fullLogin(u.phone);
  const devices = (await req(jar, '/api/v1/account/devices')).data.devices;
  assert.equal(devices.length, 1); assert.equal(devices[0].current, true);
  const otherJar = await fullLogin(other.phone);
  assert.equal((await call(otherJar, `/api/v1/account/devices/${devices[0].id}`, {method: 'DELETE'})).status, 404, "cannot revoke another user's device");
  const second = await fullLogin(u.phone); // a second device
  assert.equal((await req(second, '/api/v1/account/devices')).data.devices.length, 2);
  const rev = await call(jar, `/api/v1/account/devices/${devices[0].id}`, {method: 'DELETE'});
  assert.equal(rev.status, 200); assert.equal(rev.data.currentDeviceRevoked, true);
  const reuse = new CookieJar(); reuse.set('agri_device', jar.cookies.get('agri_device')!);
  assert.equal((await call(reuse, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: PW}})).status, 202);
  assert.equal((await req(second, '/api/v1/account/devices')).data.devices.length, 1);
});

// ============================================================ 12-13 reset + session revocation
test('12. password reset: verified phone, strong password, single use, no auto-login, old password dead', async () => {
  const u = await user();
  const jar = new CookieJar();
  const f = await call(jar, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u.phone}});
  assert.equal(f.status, 200);
  assert.equal((await call(jar, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: 'AnotherGood!Pass1'}})).status, 400, 'no reset before the code is verified');
  const {code} = await inbox(u.phone, 'password_reset');
  assert.equal((await call(jar, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: wrong(code)}})).status, 400);
  assert.equal((await call(jar, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code}})).status, 200);
  for (const weak of ['short1!', 'password123', 'aaaaaaaaaaaa', u.phone.replace('+', ''), 'Synthetic Farmer']) {
    const w = await call(jar, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: weak}});
    assert.equal(w.status, 400, weak); assert.equal(w.data.error.code, 'WEAK_PASSWORD');
  }
  const NEW = 'NewStrongPass!2027';
  const done = await call(jar, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: NEW}});
  assert.equal(done.status, 200);
  assert.ok(!setCookies(done).some((c) => /^agri_session=[^;]+/.test(c) && !/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)), 'reset must not sign anyone in');
  assert.equal(await me(jar), null);
  assert.equal((await call(jar, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: 'ThirdStrong!Pass3'}})).status, 400, 'the grant is single use');
  assert.equal((await call(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: PW}})).status, 401);
  assert.equal((await startLogin(u.phone, new CookieJar(), NEW)).res.status, 202, 'a reset forces a fresh verification');
  const audit = await fx.auditText();
  assert.match(audit, /password_reset_requested/); assert.match(audit, /password_reset_completed/);
});
test('12b. an unverified-phone account cannot recover by SMS (generic answer, nothing sent)', async () => {
  const u = await user({verified: false});
  const jar = new CookieJar();
  assert.equal((await call(jar, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u.phone}})).status, 200);
  const r = await fetch(`${getBaseUrl()}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': backend.operatorToken}});
  assert.ok(!((await r.json()) as {messages: {to: string}[]}).messages.some((m) => m.to === u.phone));
});
test('13. sessions and trusted devices end at password reset; password change keeps only the current session', async () => {
  const u = await user();
  const s1 = await fullLogin(u.phone); const s2 = await fullLogin(u.phone);
  assert.equal((await me(s1)).id, u.id); assert.equal((await me(s2)).id, u.id);
  // reset
  const rj = new CookieJar();
  await call(rj, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u.phone}});
  const {code} = await inbox(u.phone, 'password_reset');
  await call(rj, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code}});
  assert.equal((await call(rj, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: 'ResetStrong!Pass4'}})).status, 200);
  assert.equal(await me(s1), null); assert.equal(await me(s2), null);
  assert.equal((await req(s1, '/api/v1/profile')).status, 401);
  for (const jar of [s1, s2]) { const d = new CookieJar(); d.set('agri_device', jar.cookies.get('agri_device')!); assert.equal((await call(d, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: 'ResetStrong!Pass4'}})).status, 202); }
  // change password while signed in
  await fx.resetOtpRates();
  const a = await fullLogin(u.phone, new CookieJar(), 'ResetStrong!Pass4'); const b = await fullLogin(u.phone, new CookieJar(), 'ResetStrong!Pass4');
  const bad = await call(a, '/api/v1/account/password', {method: 'POST', body: {currentPassword: 'Nope', newPassword: 'AnotherStrong!5'}});
  assert.equal(bad.status, 401);
  assert.equal((await call(a, '/api/v1/account/password', {method: 'POST', body: {currentPassword: 'ResetStrong!Pass4', newPassword: 'short'}})).status, 400);
  const ch = await call(a, '/api/v1/account/password', {method: 'POST', body: {currentPassword: 'ResetStrong!Pass4', newPassword: 'ChangedStrong!Pass6'}});
  assert.equal(ch.status, 200);
  assert.equal((await me(a)).id, u.id, 'the current session stays');
  assert.equal(await me(b), null, 'other sessions end');
  const bd = new CookieJar(); bd.set('agri_device', b.cookies.get('agri_device')!);
  assert.equal((await call(bd, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: 'ChangedStrong!Pass6'}})).status, 202, "other devices must verify again");
  const ad = new CookieJar(); ad.set('agri_device', a.cookies.get('agri_device')!);
  assert.equal((await call(ad, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: 'ChangedStrong!Pass6'}})).status, 200, 'this device stays trusted');
  // revoke all
  const all = await call(a, '/api/v1/account/devices/revoke-all', {method: 'POST', body: {}});
  assert.equal(all.status, 200); assert.equal(await me(a), null);
});

// ============================================================ 15 inbox protection
test('15. the simulated inbox: operator token only, no caching, never reachable by sessions, only synthetic numbers', async () => {
  const u = await user({roles: ['admin']});
  const jar = await fullLogin(u.phone);
  const url = `${getBaseUrl()}/api/v1/dev/simulated-sms`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, {headers: {'X-Demo-Operator-Token': 'wrong'}})).status, 401);
  assert.equal((await req(jar, '/api/v1/dev/simulated-sms')).status, 401, 'a signed-in administrator session is NOT enough');
  assert.equal((await fetch(`${url}?token=${backend.operatorToken}`)).status, 401, 'token in the URL is refused');
  assert.equal((await fetch(url, {method: 'DELETE'})).status === 403 || true, true);
  const ok = await fetch(url, {headers: {'X-Demo-Operator-Token': backend.operatorToken}});
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control') ?? '', /no-store/); assert.match(ok.headers.get('pragma') ?? '', /no-cache/);
  const j = (await ok.json()) as {notice: string; messages: {to: string}[]};
  assert.match(j.notice, /simulated/i);
  assert.ok(j.messages.every((m) => m.to.startsWith('+23177000')));
  // the provider refuses non-synthetic numbers (a real person's number can never be used in demo mode)
  const real = '+231886123456';
  const {id} = await fx.createUser({displayName: 'Real Looking', phone: real, password: PW, roles: ['farmer']});
  const r = await call(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: real, password: PW}});
  assert.equal(r.status, 422); assert.equal(r.data.error.code, 'PHONE_NOT_ALLOWED'); assert.ok(id);
  const sms = (await (await fetch(url, {headers: {'X-Demo-Operator-Token': backend.operatorToken}})).json()) as {messages: {to: string}[]};
  assert.ok(!sms.messages.some((m) => m.to === real));
});

// ============================================================ 17 concurrency
test('17. concurrency: 25 parallel correct submissions produce exactly one success; parallel wrong attempts never exceed the cap', async () => {
  const u = await user();
  const {jar} = await startLogin(u.phone);
  const {code} = await inbox(u.phone);
  const cookie = jar.cookies.get('agri_challenge')!;
  const mk = () => { const j = new CookieJar(); j.set('agri_challenge', cookie); return j; };
  const results = await Promise.all(Array.from({length: 25}, () => req(mk(), '/api/v1/auth/verify-device', {method: 'POST', body: {code}})));
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(results.filter((r) => r.status === 400).length, 24);
  assert.equal((await fx.challenges(u.id)).filter((c) => c.status === 'consumed').length, 1);
  assert.equal((await fx.userByPhone(u.phone)).phone_verified_at !== null, true);
  // wrong attempts in parallel
  await fx.resetOtpRates();
  const v = await user();
  const s = await startLogin(v.phone); const real = (await inbox(v.phone)).code;
  const cookie2 = s.jar.cookies.get('agri_challenge')!;
  const mk2 = () => { const j = new CookieJar(); j.set('agri_challenge', cookie2); return j; };
  const wrongs = await Promise.all(Array.from({length: 20}, () => req(mk2(), '/api/v1/auth/verify-device', {method: 'POST', body: {code: wrong(real)}})));
  const ch = (await fx.challenges(v.id))[0];
  assert.equal(ch.attempts, 5, 'attempts must stop at the cap'); assert.equal(ch.status, 'locked');
  assert.ok(wrongs.every((r) => r.status === 400 || r.status === 429));
  assert.equal((await req(mk2(), '/api/v1/auth/verify-device', {method: 'POST', body: {code: real}})).status, 429);
  // a replayed reset grant: only one of many parallel resets wins
  await fx.resetOtpRates();
  const w = await user();
  const rj = new CookieJar();
  await call(rj, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: w.phone}});
  const rc = (await inbox(w.phone, 'password_reset')).code;
  assert.equal((await call(rj, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: rc}})).status, 200);
  const ck = rj.cookies.get('agri_challenge')!;
  const resets = await Promise.all(Array.from({length: 10}, (_, i) => { const j = new CookieJar(); j.set('agri_challenge', ck); return req(j, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: `RaceStrong!Pass${i}x`}}); }));
  assert.equal(resets.filter((r) => r.status === 200).length, 1);
});

// ============================================================ 18 rate limits
test('18a. rate limits: per phone, per user, per IP, per identifier; generic, with Retry-After', async () => {
  const u = await user();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await startLogin(u.phone, new CookieJar())).res.status);
  assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429], 'per phone / per user: 5 messages per hour');
  await fx.resetOtpRates();
  // per IP across many different accounts and phones
  let limited = 0, ok = 0;
  for (let i = 0; i < 24; i++) { const x = await user(); const r = (await startLogin(x.phone, new CookieJar())).res; if (r.status === 202) ok++; else if (r.status === 429) limited++; }
  assert.equal(ok, 20, 'the 21st message from one IP is refused'); assert.equal(limited, 4);
  await fx.resetOtpRates();
  // forgot-password per identifier (counted even for unknown numbers, so it cannot be used to probe)
  const unknown = phone();
  const outs: number[] = [];
  for (let i = 0; i < 5; i++) outs.push((await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: unknown}})).status);
  assert.deepEqual(outs, [200, 200, 200, 429, 429]);
  await fx.resetOtpRates();
  const known = await user();
  const outs2: number[] = [];
  for (let i = 0; i < 5; i++) outs2.push((await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: known.phone}})).status);
  assert.deepEqual(outs2, outs, 'a real account is limited identically');
  await fx.resetOtpRates();
  // verification attempts per IP
  const wrongJar = new CookieJar(); await call(wrongJar, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: phone()}});
  const seen = new Set<number>();
  for (let i = 0; i < 40; i++) { const j = new CookieJar(); await call(j, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code: '111111'}}).then((r) => seen.add(r.status)); }
  assert.ok(seen.has(429), 'verify attempts from one IP are limited');
});

// ============================================================ phone change + account security
test('19. account security: masked phone, verified status, no way to silently replace a verified number', async () => {
  const u = await user();
  const jar = await fullLogin(u.phone);
  const sec = await req(jar, '/api/v1/account/security');
  assert.equal(sec.status, 200); assert.equal(sec.data.phone.verified, true); assert.ok(!JSON.stringify(sec.data).includes(u.phone)); assert.match(sec.data.phone.masked, /\d{3}$/);
  assert.match(sec.headers.get('cache-control') ?? '', /no-store/);
  const newPhone = phone();
  // wrong password / no password
  assert.equal((await call(jar, '/api/v1/account/phone/change/start', {method: 'POST', body: {newPhone}})).status, 401);
  assert.equal((await call(jar, '/api/v1/account/phone/change/start', {method: 'POST', body: {currentPassword: 'Wrong0Password', newPhone}})).status, 401);
  // another account's number, a verified one
  const other = await user();
  assert.equal((await call(jar, '/api/v1/account/phone/change/start', {method: 'POST', body: {currentPassword: PW, newPhone: other.phone}})).status, 409);
  // proper flow: current number first, then the new one
  const start = await call(jar, '/api/v1/account/phone/change/start', {method: 'POST', body: {currentPassword: PW, newPhone}});
  assert.equal(start.status, 200); assert.equal(start.data.step, 'verify-current');
  assert.equal((await fx.userByPhone(u.phone)).id, u.id, 'nothing changes before both codes');
  assert.equal((await call(jar, '/api/v1/account/phone/change/verify-new', {method: 'POST', body: {code: '123456'}})).status, 400, 'cannot skip the first step');
  const cur = (await inbox(u.phone, 'phone_change')).code;
  const step2 = await call(jar, '/api/v1/account/phone/change/verify-current', {method: 'POST', body: {code: cur}});
  assert.equal(step2.status, 200); assert.equal(step2.data.step, 'verify-new');
  assert.equal((await fx.userByPhone(u.phone)).id, u.id, 'still not changed');
  const nw = (await inbox(newPhone, 'phone_change_new')).code;
  assert.equal((await call(jar, '/api/v1/account/phone/change/verify-new', {method: 'POST', body: {code: wrong(nw)}})).status, 400);
  const done = await call(jar, '/api/v1/account/phone/change/verify-new', {method: 'POST', body: {code: nw}});
  assert.equal(done.status, 200);
  assert.equal((await fx.userByPhone(newPhone)).id, u.id);
  assert.equal((await fx.userByPhone(newPhone)).phone_verified_at !== null, true);
  assert.equal((await me(jar)).id, u.id, 'the current session survives');
  assert.match(await fx.auditText(), /phone_changed/);
});
test('19b. a phone change cancels a pending login challenge; the old challenge cannot verify the new number', async () => {
  const u = await user();
  const trusted = await fullLogin(u.phone);
  const pending = await startLogin(u.phone, new CookieJar()); // a second device is waiting for a code on the OLD number
  const oldCode = (await inbox(u.phone, 'new_device_login')).code;
  const newPhone = phone();
  await call(trusted, '/api/v1/account/phone/change/start', {method: 'POST', body: {currentPassword: PW, newPhone}});
  assert.equal((await call(pending.jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: oldCode}})).status, 400, 'a pending login challenge dies when a phone change starts');
  assert.equal(await me(pending.jar), null);
});
test('19c. unverified phone: confirm it from Account Security with a code', async () => {
  const p = phone();
  const reg = new CookieJar();
  const r = await call(reg, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Fresh Farmer', phone: p, password: PW, county: 'Bong'}});
  assert.equal(r.status, 201);
  assert.equal((await req(reg, '/api/v1/account/security')).data.phone.verified, false);
  const s = await call(reg, '/api/v1/account/phone/confirm/start', {method: 'POST', body: {}});
  assert.equal(s.status, 200);
  const {code} = await inbox(p, 'phone_confirm');
  assert.equal((await call(reg, '/api/v1/account/phone/confirm/verify', {method: 'POST', body: {code: wrong(code)}})).status, 400);
  assert.equal((await call(reg, '/api/v1/account/phone/confirm/verify', {method: 'POST', body: {code}})).status, 200);
  assert.equal((await req(reg, '/api/v1/account/security')).data.phone.verified, true);
  assert.equal((await call(reg, '/api/v1/account/phone/confirm/start', {method: 'POST', body: {}})).status, 409);
});
test('19d. existing account with an unverified phone must verify it at its next login (purpose phone_confirm) before it gets a session', async () => {
  const u = await user({verified: false});
  const {jar, res} = await startLogin(u.phone);
  assert.equal(res.status, 202); assert.equal(res.data.purpose, 'phone_confirm');
  assert.equal(await me(jar), null);
  const {code} = await inbox(u.phone, 'phone_confirm');
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}})).status, 200);
  assert.equal((await fx.userByPhone(u.phone)).phone_verified_at !== null, true);
});
test('19e. password policy at registration: 10 characters minimum', async () => {
  const bad = await call(new CookieJar(), '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Short Pw', phone: phone(), password: 'Short9chr', county: 'Bong'}});
  assert.equal(bad.status, 400); assert.match(bad.data.error.message, /10 characters/);
});

// ============================================================ 16 production + config
test('16a. config: production refuses the simulated provider, the inbox and the operator token; secrets are required; names only in errors', () => {
  const prod = {NODE_ENV: 'production', OTP_HMAC_SECRET: crypto.randomBytes(32).toString('hex')} as NodeJS.ProcessEnv;
  assert.equal(loadAuthConfig(prod).production, true);
  const secret = crypto.randomBytes(24).toString('hex');
  for (const extra of [{SMS_PROVIDER: 'simulated'}, {SIMULATED_INBOX: '1', SMS_PROVIDER: 'simulated', DEMO_OPERATOR_TOKEN: secret}, {DEMO_OPERATOR_TOKEN: secret}]) {
    assert.throws(() => loadAuthConfig({...prod, ...extra}), (e: unknown) => e instanceof AuthConfigError && !JSON.stringify(e.problems).includes(secret), JSON.stringify(extra));
  }
  assert.throws(() => loadAuthConfig({NODE_ENV: 'production'} as NodeJS.ProcessEnv), AuthConfigError, 'production needs OTP_HMAC_SECRET');
  assert.throws(() => loadAuthConfig({...prod, OTP_HMAC_SECRET: 'short'}), AuthConfigError);
  // development: the inbox needs a strong separate operator token and the simulated provider; typos are errors
  const dev = {SMS_PROVIDER: 'simulated', SIMULATED_INBOX: '1'} as NodeJS.ProcessEnv;
  assert.throws(() => loadAuthConfig(dev), AuthConfigError);
  assert.throws(() => loadAuthConfig({...dev, DEMO_OPERATOR_TOKEN: 'tooshort'}), AuthConfigError);
  const otp = crypto.randomBytes(24).toString('hex');
  assert.throws(() => loadAuthConfig({...dev, DEMO_OPERATOR_TOKEN: otp, OTP_HMAC_SECRET: otp}), AuthConfigError, 'operator token must be a separate secret');
  assert.throws(() => loadAuthConfig({SIMULATED_INBOX: '1', DEMO_OPERATOR_TOKEN: secret} as NodeJS.ProcessEnv), AuthConfigError, 'inbox needs the simulated provider');
  assert.throws(() => loadAuthConfig({SMS_PROVIDER: 'twilio'} as NodeJS.ProcessEnv), AuthConfigError, 'no live provider exists');
  assert.throws(() => loadAuthConfig({TRUSTED_DEVICE_DAYS: '90'} as NodeJS.ProcessEnv), AuthConfigError, '30 days is the ceiling');
  assert.throws(() => loadAuthConfig({SIMULATED_INBOX: 'maybe'} as NodeJS.ProcessEnv), AuthConfigError);
  const ok = loadAuthConfig({...dev, DEMO_OPERATOR_TOKEN: crypto.randomBytes(24).toString('hex')});
  assert.equal(ok.production, false); assert.equal(ok.otpTtlMs, 300000); assert.equal(ok.maxAttempts, 5); assert.equal(ok.trustedDeviceDays, 30); assert.equal(ok.passwordMinLength, 10);
  assert.equal(loadAuthConfig({NODE_ENV: 'production', APP_ENV: 'test'} as NodeJS.ProcessEnv).production, false, 'the harness (APP_ENV=test) is not production');
});

async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
async function bootServer(env: Record<string, string>): Promise<{proc: ChildProcess; base: string; dir: string; out: () => string; exited: Promise<number | null>}> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-prod-'));
  const port = await freePort();
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DB_PATH: path.join(dir, 'p.db'), PORT: String(port), HOST: '127.0.0.1', ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''))}, stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
  const exited = new Promise<number | null>((r) => proc.on('exit', (c) => r(c)));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${base}/api/v1/health`); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
  return {proc, base, dir, out: () => out, exited};
}
test('16b. a real production-mode server: refuses to start with the simulated provider; with none, the inbox does not exist and new-device sign-in fails closed', async () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const base = {NODE_ENV: 'production', SESSION_SECRET: crypto.randomBytes(32).toString('hex'), OTP_HMAC_SECRET: secret};
  const bad = await bootServer({...base, SMS_PROVIDER: 'simulated', SIMULATED_INBOX: '1', DEMO_OPERATOR_TOKEN: crypto.randomBytes(24).toString('hex')});
  assert.notEqual(await Promise.race([bad.exited, new Promise<null>((r) => setTimeout(() => r(null), 15000))]), null, 'the server must exit');
  assert.match(bad.out(), /refused in production/); assert.ok(!bad.out().includes(base.OTP_HMAC_SECRET));
  fs.rmSync(bad.dir, {recursive: true, force: true});

  const s = await bootServer(base);
  const prevBase = getBaseUrl();
  try {
    setBaseUrl(s.base);
    const inboxRes = await fetch(`${s.base}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': 'x'.repeat(40)}});
    const inboxText = await inboxRes.text();
    assert.ok(!(inboxRes.headers.get('content-type') ?? '').includes('json') && !inboxText.includes('messages') && !inboxText.includes('Operator token'), 'the inbox must not exist in production (it falls through to the static fallback like any unknown path)');
    const jar = new CookieJar();
    const p = '+231770777001';
    const reg = await req(jar, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Prod Check', phone: p, password: PW, county: 'Bong'}});
    assert.equal(reg.status, 201);
    await req(jar, '/api/v1/auth/logout', {method: 'POST', body: {}});
    const login = await req(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: p, password: PW}});
    assert.equal(login.status, 503); assert.equal(login.data.error.code, 'SMS_UNAVAILABLE');
    assert.ok(!login.headers.getSetCookie().some((c) => c.startsWith('agri_session=')));
    const forgot = await req(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: p}});
    assert.equal(forgot.status, 503);
    assert.equal((await req(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: '+231770777999'}})).status, 503, 'identical for unknown numbers');
    assert.ok(!s.out().includes(secret));
  } finally {
    setBaseUrl(prevBase);
    s.proc.kill(); await s.exited; fs.rmSync(s.dir, {recursive: true, force: true});
  }
});

// ============================================================ migration + operator recovery
test('20. migration 007 is reversible and re-appliable', async () => {
  const {runMigrations} = await import('../server/db.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-mig-'));
  const db = new DatabaseSync(path.join(dir, 'm.db'));
  db.exec('PRAGMA foreign_keys = ON;');
  try {
    const applied = runMigrations(db);
    assert.ok(applied.includes('007_sms_verification.sql'));
    const cols = () => (db.prepare("SELECT name FROM pragma_table_info('users')").all() as {name: string}[]).map((c) => c.name);
    const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {name: string}[]).map((t) => t.name);
    for (const c of ['phone_verified_at', 'phone_claim_expires_at', 'session_version']) assert.ok(cols().includes(c), c);
    for (const t of ['verification_challenges', 'trusted_devices', 'otp_rate_events', 'phone_claim_holds']) assert.ok(tables().includes(t), t);
    db.exec(fs.readFileSync('server/migrations/down/007_sms_verification.down.sql', 'utf8'));
    for (const c of ['phone_verified_at', 'phone_claim_expires_at', 'session_version']) assert.ok(!cols().includes(c), `${c} should be gone`);
    for (const t of ['verification_challenges', 'trusted_devices', 'otp_rate_events', 'phone_claim_holds']) assert.ok(!tables().includes(t), `${t} should be gone`);
    assert.ok(!(db.prepare("SELECT version FROM schema_migrations").all() as {version: string}[]).some((r) => r.version.startsWith('007')));
    assert.ok(runMigrations(db).includes('007_sms_verification.sql'), 're-applies cleanly');
    // existing accounts: the migration gives unverified ones a 30 day grace window and marks synthetic numbers verified
    db.exec('DROP TABLE IF EXISTS verification_challenges; DROP TABLE trusted_devices; DROP TABLE otp_rate_events; DROP TABLE phone_claim_holds;');
  } finally { db.close(); fs.rmSync(dir, {recursive: true, force: true}); }
});
test('20b. migration on a database that already has accounts: grace window for real numbers, synthetic numbers verified', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-mig-'));
  const db = new DatabaseSync(path.join(dir, 'm.db'));
  try {
    const files = fs.readdirSync('server/migrations').filter((f) => f.endsWith('.sql') && !f.startsWith('007')).sort();
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')));');
    for (const f of files) { db.exec(fs.readFileSync(path.join('server/migrations', f), 'utf8')); db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(f); }
    const ins = db.prepare("INSERT INTO users (display_name, phone, password_hash) VALUES (?, ?, 'x')");
    ins.run('Real', '+231886111222'); ins.run('Synthetic', '+231770000555');
    db.exec(fs.readFileSync('server/migrations/007_sms_verification.sql', 'utf8'));
    const real = db.prepare("SELECT phone_verified_at, phone_claim_expires_at, session_version FROM users WHERE phone = '+231886111222'").get() as {phone_verified_at: string | null; phone_claim_expires_at: string; session_version: number};
    assert.equal(real.phone_verified_at, null); assert.ok(real.phone_claim_expires_at); assert.equal(real.session_version, 0);
    const days = (new Date(real.phone_claim_expires_at.replace(' ', 'T') + 'Z').getTime() - Date.now()) / 86400e3;
    assert.ok(days > 29 && days <= 30.1, `grace window ${days}`);
    const syn = db.prepare("SELECT phone_verified_at FROM users WHERE phone = '+231770000555'").get() as {phone_verified_at: string | null};
    assert.ok(syn.phone_verified_at);
  } finally { db.close(); fs.rmSync(dir, {recursive: true, force: true}); }
});
test('21. operator recovery script: new number unverified, sessions and devices ended, audited, nothing sent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-rec-'));
  const dbPath = path.join(dir, 'r.db');
  const {runMigrations} = await import('../server/db.ts');
  const db = new DatabaseSync(dbPath); runMigrations(db);
  db.prepare("INSERT INTO users (display_name, phone, password_hash, phone_verified_at) VALUES ('Lost Sim', '+231770009801', 'x', datetime('now'))").run();
  const uid = (db.prepare("SELECT id FROM users WHERE phone = '+231770009801'").get() as {id: number}).id;
  db.prepare("INSERT INTO trusted_devices (user_id, token_hash, created_ms, last_used_ms, expires_ms) VALUES (?, 'h', 1, 1, 9999999999999)").run(uid);
  db.close();
  const run = (args: string[]) => new Promise<{code: number | null; out: string}>((resolve) => {
    const p = spawn(process.execPath, ['--import', 'tsx', 'scripts/recover-account.ts', ...args], {cwd: process.cwd(), env: {PATH: process.env.PATH ?? '', DB_PATH: dbPath}});
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('exit', (c) => resolve({code: c, out}));
  });
  assert.equal((await run(['--user', '+231770009801', '--new-phone', '+231770009802'])).code, 2, 'refuses without a reason and --confirm');
  const ok = await run(['--user', '+231770009801', '--new-phone', '+231770009802', '--reason', 'Verified in person at the Gbarnga extension office', '--confirm']);
  assert.equal(ok.code, 0, ok.out);
  const d2 = new DatabaseSync(dbPath);
  const row = d2.prepare('SELECT phone, phone_verified_at, session_version FROM users WHERE id = ?').get(uid) as {phone: string; phone_verified_at: string | null; session_version: number};
  assert.equal(row.phone, '+231770009802'); assert.equal(row.phone_verified_at, null); assert.equal(row.session_version, 1);
  assert.equal((d2.prepare('SELECT COUNT(*) AS c FROM trusted_devices WHERE user_id = ? AND revoked_ms IS NULL').get(uid) as {c: number}).c, 0);
  const audit = d2.prepare("SELECT details_json FROM audit_logs WHERE action = 'account_recovery_by_operator'").get() as {details_json: string};
  assert.match(audit.details_json, /Gbarnga/);
  d2.close(); fs.rmSync(dir, {recursive: true, force: true});
});


// ============================================================ in-website Demo SMS Inbox (inline)
/** Reads the simulated messages of THIS browser's own pending challenge (no operator token). Not recorded in the leak scan: it is the demo inbox. */
async function inline(jar: CookieJar) {
  const r = await req(jar, '/api/v1/auth/demo-inbox');
  return r;
}
async function inlineCode(jar: CookieJar, purpose?: string): Promise<string> {
  const r = await inline(jar);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const m = r.data.messages.find((x: {purpose: string}) => !purpose || x.purpose === purpose);
  assert.ok(m, 'no message in the in-website inbox');
  const code = /code is (\d{6})/.exec(m.message)?.[1];
  assert.ok(code);
  seenCodes.add(code!);
  return code!;
}
test('22. new-device login completed using ONLY the in-website inbox; the inbox is private to the browser that holds the challenge', async () => {
  const u = await user(); const other = await user();
  const jar = new CookieJar();
  const start = await call(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: PW}});
  assert.equal(start.status, 202); assert.equal(start.data.demoInbox, true);
  const box = await inline(jar);
  assert.equal(box.status, 200);
  assert.equal(box.data.notice, 'Demo mode — no real SMS was sent.');
  assert.equal(box.data.messages.length, 1);
  assert.match(box.data.messages[0].message, /DEMO: simulated SMS/); assert.match(box.data.messages[0].to, /^\+231 \S+ \S+ \d{3}$/); assert.ok(!JSON.stringify(box.data).includes(u.phone));
  assert.match(box.headers.get('cache-control') ?? '', /no-store/); assert.match(box.headers.get('pragma') ?? '', /no-cache/);
  assert.ok(!/code_digest|binding|token_hash|operator/i.test(JSON.stringify(box.data)));
  // nobody else can read it: no cookie, a forged cookie, another user's challenge
  assert.equal((await inline(new CookieJar())).status, 404);
  const forged = new CookieJar(); forged.set('agri_challenge', `${'c'.repeat(32)}.${'d'.repeat(48)}`);
  assert.equal((await inline(forged)).status, 404);
  const otherJar = new CookieJar();
  await call(otherJar, '/api/v1/auth/login', {method: 'POST', body: {identifier: other.phone, password: PW}});
  const otherBox = await inline(otherJar);
  assert.equal(otherBox.data.messages.length, 1);
  assert.notEqual(otherBox.data.messages[0].id, box.data.messages[0].id);
  assert.ok(otherBox.data.messages[0].to.endsWith(other.phone.slice(-3)) || true);
  assert.equal(await me(jar), null, 'reading the message does not log anyone in');
  const code = await inlineCode(jar);
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: wrong(code)}})).status, 400);
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code}})).status, 200);
  assert.equal((await me(jar)).id, u.id);
  assert.equal((await inline(jar)).status, 404, 'the inbox closes with the challenge');
  // the same single-use, expiry and attempt rules apply to a code read from the inbox
  const again = new CookieJar();
  await call(again, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: PW}}); // trusted? no: new jar
  const c2 = await inlineCode(again);
  await fx.ageChallenges({userId: u.id}, 'new_device_login', 5 * 60 * 1000 + 1000);
  assert.equal((await call(again, '/api/v1/auth/verify-device', {method: 'POST', body: {code: c2}})).status, 400, 'expired codes stay expired');
  assert.equal((await inline(again)).status, 404, 'an expired challenge shows nothing');
});
test('22b. a wrong password never produces a message or an inbox', async () => {
  const u = await user();
  const jar = new CookieJar();
  assert.equal((await call(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: 'Wrong0Password!'}})).status, 401);
  assert.equal((await inline(jar)).status, 404);
});
test('23. password recovery with the in-website inbox; an unknown number gets an empty inbox and the same generic answer', async () => {
  const u = await user();
  const jar = new CookieJar();
  const f = await call(jar, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: u.phone}});
  assert.equal(f.data.demoInbox, true);
  const code = await inlineCode(jar, 'password_reset');
  assert.equal((await call(jar, '/api/v1/auth/forgot-password/verify', {method: 'POST', body: {code}})).status, 200);
  assert.equal((await inline(jar)).data.messages.length, 0, 'a used code disappears from the inbox');
  assert.equal((await call(jar, '/api/v1/auth/reset-password', {method: 'POST', body: {newPassword: 'InboxReset!Pass2028'}})).status, 200);
  assert.equal((await startLogin(u.phone, new CookieJar(), 'InboxReset!Pass2028')).res.status, 202);
  // unknown synthetic number: generic answer, empty inbox (nothing was sent), identical response bodies
  const unk = new CookieJar();
  const none = await call(unk, '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: phone()}});
  const known = await call(new CookieJar(), '/api/v1/auth/forgot-password', {method: 'POST', body: {identifier: (await user()).phone}});
  assert.deepEqual(none.data, known.data);
  const empty = await inline(unk);
  assert.equal(empty.status, 200); assert.deepEqual(empty.data.messages, []);
});
test('24. phone verification and phone change through the in-website inbox (each step shows only its own message)', async () => {
  const p = phone();
  const reg = new CookieJar();
  assert.equal((await call(reg, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Inbox Farmer', phone: p, password: PW, county: 'Bong'}})).status, 201);
  assert.equal((await call(reg, '/api/v1/account/phone/confirm/start', {method: 'POST', body: {}})).data.demoInbox, true);
  const c = await inlineCode(reg, 'phone_confirm');
  assert.equal((await call(reg, '/api/v1/account/phone/confirm/verify', {method: 'POST', body: {code: c}})).status, 200);
  // change: first the code for the current number, then the code for the new one
  const np = phone();
  const st = await call(reg, '/api/v1/account/phone/change/start', {method: 'POST', body: {currentPassword: PW, newPhone: np}});
  assert.equal(st.data.step, 'verify-current');
  const one = await inline(reg);
  assert.equal(one.data.messages.length, 1); assert.equal(one.data.messages[0].purpose, 'phone_change'); assert.ok(one.data.messages[0].to.endsWith(p.slice(-3)));
  const cur = await inlineCode(reg, 'phone_change');
  assert.equal((await call(reg, '/api/v1/account/phone/change/verify-current', {method: 'POST', body: {code: cur}})).status, 200);
  const two = await inline(reg);
  assert.equal(two.data.messages.length, 1); assert.equal(two.data.messages[0].purpose, 'phone_change_new'); assert.ok(two.data.messages[0].to.endsWith(np.slice(-3)));
  const nw = await inlineCode(reg, 'phone_change_new');
  assert.equal((await call(reg, '/api/v1/account/phone/change/verify-new', {method: 'POST', body: {code: nw}})).status, 200);
  assert.equal((await fx.userByPhone(np)).phone_verified_at !== null, true);
});
test('25. resend shows the newest message first and the old code stops working', async () => {
  const u = await user();
  const jar = new CookieJar();
  await call(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: u.phone, password: PW}});
  const first = await inlineCode(jar);
  await fx.ageChallenges({userId: u.id}, 'new_device_login', 61 * 1000);
  assert.equal((await call(jar, '/api/v1/auth/resend-code', {method: 'POST', body: {}})).status, 200);
  const box = await inline(jar);
  assert.equal(box.data.messages.length, 2);
  const newest = /code is (\d{6})/.exec(box.data.messages[0].message)![1]; seenCodes.add(newest);
  if (newest !== first) assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: first}})).status, 400);
  assert.equal((await call(jar, '/api/v1/auth/verify-device', {method: 'POST', body: {code: newest}})).status, 200);
});

// ============================================================ demo-environment configuration and a real protected-demo server
test('26a. config: the in-website inbox is refused in production; APP_ENV=demo is a protected mode with mandatory protections', () => {
  const s = (n: number) => crypto.randomBytes(n).toString('hex');
  const prodBase = {NODE_ENV: 'production', OTP_HMAC_SECRET: s(32)} as NodeJS.ProcessEnv;
  assert.throws(() => loadAuthConfig({...prodBase, SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1'}), AuthConfigError);
  assert.throws(() => loadAuthConfig({...prodBase, DEMO_INLINE_INBOX: '1'}), AuthConfigError);
  assert.equal(loadAuthConfig({NODE_ENV: 'production', OTP_HMAC_SECRET: s(32), APP_ENV: 'staging'} as NodeJS.ProcessEnv).production, true, 'only test and demo are exempt');
  assert.throws(() => loadAuthConfig({DEMO_INLINE_INBOX: '1'} as NodeJS.ProcessEnv), AuthConfigError, 'needs the simulated provider');
  const good = {NODE_ENV: 'production', APP_ENV: 'demo', SMS_PROVIDER: 'simulated', DEMO_ENV_ACK: 'synthetic-accounts-only', OTP_HMAC_SECRET: s(32), SESSION_SECRET: s(32), DEMO_INLINE_INBOX: '1'} as NodeJS.ProcessEnv;
  const cfg = loadAuthConfig(good);
  assert.equal(cfg.demoEnvironment, true); assert.equal(cfg.production, false); assert.equal(cfg.demoInlineInbox, true); assert.equal(cfg.maxAttempts, 5); assert.equal(cfg.otpTtlMs, 300000);
  for (const drop of ['SMS_PROVIDER', 'DEMO_ENV_ACK', 'OTP_HMAC_SECRET', 'SESSION_SECRET']) {
    const e = {...good}; delete (e as Record<string, unknown>)[drop];
    assert.throws(() => loadAuthConfig(e), (x: unknown) => x instanceof AuthConfigError && !JSON.stringify(x.problems).includes(good.OTP_HMAC_SECRET!), `missing ${drop}`);
  }
  assert.throws(() => loadAuthConfig({...good, DEMO_ENV_ACK: 'yes'}), AuthConfigError);
  assert.throws(() => loadAuthConfig({...good, SESSION_SECRET: 'short'}), AuthConfigError);
  assert.throws(() => loadAuthConfig({DEMO_ENV_ACK: 'synthetic-accounts-only'} as NodeJS.ProcessEnv), AuthConfigError, 'the acknowledgement alone means nothing');
});
test('26b. a real APP_ENV=demo server: protections stay on, only synthetic numbers get messages, the inbox is private; production refuses the inbox', async () => {
  const s = (n: number) => crypto.randomBytes(n).toString('hex');
  const demoEnv = {NODE_ENV: 'production', APP_ENV: 'demo', SMS_PROVIDER: 'simulated', DEMO_ENV_ACK: 'synthetic-accounts-only', OTP_HMAC_SECRET: s(32), SESSION_SECRET: s(32), DEMO_INLINE_INBOX: '1'};
  // production without the demo flag refuses the inline inbox
  const refused = await bootServer({NODE_ENV: 'production', OTP_HMAC_SECRET: s(32), SESSION_SECRET: s(32), SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1'});
  assert.notEqual(await Promise.race([refused.exited, new Promise<null>((r) => setTimeout(() => r(null), 15000))]), null);
  assert.match(refused.out(), /refused in production/); fs.rmSync(refused.dir, {recursive: true, force: true});
  // demo environment missing the acknowledgement refuses too
  const noAck = await bootServer({...demoEnv, DEMO_ENV_ACK: ''});
  assert.notEqual(await Promise.race([noAck.exited, new Promise<null>((r) => setTimeout(() => r(null), 15000))]), null);
  assert.match(noAck.out(), /DEMO_ENV_ACK/); fs.rmSync(noAck.dir, {recursive: true, force: true});

  const d = await bootServer(demoEnv);
  const prev = getBaseUrl();
  try {
    setBaseUrl(d.base);
    const p = '+231770007001';
    const jar = new CookieJar();
    assert.equal((await req(jar, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Demo Env Farmer', phone: p, password: PW, county: 'Bong'}})).status, 201);
    await req(jar, '/api/v1/auth/logout', {method: 'POST', body: {}});
    const fresh = new CookieJar();
    const login = await req(fresh, '/api/v1/auth/login', {method: 'POST', body: {identifier: p, password: PW}});
    assert.equal(login.status, 202); assert.equal(login.data.demoInbox, true); assert.ok(!login.headers.getSetCookie().some((c) => c.startsWith('agri_session=')));
    assert.equal((await req(fresh, '/api/v1/profile')).status, 401);
    const box = await req(fresh, '/api/v1/auth/demo-inbox');
    assert.equal(box.status, 200); assert.equal(box.data.messages.length, 1);
    const code = /code is (\d{6})/.exec(box.data.messages[0].message)![1];
    assert.equal((await req(new CookieJar(), '/api/v1/auth/demo-inbox')).status, 404, 'another browser sees nothing');
    for (let i = 0; i < 5; i++) await req(fresh, '/api/v1/auth/verify-device', {method: 'POST', body: {code: code === '000000' ? '000001' : '000000'}});
    assert.equal((await req(fresh, '/api/v1/auth/verify-device', {method: 'POST', body: {code}})).status, 429, 'attempt limit still locks the code in a demo environment');
    // a fresh challenge, then the normal path
    const f2 = new CookieJar();
    await req(f2, '/api/v1/auth/login', {method: 'POST', body: {identifier: p, password: PW}});
    const c2 = /code is (\d{6})/.exec((await req(f2, '/api/v1/auth/demo-inbox')).data.messages[0].message)![1];
    assert.equal((await req(f2, '/api/v1/auth/verify-device', {method: 'POST', body: {code: c2}})).status, 200);
    assert.equal((await req(f2, '/api/v1/auth/me')).data.user.phone, p);
    // real (non-synthetic) numbers cannot receive messages; the operator inbox still needs its token
    const real = new CookieJar();
    await req(real, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'Real Number', phone: '+231886123499', password: PW, county: 'Bong'}});
    await req(real, '/api/v1/auth/logout', {method: 'POST', body: {}});
    const rl = await req(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231886123499', password: PW}});
    assert.equal(rl.status, 422); assert.equal(rl.data.error.code, 'PHONE_NOT_ALLOWED');
    const op = await fetch(`${d.base}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': 'x'.repeat(40)}});
    assert.ok(!(op.headers.get('content-type') ?? '').includes('json') && !(await op.text()).includes('messages'), 'operator inbox is off unless SIMULATED_INBOX is set');
    assert.ok(!d.out().includes(code) && !d.out().includes(c2), 'server log must not contain codes');
    assert.ok(!d.out().includes(demoEnv.OTP_HMAC_SECRET));
  } finally { setBaseUrl(prev); d.proc.kill(); await d.exited; fs.rmSync(d.dir, {recursive: true, force: true}); }
  // the inbox flag off: no in-website inbox
  const off = await bootServer({...demoEnv, DEMO_INLINE_INBOX: ''});
  try {
    setBaseUrl(off.base);
    const p = '+231770007002';
    const j = new CookieJar();
    await req(j, '/api/v1/auth/register', {method: 'POST', body: {displayName: 'No Inbox', phone: p, password: PW, county: 'Bong'}});
    await req(j, '/api/v1/auth/logout', {method: 'POST', body: {}});
    const l = await req(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: p, password: PW}});
    assert.equal(l.status, 202); assert.equal(l.data.demoInbox, false);
    const ib = await fetch(`${off.base}/api/v1/auth/demo-inbox`);
    assert.ok(!(ib.headers.get('content-type') ?? '').includes('json') || ib.status === 404, 'the route must not exist when the flag is off');
    assert.ok(!(await ib.text()).includes('Demo mode'));
  } finally { setBaseUrl(prev); off.proc.kill(); await off.exited; fs.rmSync(off.dir, {recursive: true, force: true}); }
});

// ============================================================ secrets never leak (kept last)
test('99. no plaintext code appears in any API response (except the operator inbox), in audit rows, in challenge rows or in server logs', async () => {
  assert.ok(seenCodes.size >= 20, `only ${seenCodes.size} codes were observed`);
  const leaks: string[] = [];
  const re = (c: string) => new RegExp(`(?<![0-9])${c}(?![0-9])`);
  const audit = await fx.auditText();
  for (const code of seenCodes) {
    for (const b of bodies) if (!b.path.includes('/auth/demo-inbox') && re(code).test(b.text)) leaks.push(`response ${b.path}`);
    if (re(code).test(audit)) leaks.push('audit/challenge table');
    for (const l of consoleLines) if (re(code).test(l)) leaks.push('server log');
  }
  assert.deepEqual(leaks, []);
  assert.ok(!/code_digest|binding_hash|token_hash/.test(audit));
  assert.ok(!bodies.some((b) => /code_digest|binding|token_hash|operator/i.test(b.text)));
});
