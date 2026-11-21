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
import {limiterAddress} from '../server/security.ts';
import {MAX_AUTO_ATTEMPTS, MAX_BACKOFF_MS, MAX_RETRY_AFTER_MS, MAX_SERVER_DIRECTED_ATTEMPTS, parseRetryAfter, planRetry} from '../src/lib/retryPolicy.ts';

/**
 * Phase 0 FOLLOW-UP regression tests: each test reproduces a finding of the independent review of commit 9ced7ff. Real `server.js` child processes with
 * DEFAULT limits on disposable databases in the OS temp folder, plus an in-process backend. Synthetic data only; nothing leaves localhost.
 */
const root = path.resolve(import.meta.dirname, '..');
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const PW = 'GoodPassw0rd!2026';
const FARMER_PW = 'Private-Farmer-Pass-77';
const EXPERT_PW = 'Private-Expert-Pass-88';
const tmpDirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p0b-')); tmpDirs.push(d); return d; };
let backend: Backend;

before(async () => {
  const b = spawnSync(process.execPath, [path.join(root, 'scripts/build-server.mjs')], {cwd: root, encoding: 'utf8'});
  assert.equal(b.status, 0, b.stderr);
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')), 'run `npm run build` first');
  backend = await startBackend();
});
after(async () => { await backend?.stop(); for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

// ------------------------------------------------------------------------------------------------------------------ helpers
async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
interface Booted {proc: ChildProcess; base: string; dir: string; db: string; out: () => string; exited: Promise<number | null>; stop: () => Promise<void>}
async function boot(envIn: Record<string, string | undefined>, dirIn?: string): Promise<Booted> {
  const dir = dirIn ?? tmp();
  const env = Object.fromEntries(Object.entries(envIn).filter(([, v]) => v !== undefined)) as Record<string, string>;
  const db = path.join(dir, 'data', 'a.db');
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const proc = spawn(process.execPath, [path.join(root, 'server.js')], {cwd: os.tmpdir(), env: {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), DB_PATH: db, PORT: String(port), HOST: '127.0.0.1', ...env}, stdio: ['ignore', 'pipe', 'pipe']});
    let out = ''; proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => proc.on('exit', (c) => r(c)));
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    if (proc.exitCode !== null && /EADDRINUSE/.test(out) && attempt < 4) continue;
    return {proc, base, dir, db, out: () => out, exited, stop: async () => { if (proc.exitCode === null) { proc.kill(); await exited; } }};
  }
}
const demoEnv = (extra: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  NODE_ENV: 'production', APP_ENV: 'demo', AUTH_REQUIRE_SMS: '1', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only',
  SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), ENABLE_DEMO_SEED: '1', DEMO_FARMER_PASSWORD: FARMER_PW, DEMO_EXPERT_PASSWORD: EXPERT_PW, TRUST_PROXY: '0', ...extra,
});
const prodEnv = (extra: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), TRUST_PROXY: '0', ...extra});
const devEnv = (): Record<string, string | undefined> => ({NODE_ENV: 'development', ENABLE_DEMO_SEED: '1', AUTH_REQUIRE_SMS: '1', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), TRUST_PROXY: '0'});

class Jar {
  c = new Map<string, string>();
  take(res: Response): void { for (const s of res.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); this.c.set(kv.slice(0, i), kv.slice(i + 1)); } }
  hdr(): string { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
}
interface Res {status: number; j: any; headers: Headers}
async function call(base: string, jar: Jar, method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  if (!jar.c.has('agri_csrf')) { const c = await fetch(`${base}/api/v1/csrf-token`); jar.take(c); await c.arrayBuffer(); }
  const h: Record<string, string> = {'Content-Type': 'application/json', Cookie: jar.hdr(), ...extra};
  if (jar.c.get('agri_csrf')) h['X-CSRF-Token'] = jar.c.get('agri_csrf')!;
  const x = await fetch(base + url, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)});
  jar.take(x);
  let j: any = null; try { j = await x.json(); } catch { /* not json */ }
  return {status: x.status, j, headers: x.headers};
}
const login = (base: string, jar: Jar, identifier: string, password: string, extra: Record<string, string> = {}) => call(base, jar, 'POST', '/api/v1/auth/login', {identifier, password}, extra);
async function inboxSignIn(base: string, phone: string, password: string): Promise<{jar: Jar; res: Res}> {
  const jar = new Jar();
  const l = await login(base, jar, phone, password);
  if (l.status !== 202) return {jar, res: l};
  const ib = await call(base, jar, 'GET', '/api/v1/auth/demo-inbox');
  const code = /(\d{6})/.exec(ib.j?.messages?.[0]?.message ?? '')?.[1];
  assert.ok(code, 'demo inbox shows the caller\'s own code');
  return {jar, res: await call(base, jar, 'POST', '/api/v1/auth/verify-device', {code})};
}
const listingBody = (name: string, extra: Record<string, unknown> = {}) => ({ownerKey: `${name}-${rand(20)}`, sellerName: 'Synthetic Seller', category: 'Cassava and root crops', productName: `Cassava ${name}`, quantity: '50', unit: 'kg', priceLrd: 1200, county: 'Bong', town: 'Gbarnga', description: 'Synthetic harvest listing for the security test.', ...extra});
const expertBody = (name: string, extra: Record<string, unknown> = {}) => ({requesterKey: `${name}-${rand(20)}`, farmerName: `Visitor ${name}`, category: 'Poultry farming', county: 'Bong', title: `Question ${name}`, description: `Synthetic description from visitor ${name}, please ignore.`, ...extra});
const img = (chars: number) => `data:image/png;base64,${'A'.repeat(chars - 22)}`;
const aud = (chars: number) => `data:audio/webm;base64,${'A'.repeat(chars - 23)}`;
const rw = <T>(file: string, fn: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(file); try { db.exec('PRAGMA busy_timeout = 5000'); return fn(db); } finally { db.close(); } };

