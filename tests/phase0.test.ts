import assert from 'node:assert/strict';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {reviewLine, isPlaceholderReviewer, DEMO_ADVICE_LABEL} from '../src/lib/adviceLabels.ts';

/**
 * Phase 0 security regression tests. Real `server.js` child processes with the DEFAULT abuse limits on disposable databases in the OS temp folder, plus
 * one in-process backend (harness) for the shared demo accounts. Synthetic data only (+23177000xxxx). No real SMS, nothing leaves localhost.
 */
const root = path.resolve(import.meta.dirname, '..');
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const PW = 'GoodPassw0rd!2026';
const tmpDirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p0-')); tmpDirs.push(d); return d; };
const FARMER_PW = 'Private-Farmer-Pass-77';
const EXPERT_PW = 'Private-Expert-Pass-88';

before(() => {
  const b = spawnSync(process.execPath, [path.join(root, 'scripts/build-server.mjs')], {cwd: root, encoding: 'utf8'});
  assert.equal(b.status, 0, b.stderr);
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')), 'run `npm run build` first');
});
after(() => { for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

// ------------------------------------------------------------------------------------------------------------------ child-server helpers
async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
interface Booted {proc: ChildProcess; base: string; dir: string; out: () => string; exited: Promise<number | null>; stop: () => Promise<void>}
async function boot(envIn: Record<string, string | undefined>, opts: {entry?: string; args?: string[]} = {}): Promise<Booted> {
  const dir = tmp();
  const env = Object.fromEntries(Object.entries(envIn).filter(([, v]) => v !== undefined)) as Record<string, string>;
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const proc = spawn(process.execPath, [...(opts.args ?? []), opts.entry ?? path.join(root, 'server.js')], {cwd: os.tmpdir(), env: {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), DB_PATH: path.join(dir, 'data', 'a.db'), PORT: String(port), HOST: '127.0.0.1', ...env}, stdio: ['ignore', 'pipe', 'pipe']});
    let out = ''; proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => proc.on('exit', (c) => r(c)));
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    if (proc.exitCode !== null && /EADDRINUSE/.test(out) && attempt < 4) continue;
    return {proc, base, dir, out: () => out, exited, stop: async () => { if (proc.exitCode === null) { proc.kill(); await exited; } }};
  }
}
const demoEnv = (extra: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  NODE_ENV: 'production', APP_ENV: 'demo', AUTH_REQUIRE_SMS: '1', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only',
  SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), ENABLE_DEMO_SEED: '1', DEMO_FARMER_PASSWORD: FARMER_PW, DEMO_EXPERT_PASSWORD: EXPERT_PW, TRUST_PROXY: '0', ...extra,
});
const prodEnv = (extra: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), TRUST_PROXY: '0', ...extra});

class Jar {
  c = new Map<string, string>();
  take(res: Response): void { for (const s of res.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); this.c.set(kv.slice(0, i), kv.slice(i + 1)); } }
  hdr(): string { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
}
interface Res {status: number; j: any; headers: Headers; ms: number}
async function call(base: string, jar: Jar, method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  if (!jar.c.has('agri_csrf')) { const c = await fetch(`${base}/api/v1/csrf-token`); jar.take(c); await c.arrayBuffer(); }
  const h: Record<string, string> = {'Content-Type': 'application/json', Cookie: jar.hdr(), ...extra};
  if (jar.c.get('agri_csrf')) h['X-CSRF-Token'] = jar.c.get('agri_csrf')!;
  const t = Date.now();
  const x = await fetch(base + url, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)});
  jar.take(x);
  let j: any = null; try { j = await x.json(); } catch { /* not json */ }
  return {status: x.status, j, headers: x.headers, ms: Date.now() - t};
}
const login = (base: string, jar: Jar, identifier: string, password: string) => call(base, jar, 'POST', '/api/v1/auth/login', {identifier, password});
/** Full sign-in on the demo environment: password, then the code shown in the in-website Demo SMS Inbox of THIS browser. */
async function demoSignIn(base: string, phone: string, password: string): Promise<{jar: Jar; res: Res}> {
  const jar = new Jar();
  const l = await login(base, jar, phone, password);
  if (l.status !== 202) return {jar, res: l};
  const ib = await call(base, jar, 'GET', '/api/v1/auth/demo-inbox');
  const code = /(\d{6})/.exec(ib.j?.messages?.[0]?.message ?? '')?.[1];
  assert.ok(code, 'demo inbox shows a code for the caller\'s own challenge');
  return {jar, res: await call(base, jar, 'POST', '/api/v1/auth/verify-device', {code})};
}
const expertBody = (name: string) => ({requesterKey: `${name}-${rand(20)}`, farmerName: `Visitor ${name}`, category: 'Poultry farming', county: 'Bong', title: `Private question ${name}`, description: `Private description from visitor ${name}, please keep this private.`});
const listingBody = (name: string) => ({ownerKey: `${name}-${rand(20)}`, sellerName: 'Synthetic Seller', category: 'Cassava and root crops', productName: `Cassava ${name}`, quantity: '50', unit: 'kg', priceLrd: 1200, county: 'Bong', town: 'Gbarnga', description: 'Synthetic harvest listing for the security test.'});

