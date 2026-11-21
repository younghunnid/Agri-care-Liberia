import assert from 'node:assert/strict';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {loadRuntimeConfig, RuntimeConfigError, parseTrustProxy} from '../server/runtime.ts';

/**
 * Deployment readiness: configuration validation (unit) and the BUILT production entry `server.js` run as a real child process from a different
 * working directory on disposable databases in the OS temp folder. Nothing here touches data/agri_advisory.db. No real SMS, no network except localhost.
 */
const root = path.resolve(import.meta.dirname, '..');
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const PW = 'GoodPassw0rd!2026';
const tmpDirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-deploy-')); tmpDirs.push(d); return d; };

before(() => {
  const b = spawnSync(process.execPath, [path.join(root, 'scripts/build-server.mjs')], {cwd: root, encoding: 'utf8'});
  assert.equal(b.status, 0, b.stderr);
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')), 'run `npm run build` first (dist/ is needed for the production server)');
});
after(() => { for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

const goodEnv = (dir: string): NodeJS.ProcessEnv => ({NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), DB_PATH: path.join(dir, 'data', 'agri.db')} as NodeJS.ProcessEnv);

// ============================================================ configuration (unit)
test('1. production configuration is validated and fails closed, naming settings never values', () => {
  const dir = tmp();
  const app = '/srv/app/current';
  const ok = loadRuntimeConfig(goodEnv(dir), app);
  assert.equal(ok.production, true); assert.equal(ok.cookieMode, 'first_party'); assert.equal(ok.enableDemoSeed, false); assert.equal(ok.stagingDiagToken, null);
  const bad = (env: Record<string, string | undefined>, re: RegExp, why: string) => {
    try { loadRuntimeConfig({...goodEnv(dir), ...env} as NodeJS.ProcessEnv, app); assert.fail(`should refuse: ${why}`); }
    catch (e) { assert.ok(e instanceof RuntimeConfigError, why); assert.match((e as Error).message, re, why); for (const v of Object.values(env)) if (v && v.length > 12) assert.ok(!(e as Error).message.includes(v), 'message must not echo values'); }
  };
  bad({SESSION_SECRET: undefined}, /SESSION_SECRET is required/, 'no session secret');
  bad({SESSION_SECRET: 'short'}, /SESSION_SECRET is required/, 'short session secret');
  bad({SESSION_SECRET: 'changeme-changeme-changeme-changeme-1234'}, /SESSION_SECRET is required/, 'placeholder session secret');
  bad({DB_PATH: undefined}, /DB_PATH is required/, 'no DB_PATH');
  bad({DB_PATH: './data/agri.db'}, /DB_PATH must be an absolute path/, 'relative DB_PATH');
  bad({DB_PATH: `${app}/data/agri.db`}, /outside the application folder/, 'database inside the app folder');
  bad({DB_PATH: '/home/u/hbuilds/versions/x/agri.db'}, /hbuilds or public_html/, 'database inside hbuilds');
  bad({DB_PATH: '/home/u/public_html/agri.db'}, /hbuilds or public_html/, 'database inside public_html');
  bad({COOKIE_MODE: 'cross_site'}, /SameSite=None/, 'cross-site cookies in production');
  bad({ENABLE_DEMO_SEED: '1'}, /ENABLE_DEMO_SEED must not be set in production/, 'demo seed in production');
  bad({TRUST_PROXY: '0.0.0.0/0'}, /TRUST_PROXY/, 'trusting every address');
  bad({TRUST_PROXY: 'banana!'}, /TRUST_PROXY/, 'garbage trust proxy');
  bad({TRUST_PROXY: '25'}, /TRUST_PROXY/, 'hop count out of range');
  bad({SQLITE_JOURNAL_MODE: 'memory'}, /SQLITE_JOURNAL_MODE/, 'unsupported journal mode');
  bad({STAGING_DIAG_TOKEN: 'short'}, /STAGING_DIAG_TOKEN/, 'weak diagnostics token');
});

test('2. the protected demo environment is as strict as production on secrets and storage, but may seed synthetic accounts; development stays easy', () => {
  const dir = tmp();
  const demoBase = {...goodEnv(dir), NODE_ENV: 'production', APP_ENV: 'demo'} as NodeJS.ProcessEnv;
  const demo = {...demoBase, ENABLE_DEMO_SEED: '1', DEMO_FARMER_PASSWORD: 'Private-Farmer-Pass-77', DEMO_EXPERT_PASSWORD: 'Private-Expert-Pass-88'} as NodeJS.ProcessEnv;
  const c = loadRuntimeConfig(demo, '/srv/app');
  assert.equal(c.demoEnvironment, true); assert.equal(c.strict, true); assert.equal(c.enableDemoSeed, true); assert.equal(c.cookieMode, 'first_party');
  assert.deepEqual(c.demoSeedPasswords, {farmer: 'Private-Farmer-Pass-77', expert: 'Private-Expert-Pass-88'});
  // Phase 0: the demo environment never seeds accounts with the PUBLISHED passwords.
  for (const bad of [
    {...demoBase, ENABLE_DEMO_SEED: '1'},
    {...demo, DEMO_EXPERT_PASSWORD: 'ExpertDemo!2026'},
    {...demo, DEMO_FARMER_PASSWORD: 'short'},
    {...demo, DEMO_EXPERT_PASSWORD: 'Private-Farmer-Pass-77'},
    {...demoBase, DEMO_FARMER_PASSWORD: 'Private-Farmer-Pass-77'},
  ] as NodeJS.ProcessEnv[]) {
    try { loadRuntimeConfig(bad, '/srv/app'); assert.fail('should refuse'); } catch (e) { assert.ok(e instanceof RuntimeConfigError); assert.match((e as Error).message, /DEMO_(FARMER|EXPERT)_PASSWORD/); assert.ok(!(e as Error).message.includes('Private-Farmer-Pass-77') && !(e as Error).message.includes('ExpertDemo')); }
  }
  assert.throws(() => loadRuntimeConfig({...goodEnv(dir), DEMO_FARMER_PASSWORD: 'Private-Farmer-Pass-77'} as NodeJS.ProcessEnv, '/srv/app'), RuntimeConfigError, 'production refuses demo passwords');
  assert.throws(() => loadRuntimeConfig({...demo, SESSION_SECRET: undefined} as NodeJS.ProcessEnv, '/srv/app'), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig({...demo, DB_PATH: '/srv/app/x.db'} as NodeJS.ProcessEnv, '/srv/app'), RuntimeConfigError);
  const dev = loadRuntimeConfig({} as NodeJS.ProcessEnv, '/srv/app');
  assert.equal(dev.strict, false); assert.equal(dev.dbPath, path.resolve('/srv/app/data/agri_advisory.db')); assert.equal(dev.cookieMode, 'cross_site'); assert.equal(dev.enableDemoSeed, false);
  assert.equal(loadRuntimeConfig({APP_ENV: 'test', NODE_ENV: 'production'} as NodeJS.ProcessEnv, '/srv/app').strict, false, 'the black-box harness is not production');
  const p: string[] = [];
  assert.deepEqual(parseTrustProxy('2', p), {value: 2, explicit: true}); assert.deepEqual(parseTrustProxy('0', p), {value: false, explicit: true}); assert.deepEqual(parseTrustProxy(undefined, p), {value: 1, explicit: false});
  assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8', p).value, ['loopback', '10.0.0.0/8']); assert.equal(p.length, 0);
});

// ============================================================ the built server as a real process
async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
interface Booted {proc: ChildProcess; base: string; out: () => string; exited: Promise<number | null>; stop: () => Promise<void>}
async function boot(envIn: Record<string, string | undefined>, entry = path.join(root, 'server.js'), cwd = os.tmpdir()): Promise<Booted> {
  const env = Object.fromEntries(Object.entries(envIn).filter(([, v]) => v !== undefined)) as Record<string, string>;
  for (let attempt = 1; ; attempt++) {
    const port = await freePort(); // released before the child binds it: retry on a new port if something took it meanwhile
    const proc = spawn(process.execPath, [entry], {cwd, env: {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), PORT: String(port), HOST: '127.0.0.1', ...env}, stdio: ['ignore', 'pipe', 'pipe']});
    let out = ''; proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => proc.on('exit', (c) => r(c)));
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    if (proc.exitCode !== null && /EADDRINUSE/.test(out) && attempt < 4) continue;
    return {proc, base, out: () => out, exited, stop: async () => { if (proc.exitCode === null) { proc.kill(); await exited; } }};
  }
}
const refuses = async (env: Record<string, string | undefined>): Promise<string> => {
  const b = await boot(env);
  const code = await Promise.race([b.exited, new Promise<null>((r) => setTimeout(() => r(null), 30000))]);
  const out = b.out(); await b.stop();
  assert.notEqual(code, null, 'server must exit'); assert.notEqual(code, 0);
  return out;
};
const cookiesOf = (r: Response) => r.headers.getSetCookie();
async function register(base: string, phone: string, extra: Record<string, string> = {}) {
  const c = await fetch(`${base}/api/v1/csrf-token`, {headers: extra});
  const {csrfToken} = (await c.json()) as {csrfToken: string};
  const jar = cookiesOf(c).map((x) => x.split(';')[0]).join('; ');
  const r = await fetch(`${base}/api/v1/auth/register`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: jar, ...extra}, body: JSON.stringify({displayName: 'Deploy Check', phone, password: PW, county: 'Bong'})});
  return {r, jar: [...cookiesOf(c), ...cookiesOf(r)].map((x) => x.split(';')[0]).join('; '), csrfToken};
}