// ====================================================================================================================== 1. synthetic numbers everywhere
test('1. demo environment: sellerPhone and buyerPhone must be synthetic (create, edit and inquiry); outside the demo nothing changes', async () => {
  const d = await boot(demoEnv({PUBLIC_WRITE_LIMIT_SCALE: '100'})); // this test makes many writes from one address; the limits themselves are tested elsewhere
  try {
    const anon = new Jar();
    for (const real of ['+231886123456', '0886123456', '886123456', '+231 55 123 4567', '+231770011234', 'not-a-number', '+1 202 555 0100']) {
      const r = await call(d.base, anon, 'POST', '/api/v1/marketplace/listings', listingBody('real', {sellerPhone: real, phoneConsent: true}));
      assert.equal(r.status, 422, `${real} must be refused as a seller phone`); assert.equal(r.j.error.code, 'PHONE_NOT_ALLOWED');
    }
    for (const synth of ['+231770001234', '0770001235', '770001236', '+231 77 000 1237']) {
      const r = await call(d.base, anon, 'POST', '/api/v1/marketplace/listings', listingBody('syn', {sellerPhone: synth, phoneConsent: true}));
      assert.equal(r.status, 201, `${synth} is synthetic`);
    }
    assert.equal((await call(d.base, anon, 'POST', '/api/v1/marketplace/listings', listingBody('nophone'))).status, 201, 'no phone at all is fine');
    // edit: the owner cannot swap in a real number later
    const body = listingBody('edit', {sellerPhone: '+231770002000', phoneConsent: true});
    const made = await call(d.base, anon, 'POST', '/api/v1/marketplace/listings', body);
    assert.equal(made.status, 201);
    const id = made.j.listing.id;
    const own = {'X-Listing-Key': body.ownerKey};
    const edit = await call(d.base, anon, 'PATCH', `/api/v1/marketplace/listings/${id}`, {sellerPhone: '+231886999000', phoneConsent: true}, own);
    assert.equal(edit.status, 422); assert.equal(edit.j.error.code, 'PHONE_NOT_ALLOWED');
    assert.equal((await call(d.base, anon, 'PATCH', `/api/v1/marketplace/listings/${id}`, {sellerPhone: '+231770002001', phoneConsent: true}, own)).status, 200);
    // inquiries
    const inq = (phone: unknown) => call(d.base, anon, 'POST', `/api/v1/marketplace/listings/${id}/inquiries`, {buyerName: 'Synthetic Buyer', buyerCounty: 'Bong', message: 'Synthetic inquiry text', buyerToken: `t-${rand(6)}`, ...(phone === undefined ? {} : {buyerPhone: phone})});
    for (const real of ['+231886111222', '0886111222', 'call me on 0886111222', '886111222']) { const r = await inq(real); assert.equal(r.status, 422, real); assert.equal(r.j.error.code, 'PHONE_NOT_ALLOWED'); }
    assert.equal((await inq('+231770003000')).status, 201); assert.equal((await inq(undefined)).status, 201); assert.equal((await inq('')).status, 201);
    // nothing but synthetic numbers (or empty) was ever stored
    rw(d.db, (db) => {
      const bad = db.prepare("SELECT COUNT(*) c FROM marketplace_listings WHERE seller_phone <> '' AND seller_phone NOT GLOB '+23177000[0-9][0-9][0-9][0-9]'").get() as {c: number};
      const bad2 = db.prepare("SELECT COUNT(*) c FROM marketplace_inquiries WHERE buyer_phone <> '' AND buyer_phone NOT GLOB '+23177000[0-9][0-9][0-9][0-9]' AND buyer_phone NOT GLOB '0770[0-9][0-9][0-9][0-9][0-9][0-9]'").get() as {c: number};
      assert.equal(bad.c, 0, 'no real seller number stored'); assert.equal(bad2.c, 0, 'no real buyer number stored');
    });
    const pub = await call(d.base, new Jar(), 'GET', '/api/v1/marketplace/listings');
    assert.ok(pub.j.listings.filter((l: {seller_phone: string}) => l.seller_phone).every((l: {seller_phone: string}) => l.seller_phone.startsWith('+23177000')), 'every number visible to the public is synthetic');
  } finally { await d.stop(); }
  const p = await boot(prodEnv());
  try {
    const r = await call(p.base, new Jar(), 'POST', '/api/v1/marketplace/listings', listingBody('prod', {sellerPhone: '+231886123456', phoneConsent: true}));
    assert.equal(r.status, 201, 'production (not demo) keeps accepting real numbers: the rule belongs to the demo environment');
  } finally { await p.stop(); }
});