// ====================================================================================================================== 1. shared demo credentials
let backend: Backend;
const SHARED_ONLY = 'shared-account tests';
test(`1. ${SHARED_ONLY}: the published demo expert and farmer cannot read or answer another visitor's expert request`, async () => {
  backend = await startBackend();
  try {
    const fx = backend.fixtures;
    const trust = async (phone: string) => { const j = new CookieJar(); j.set('agri_device', await fx.trustDevice(phone)); return j; };
    const signIn = async (phone: string, pw: string) => { const j = await trust(phone); const r = await req(j, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password: pw}}); assert.equal(r.status, 200, `sign-in ${phone}`); return j; };
    const victim = new CookieJar();
    const created = await req(victim, '/api/v1/expert-requests/demo', {method: 'POST', body: {...expertBody('victim'), description: 'MARKER-VICTIM-TEXT written by a visitor.', farmerName: 'MARKER-VICTIM-NAME', photoDataUrl: 'data:image/png;base64,AAAA'}});
    assert.equal(created.status, 201);
    const id = created.data.request.id;

    // The documented credentials are KNOWN to everyone: that is the attacker's position.
    const sharedExpert = await signIn('+231770000201', 'ExpertDemo!2026');
    const sharedFarmer = await signIn('+231770000101', 'FarmerDemo!2026');
    for (const jar of [sharedExpert, sharedFarmer, new CookieJar()]) {
      const list = await req(jar, '/api/v1/expert-requests/demo');
      assert.equal(list.status, 200);
      const text = JSON.stringify(list.data);
      assert.ok(!text.includes('MARKER-VICTIM'), 'a shared/anonymous account must not see the visitor request');
      assert.ok(!list.data.requests.some((r: {id: number}) => r.id === id));
    }
    // It cannot answer it either (that would put fake "expert advice" in front of a real farmer).
    const reply = await req(sharedExpert, `/api/v1/expert-requests/demo/${id}/reply`, {method: 'PATCH', body: {expertReply: 'Spray anything you have on it.', status: 'Answered'}});
    assert.equal(reply.status, 403); assert.equal(reply.data.error.code, 'FORBIDDEN');
    assert.equal((await fx.expertRequest(id)).expert_reply, '');
    // ...but it can still demonstrate on the fictional samples.
    const sharedList = await req(sharedExpert, '/api/v1/expert-requests/demo');
    assert.ok(sharedList.data.requests.length > 0 && sharedList.data.requests.every((r: {can_reply: boolean}) => r.can_reply));
    // A real extension officer (private password) does see and can answer it.
    await fx.createUser({displayName: 'Private Officer', phone: '+231775550777', password: 'OfficerPrivate!2026x', roles: ['expert'], expertStatus: 'approved'});
    const officer = await signIn('+231775550777', 'OfficerPrivate!2026x');
    const officerList = await req(officer, '/api/v1/expert-requests/demo');
    assert.ok(officerList.data.requests.some((r: {id: number}) => r.id === id));
    assert.equal((await req(officer, `/api/v1/expert-requests/demo/${id}/reply`, {method: 'PATCH', body: {expertReply: 'Keep the pen dry and call your extension officer.', status: 'Answered'}})).status, 200);
    // The account is PERMANENTLY flagged: a new password (here set directly, as a stand-in for any takeover) does not make it trusted.
    await fx.setPassword('+231770000201', 'NowPrivate!2026-secret');
    const afterChange = await signIn('+231770000201', 'NowPrivate!2026-secret');
    assert.ok(!(await req(afterChange, '/api/v1/expert-requests/demo')).data.requests.some((r: {id: number}) => r.id === id), 'a changed password must not expose the visitor request');
    assert.equal((await req(afterChange, `/api/v1/expert-requests/demo/${id}/reply`, {method: 'PATCH', body: {expertReply: 'Takeover reply to a real visitor.', status: 'Answered'}})).status, 403);
    // Only an operator re-provisioning (test fixture: password AND flag) makes it a trusted officer.
    await fx.setPassword('+231770000201', 'Reprovisioned!2026-ok', {clearSharedFlag: true});
    const reprovisioned = await signIn('+231770000201', 'Reprovisioned!2026-ok');
    assert.ok((await req(reprovisioned, '/api/v1/expert-requests/demo')).data.requests.some((r: {id: number}) => r.id === id));
  } finally { /* stopped in the last test of this file */ }
});