test('3. the built server.js starts from another working directory, serves the app and the API, and stays in production mode', async () => {
  const dir = tmp();
  const s = await boot(goodEnv(dir));
  try {
    const h = await fetch(`${s.base}/api/v1/health`);
    assert.equal(h.status, 200); assert.equal(h.headers.get('x-powered-by'), null, 'no Express banner');
    const home = await fetch(`${s.base}/`); const html = await home.text();
    assert.equal(home.status, 200); assert.match(html, /<div id="root">/);
    assert.equal((await fetch(`${s.base}/learn`)).status, 200, 'SPA routes fall back to index.html');
    const sw = await fetch(`${s.base}/sw.js`); assert.equal(sw.status, 200); assert.match(sw.headers.get('cache-control') ?? '', /max-age=0/, 'the service worker must always be revalidated');
    const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0]; assert.ok(asset, 'index.html references a hashed asset');
    const a = await fetch(`${s.base}${asset}`); assert.equal(a.status, 200); assert.match(a.headers.get('cache-control') ?? '', /max-age=31536000.*immutable/, 'hashed assets are cached for a year');
    assert.equal((await fetch(`${s.base}/assets/missing-file.js`)).status, 404, 'a missing asset is a 404, not the app');
    assert.ok(fs.existsSync(path.join(dir, 'data', 'agri.db')), 'database was created at DB_PATH, not in the application folder');
    assert.ok(!fs.existsSync(path.join(root, 'data', 'deploy-test.db')));
    assert.match(s.out(), /listening|running|Server/i);
  } finally { await s.stop(); }
});