// ====================================================================================================================== 2. permanent shared-account flag
test('2. a shared demo account is permanently flagged: changing its password (or phone, or resetting it) cannot expose private requests', async () => {
  const dir = tmp();
  let d = await boot(devEnv(), dir);
  try {
    const victim = new Jar();
    assert.equal((await call(d.base, victim, 'POST', '/api/v1/expert-requests/demo', expertBody('victim', {description: 'VICTIM-MARKER private visitor text.'}))).status, 201);
    const atk = await inboxSignIn(d.base, '+231770000201', 'ExpertDemo!2026');
    assert.equal(atk.res.status, 200);
    assert.ok(!JSON.stringify((await call(d.base, atk.jar, 'GET', '/api/v1/expert-requests/demo')).j).includes('VICTIM-MARKER'));
    // the takeover attempt from the review: change the shared account's password, then look again
    const ch = await call(d.base, atk.jar, 'POST', '/api/v1/account/password', {currentPassword: 'ExpertDemo!2026', newPassword: 'AttackerChosen!2026-xyz'});
    assert.equal(ch.status, 403); assert.equal(ch.j.error.code, 'SHARED_DEMO_ACCOUNT');
    assert.equal((await call(d.base, atk.jar, 'POST', '/api/v1/account/phone/change/start', {currentPassword: 'ExpertDemo!2026', newPhone: '+231770000999'})).status, 403);
    // the old password still works (nothing changed) and still sees only the samples
    const again = await inboxSignIn(d.base, '+231770000201', 'ExpertDemo!2026');
    assert.equal(again.res.status, 200);
    assert.ok(!JSON.stringify((await call(d.base, again.jar, 'GET', '/api/v1/expert-requests/demo')).j).includes('VICTIM-MARKER'));
    // password reset by code (the code is visible in the demo inbox to whoever asks) is refused for the shared account too
    const forgot = new Jar();
    assert.equal((await call(d.base, forgot, 'POST', '/api/v1/auth/forgot-password', {identifier: '+231770000201'})).status, 200);
    const ib = await call(d.base, forgot, 'GET', '/api/v1/auth/demo-inbox');
    const code = /(\d{6})/.exec(ib.j?.messages?.[0]?.message ?? '')?.[1];
    assert.ok(code, 'the recovery code is visible in the demo inbox (that is what makes the shared account reachable)');
    {
      assert.equal((await call(d.base, forgot, 'POST', '/api/v1/auth/forgot-password/verify', {code})).status, 200);
      const reset = await call(d.base, forgot, 'POST', '/api/v1/auth/reset-password', {newPassword: 'ResetByStranger!2026-x'});
      assert.equal(reset.status, 403); assert.equal(reset.j.error.code, 'SHARED_DEMO_ACCOUNT');
    }
    assert.equal((await login(d.base, new Jar(), '+231770000201', 'ResetByStranger!2026-x')).status, 401);
  } finally { await d.stop(); }
  // The flag is stored, permanent across restarts, and covers both seeded accounts.
  rw(d.db, (db) => assert.deepEqual((db.prepare("SELECT phone, is_shared_demo f FROM users WHERE phone IN ('+231770000101','+231770000201') ORDER BY phone").all() as {phone: string; f: number}[]).map((r) => r.f), [1, 1]));
  // A database seeded before the flag existed (flag 0, published passwords) is flagged again at start-up.
  rw(d.db, (db) => db.exec("UPDATE users SET is_shared_demo = 0 WHERE phone IN ('+231770000101','+231770000201')"));
  d = await boot(devEnv(), dir);
  await d.stop();
  rw(d.db, (db) => assert.deepEqual((db.prepare("SELECT is_shared_demo f FROM users WHERE phone IN ('+231770000101','+231770000201')").all() as {f: number}[]).map((r) => r.f), [1, 1]));
  // Even with the password changed directly in the database, a flagged account stays flagged after a restart.
  rw(d.db, (db) => db.exec("UPDATE users SET password_hash = 'x:y' WHERE phone = '+231770000201'"));
  d = await boot(devEnv(), dir); await d.stop();
  rw(d.db, (db) => assert.equal((db.prepare("SELECT is_shared_demo f FROM users WHERE phone = '+231770000201'").get() as {f: number}).f, 1));
  // Private-password demo accounts (strict demo environment) are NOT flagged: the presenter keeps a working expert account.
  const s = await boot(demoEnv());
  await s.stop();
  rw(s.db, (db) => assert.deepEqual((db.prepare("SELECT is_shared_demo f FROM users WHERE phone IN ('+231770000101','+231770000201')").all() as {f: number}[]).map((r) => r.f), [0, 0]));
});