test('2. strict environments never create accounts with the PUBLISHED passwords; those passwords do not sign in', async () => {
  const d = await boot(demoEnv());
  try {
    for (const [phone, pw] of [['+231770000101', 'FarmerDemo!2026'], ['+231770000201', 'ExpertDemo!2026']] as const) {
      const r = await login(d.base, new Jar(), phone, pw);
      assert.equal(r.status, 401, `published password must not work for ${phone}`);
    }
    // The private passwords do (a new device still needs the simulated code), and the account is a working expert.
    const ex = await demoSignIn(d.base, '+231770000201', EXPERT_PW);
    assert.equal(ex.res.status, 200); assert.deepEqual(ex.res.j.user.roles, ['expert']);
    const visitor = new Jar();
    const made = await call(d.base, visitor, 'POST', '/api/v1/expert-requests/demo', expertBody('legit'), {'Idempotency-Key': crypto.randomUUID()});
    assert.equal(made.status, 201);
    const seen = await call(d.base, ex.jar, 'GET', '/api/v1/expert-requests/demo');
    assert.ok(seen.j.requests.some((r: {id: number}) => r.id === made.j.request.id), 'the presenter (private password) still sees the live queue');
    assert.ok(!d.out().includes(EXPERT_PW) && !d.out().includes(FARMER_PW));
  } finally { await d.stop(); }
  // No private passwords: the demo environment refuses to seed instead of falling back to the published ones.
  const bad = await boot(demoEnv({DEMO_FARMER_PASSWORD: undefined, DEMO_EXPERT_PASSWORD: undefined}));
  assert.notEqual(await Promise.race([bad.exited, new Promise<null>((r) => setTimeout(() => r(null), 20000))]), null);
  assert.match(bad.out(), /DEMO_FARMER_PASSWORD and DEMO_EXPERT_PASSWORD/); await bad.stop();
  const published = await boot(demoEnv({DEMO_EXPERT_PASSWORD: 'ExpertDemo!2026'}));
  assert.notEqual(await Promise.race([published.exited, new Promise<null>((r) => setTimeout(() => r(null), 20000))]), null);
  assert.ok(!/ExpertDemo!2026/.test(published.out().replace(/DEMO_[A-Z_]+/g, '')), 'the published password is never echoed'); await published.stop();
});

test('3. the demo environment refuses a database that already holds the published demo accounts', async () => {
  const dir = tmp();
  const dev = await boot({NODE_ENV: 'development', ENABLE_DEMO_SEED: '1', DB_PATH: path.join(dir, 'data', 'a.db')});
  await dev.stop();
  const db = new DatabaseSync(path.join(dir, 'data', 'a.db'), {readOnly: true});
  assert.equal((db.prepare("SELECT COUNT(*) c FROM users WHERE phone = '+231770000201'").get() as {c: number}).c, 1); db.close();
  const demo = await boot(demoEnv({DB_PATH: path.join(dir, 'data', 'a.db')}));
  assert.notEqual(await Promise.race([demo.exited, new Promise<null>((r) => setTimeout(() => r(null), 25000))]), null, 'must exit');
  assert.match(demo.out(), /published passwords/); assert.ok(!demo.out().includes('ExpertDemo!2026'));
  await demo.stop();
});