test('4. API errors are JSON: unknown paths 404, bad JSON 400, oversized body 413, no stack traces', async () => {
  const dir = tmp();
  const s = await boot(goodEnv(dir));
  try {
    for (const p of ['/api/v1/nope', '/api/nothing', '/api/v1/dev/simulated-sms', '/api/v1/__staging/proxy', '/api/v1/test-fixtures/reset']) {
      const r = await fetch(`${s.base}${p}`);
      assert.equal(r.status, 404, p); assert.match(r.headers.get('content-type') ?? '', /json/, p);
      const j = (await r.json()) as {error: {code: string}}; assert.equal(j.error.code, 'NOT_FOUND');
    }
    const bad = await fetch(`${s.base}/api/v1/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{not json'});
    assert.equal(bad.status, 400); const bj = await bad.text(); assert.match(bj, /INVALID_JSON/); assert.ok(!/at .*\.js|node_modules|SyntaxError/.test(bj), 'no stack or parser internals');
    const big = await fetch(`${s.base}/api/v1/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({x: 'a'.repeat(5 * 1024 * 1024)})});
    assert.equal(big.status, 413); assert.match(await big.text(), /PAYLOAD_TOO_LARGE/);
    const env = await (await fetch(`${s.base}/api/v1/environment`)).json() as Record<string, boolean>;
    assert.deepEqual(env, {demoEnvironment: false, simulatedSms: false, phoneVerification: 'none', syntheticAccountsOnly: false});
  } finally { await s.stop(); }
});