// ====================================================================================================================== 3. no-store
test('3. API responses are Cache-Control: no-store (sessions, personal lists, errors); the static app shell is not', async () => {
  const d = await boot(prodEnv());
  try {
    const jar = new Jar();
    for (const [m, u] of [['GET', '/api/v1/auth/me'], ['GET', '/api/v1/expert-requests/demo'], ['GET', '/api/v1/guides'], ['GET', '/api/v1/marketplace/listings'], ['GET', '/api/v1/marketplace/inquiries'], ['GET', '/api/v1/csrf-token'], ['GET', '/api/v1/health'], ['GET', '/api/v1/nope'], ['POST', '/api/v1/auth/login']] as const) {
      const r = await call(d.base, jar, m, u, m === 'POST' ? {identifier: 'x', password: 'y'} : undefined);
      assert.equal(r.headers.get('cache-control'), 'no-store', `${m} ${u}`);
    }
    const shell = await fetch(`${d.base}/`);
    assert.notEqual(shell.headers.get('cache-control'), 'no-store', 'the app shell keeps its normal revalidation');
    assert.match((await fetch(`${d.base}/sw.js`)).headers.get('cache-control') ?? '', /max-age=0/);
  } finally { await d.stop(); }
});

// ====================================================================================================================== 4. pruning
test('4. rate-limit pruning runs in small indexed batches and cannot stall the thread', async () => {
  const {getDb} = await import('../server/db.ts');
  const {checkAndRecordRateLimit, pruneRateLimitBatch, resetRateLimitPruneForTests} = await import('../server/security.ts');
  const db = getDb();
  assert.ok((db.prepare('PRAGMA index_list(rate_limit_attempts)').all() as {name: string}[]).some((i) => i.name === 'idx_rate_limit_created'), 'migration 008 index exists');
  const plan = (db.prepare("EXPLAIN QUERY PLAN SELECT id FROM rate_limit_attempts WHERE created_at < datetime('now', '-25 hours') LIMIT 5000").all() as {detail: string}[]).map((r) => r.detail).join(' | ');
  assert.match(plan, /idx_rate_limit_created/, `prune must use the index, plan: ${plan}`);
  db.exec('DELETE FROM rate_limit_attempts');
  db.exec('BEGIN');
  const ins = db.prepare("INSERT INTO rate_limit_attempts (rate_key, action_type, created_at) VALUES (?, 'login_attempt', datetime('now', ?))");
  for (let i = 0; i < 300_000; i++) ins.run(`k${i % 40_000}`, i % 6 === 0 ? '-30 hours' : `-${(i % 600) + 1} minutes`);
  db.exec('COMMIT');
  const old = (db.prepare("SELECT COUNT(*) c FROM rate_limit_attempts WHERE created_at < datetime('now', '-25 hours')").get() as {c: number}).c;
  const recent = 300_000 - old;
  assert.ok(old >= 49_000, `precondition: ${old} old rows`);
  resetRateLimitPruneForTests();
  let t = Date.now();
  checkAndRecordRateLimit('probe-key', 'login_attempt', 5, 15, false); // runs one batch inline
  const inline = Date.now() - t;
  const afterOne = (db.prepare("SELECT COUNT(*) c FROM rate_limit_attempts WHERE created_at < datetime('now', '-25 hours')").get() as {c: number}).c;
  assert.equal(old - afterOne, 1000, 'one limiter call removes at most one batch (1000 rows), never the whole backlog');
  assert.ok(inline < 600, `one limiter call with a 50 000-row backlog took ${inline} ms (a bounded batch is tens of milliseconds; the old full-table delete held the thread for about a second)`);
  let worst = 0;
  for (let i = 0; i < 80; i++) { t = Date.now(); const n = pruneRateLimitBatch(); worst = Math.max(worst, Date.now() - t); assert.ok(n <= 1000); if (n === 0) break; }
  assert.ok(worst < 600, `worst single batch ${worst} ms`);
  assert.equal((db.prepare("SELECT COUNT(*) c FROM rate_limit_attempts WHERE created_at < datetime('now', '-25 hours')").get() as {c: number}).c, 0, 'the whole backlog drains in batches');
  assert.equal((db.prepare('SELECT COUNT(*) c FROM rate_limit_attempts').get() as {c: number}).c, recent, 'recent rows are kept, exactly');
  db.exec('DELETE FROM rate_limit_attempts');
});