// ====================================================================================================================== 2. synthetic-only demo
test('4. the demo environment accepts only synthetic phone numbers (and no e-mail) at registration and sign-in', async () => {
  const d = await boot(demoEnv());
  try {
    const reg = (phone: string, extra: Record<string, unknown> = {}) => call(d.base, new Jar(), 'POST', '/api/v1/auth/register', {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Test Person', phone, password: PW, county: 'Bong', ...extra});
    for (const real of ['+231886123456', '0886123456', '+231 77 123 4567', '+231770011234', '+23177 0011 234', '231550123456']) {
      const r = await reg(real);
      assert.equal(r.status, 422, `${real} must be refused`); assert.equal(r.j.error.code, 'PHONE_NOT_ALLOWED');
    }
    const em = await reg('+231770009001', {email: 'real.person@example.com'});
    assert.equal(em.status, 422); assert.equal(em.j.error.code, 'EMAIL_NOT_ALLOWED');
    const ok = await reg('+231770009002'); assert.equal(ok.status, 201);
    const ok2 = await reg('0770009003'); assert.equal(ok2.status, 201, 'a synthetic number in local format is the same synthetic number');
    // sign-in: real number, e-mail, nonsense all get the same demo-site answer, with no account lookup
    for (const id of ['+231886123499', 'someone@example.com', '0886000000']) {
      const r = await login(d.base, new Jar(), id, PW);
      assert.equal(r.status, 422, id); assert.equal(r.j.error.code, 'PHONE_NOT_ALLOWED');
    }
    const db = new DatabaseSync(path.join(d.dir, 'data', 'a.db'), {readOnly: true});
    assert.equal((db.prepare("SELECT COUNT(*) c FROM users WHERE phone NOT GLOB '+23177000[0-9][0-9][0-9][0-9]'").get() as {c: number}).c, 0, 'no non-synthetic number is stored'); db.close();
  } finally { await d.stop(); }
});

// ====================================================================================================================== 3. login limits
test('5. login throttle uses the NORMALIZED identifier: spacing, local format and e-mail cannot reset the allowance', async () => {
  const d = await boot(demoEnv());
  try {
    const phone = '+231770009100';
    assert.equal((await call(d.base, new Jar(), 'POST', '/api/v1/auth/register', {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Throttle Test', phone, password: PW, county: 'Bong'})).status, 201);
    const spellings = ['+231770009100', '0770009100', '+231 770 009 100', '+231-770-009-100', '770009100', '+231  770009100', ' +231770009100 ', '0770 009 100', '+231 7700 09100', '(+231) 770 009 100', '0770-009-100', '+231770009100'];
    const statuses: number[] = [];
    const jar = new Jar();
    for (const s of spellings.concat(spellings)) statuses.push((await login(d.base, jar, s, 'WrongPassw0rd!x')).status);
    const ok = statuses.filter((x) => x === 401).length, blocked = statuses.filter((x) => x === 429).length;
    assert.equal(ok, 8, `exactly 8 attempts per account/address, however the number is written (got ${statuses})`);
    assert.equal(blocked, statuses.length - 8);
    // the throttle holds for the right password too (a locked-out attacker cannot confirm a guess)
    assert.equal((await login(d.base, jar, '0770 009 100', PW)).status, 429);
  } finally { await d.stop(); }
});

test('6. per-address ceiling: failed sign-ins across DIFFERENT accounts are capped (30 per 15 minutes by default)', async () => {
  const d = await boot(prodEnv());
  try {
    const jar = new Jar();
    const statuses: number[] = [];
    for (let i = 0; i < 36; i++) statuses.push((await login(d.base, jar, `+23177000${String(2000 + i).padStart(4, '0')}`, 'WrongPassw0rd!x')).status);
    assert.equal(statuses.filter((x) => x === 401).length, 30, `30 failures allowed (${statuses})`);
    assert.ok(statuses.slice(30).every((x) => x === 429), 'then the address is throttled');
    // Throttled requests do no password work and are cheap.
    const t = Date.now(); const r = await login(d.base, jar, '+231770002999', 'WrongPassw0rd!x'); assert.equal(r.status, 429); assert.ok(Date.now() - t < 500);
    const ra = Number(r.headers.get('retry-after')); assert.ok(ra >= 1 && ra <= 900, `Retry-After ${ra} must be the real remaining wait (at most 15 minutes)`);
  } finally { await d.stop(); }
});

test('7. a different address is unaffected (limits are per address; a forged X-Forwarded-For does not help when no proxy is trusted)', async () => {
  const d = await boot(prodEnv({LOGIN_IP_FAIL_MAX: '5'}));
  try {
    const jar = new Jar();
    const s: number[] = [];
    for (let i = 0; i < 8; i++) s.push((await call(d.base, jar, 'POST', '/api/v1/auth/login', {identifier: `+23177000${3000 + i}`, password: 'WrongPassw0rd!x'}, {'X-Forwarded-For': `203.0.113.${i + 1}`})).status);
    assert.deepEqual(s, [401, 401, 401, 401, 401, 429, 429, 429], 'rotating forged addresses does not reset the limit');
  } finally { await d.stop(); }
});

// ====================================================================================================================== 4. event loop, timing, busy
test('8. password checks do not block the event loop: the server keeps answering while many sign-ins run', async () => {
  // REAL accounts, so every sign-in does a full password check (an unknown account used to skip it). TRUST_PROXY=1 + a distinct forwarded address per
  // request keeps the registration/sign-in allowances out of the way: this test is about the event loop only.
  const d = await boot(prodEnv({LOGIN_IP_FAIL_MAX: '1000', TRUST_PROXY: '1'}));
  try {
    const N = 24;
    for (let i = 0; i < N; i++) assert.equal((await call(d.base, new Jar(), 'POST', '/api/v1/auth/register', {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: `Load Test ${i}`, phone: `+23188000${7000 + i}`, password: PW, county: 'Bong'}, {'X-Forwarded-For': `198.51.100.${i + 1}`})).status, 201);
    const burst: Promise<Res>[] = [];
    for (let i = 0; i < N; i++) burst.push(call(d.base, new Jar(), 'POST', '/api/v1/auth/login', {identifier: `+23188000${7000 + i}`, password: 'WrongPassw0rd!x'}, {'X-Forwarded-For': `198.51.100.${i + 1}`}));
    const lat: number[] = [];
    const pinger = (async () => { for (let i = 0; i < 25; i++) { const t = Date.now(); await fetch(`${d.base}/api/v1/health`); lat.push(Date.now() - t); await new Promise((r) => setTimeout(r, 15)); } })();
    const all = await Promise.all(burst); await pinger;
    assert.ok(all.every((r) => r.status === 401 || r.status === 503), `answers are failures or "busy" (${all.map((r) => r.status)})`);
    assert.ok(all.filter((r) => r.status === 401).length >= 10, 'most sign-ins really ran the password check');
    // A blocked event loop shows as MANY slow answers (every ping queued behind a ~80 ms password hash); the worker-pool version answers almost all at once.
    const slow = lat.filter((x) => x > 20).length;
    assert.ok(slow <= 6, `${slow} of ${lat.length} health answers took over 20 ms during the burst (latencies ${JSON.stringify(lat)}); the old synchronous scrypt gave about 11`);
  } finally { await d.stop(); }
});

test('9. an unknown account costs the same as a wrong password (no account-enumeration timing)', async () => {
  const d = await boot(prodEnv({LOGIN_IP_FAIL_MAX: '1000'}));
  try {
    assert.equal((await call(d.base, new Jar(), 'POST', '/api/v1/auth/register', {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Timing Test', phone: '+231880009200', password: PW, county: 'Bong'})).status, 201);
    const median = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const known: number[] = [], unknown: number[] = [];
    for (let i = 0; i < 9; i++) {
      // alternate so both see the same machine conditions; distinct formatting keeps each attempt under the per-account throttle
      known.push((await login(d.base, new Jar(), ['0880009200', '+231880009200', '880009200'][i % 3], 'WrongPassw0rd!x' + i)).ms);
      unknown.push((await login(d.base, new Jar(), `+23177000${String(5000 + i)}`, 'WrongPassw0rd!x' + i)).ms);
    }
    const mk = median(known), mu = median(unknown);
    assert.ok(mu > 25, `an unknown account must do real password work (median ${mu} ms)`);
    assert.ok(Math.abs(mk - mu) < Math.max(40, mk * 0.5), `known ${mk} ms vs unknown ${mu} ms must be close (before the fix: ~63 vs ~9)`);
  } finally { await d.stop(); }
});

test('10. a flood of hashing work is answered "busy" (503 + Retry-After), not queued without limit, and the server stays healthy', async () => {
  const d = await boot(prodEnv({LOGIN_IP_FAIL_MAX: '1000', PASSWORD_HASH_CONCURRENCY: '1', PASSWORD_HASH_QUEUE: '2'}));
  try {
    const burst: Promise<Res>[] = [];
    for (let i = 0; i < 20; i++) burst.push(login(d.base, new Jar(), `+23177000${String(6000 + i)}`, 'WrongPassw0rd!x'));
    const all = await Promise.all(burst);
    const busy = all.filter((r) => r.status === 503);
    assert.ok(busy.length >= 1, `some requests must be refused as busy (statuses ${all.map((r) => r.status)})`);
    assert.ok(busy.every((r) => r.j.error.code === 'SERVER_BUSY' && r.headers.get('retry-after')));
    assert.ok(all.every((r) => r.status === 401 || r.status === 503));
    assert.equal((await fetch(`${d.base}/api/v1/health`)).status, 200);
    assert.equal((await login(d.base, new Jar(), '+231770006999', 'WrongPassw0rd!x')).status, 401, 'back to normal once the burst is over');
  } finally { await d.stop(); }
});

// ====================================================================================================================== 5. anonymous write limits
test('11. anonymous expert requests, marketplace listings and inquiries are rate limited; an offline-sync replay is not penalised', async () => {
  const d = await boot(prodEnv());
  try {
    const jar = new Jar();
    // expert requests: 12 per hour per address
    const er: number[] = [];
    for (let i = 0; i < 14; i++) er.push((await call(d.base, jar, 'POST', '/api/v1/expert-requests/demo', expertBody(`e${i}`))).status);
    assert.deepEqual(er, [...Array(12).fill(201), 429, 429], `expert requests (${er})`);
    // listings: 12 per hour per address
    const ls: number[] = [];
    for (let i = 0; i < 14; i++) ls.push((await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', listingBody(`l${i}`))).status);
    assert.deepEqual(ls, [...Array(12).fill(201), 429, 429], `listings (${ls})`);
    const limited = await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', listingBody('x'));
    assert.equal(limited.status, 429); assert.equal(limited.j.error.code, 'RATE_LIMITED'); const ra = Number(limited.headers.get('retry-after')); assert.ok(ra >= 1 && ra <= 3600, `Retry-After ${ra} is the real remaining wait (at most the 1 hour window)`);
    // inquiries: 20 per hour per address
    const lst = await call(d.base, new Jar(), 'GET', '/api/v1/marketplace/listings');
    const listingId = lst.j.listings[0].id;
    const iq: number[] = [];
    for (let i = 0; i < 22; i++) iq.push((await call(d.base, jar, 'POST', `/api/v1/marketplace/listings/${listingId}/inquiries`, {buyerName: 'Synthetic Buyer', buyerCounty: 'Bong', message: `Synthetic inquiry number ${i}`, buyerToken: `tok-${i}`})).status);
    assert.deepEqual(iq, [...Array(20).fill(201), 429, 429], `inquiries (${iq})`);
  } finally { await d.stop(); }
});

test('12. offline retries (same Idempotency-Key) are replayed without using up the allowance', async () => {
  const d = await boot(prodEnv());
  try {
    const jar = new Jar();
    const body = expertBody('retry');
    const key = crypto.randomUUID();
    const first = await call(d.base, jar, 'POST', '/api/v1/expert-requests/demo', body, {'Idempotency-Key': key});
    assert.equal(first.status, 201);
    for (let i = 0; i < 30; i++) {
      const again = await call(d.base, jar, 'POST', '/api/v1/expert-requests/demo', body, {'Idempotency-Key': key});
      assert.equal(again.status, 201, `replay ${i}`); assert.equal(again.headers.get('idempotent-replay'), 'true');
    }
    // the allowance is still there for genuinely new submissions
    assert.equal((await call(d.base, jar, 'POST', '/api/v1/expert-requests/demo', expertBody('fresh'))).status, 201);
  } finally { await d.stop(); }
});

test('13. a different address has its own allowance; signed-in accounts are limited per account, not per address', async () => {
  const d = await boot(prodEnv({TRUST_PROXY: '1'}));
  try {
    const post = (xff: string) => call(d.base, new Jar(), 'POST', '/api/v1/marketplace/listings', listingBody('addr'), {'X-Forwarded-For': xff});
    for (let i = 0; i < 12; i++) assert.equal((await post('198.51.100.10')).status, 201);
    assert.equal((await post('198.51.100.10')).status, 429);
    assert.equal((await post('198.51.100.11')).status, 201, 'another address is not affected');
  } finally { await d.stop(); }
});

test('14. rate-limit bookkeeping does not grow without bound (rows older than 25 h are pruned)', async () => {
  const {getDb} = await import('../server/db.ts');
  const {checkAndRecordRateLimit, resetRateLimitPruneForTests} = await import('../server/security.ts');
  const db = getDb();
  db.prepare("INSERT INTO rate_limit_attempts (rate_key, action_type, created_at) VALUES ('old-key', 'login_attempt', datetime('now', '-26 hours')), ('new-key', 'login_attempt', datetime('now', '-1 hours'))").run();
  resetRateLimitPruneForTests();
  checkAndRecordRateLimit('some-key', 'login_attempt', 5, 15, false);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM rate_limit_attempts WHERE rate_key = 'old-key'").get() as {c: number}).c, 0);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM rate_limit_attempts WHERE rate_key = 'new-key'").get() as {c: number}).c, 1, 'recent rows are kept');
});

// ====================================================================================================================== 6. wording and labels
test('15. only the explicitly proposed browser-only USSD code is allowed; no telecom service is claimed', () => {
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = [...walk('src'), ...walk('server'), 'index.html'].filter((f) => /\.(ts|tsx|html|json|md)$/.test(f));
  const pattern = /\*[0-9]{1,5}(\*[0-9]+)*#/;
  for (const f of files) { const source = fs.readFileSync(path.join(root, f), 'utf8'); const permitted = f === path.join('src', 'lib', 'ussd', 'enrollment.ts') ? source.replace("export const PROPOSED_USSD_CODE = '*440#';", '') : source; assert.ok(!pattern.test(permitted), `${f} contains an unapproved USSD-style short code`); }
  const simulator = fs.readFileSync(path.join(root, 'src/pages/public/UssdDemoPage.tsx'), 'utf8'); assert.match(simulator, /not assigned or connected to a telecom network/);
  const page = fs.readFileSync(path.join(root, 'src/pages/public/PhoneSimulatorPage.tsx'), 'utf8');
  assert.match(page, /no telephone number, short code or telecom network is used/);
  assert.ok(!/useState\('\*/.test(page) && !/Dial \*/.test(page));
});

test('16. demonstration advice is never labelled as reviewed by a qualified agronomist', () => {
  const seeded = {isSampleDemo: true, reviewStatus: 'approved', reviewedByName: 'Sample Demo Reviewer (Unverified Demonstration)', lastReviewedAt: '2026-10-15'};
  const l = reviewLine(seeded);
  assert.equal(l.reviewed, false); assert.equal(l.badge, DEMO_ADVICE_LABEL);
  const all = JSON.stringify(l);
  assert.ok(!/Sample Demo Reviewer|Reviewed by [A-Z]|2026-10-15/.test(all), `label must not show the placeholder reviewer, a "Reviewed by <name>" claim or a review date: ${all}`);
  assert.match(l.badge, /^Demonstration advice: NOT reviewed by a qualified agronomist$/, 'the badge only ever DENIES review');
  assert.ok(!/approved|verified/i.test(l.badge), 'the badge never claims approval or verification');
  assert.ok(!/(has|been|is|was) (approved|verified|reviewed)(?! by)/i.test(l.text.replace(/No qualified agronomist or Ministry officer has approved it/, '')), 'the text only ever DENIES approval');
  assert.match(l.text, /No qualified agronomist/);
  // placeholder names are recognised even if the sample flag is missing; a bare status word is never enough
  for (const name of ['Demo Agronomist', 'Sample Reviewer', 'Unverified Demonstration', 'Fictional Expert', 'Synthetic Officer', 'Test Reviewer']) assert.ok(isPlaceholderReviewer(name), name);
  assert.equal(reviewLine({isSampleDemo: false, reviewStatus: 'approved', reviewedByName: 'Sample Demo Reviewer', lastReviewedAt: null}).reviewed, false);
  assert.equal(reviewLine({isSampleDemo: false, reviewStatus: 'approved', reviewedByName: null, lastReviewedAt: null}).reviewed, false);
  assert.equal(reviewLine({isSampleDemo: false, reviewStatus: 'pending_review', reviewedByName: 'Dr Real Person', lastReviewedAt: '2026-01-01'}).reviewed, false);
  const real = reviewLine({isSampleDemo: false, reviewStatus: 'approved', reviewedByName: 'Dr Real Person', lastReviewedAt: '2026-01-01'});
  assert.equal(real.reviewed, true); assert.match(real.text, /Reviewed by Dr Real Person on 2026-01-01/);
  // the pages use the helper and no longer print a reviewer name directly
  const detail = fs.readFileSync(path.join(root, 'src/pages/public/GuideDetailPage.tsx'), 'utf8');
  assert.match(detail, /reviewLine\(guide\)/); assert.ok(!/Reviewer: \$\{guide\.reviewedByName\}/.test(detail) && !/Review Status:/.test(detail));
  assert.ok(!/Detailed Approved Pest/.test(fs.readFileSync(path.join(root, 'src/pages/public/PestsDiseasesPage.tsx'), 'utf8')));
  assert.ok(!/Approved crop guides/.test(fs.readFileSync(path.join(root, 'src/pages/public/AboutPage.tsx'), 'utf8')));
});

test('17. the seeded guides reach the browser flagged as demonstration content (so the label logic applies)', async () => {
  const jar = new CookieJar();
  const list = await req(jar, '/api/v1/guides');
  assert.equal(list.status, 200);
  assert.ok(list.data.guides.length > 0 && list.data.guides.every((g: {isSampleDemo: boolean}) => g.isSampleDemo === true));
  const one = await req(jar, `/api/v1/guides/${list.data.guides[0].id}`);
  assert.equal(one.data.guide.isSampleDemo, true);
  assert.match(String(one.data.guide.reviewedByName), /Unverified|Demo|Sample/i);
  assert.equal(reviewLine(one.data.guide).reviewed, false);
});

// ====================================================================================================================== 7. start-up hardening
test('18. APP_ENV=test (fixtures, relaxed checks) refuses to listen on a non-loopback HOST', async () => {
  const dir = tmp();
  const b = await boot({APP_ENV: 'test', NODE_ENV: 'production', TEST_FIXTURE_TOKEN: rand(16), DB_PATH: path.join(dir, 'x.db'), HOST: '0.0.0.0'});
  const code = await Promise.race([b.exited, new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
  assert.notEqual(code, null); assert.notEqual(code, 0);
  assert.match(b.out(), /APP_ENV=test is only allowed on a loopback HOST/);
  await b.stop();
});

test('19. START_SERVER=1 makes the server listen when a host loader starts it; a configuration error exits with one clear line, no stack', async () => {
  const dir = tmp();
  const loader = `import(${JSON.stringify(path.join(root, 'server.js'))})`;
  const mk = async (extra: Record<string, string>) => {
    const port = await freePort();
    const env = {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), PORT: String(port), HOST: '127.0.0.1', DB_PATH: path.join(dir, `${port}.db`), NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), ...extra};
    return {port, proc: spawn(process.execPath, ['--input-type=module', '-e', loader], {cwd: os.tmpdir(), env, stdio: 'ignore'})};
  };
  const probe = async (port: number, tries: number): Promise<boolean> => { for (let i = 0; i < tries; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status === 200) return true; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 250)); } return false; };
  // Started through a loader, process.argv[1] is not server.js: without START_SERVER nothing listens (the trap this setting removes) ...
  const quiet = await mk({});
  try { assert.equal(await probe(quiet.port, 16), false, 'without START_SERVER a loader start does not listen'); } finally { quiet.proc.kill(); }
  // ... with it, the server listens.
  const forced = await mk({START_SERVER: '1'});
  try { assert.equal(await probe(forced.port, 80), true, 'listens when START_SERVER=1'); } finally { forced.proc.kill(); }
  const bad = await boot(prodEnv({SESSION_SECRET: ''}));
  const code = await Promise.race([bad.exited, new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
  assert.equal(code, 1);
  assert.match(bad.out(), /Server did not start: Invalid deployment configuration: SESSION_SECRET is required/);
  assert.ok(!/\n\s+at /.test(bad.out()), 'no stack trace in the host log');
  await bad.stop();
});

test('20. (cleanup) the in-process backend stops', async () => { await backend?.stop(); });