test('5. a fresh production database contains NO demo accounts; the published demo passwords do not work', async () => {
  const dir = tmp();
  const s = await boot(goodEnv(dir));
  try {
    for (const [id, pw] of [['+231770000101', 'FarmerDemo!2026'], ['+231770000201', 'ExpertDemo!2026']] as const) {
      const c = await fetch(`${s.base}/api/v1/csrf-token`); const {csrfToken} = (await c.json()) as {csrfToken: string};
      const r = await fetch(`${s.base}/api/v1/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookiesOf(c).map((x) => x.split(';')[0]).join('; ')}, body: JSON.stringify({identifier: id, password: pw})});
      assert.equal(r.status, 401, `demo password must be rejected for ${id}`);
      assert.ok(!cookiesOf(r).some((x) => x.startsWith('agri_session=')));
    }
  } finally { await s.stop(); }
  const db = new DatabaseSync(path.join(dir, 'data', 'agri.db'), {readOnly: true});
  try { assert.equal((db.prepare("SELECT COUNT(*) AS c FROM users WHERE phone IN ('+231770000101','+231770000201')").get() as {c: number}).c, 0); assert.ok((db.prepare('SELECT COUNT(*) AS c FROM roles').get() as {c: number}).c >= 3, 'roles/reference data still seeded'); } finally { db.close(); }
});

test('6. production refuses to start on a database that already contains demo accounts, and on every unsafe setting', async () => {
  const dir = tmp();
  // A database made the development way (demo seed ON) ...
  const dev = await boot({NODE_ENV: 'development', ENABLE_DEMO_SEED: '1', DB_PATH: path.join(dir, 'data', 'agri.db'), APP_ENV: ''}, path.join(root, 'server.js'));
  await dev.stop();
  const db = new DatabaseSync(path.join(dir, 'data', 'agri.db'), {readOnly: true});
  const seeded = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE phone = '+231770000101'").get() as {c: number}).c; db.close();
  assert.equal(seeded, 1, 'precondition: the development start did create the demo accounts');
  // ... must not be served in production.
  const out = await refuses(goodEnv(dir));
  assert.match(out, /demo accounts with published passwords/); assert.ok(!out.includes('FarmerDemo') && !out.includes('ExpertDemo'), 'passwords are never printed');
  const d2 = tmp();
  const env = goodEnv(d2);
  const o1 = await refuses({...env, SESSION_SECRET: ''} as Record<string, string>); assert.match(o1, /SESSION_SECRET is required/); assert.ok(!o1.includes(env.OTP_HMAC_SECRET as string));
  assert.match(await refuses({...env, DB_PATH: ''} as Record<string, string>), /DB_PATH is required/);
  assert.match(await refuses({...env, ENABLE_DEMO_SEED: '1'} as Record<string, string>), /ENABLE_DEMO_SEED must not be set in production/);
  assert.match(await refuses({...env, DB_PATH: path.join(root, 'data', 'never-created.db')} as Record<string, string>), /outside the application folder/);
  assert.ok(!fs.existsSync(path.join(root, 'data', 'never-created.db')));
  assert.match(await refuses({...env, DB_PATH: '/proc/agri/x.db'} as Record<string, string>), /not writable/);
});

test('7. cookies: first-party SameSite=Lax; Secure in production, the client Origin header cannot change them, sessions survive a restart (stable SESSION_SECRET)', async () => {
  const dir = tmp();
  const env = goodEnv(dir);
  const phone = '+231770777301';
  let s = await boot(env);
  let jar = ''; let csrf = '';
  try {
    const plain = await fetch(`${s.base}/api/v1/csrf-token`, {headers: {Origin: 'https://attacker.example'}});
    for (const c of cookiesOf(plain)) { assert.match(c, /SameSite=Lax/i, c); assert.match(c, /;\s*Secure/i, c); assert.ok(!/Partitioned|SameSite=None/i.test(c), c); }
    assert.ok(cookiesOf(plain).length >= 1);
    const reg = await register(s.base, phone, {'X-Forwarded-Proto': 'https'});
    assert.equal(reg.r.status, 201, await reg.r.clone().text());
    const sess = cookiesOf(reg.r).find((c) => c.startsWith('agri_session='))!;
    assert.match(sess, /HttpOnly/i); assert.match(sess, /SameSite=Lax/i); assert.match(sess, /;\s*Secure/i);
    jar = reg.jar; csrf = reg.csrfToken;
    const me = await (await fetch(`${s.base}/api/v1/auth/me`, {headers: {Cookie: jar, 'X-Forwarded-Proto': 'https'}})).json() as {user: {phone: string}};
    assert.equal(me.user.phone, phone);
  } finally { await s.stop(); }
  // Restart with the SAME secret: the browser's session cookie is still valid.
  s = await boot(env);
  try {
    const me = await (await fetch(`${s.base}/api/v1/auth/me`, {headers: {Cookie: jar, 'X-Forwarded-Proto': 'https'}})).json() as {user: {phone: string} | null};
    assert.equal(me.user?.phone, phone, 'session survives a restart and the database persisted');
  } finally { await s.stop(); }
  // A DIFFERENT secret (what an unset SESSION_SECRET would silently cause) signs everyone out.
  s = await boot({...env, SESSION_SECRET: rand()});
  try {
    const me = await (await fetch(`${s.base}/api/v1/auth/me`, {headers: {Cookie: jar, 'X-Forwarded-Proto': 'https'}})).json() as {user: unknown};
    assert.ok(!me.user, 'a changed secret invalidates sessions (documented)');
  } finally { await s.stop(); }
  assert.ok(csrf.length > 10);
});

test('8. proxy handling: TRUST_PROXY=1 keys the limiter on the proxy-added address (spoofed left-hand values do not help); TRUST_PROXY=0 ignores forwarding headers', async () => {
  const attempts = async (base: string, header: (i: number) => string, ident: string, n = 10) => {
    const statuses: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = await fetch(`${base}/api/v1/csrf-token`); const {csrfToken} = (await c.json()) as {csrfToken: string};
      const r = await fetch(`${base}/api/v1/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookiesOf(c).map((x) => x.split(';')[0]).join('; '), 'X-Forwarded-For': header(i)}, body: JSON.stringify({identifier: ident, password: 'WrongPassw0rd!x'})});
      statuses.push(r.status);
    }
    return statuses;
  };
  const d1 = tmp();
  const one = await boot({...goodEnv(d1), TRUST_PROXY: '1'});
  try {
    const st = await attempts(one.base, (i) => `203.0.113.${i + 1}, 198.51.100.9`, '+231770777401');
    assert.ok(st.slice(0, 8).every((x) => x === 401) && st.slice(8).every((x) => x === 429), `one hop: spoofed left-hand addresses must not reset the limit (${st})`);
    const other = await attempts(one.base, () => '203.0.113.50, 198.51.100.77', '+231770777402', 5);
    assert.ok(other.every((x) => x === 401), `a different proxy-added client address is a different bucket (${other})`);
  } finally { await one.stop(); }
  const d2 = tmp();
  const zero = await boot({...goodEnv(d2), TRUST_PROXY: '0'});
  try {
    const st = await attempts(zero.base, (i) => `203.0.113.${i + 1}`, '+231770777403');
    assert.ok(st.slice(0, 8).every((x) => x === 401) && st.slice(8).every((x) => x === 429), `no proxy trusted: forwarding headers are ignored (${st})`);
  } finally { await zero.stop(); }
});