test('5. migration 008 is additive, reversible and re-appliable', async () => {
  const {runMigrations} = await import('../server/db.ts');
  const dir = tmp();
  const db = new DatabaseSync(path.join(dir, 'm.db'));
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    const applied = runMigrations(db);
    assert.ok(applied.includes('008_shared_demo_accounts.sql'));
    const cols = () => (db.prepare('PRAGMA table_info(users)').all() as {name: string}[]).map((c) => c.name);
    assert.ok(cols().includes('is_shared_demo'));
    db.exec(fs.readFileSync(path.join(root, 'server/migrations/down/008_shared_demo_accounts.down.sql'), 'utf8'));
    assert.ok(!cols().includes('is_shared_demo')); assert.ok(!(db.prepare('PRAGMA index_list(rate_limit_attempts)').all() as {name: string}[]).some((i) => i.name === 'idx_rate_limit_created'));
    assert.deepEqual(runMigrations(db), ['008_shared_demo_accounts.sql'], 'applies again cleanly');
    assert.ok(cols().includes('is_shared_demo'));
  } finally { db.close(); }
});

// ====================================================================================================================== 6. IPv6 /64
test('6. limiter addresses: IPv6 is keyed by /64, IPv4-mapped is IPv4, garbage is "unknown"; only req.ip is used', () => {
  const k = limiterAddress;
  assert.equal(k('203.0.113.9'), '203.0.113.9');
  assert.equal(k('::ffff:203.0.113.9'), '203.0.113.9'); assert.equal(k('::ffff:cb00:7109'), '203.0.113.9');
  assert.equal(k('2001:db8:abcd:12::1'), 'v6:2001:db8:abcd:12');
  assert.equal(k('2001:db8:abcd:12:ffff:ffff:ffff:ffff'), 'v6:2001:db8:abcd:12');
  assert.equal(k('2001:DB8:ABCD:0012:0:0:0:7'), 'v6:2001:db8:abcd:12');
  assert.notEqual(k('2001:db8:abcd:13::1'), k('2001:db8:abcd:12::1'));
  assert.equal(k('fe80::1%eth0'), 'v6:fe80:0:0:0'); assert.equal(k('::1'), 'v6:0:0:0:0'); assert.equal(k('::'), 'v6:0:0:0:0');
  assert.equal(k('64:ff9b::192.0.2.1'), 'v6:64:ff9b:0:0');
  for (const bad of ['', undefined, null, 'not-an-ip', '1:2:3:4:5:6:7:8:9', '2001:db8::1::2', '300.1.1.1', '2001:db8:abcd:12::g']) assert.equal(k(bad as string), 'unknown', String(bad));
  // every limiter key uses it, and no limiter reads a forwarding header itself
  for (const f of ['server/routes/v1.ts', 'server/routes/authSecurity.ts', 'server/security.ts', 'server/mediaQuota.ts']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/x-forwarded-for|x-real-ip|cf-connecting-ip/i.test(src.replace(/^\s*(\/\/|\*).*$/gm, '')), `${f} must not read forwarding headers`);
  }
  const v1 = fs.readFileSync(path.join(root, 'server/routes/v1.ts'), 'utf8');
  assert.ok(!/hashIdentifier\([^)]*req\.ip/.test(v1) && !/\$\{req\.ip/.test(v1), 'v1 limiter keys use clientAddress(req)');
});

test('7. IPv6 /64 rotation does not reset login or write limits; a different /64 and IPv4 keep their own allowance; unverified headers are ignored', async () => {
  const d = await boot(prodEnv({TRUST_PROXY: '1'}));
  try {
    const st: number[] = [];
    for (let i = 0; i < 36; i++) st.push((await login(d.base, new Jar(), `+23177000${9100 + i}`, 'WrongPassw0rd!x', {'X-Forwarded-For': `2001:db8:abcd:12::${i + 1}`})).status);
    assert.equal(st.filter((s) => s === 401).length, 30, `30 failures per /64, not per address (${st})`); assert.ok(st.slice(30).every((s) => s === 429));
    assert.equal((await login(d.base, new Jar(), '+231770009200', 'WrongPassw0rd!x', {'X-Forwarded-For': '2001:db8:abcd:13::1'})).status, 401, 'another /64 is separate');
    assert.equal((await login(d.base, new Jar(), '+231770009201', 'WrongPassw0rd!x', {'X-Forwarded-For': '198.51.100.20'})).status, 401, 'an IPv4 client is separate');
    assert.equal((await login(d.base, new Jar(), '+231770009202', 'WrongPassw0rd!x', {'X-Forwarded-For': '::ffff:198.51.100.20'})).status, 401, 'IPv4-mapped is counted as that IPv4 address');
    // anonymous writes: 12 per /64 per hour, however the host part rotates
    const w: number[] = [];
    for (let i = 0; i < 14; i++) w.push((await call(d.base, new Jar(), 'POST', '/api/v1/marketplace/listings', listingBody(`v6${i}`), {'X-Forwarded-For': `2001:db8:feed:1::${i + 1}`})).status);
    assert.deepEqual(w, [...Array(12).fill(201), 429, 429], `writes (${w})`);
  } finally { await d.stop(); }
  // No trusted proxy: forwarding / client-address headers (including unverified ones) are ignored and the socket address rules.
  const n = await boot(prodEnv({TRUST_PROXY: '0'}));
  try {
    const st: number[] = [];
    for (let i = 0; i < 34; i++) st.push((await login(n.base, new Jar(), `+23177000${9300 + i}`, 'WrongPassw0rd!x', {'X-Forwarded-For': `2001:db8::${i + 1}`, 'X-Real-IP': `2001:db8:1:${i}::1`, 'CF-Connecting-IP': `203.0.113.${i + 1}`})).status);
    assert.equal(st.filter((s) => s === 401).length, 30, `headers must not reset the limit (${st})`);
  } finally { await n.stop(); }
});

// ====================================================================================================================== 7. Retry-After and offline retries
test('8. client retry policy honours Retry-After, including waits longer than the normal back-off, and never changes what is retried', () => {
  const now = 1_700_000_000_000;
  assert.equal(parseRetryAfter('900'), 900_000); assert.equal(parseRetryAfter(' 3 '), 3_000); assert.equal(parseRetryAfter('0'), 0);
  assert.equal(parseRetryAfter(new Date(now + 120_000).toUTCString(), now), 120_000);
  assert.equal(parseRetryAfter(new Date(now - 5_000).toUTCString(), now), 0);
  for (const bad of [null, undefined, '', 'soon', '-5', '1.5', '9999999999999']) assert.equal(parseRetryAfter(bad as string, now), null, String(bad));
  // plain network trouble: unchanged schedule and give-up
  const plain = [0, 1, 2, 3, 4].map((a) => planRetry({previousAttempts: a, retryable: true, random: 0}));
  assert.deepEqual(plain.map((p) => p.delayMs), [5000, 10000, 20000, 40000, 80000]);
  assert.equal(planRetry({previousAttempts: MAX_AUTO_ATTEMPTS - 1, retryable: true}).giveUp, true);
  assert.equal(planRetry({previousAttempts: 0, retryable: false}).giveUp, true);
  assert.ok(planRetry({previousAttempts: 9, retryable: true, random: 0}).delayMs === MAX_BACKOFF_MS || planRetry({previousAttempts: 9, retryable: true, random: 0}).giveUp);
  // server-directed: 15 minutes (the rate-limit window) is honoured although the normal cap is 5 minutes
  const p = planRetry({previousAttempts: 0, retryable: true, retryAfterMs: 900_000, random: 0});
  assert.equal(p.delayMs, 900_000); assert.ok(p.delayMs > MAX_BACKOFF_MS); assert.equal(p.serverDirected, true); assert.equal(p.giveUp, false);
  assert.equal(planRetry({previousAttempts: 0, retryable: true, retryAfterMs: 86_400_000, random: 0}).delayMs, MAX_RETRY_AFTER_MS, 'one wait is at most an hour');
  assert.equal(planRetry({previousAttempts: 0, retryable: true, retryAfterMs: 0, random: 0}).delayMs, 1000, 'never a tight loop');
  assert.ok(planRetry({previousAttempts: 0, retryable: true, retryAfterMs: 900_000, random: 0.999}).delayMs < 901_000, 'jitter stays small');
  // being told to wait is not a failure of the item: it survives past the normal 6 attempts and is handed back to the farmer only after 12 waits
  assert.equal(planRetry({previousAttempts: MAX_AUTO_ATTEMPTS, retryable: true, retryAfterMs: 900_000}).giveUp, false);
  assert.equal(planRetry({previousAttempts: MAX_SERVER_DIRECTED_ATTEMPTS - 1, retryable: true, retryAfterMs: 900_000}).giveUp, true);
  assert.equal(planRetry({previousAttempts: 0, retryable: false, retryAfterMs: 900_000}).giveUp, true, 'a rejection the farmer must fix is never retried');
  // wiring: the header is read, classified, and used for the next attempt time; nothing else about the queued write changes
  const api = fs.readFileSync(path.join(root, 'src/lib/api.ts'), 'utf8'); const eng = fs.readFileSync(path.join(root, 'src/lib/syncEngine.ts'), 'utf8');
  assert.match(api, /parseRetryAfter\(response\.headers\.get\('Retry-After'\)\)/);
  assert.match(eng, /retryAfterMs: asked/); assert.match(eng, /planRetry\(\{previousAttempts: op\.attempts, retryable: c\.retryable, retryAfterMs: c\.retryAfterMs\}\)/);
  assert.match(eng, /headers: \{'Idempotency-Key': op\.opId\}/, 'every send still carries the same Idempotency-Key');
  assert.ok(!/const MAX_BACKOFF_MS|const MAX_AUTO_ATTEMPTS/.test(eng), 'one policy, in retryPolicy.ts');
});