test('9. staging diagnostics exist only with STAGING_DIAG_TOKEN, require it, and leak no secrets or accounts', async () => {
  const dir = tmp();
  const token = rand();
  const env: Record<string, string> = {...(goodEnv(dir) as Record<string, string>), STAGING_DIAG_TOKEN: token, TRUST_PROXY: '1'};
  let s = await boot(env);
  try {
    assert.equal((await fetch(`${s.base}/api/v1/__staging/storage`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/v1/__staging/storage`, {headers: {'X-Staging-Token': 'x'.repeat(40)}})).status, 401);
    const H = {'X-Staging-Token': token};
    const st = await (await fetch(`${s.base}/api/v1/__staging/storage`, {headers: H})).json() as Record<string, unknown>;
    assert.equal(st.dbInsideAppRoot, false); assert.equal(st.journalMode, 'wal'); assert.equal(st.quickCheck, 'ok'); assert.equal(st.marker, null); assert.match(String(st.node), /^v2[2-9]/);
    assert.equal((await fetch(`${s.base}/api/v1/__staging/marker`, {method: 'POST', headers: H})).status, 201);
    const prox = await (await fetch(`${s.base}/api/v1/__staging/proxy`, {headers: {...H, 'X-Forwarded-For': '198.51.100.9', 'X-Forwarded-Proto': 'https'}})).json() as Record<string, unknown>;
    assert.equal(prox.secure, true); assert.equal(prox.ip, '198.51.100.9');
    const wal = await (await fetch(`${s.base}/api/v1/__staging/wal-test?rounds=200`, {method: 'POST', headers: H})).json() as {ok: boolean; inserted: number};
    assert.equal(wal.ok, true); assert.equal(wal.inserted, 200);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'data')).filter((f) => f.startsWith('staging-wal-test')), [], 'scratch files are removed');
    const text = JSON.stringify([st, prox]);
    for (const secret of [env.SESSION_SECRET, env.OTP_HMAC_SECRET, token, dir]) assert.ok(!text.includes(secret as string), 'no secret or full path in diagnostics');
  } finally { await s.stop(); }
  s = await boot(env); // restart: the marker file next to the database persists
  try {
    const st = await (await fetch(`${s.base}/api/v1/__staging/storage`, {headers: {'X-Staging-Token': token}})).json() as {marker: {id: string} | null};
    assert.ok(st.marker?.id, 'persistence marker survived the restart');
  } finally { await s.stop(); }
  const off = await boot(goodEnv(tmp()));
  try { assert.equal((await fetch(`${off.base}/api/v1/__staging/storage`)).status, 404, 'absent without a token'); } finally { await off.stop(); }
});

test('10. the protected demo environment boots as a labelled, isolated demonstration server (synthetic accounts only)', async () => {
  const dir = tmp();
  const env = {...goodEnv(dir), APP_ENV: 'demo', AUTH_REQUIRE_SMS: '1', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only', ENABLE_DEMO_SEED: '1', DEMO_FARMER_PASSWORD: 'Private-Farmer-Pass-77', DEMO_EXPERT_PASSWORD: 'Private-Expert-Pass-88'};
  const s = await boot(env);
  try {
    const e = await (await fetch(`${s.base}/api/v1/environment`)).json() as Record<string, boolean>;
    assert.deepEqual(e, {demoEnvironment: true, simulatedSms: true, phoneVerification: 'sms', syntheticAccountsOnly: true});
    const c = await fetch(`${s.base}/api/v1/csrf-token`);
    for (const x of cookiesOf(c)) assert.match(x, /SameSite=Lax/i);
    assert.equal((await fetch(`${s.base}/api/v1/dev/simulated-sms`, {headers: {'X-Demo-Operator-Token': 'x'.repeat(40)}})).status, 404, 'operator inbox off unless SIMULATED_INBOX is set');
  } finally { await s.stop(); }
  assert.match(await refuses({...env, DEMO_ENV_ACK: ''} as Record<string, string>), /DEMO_ENV_ACK/);
  assert.match(await refuses({...env, SESSION_SECRET: ''} as Record<string, string>), /SESSION_SECRET/);
  assert.match(await refuses({...env, COOKIE_MODE: 'cross_site'} as Record<string, string>), /SameSite=None/);
});

// ============================================================ backup and restore
test('11. backup-db.js makes a verified consistent copy of a LIVE database, prunes old copies; restore-db.js verifies, keeps the old file and restores', async () => {
  const dir = tmp();
  const env = goodEnv(dir);
  const s = await boot(env);
  const phone = '+231770777501';
  try { assert.equal((await register(s.base, phone)).r.status, 201); await register(s.base, '+231770777502'); } finally { /* keep running: backup while live */ }
  const bdir = path.join(dir, 'backups');
  const run = (script: string, args: string[], e: Record<string, string>) => spawnSync(process.execPath, [path.join(root, script), ...args], {cwd: os.tmpdir(), encoding: 'utf8', env: {PATH: process.env.PATH ?? '', ...e}});
  const b1 = run('backup-db.js', ['--to', bdir, '--keep', '2'], {DB_PATH: env.DB_PATH as string});
  assert.equal(b1.status, 0, b1.stderr + b1.stdout); assert.match(b1.stdout, /backup ok.*integrity ok/);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(run('backup-db.js', ['--to', bdir, '--keep', '2'], {DB_PATH: env.DB_PATH as string}).status, 0);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(run('backup-db.js', ['--to', bdir, '--keep', '2'], {DB_PATH: env.DB_PATH as string}).status, 0);
  const files = fs.readdirSync(bdir).filter((f) => f.endsWith('.db')).sort();
  assert.equal(files.length, 2, 'only the newest 2 are kept'); assert.equal(fs.readdirSync(bdir).filter((f) => f.endsWith('.sha256')).length, 2);
  assert.equal((fs.statSync(path.join(bdir, files[0])).mode & 0o077), 0, 'backup is private (0600)');
  assert.equal(run('backup-db.js', ['--to', path.join(dir, 'public_html', 'x')], {DB_PATH: env.DB_PATH as string}).status, 1, 'refuses public_html');
  await s.stop();
  const newest = path.join(bdir, files[1]);
  // Damage the live database, then restore.
  const live = env.DB_PATH as string;
  fs.writeFileSync(live, 'this is not a database');
  const dry = run('restore-db.js', ['--from', newest, '--dry-run'], {DB_PATH: live});
  assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /dry run: nothing changed/); assert.equal(fs.readFileSync(live, 'utf8'), 'this is not a database');
  assert.equal(run('restore-db.js', ['--from', newest], {DB_PATH: live}).status, 1, 'needs --confirm');
  const done = run('restore-db.js', ['--from', newest, '--confirm'], {DB_PATH: live});
  assert.equal(done.status, 0, done.stderr + done.stdout); assert.ok(fs.readdirSync(path.dirname(live)).some((f) => f.includes('.before-restore-')), 'the old file is kept, not deleted');
  // A tampered backup is refused.
  const bad = path.join(bdir, 'tampered.db'); fs.copyFileSync(newest, bad); fs.copyFileSync(`${newest}.sha256`, `${bad}.sha256`); fs.appendFileSync(bad, 'x');
  const t = run('restore-db.js', ['--from', bad, '--confirm'], {DB_PATH: live}); assert.equal(t.status, 1); assert.match(t.stderr, /checksum mismatch/);
  const s2 = await boot(env);
  try {
    const db = new DatabaseSync(live, {readOnly: true});
    const n = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE phone IN (?, ?)').get(phone, '+231770777502') as {c: number}).c; db.close();
    assert.equal(n, 2, 'accounts are back after the restore');
    assert.equal((await fetch(`${s2.base}/api/v1/health`)).status, 200);
  } finally { await s2.stop(); }
});

test('12. the operator tools run as plain JavaScript on the target (bootstrap-admin.js): no tsx needed, no demo accounts created', async () => {
  const dir = tmp();
  const dbp = path.join(dir, 'data', 'agri.db');
  const r = spawnSync(process.execPath, [path.join(root, 'bootstrap-admin.js')], {cwd: os.tmpdir(), encoding: 'utf8', env: {PATH: process.env.PATH ?? '', DB_PATH: dbp, ADMIN_BOOTSTRAP_PHONE: '+231770777601', ADMIN_BOOTSTRAP_PASSWORD: rand(8) + 'Aa1!', ADMIN_BOOTSTRAP_NAME: 'Staging Admin'}});
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const db = new DatabaseSync(dbp, {readOnly: true});
  try {
    assert.equal((db.prepare("SELECT COUNT(*) AS c FROM users WHERE phone IN ('+231770000101','+231770000201')").get() as {c: number}).c, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c, 1);
  } finally { db.close(); }
});

test('13. the production bundle contains no development tooling and package.json is deployable', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {engines?: {node?: string}; scripts: Record<string, string>; dependencies: Record<string, string>};
  assert.equal(pkg.engines?.node, '>=22.13.0'); assert.equal(pkg.scripts.start, 'node server.js'); assert.match(pkg.scripts.build, /vite build.*build-server/);
  for (const d of ['esbuild', 'vite', 'tailwindcss']) assert.ok(pkg.dependencies[d], `${d} is needed at build time on the host`);
  assert.ok(!('tsx' in pkg.dependencies), 'tsx stays a development tool');
  const bundle = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(!/from ['"]tsx|require\(['"]tsx/.test(bundle));
  assert.match(bundle, /NODE_ENV \?\?= 'production'/);
  assert.equal(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(), '22');
  assert.ok(fs.existsSync(path.join(root, 'package-lock.json')), 'a lockfile makes installs reproducible');
});