test('9. a rate-limited sync write is told the real wait, is not stored as done, and the SAME Idempotency-Key succeeds exactly once afterwards', async () => {
  const d = await boot(prodEnv());
  try {
    const jar = new Jar();
    for (let i = 0; i < 12; i++) assert.equal((await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', listingBody(`fill${i}`))).status, 201);
    const body = listingBody('retried', {productName: 'Cassava RETRIED-ONCE'});
    const key = crypto.randomUUID();
    const first = await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', body, {'Idempotency-Key': key});
    assert.equal(first.status, 429); assert.equal(first.j.error.code, 'RATE_LIMITED');
    const ra = Number(first.headers.get('retry-after'));
    assert.ok(ra >= 1 && ra <= 3600, `Retry-After ${ra}`); assert.equal(first.j.error.retryAfterSeconds, ra, 'header and body agree');
    assert.equal(rw(d.db, (db) => (db.prepare("SELECT COUNT(*) c FROM marketplace_listings WHERE product_name = 'Cassava RETRIED-ONCE'").get() as {c: number}).c), 0, 'nothing was stored');
    // the window passes (simulated by clearing this address's counters in the disposable database), the client retries with the SAME key
    rw(d.db, (db) => db.exec("DELETE FROM rate_limit_attempts WHERE action_type LIKE 'write_%'"));
    const retry = await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', body, {'Idempotency-Key': key});
    assert.equal(retry.status, 201);
    for (let i = 0; i < 5; i++) { const again = await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', body, {'Idempotency-Key': key}); assert.equal(again.status, 201); assert.equal(again.headers.get('idempotent-replay'), 'true'); assert.equal(again.j.listing.id, retry.j.listing.id); }
    assert.equal(rw(d.db, (db) => (db.prepare("SELECT COUNT(*) c FROM marketplace_listings WHERE product_name = 'Cassava RETRIED-ONCE'").get() as {c: number}).c), 1, 'exactly one record');
  } finally { await d.stop(); }
});

// ====================================================================================================================== 8. media quotas
test('10. anonymous photo/voice quotas: per-item caps, a global byte budget and a daily count bound database growth; signed-in accounts and replays are unaffected', async () => {
  const d = await boot(prodEnv({ANON_MEDIA_BUDGET_MB: '1', PUBLIC_WRITE_LIMIT_SCALE: '100'}));
  try {
    const anon = new Jar();
    const withPhoto = (n: number, extra: Record<string, unknown> = {}) => call(d.base, anon, 'POST', '/api/v1/expert-requests/demo', expertBody(`m${rand(3)}`, {photoDataUrl: img(n), ...extra}));
    const a = await withPhoto(600_000); assert.equal(a.status, 201); assert.equal(a.j.request.photo_data_url.length, 600_000);
    const b = await withPhoto(600_000);
    assert.equal(b.status, 507, 'the budget (1 MB) is exhausted'); assert.equal(b.j.error.code, 'ANON_STORAGE_QUOTA');
    assert.equal((await call(d.base, anon, 'POST', '/api/v1/expert-requests/demo', expertBody('textonly'))).status, 201, 'text-only questions are still accepted');
    // per-item cap for anonymous visitors: 1.0M characters of image, 1.5M of audio (larger media is ignored, as before)
    const big = await call(d.base, new Jar(), 'POST', '/api/v1/expert-requests/demo', expertBody('big', {photoDataUrl: img(1_200_000)}));
    assert.equal(big.status, 201); assert.equal(big.j.request.photo_data_url, '', 'an anonymous photo over the cap is not stored');
    // listing images and recordings count too
    const lst = await call(d.base, anon, 'POST', '/api/v1/marketplace/listings', listingBody('imgq', {imageUrl: img(600_000)}));
    assert.equal(lst.status, 507); assert.equal(lst.j.error.code, 'ANON_STORAGE_QUOTA');
    const rec = await call(d.base, anon, 'POST', '/api/v1/language-lab/recordings', {languageCode: 'bas', topicSlug: 'rice', speakerName: 'Synthetic Speaker', questionText: 'How do I plant rice?', answerText: 'Plant at the start of the rains.', consentConfirmed: true, audioDataUrl: aud(900_000)});
    assert.equal(rec.status, 507);
    // signed-in accounts keep the original 2.5 MB items and are not limited by the visitor budget
    const acct = new Jar();
    assert.equal((await call(d.base, acct, 'POST', '/api/v1/auth/register', {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Quota Farmer', phone: '+231880009500', password: PW, county: 'Bong'})).status, 201);
    const mine = await call(d.base, acct, 'POST', '/api/v1/expert-requests/demo', expertBody('acct', {requesterKey: undefined, photoDataUrl: img(1_200_000)}));
    assert.equal(mine.status, 201); assert.equal(mine.j.request.photo_data_url.length, 1_200_000);
    // the total of visitor media never exceeds the budget
    const bytes = rw(d.db, (db) => Number((db.prepare('SELECT SUM(COALESCE(octet_length(photo_data_url),0) + COALESCE(octet_length(voice_note_data_url),0)) n FROM demo_expert_requests WHERE user_id IS NULL').get() as {n: number}).n));
    assert.ok(bytes <= 1024 * 1024, `anonymous media ${bytes} bytes stays within the 1 MB budget`);
  } finally { await d.stop(); }
  const e = await boot(prodEnv({ANON_MEDIA_BUDGET_MB: '1000'}));
  try {
    const anon = new Jar();
    const key = crypto.randomUUID(); const body = expertBody('replay', {photoDataUrl: img(2000)});
    assert.equal((await call(e.base, anon, 'POST', '/api/v1/expert-requests/demo', body, {'Idempotency-Key': key})).status, 201);
    for (let i = 0; i < 20; i++) assert.equal((await call(e.base, anon, 'POST', '/api/v1/expert-requests/demo', body, {'Idempotency-Key': key})).headers.get('idempotent-replay'), 'true', 'a retry is replayed, not counted again');
    const st: number[] = [];
    for (let i = 0; i < 9; i++) st.push((await call(e.base, anon, 'POST', '/api/v1/expert-requests/demo', expertBody(`d${i}`, {photoDataUrl: img(2000)}))).status);
    assert.deepEqual(st.slice(0, 7), Array(7).fill(201), `7 more uploads fit in the daily allowance of 8 (replays were free) (${st})`);
    assert.equal(st[7], 429, `the 9th media upload today is refused (${st})`);
    const limited = await call(e.base, anon, 'POST', '/api/v1/expert-requests/demo', expertBody('dx', {photoDataUrl: img(2000)}));
    assert.equal(limited.j.error.code, 'RATE_LIMITED'); assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  } finally { await e.stop(); }
});

// ====================================================================================================================== 9. wording
test('11. no farmer-facing text calls simulated advice approved or verified', () => {
  const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk('src').filter((f) => /\.tsx$/.test(f) && !f.startsWith(path.join('src', 'pages', 'admin')));
  const banned = [/Approved Expert Advice/, /approved crop guides/i, /approved agricultural specialist/i, /Approved Expert ·/, /Read approved guides/i, /Detailed Approved/i, /Approved crop guides/, /verified expert/i, /certified agronomist (has|have|approved)/i, /Verified Static/i, /matching approved/i];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const re of banned) assert.ok(!re.test(text), `${f} contains misleading wording ${re}`);
  }
  assert.match(fs.readFileSync(path.join(root, 'src/pages/farmer/MyQuestionsPage.tsx'), 'utf8'), /not verified agricultural advice/);
  assert.ok(!/matching approved guides/i.test(fs.readFileSync(path.join(root, 'server/ai.ts'), 'utf8')), 'the advisor fallback must not call demonstration guides approved');
  assert.match(fs.readFileSync(path.join(root, 'src/pages/expert/ExpertDashboardPage.tsx'), 'utf8'), /Expert account ·/);
});
