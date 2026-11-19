/**
 * M3 black-box suite: Node reference vs PHP foundation, over HTTP only.
 *
 * Needs the disposable engines from database/validation/scratch-engines.sh (MySQL 8 on :3307, MariaDB on :3308). It provisions throw-away
 * databases (schema M001 + reference seed + a least-privilege user), starts several `php -S` servers with different configurations, boots the Node
 * reference in-process on a temp SQLite file, runs the checks and cleans everything up. No existing database is touched.
 *
 *   npm run test:m3
 */
import assert from 'node:assert/strict';
import {execFileSync, spawn, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import test, {after, before, describe} from 'node:test';
import {startBackend, type Backend} from '../harness/backend.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PHP = process.env.PHP_BIN || 'php';
const rnd = (n = 24) => crypto.randomBytes(n).toString('hex');

// ---------- helpers ----------
interface Res {status: number; headers: Headers; text: string; json: any; cookies: string[]}
async function call(base: string, p: string, o: {method?: string; headers?: Record<string, string>; body?: string} = {}): Promise<Res> {
  const r = await fetch(base + p, {method: o.method ?? 'GET', headers: o.headers, body: o.body, redirect: 'manual'});
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return {status: r.status, headers: r.headers, text, json, cookies: r.headers.getSetCookie()};
}
interface Cookie {name: string; value: string; flags: string[]; maxAge: string | null}
function parseCookie(raw: string): Cookie {
  const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
  const eq = pair.indexOf('=');
  const flags = attrs.filter((a) => !/^(expires|max-age)=/i.test(a)).map((a) => a.toLowerCase()).sort();
  return {name: pair.slice(0, eq), value: pair.slice(eq + 1), flags, maxAge: attrs.find((a) => /^max-age=/i.test(a))?.split('=')[1] ?? null};
}
const cookieOf = (r: Res, name: string) => r.cookies.map(parseCookie).find((c) => c.name === name);
const getPort = () => new Promise<number>((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); });

const cleanBase: Record<string, string> = {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: os.tmpdir()};
interface Php {base: string; stop: () => Promise<void>; logDir: string; proc: ChildProcess; output: () => string}
async function startPhp(env: Record<string, string>): Promise<Php> {
  const port = await getPort();
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-m3-logs-'));
  const proc = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', path.join(ROOT, 'backend-php/public'), path.join(ROOT, 'backend-php/public/index.php')], {env: {...cleanBase, LOG_DIR: logDir, ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  proc.stdout?.on('data', (d) => (out += d)); proc.stderr?.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/ping'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  return {base, logDir, proc, output: () => out, stop: async () => { proc.kill(); fs.rmSync(logDir, {recursive: true, force: true}); }};
}

interface Db {engine: string; hostPort: string; db: string; user: string; pass: string}
function provision(hostPort: string, engine: string): Db {
  const out = execFileSync(PHP, [path.join(ROOT, 'backend-php/tests/m3/provision.php'), 'create', hostPort], {env: {...cleanBase, AGRI_DISPOSABLE_DB_OK: '1', DB_USER: 'root', DB_PASS: ''}, encoding: 'utf8'});
  return {engine, hostPort, ...JSON.parse(out)};
}
function unprovision(d: Db): void {
  execFileSync(PHP, [path.join(ROOT, 'backend-php/tests/m3/provision.php'), 'drop', d.hostPort, d.db, d.user], {env: {...cleanBase, AGRI_DISPOSABLE_DB_OK: '1', DB_USER: 'root', DB_PASS: ''}});
}
const dbEnv = (d: Db): Record<string, string> => ({DB_HOST: '127.0.0.1', DB_PORT: d.hostPort.split(':')[1], DB_NAME: d.db, DB_USER: d.user, DB_PASS: d.pass});
const devEnv = (extra: Record<string, string> = {}): Record<string, string> => ({APP_ENV: 'test', SESSION_SECRET: rnd(), OWNER_KEY_HMAC_SECRET: rnd(), HEALTH_CACHE_TTL_SECONDS: '0', ...extra});

// ---------- fixtures ----------
let node: Backend;
let mysql: Db; let maria: Db;
const servers: Php[] = [];
let phpDev: Php; let phpMaria: Php; let phpCross: Php; let phpSmall: Php; let phpProd: Php; let phpBadDb: Php;
let prodEnvBase: Record<string, string>;
let prodCache = '';

before(async () => {
  node = await startBackend();
  mysql = provision('127.0.0.1:3307', 'MySQL 8');
  maria = provision('127.0.0.1:3308', 'MariaDB 10.4');
  const add = async (env: Record<string, string>) => { const s = await startPhp(env); servers.push(s); return s; };
  phpDev = await add({...devEnv(), ...dbEnv(mysql), CORS_ALLOWED_ORIGINS: 'https://app.example.test'});
  phpMaria = await add({...devEnv(), ...dbEnv(maria)});
  phpCross = await add({...devEnv({COOKIE_MODE: 'cross_site', TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '127.0.0.0/8'}), ...dbEnv(mysql)});
  phpSmall = await add({...devEnv({MAX_BODY_BYTES: '2048'}), ...dbEnv(mysql)});
  phpBadDb = await add({...devEnv(), DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'nope', DB_USER: 'nobody', DB_PASS: 'wrong-password-sentinel-9f3a'});
  prodCache = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-m3-prodcache-'));
  prodEnvBase = {APP_ENV: 'production', CACHE_DIR: prodCache, SESSION_SECRET: rnd(), OWNER_KEY_HMAC_SECRET: rnd(), APP_URL: 'https://agri.example.test', CORS_ALLOWED_ORIGINS: 'https://staging.example.test', TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '127.0.0.1', IP_HASH_SECRET: rnd(), PASSWORD_HASH_SCHEME: 'bcrypt', PASSWORD_REHASH_ENABLED: '0', HSTS_MAX_AGE: '31536000', ...dbEnv(mysql)};
  phpProd = await add(prodEnvBase);
});

after(async () => {
  for (const s of servers) await s.stop();
  for (const d of [mysql, maria]) if (d) try { unprovision(d); } catch { /* best effort */ }
  if (node) await node.stop();
  if (prodCache) fs.rmSync(prodCache, {recursive: true, force: true});
});

// ---------- static checks ----------
describe('PHP syntax and hygiene', () => {
  test('php -l passes for every PHP file in backend-php', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.php')) files.push(p); } };
    walk(path.join(ROOT, 'backend-php'));
    assert.ok(files.length >= 20, `only ${files.length} PHP files found`);
    for (const f of files) execFileSync(PHP, ['-l', f], {stdio: 'pipe'});
  });
  test('no secret-looking literals and no .env are committed under backend-php', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'backend-php/.env')));
    const walk = (d: string, out: string[] = []) => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'storage') walk(p, out); } else out.push(p); } return out; };
    for (const f of walk(path.join(ROOT, 'backend-php')).filter((x) => /\.(php|sql|htaccess)$/.test(x) || x.endsWith('.htaccess'))) {
      assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, f);
    }
  });
  test('public web root exposes only the front controller, .htaccess and the static error body', () => {
    assert.deepEqual(fs.readdirSync(path.join(ROOT, 'backend-php/public')).sort(), ['.htaccess', 'error.json', 'index.php']);
  });
});

// ---------- parity ----------
describe('parity: Node reference vs PHP', () => {
  const targets = () => [['node', node.baseUrl], ['php', phpDev.base]] as const;

  test('GET /api/v1/health: same status, field names, order and types', async () => {
    const [n, p] = await Promise.all([call(node.baseUrl, '/api/v1/health'), call(phpDev.base, '/api/v1/health')]);
    assert.equal(n.status, 200); assert.equal(p.status, 200);
    assert.deepEqual(Object.keys(p.json), Object.keys(n.json), 'key order');
    for (const k of Object.keys(n.json)) assert.equal(typeof p.json[k], typeof n.json[k], `type of ${k}`);
    for (const k of ['status', 'service', 'apiVersion', 'database', 'publishedGuides', 'aiConfigured']) assert.equal(p.json[k], n.json[k], k);
    assert.equal(p.json.publishedGuides, 7);
    assert.ok(typeof p.json.latestMigration === 'string' && p.json.latestMigration.length > 0);
    for (const j of [n.json, p.json]) {
      assert.match(j.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      assert.ok(Math.abs(Date.now() - Date.parse(j.timestamp)) < 5000, 'timestamp is current');
    }
    assert.equal(p.headers.get('content-type'), n.headers.get('content-type'));
  });

  test('GET /api/v1/health works on MariaDB 10.4 as well as MySQL 8', async () => {
    const m = await call(phpMaria.base, '/api/v1/health');
    assert.equal(m.status, 200); assert.equal(m.json.publishedGuides, 7); assert.equal(m.json.database, 'connected');
  });

  test('GET /api/v1/csrf-token: format, no-store, exactly one agri_csrf cookie equal to the token', async () => {
    for (const [name, base] of targets()) {
      const r = await call(base, '/api/v1/csrf-token');
      assert.equal(r.status, 200, name);
      assert.deepEqual(Object.keys(r.json), ['csrfToken'], name);
      assert.match(r.json.csrfToken, /^[a-f0-9]{48}$/, name);
      assert.equal(r.headers.get('cache-control'), 'no-store', name);
      const csrf = r.cookies.filter((c) => c.startsWith('agri_csrf='));
      assert.equal(csrf.length, 1, `${name}: exactly one agri_csrf Set-Cookie`);
      assert.equal(parseCookie(csrf[0]).value, r.json.csrfToken, name);
    }
  });

  test('session cookies: names, attributes, lifetimes match (HTTP, SameSite=Lax, anon HttpOnly, csrf script-readable)', async () => {
    const [n, p] = await Promise.all([call(node.baseUrl, '/api/v1/csrf-token'), call(phpDev.base, '/api/v1/csrf-token')]);
    for (const name of ['agri_anon', 'agri_csrf']) {
      const a = cookieOf(n, name)!; const b = cookieOf(p, name)!;
      assert.ok(a && b, `${name} issued by both`);
      assert.deepEqual(b.flags, a.flags, `${name} attributes`);
      assert.equal(b.maxAge, a.maxAge, `${name} max-age`);
      assert.equal(b.value.length, a.value.length, `${name} value length`);
    }
    assert.ok(cookieOf(p, 'agri_anon')!.flags.includes('httponly')); assert.ok(!cookieOf(p, 'agri_csrf')!.flags.includes('httponly'));
    assert.equal(cookieOf(p, 'agri_csrf')!.maxAge, '604800');
  });

  test('existing valid cookies are reused: same token, no new Set-Cookie', async () => {
    for (const [name, base] of targets()) {
      const first = await call(base, '/api/v1/csrf-token');
      const cookie = first.cookies.map((c) => c.split(';')[0]).join('; ');
      const again = await call(base, '/api/v1/csrf-token', {headers: {Cookie: cookie}});
      assert.equal(again.json.csrfToken, first.json.csrfToken, name);
      assert.equal(again.cookies.length, 0, `${name}: no new cookies`);
    }
  });

  test('health also issues the session cookies on a first visit (Node behaviour)', async () => {
    for (const [name, base] of targets()) {
      const r = await call(base, '/api/v1/health');
      assert.ok(cookieOf(r, 'agri_csrf') && cookieOf(r, 'agri_anon'), name);
    }
  });

  test('HTTPS-signalled request: PHP(cross_site) cookie attributes equal Node (SameSite=None; Secure; Partitioned)', async () => {
    const h = {'X-Forwarded-Proto': 'https'};
    const [n, p] = await Promise.all([call(node.baseUrl, '/api/v1/csrf-token', {headers: h}), call(phpCross.base, '/api/v1/csrf-token', {headers: h})]);
    for (const name of ['agri_anon', 'agri_csrf']) {
      assert.deepEqual(cookieOf(p, name)!.flags, cookieOf(n, name)!.flags, name);
      for (const f of ['secure', 'samesite=none', 'partitioned']) assert.ok(cookieOf(p, name)!.flags.includes(f), `${name} ${f}`);
    }
  });

  test('DOCUMENTED DEVIATION: default PHP cookie mode is first-party (Lax + Secure on HTTPS, never SameSite=None/Partitioned)', async () => {
    const p = await call(phpProd.base, '/api/v1/csrf-token', {headers: {'X-Forwarded-Proto': 'https'}});
    for (const name of ['agri_anon', 'agri_csrf']) { const f = cookieOf(p, name)!.flags; assert.ok(f.includes('secure') && f.includes('samesite=lax')); assert.ok(!f.includes('samesite=none') && !f.includes('partitioned')); }
  });

  test('CSRF semantics: missing / mismatched token -> 403 with identical codes and messages', async () => {
    for (const [name, base] of targets()) {
      const missing = await call(base, '/api/v1/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"name":"x","message":"y"}'});
      assert.equal(missing.status, 403, name); assert.deepEqual(missing.json, {error: {code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token.'}}, name);
      const tok = rnd();
      const mismatch = await call(base, '/api/v1/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: `agri_csrf=${tok}`, 'X-CSRF-Token': rnd()}, body: '{}'});
      assert.equal(mismatch.status, 403, name); assert.deepEqual(mismatch.json, {error: {code: 'CSRF_INVALID', message: 'CSRF token mismatch.'}}, name);
      const short = await call(base, '/api/v1/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: 'agri_csrf=short', 'X-CSRF-Token': 'short'}, body: '{}'});
      assert.equal(short.status, 403, `${name}: tokens under 16 chars never valid`);
      for (const m of ['PATCH', 'DELETE']) assert.equal((await call(base, '/api/v1/feedback/1', {method: m})).status, 403, `${name} ${m}`);
    }
  });

  test('CSRF-valid write: Node executes it; PHP answers 501 (route not migrated yet — by design)', async () => {
    const jar = await call(phpDev.base, '/api/v1/csrf-token');
    const cookie = jar.cookies.map((c) => c.split(';')[0]).join('; ');
    const r = await call(phpDev.base, '/api/v1/feedback', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': jar.json.csrfToken}, body: '{"name":"x","message":"y"}'});
    assert.equal(r.status, 501); assert.equal(r.json.error.code, 'NOT_IMPLEMENTED');
  });

  test('CORS: same decisions for allowed / same-host / unknown / null origins; credentials only with a specific origin', async () => {
    const cases: [string, boolean][] = [['http://localhost:3000', true], ['https://evil.example', false], ['null', false], ['http://127.0.0.1:3000', true]];
    for (const [origin, allowed] of cases) {
      for (const [name, base] of targets()) {
        const r = await call(base, '/api/v1/health', {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'GET'}});
        assert.equal(r.status, 204, `${name} preflight ${origin}`);
        assert.equal(r.headers.get('access-control-allow-origin'), allowed ? origin : null, `${name} ${origin}`);
        assert.equal(r.headers.get('access-control-allow-credentials'), allowed ? 'true' : null, `${name} ${origin} credentials`);
        if (allowed) assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, PATCH, DELETE, OPTIONS', name);
      }
    }
    for (const [name, base] of targets()) {
      const same = await call(base, '/api/v1/health', {headers: {Origin: new URL(base).origin}});
      assert.equal(same.headers.get('access-control-allow-origin'), new URL(base).origin, `${name} same-host origin`);
    }
  });

  test('common security headers present on both (nosniff, Referrer-Policy)', async () => {
    for (const [name, base] of targets()) {
      const r = await call(base, '/api/v1/health');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', name);
      assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', name);
    }
  });

  test('JSON bodies: Node vs PHP both reject malformed JSON with 400 before issuing cookies', async () => {
    for (const [name, base] of targets()) {
      const r = await call(base, '/api/v1/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{nope'});
      assert.equal(r.status, 400, name);
      assert.equal(r.cookies.length, 0, `${name}: no cookies on a rejected body`);
    }
  });
});

// ---------- PHP-only behaviour ----------
describe('PHP routing, methods, content types, errors', () => {
  const sec = (r: Res, label: string) => {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', label);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', label);
    assert.ok(r.headers.get('x-request-id'), `${label} request id`);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/, `${label} json`);
  };
  const noLeak = (r: Res, label: string) => {
    for (const bad of ['Stack trace', '#0 ', '.php', 'Fatal error', 'Warning:', 'Notice:', 'PDOException', 'SQLSTATE', 'wrong-password-sentinel', 'Access denied', 'Connection refused', ROOT, os.homedir()]) assert.ok(!r.text.includes(bad), `${label} leaks "${bad}"`);
  };

  test('unknown routes -> 404 JSON everywhere (never HTML, never a file)', async () => {
    for (const p of ['/api/v1/nope', '/api/nope', '/api/v1/', '/', '/index.html', '/.env', '/backend-php/.env', '/api/v1/health/extra', '/api/v1/../../.env', '/api/%2e%2e/.env']) {
      const r = await call(phpDev.base, p);
      assert.equal(r.status, 404, p); assert.equal(r.json?.error?.code, 'NOT_FOUND', p); sec(r, p); noLeak(r, p);
    }
  });
  test('trailing slash tolerated (Express parity); HEAD returns headers without a body', async () => {
    assert.equal((await call(phpDev.base, '/api/v1/health/')).status, 200);
    const h = await call(phpDev.base, '/api/v1/health', {method: 'HEAD'});
    assert.equal(h.status, 200); assert.equal(h.text, '');
  });
  test('wrong method -> 405 JSON with Allow (after CSRF for writes)', async () => {
    const g = await call(phpDev.base, '/api/v1/health', {method: 'PROPFIND'});
    assert.equal(g.status, 405); sec(g, 'propfind');
    const jar = await call(phpDev.base, '/api/v1/csrf-token');
    const hdr = {Cookie: jar.cookies.map((c) => c.split(';')[0]).join('; '), 'X-CSRF-Token': jar.json.csrfToken, 'Content-Type': 'application/json'};
    for (const [m, p] of [['POST', '/api/v1/health'], ['DELETE', '/api/v1/csrf-token'], ['PATCH', '/api/v1/health']]) {
      const r = await call(phpDev.base, p, {method: m, headers: hdr, body: m === 'DELETE' ? undefined : '{}'});
      assert.equal(r.status, 405, `${m} ${p}`); assert.match(r.headers.get('allow') ?? '', /GET/); assert.equal(r.json.error.code, 'METHOD_NOT_ALLOWED'); sec(r, `${m} ${p}`);
    }
    const noCsrf = await call(phpDev.base, '/api/v1/health', {method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
    assert.equal(noCsrf.status, 403, 'CSRF is checked before routing, like Node');
  });
  test('non-migrated Node routes answer 501 NOT_IMPLEMENTED (preserved, not implemented)', async () => {
    for (const p of ['/api/v1/crops', '/api/v1/public/home', '/api/v1/marketplace/listings', '/api/v1/admin/audit-logs', '/api/v1/guides/1']) {
      const r = await call(phpDev.base, p); assert.equal(r.status, 501, p); assert.equal(r.json.error.code, 'NOT_IMPLEMENTED'); sec(r, p);
    }
  });
  test('malformed JSON -> 400 INVALID_JSON; wrong media type -> 415; scalar JSON -> 400; no cookies issued', async () => {
    const mk = async (ct: string, body: string) => call(phpDev.base, '/api/v1/auth/login', {method: 'POST', headers: {'Content-Type': ct}, body});
    const bad = await mk('application/json', '{"a":'); assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'INVALID_JSON'); assert.equal(bad.cookies.length, 0); noLeak(bad, 'bad json');
    const ct = await mk('text/plain', '{"a":1}'); assert.equal(ct.status, 415); assert.equal(ct.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    const form = await mk('application/x-www-form-urlencoded', 'a=1'); assert.equal(form.status, 415);
    const scalar = await mk('application/json', '"x"'); assert.equal(scalar.status, 400);
    const deep = await mk('application/json', '['.repeat(200) + ']'.repeat(200)); assert.equal(deep.status, 400);
  });
  test('valid JSON with a valid CSRF token reaches the router', async () => {
    const jar = await call(phpDev.base, '/api/v1/csrf-token');
    const r = await call(phpDev.base, '/api/v1/auth/login', {method: 'POST', headers: {Cookie: jar.cookies.map((c) => c.split(';')[0]).join('; '), 'X-CSRF-Token': jar.json.csrfToken, 'Content-Type': 'application/json; charset=utf-8'}, body: '{"phone":"x"}'});
    assert.equal(r.status, 501);
  });
  test('request size limit: over MAX_BODY_BYTES -> 413 without reading; at the limit is accepted', async () => {
    const over = await call(phpSmall.base, '/api/v1/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({p: 'a'.repeat(4000)})});
    assert.equal(over.status, 413); assert.equal(over.json.error.code, 'PAYLOAD_TOO_LARGE'); assert.equal(over.cookies.length, 0);
    const jar = await call(phpSmall.base, '/api/v1/csrf-token');
    const filler = 'a'.repeat(2048 - '{"p":""}'.length);
    const ok = await call(phpSmall.base, '/api/v1/auth/login', {method: 'POST', headers: {Cookie: jar.cookies.map((c) => c.split(';')[0]).join('; '), 'X-CSRF-Token': jar.json.csrfToken, 'Content-Type': 'application/json'}, body: `{"p":"${filler}"}`});
    assert.equal(ok.status, 501, 'a body of exactly MAX_BODY_BYTES is accepted');
  });
  test('security headers present on 200, 400, 403, 404, 405, 413, 415, 501', async () => {
    const rs = await Promise.all([call(phpDev.base, '/api/v1/health'), call(phpDev.base, '/api/v1/nope'), call(phpDev.base, '/api/v1/crops'),
      call(phpDev.base, '/api/v1/x', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{'}), call(phpDev.base, '/api/v1/x', {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: 'a'}),
      call(phpDev.base, '/api/v1/x', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}), call(phpSmall.base, '/api/v1/x', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: 'x'.repeat(5000)})]);
    rs.forEach((r, i) => { sec(r, `case ${i} (${r.status})`); assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin'); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.ok(r.headers.get('content-security-policy')?.includes("default-src 'none'")); });
    assert.equal(new Set(rs.map((r) => r.headers.get('x-request-id'))).size, rs.length, 'request ids are unique');
  });
  test('no X-Powered-By / server internals header leaks', async () => {
    const r = await call(phpDev.base, '/api/v1/health'); assert.equal(r.headers.get('x-powered-by'), null);
  });
});

describe('PHP CORS (no wildcard with credentials)', () => {
  test('allow-listed origin gets specific ACAO + credentials + Vary; others get nothing; never "*"', async () => {
    const ok = await call(phpDev.base, '/api/v1/health', {method: 'OPTIONS', headers: {Origin: 'https://app.example.test'}});
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.test'); assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    assert.match(ok.headers.get('access-control-allow-headers') ?? '', /X-CSRF-Token/); assert.match(ok.headers.get('vary') ?? '', /Origin/);
    for (const o of ['https://evil.example', 'https://app.example.test.evil.example', 'http://app.example.test', 'null', '*', 'https://APP.example.test.']) {
      for (const m of ['OPTIONS', 'GET']) {
        const r = await call(phpDev.base, '/api/v1/health', {method: m, headers: {Origin: o}});
        assert.equal(r.headers.get('access-control-allow-origin'), null, `${m} ${o}`); assert.equal(r.headers.get('access-control-allow-credentials'), null, `${m} ${o}`);
      }
    }
    const any = await call(phpDev.base, '/api/v1/health', {headers: {Origin: 'https://app.example.test'}});
    assert.notEqual(any.headers.get('access-control-allow-origin'), '*');
  });
  test('preflight needs no CSRF token and sets no cookies', async () => {
    const r = await call(phpDev.base, '/api/v1/auth/login', {method: 'OPTIONS', headers: {Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'POST'}});
    assert.equal(r.status, 204); assert.equal(r.cookies.length, 0);
  });
});

describe('PHP error handling and logging', () => {
  test('database failure: generic 500 JSON, no credentials/host/driver text in the response', async () => {
    const r = await call(phpBadDb.base, '/api/v1/health');
    assert.equal(r.status, 500); assert.deepEqual(r.json, {status: 'error', error: {code: 'HEALTH_CHECK_FAILED', message: 'Database error'}});
    for (const bad of ['wrong-password-sentinel', 'nobody', 'SQLSTATE', 'Connection refused', '127.0.0.1', 'PDO']) assert.ok(!r.text.includes(bad), bad);
  });
  test('server log keeps the detail but never the DB password; log file is private', async () => {
    await call(phpBadDb.base, '/api/v1/health');
    const logs = fs.readdirSync(phpBadDb.logDir).filter((f) => f.startsWith('app-'));
    assert.ok(logs.length > 0, 'log file written');
    const file = path.join(phpBadDb.logDir, logs[0]); const body = fs.readFileSync(file, 'utf8');
    assert.match(body, /health check failed/); assert.ok(!body.includes('wrong-password-sentinel-9f3a'), 'password must not be logged');
    assert.equal((fs.statSync(file).mode & 0o777).toString(8), '600');
    for (const line of body.trim().split('\n')) { const j = JSON.parse(line); assert.ok(j.ts && j.level && 'request_id' in j); }
  });
  test('PHP errors are never displayed (display_errors off) — a PHP warning cannot reach the client', async () => {
    const r = await call(phpDev.base, '/api/v1/health?a[]=1&a[b]=2'); assert.equal(r.status, 200); assert.ok(!/Warning|Notice|Deprecated/.test(r.text));
  });
});

describe('Production configuration fails closed', () => {
  const expectBlocked = async (label: string, env: Record<string, string>) => {
    const s = await startPhp(env);
    try {
      for (const [m, p] of [['GET', '/api/v1/health'], ['GET', '/api/v1/csrf-token'], ['OPTIONS', '/api/v1/health'], ['POST', '/api/v1/auth/login'], ['GET', '/api/v1/crops']]) {
        const r = await call(s.base, p, {method: m, headers: {Origin: 'https://agri.example.test', 'Content-Type': 'application/json'}, body: m === 'POST' ? '{}' : undefined});
        assert.equal(r.status, 500, `${label}: ${m} ${p}`); assert.equal(r.json?.error?.code, 'SERVER_MISCONFIGURED', label);
        assert.equal(r.cookies.length, 0, `${label}: no cookies when misconfigured`); assert.equal(r.headers.get('access-control-allow-origin'), null);
        for (const v of Object.values(env)) if (v.length >= 8) assert.ok(!r.text.includes(v), `${label}: response leaks a configuration value`);
        assert.ok(!/Stack|\.php|SESSION_SECRET|OWNER_KEY|DB_PASS/.test(r.text), `${label}: names/paths leak`);
      }
      const logged = fs.readdirSync(s.logDir).map((f) => fs.readFileSync(path.join(s.logDir, f), 'utf8')).join('');
      assert.match(logged, /configuration invalid/, `${label}: reason is logged server-side`);
      for (const v of Object.values(env)) if (v.length >= 12 && /^[0-9a-f]+$/.test(v)) assert.ok(!logged.includes(v), `${label}: log leaks a secret value`);
    } finally { await s.stop(); }
  };
  const without = (k: string) => { const e = {...prodEnvBase}; delete e[k]; return e; };

  test('valid production configuration serves traffic', async () => {
    const r = await call(phpProd.base, '/api/v1/health'); assert.equal(r.status, 200); assert.equal(r.json.status, 'ok');
  });
  test('missing SESSION_SECRET / OWNER_KEY_HMAC_SECRET / DB settings / APP_URL / APP_ENV are fatal', async () => {
    for (const k of ['SESSION_SECRET', 'OWNER_KEY_HMAC_SECRET', 'DB_PASS', 'DB_NAME', 'APP_URL', 'APP_ENV']) await expectBlocked(`missing ${k}`, without(k));
  });
  test('weak / placeholder secrets, root DB user, http APP_URL, wildcard CORS are fatal', async () => {
    await expectBlocked('short secret', {...prodEnvBase, SESSION_SECRET: 'tooshort'});
    await expectBlocked('placeholder secret', {...prodEnvBase, SESSION_SECRET: 'change-me-change-me-change-me-12345'});
    await expectBlocked('root db user', {...prodEnvBase, DB_USER: 'root'});
    await expectBlocked('http app url', {...prodEnvBase, APP_URL: 'http://agri.example.test'});
    await expectBlocked('wildcard cors', {...prodEnvBase, CORS_ALLOWED_ORIGINS: '*'});
    await expectBlocked('cross-site cookies', {...prodEnvBase, COOKIE_MODE: 'cross_site'});
  });
  test('test/dev switches cannot be enabled in production', async () => {
    for (const [k, v] of [['TEST_FIXTURE_TOKEN', rnd(12)], ['APP_DEBUG', '1'], ['ENABLE_TEST_FIXTURES', '1'], ['ENABLE_DEMO_SEED', '1'], ['DEMO_FARMER_PASSWORD', 'demo-password-123'], ['AGRI_DISPOSABLE_DB_OK', '1']]) await expectBlocked(`prod + ${k}`, {...prodEnvBase, [k]: v});
    await expectBlocked('APP_ENV typo is not lenient', {...prodEnvBase, APP_ENV: 'prod'});
    await expectBlocked('APP_ENV=test with missing secrets is still fatal', {APP_ENV: 'test'});
  });
  test('production cookies are Secure + Lax even when the proxy header is absent; HSTS only over https', async () => {
    const http = await call(phpProd.base, '/api/v1/csrf-token');
    for (const n of ['agri_anon', 'agri_csrf']) { const f = cookieOf(http, n)!.flags; assert.ok(f.includes('secure') && f.includes('samesite=lax')); }
    assert.equal(http.headers.get('strict-transport-security'), null, 'no HSTS over plain http');
    const https = await call(phpProd.base, '/api/v1/csrf-token', {headers: {'X-Forwarded-Proto': 'https'}});
    assert.equal(https.headers.get('strict-transport-security'), 'max-age=31536000');
  });
  test('production CORS: only configured https origins; localhost dev origins are not allowed', async () => {
    for (const [o, ok] of [['https://staging.example.test', true], ['https://agri.example.test', true], ['http://localhost:3000', false], ['http://127.0.0.1:3000', false]] as const) {
      const r = await call(phpProd.base, '/api/v1/health', {method: 'OPTIONS', headers: {Origin: o}});
      assert.equal(r.headers.get('access-control-allow-origin'), ok ? o : null, o);
    }
  });
  test('M3.1 settings are required/validated in production (IP hash, password policy, mail, sessions, proxies, health)', async () => {
    for (const k of ['IP_HASH_SECRET', 'PASSWORD_HASH_SCHEME', 'PASSWORD_REHASH_ENABLED']) await expectBlocked(`missing ${k}`, without(k));
    await expectBlocked('IP hash = session secret', {...prodEnvBase, IP_HASH_SECRET: prodEnvBase.SESSION_SECRET});
    await expectBlocked('hash scheme typo', {...prodEnvBase, PASSWORD_HASH_SCHEME: 'argon'});
    await expectBlocked('rehash with legacy', {...prodEnvBase, PASSWORD_HASH_SCHEME: 'legacy', PASSWORD_REHASH_ENABLED: '1'});
    await expectBlocked('session window typo', {...prodEnvBase, SESSION_IDLE_MINUTES: '12h'});
    await expectBlocked('admin window longer than user window', {...prodEnvBase, SESSION_IDLE_MINUTES: '20'});
    await expectBlocked('capture mail transport', {...prodEnvBase, MAIL_TRANSPORT: 'capture'});
    await expectBlocked('incomplete smtp', {...prodEnvBase, MAIL_TRANSPORT: 'smtp', MAIL_HOST: 'smtp.example.test'});
    await expectBlocked('trust proxy without list', (() => { const e = {...prodEnvBase}; delete e.TRUSTED_PROXY_CIDRS; return e; })());
    await expectBlocked('trust everyone', {...prodEnvBase, TRUSTED_PROXY_CIDRS: '0.0.0.0/0'});
    await expectBlocked('health cache off in production', {...prodEnvBase, HEALTH_CACHE_TTL_SECONDS: '0'});
    await expectBlocked('short deep token', {...prodEnvBase, HEALTH_DEEP_TOKEN: 'short'});
  });
  test('a complete smtp block validates but sends nothing (no sender exists)', async () => {
    const s = await startPhp({...prodEnvBase, MAIL_TRANSPORT: 'smtp', MAIL_HOST: 'smtp.example.test', MAIL_PORT: '587', MAIL_ENCRYPTION: 'starttls', MAIL_USERNAME: 'u', MAIL_PASSWORD: rnd(8), MAIL_FROM_ADDRESS: 'no-reply@example.test'});
    try { assert.equal((await call(s.base, '/api/v1/health')).status, 200); assert.match(fs.readdirSync(s.logDir).map((f) => fs.readFileSync(path.join(s.logDir, f), 'utf8')).join(''), /no mail sender exists/); } finally { await s.stop(); }
  });
  test('production never shows debug details, even for forced errors', async () => {
    const r = await call(phpProd.base, '/api/v1/health', {headers: {'X-Debug': '1'}}); assert.ok(!('debug' in (r.json ?? {})));
  });
});

describe('M3.1: forwarded headers, health cache and deep health over HTTP', () => {
  const cache = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agri-m3-cache-'));
  const dirs: string[] = [];
  const mk = async (extra: Record<string, string>) => { const c = cache(); dirs.push(c); const s = await startPhp({...devEnv({HEALTH_CACHE_TTL_SECONDS: '15'}), ...dbEnv(mysql), CACHE_DIR: c, ...extra}); servers.push(s); return s; };
  after(() => { for (const d of dirs) fs.rmSync(d, {recursive: true, force: true}); });
  const TOKEN = rnd(20);
  let noTrust: Php; let trusted: Php; let wrongList: Php; let plain: Php;
  before(async () => {
    noTrust = await mk({HEALTH_DEEP_TOKEN: TOKEN, HEALTH_DEEP_RATE_PER_MINUTE: '3'});
    trusted = await mk({HEALTH_DEEP_TOKEN: TOKEN, HEALTH_DEEP_RATE_PER_MINUTE: '3', TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '127.0.0.1'});
    wrongList = await mk({HEALTH_DEEP_TOKEN: TOKEN, HEALTH_DEEP_RATE_PER_MINUTE: '3', TRUST_PROXY: '1', TRUSTED_PROXY_CIDRS: '10.9.0.0/16'});
    plain = await mk({});
  });
  const deep = (s: Php, xff?: string, extra: Record<string, string> = {}) => call(s.base, '/api/v1/health?deep=1', {headers: {'X-Health-Token': TOKEN, ...(xff ? {'X-Forwarded-For': xff} : {}), ...extra}});

  test('X-Forwarded-Proto is ignored by default and from an untrusted peer; honoured from a trusted proxy', async () => {
    for (const s of [noTrust, wrongList]) { const r = await call(s.base, '/api/v1/csrf-token', {headers: {'X-Forwarded-Proto': 'https'}}); assert.ok(!cookieOf(r, 'agri_csrf')!.flags.includes('secure'), 'Secure must not follow a forged header'); }
    const t = await call(trusted.base, '/api/v1/csrf-token', {headers: {'X-Forwarded-Proto': 'https'}}); assert.ok(cookieOf(t, 'agri_csrf')!.flags.includes('secure'));
    const g = await call(trusted.base, '/api/v1/csrf-token', {headers: {'X-Forwarded-Proto': 'javascript'}}); assert.ok(!cookieOf(g, 'agri_csrf')!.flags.includes('secure'));
  });
  test('forged X-Forwarded-For cannot dodge the (IP-keyed) deep-health limiter when trust is off', async () => {
    const codes: number[] = []; for (let i = 0; i < 5; i++) codes.push((await deep(noTrust, `203.0.113.${i + 10}`)).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  });
  test('forged X-Forwarded-For is ignored when the peer is not a listed proxy', async () => {
    const codes: number[] = []; for (let i = 0; i < 5; i++) codes.push((await deep(wrongList, `203.0.113.${i + 10}`)).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  });
  test('behind a listed proxy the rightmost address is the client: a forged left side does not help, a different real client has its own bucket', async () => {
    const codes: number[] = []; for (let i = 0; i < 5; i++) codes.push((await deep(trusted, `${i + 1}.${i + 1}.${i + 1}.${i + 1}, 198.51.100.7`)).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    assert.equal((await deep(trusted, '9.9.9.9, 198.51.100.8')).status, 200);
  });
  test('deep health: 404 when no token configured; 403 for missing/wrong/URL token; no cookies-for-secrets; generic bodies', async () => {
    assert.equal((await call(plain.base, '/api/v1/health?deep=1', {headers: {'X-Health-Token': TOKEN}})).status, 404);
    const s = await mk({HEALTH_DEEP_TOKEN: TOKEN});
    for (const [u, h] of [['/api/v1/health?deep=1', {}], ['/api/v1/health?deep=1', {'X-Health-Token': 'x'.repeat(40)}], [`/api/v1/health?deep=1&token=${TOKEN}`, {}], [`/api/v1/health?deep=${TOKEN}`, {}]] as const) {
      const r = await call(s.base, u, {headers: h as Record<string, string>}); assert.equal(r.status, 403, u); assert.deepEqual(Object.keys(r.json), ['error']); assert.ok(!r.text.includes(TOKEN));
    }
    const ok = await call(s.base, '/api/v1/health?deep=1', {headers: {'X-Health-Token': TOKEN}});
    assert.equal(ok.status, 200); assert.equal(ok.json.deep, true); assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.ok(!ok.text.includes(TOKEN) && !/\/tmp|\/var\/|\/Users|\.php|PHP\//.test(ok.text), 'deep body discloses paths or versions');
  });
  test('public health: contract identical to Node, served from cache (HIT) after the first call, cache-buster ignored', async () => {
    const s = await mk({}); const n = await call(node.baseUrl, '/api/v1/health');
    const a = await call(s.base, '/api/v1/health?_=1'); const b = await call(s.base, '/api/v1/health?_=2'); const c = await call(s.base, '/api/v1/health');
    assert.deepEqual([a.headers.get('x-health-cache'), b.headers.get('x-health-cache'), c.headers.get('x-health-cache')], ['MISS', 'HIT', 'HIT']);
    for (const r of [a, b, c]) { assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.json), Object.keys(n.json)); for (const k of ['status', 'service', 'apiVersion', 'database', 'aiConfigured']) assert.equal(r.json[k], n.json[k], k); assert.equal(r.json.publishedGuides, 7); }
    assert.notEqual(b.json.timestamp, c.json.timestamp === b.json.timestamp ? '' : c.json.timestamp);
  });
  test('200 parallel pollers cause at most a handful of database checks and never an error', async () => {
    const s = await mk({}); const rs = await Promise.all(Array.from({length: 200}, () => call(s.base, '/api/v1/health')));
    assert.ok(rs.every((r) => r.status === 200 && r.json.database === 'connected'), 'some pollers failed');
    const misses = rs.filter((r) => r.headers.get('x-health-cache') === 'MISS').length;
    assert.ok(misses <= 8, `${misses} live checks for 200 parallel polls`);
  });
  test('a database outage is cached for only a few seconds and never leaks details', async () => {
    const c = cache(); dirs.push(c); const bad = await startPhp({...devEnv({HEALTH_CACHE_TTL_SECONDS: '15', HEALTH_FAIL_CACHE_TTL_SECONDS: '1'}), DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'nope', DB_USER: 'nobody', DB_PASS: 'wrong-password-sentinel-9f3a', CACHE_DIR: c}); servers.push(bad);
    const a = await call(bad.base, '/api/v1/health'); const b = await call(bad.base, '/api/v1/health');
    assert.equal(a.status, 500); assert.equal(a.headers.get('x-health-cache'), 'MISS'); assert.equal(b.headers.get('x-health-cache'), 'HIT');
    assert.deepEqual(a.json, {status: 'error', error: {code: 'HEALTH_CHECK_FAILED', message: 'Database error'}});
    assert.ok(!/wrong-password|nobody|nope|SQLSTATE|127\.0\.0\.1/.test(a.text + b.text));
    await new Promise((r) => setTimeout(r, 2100));
    assert.equal((await call(bad.base, '/api/v1/health')).headers.get('x-health-cache'), 'MISS', 'failure cached longer than the fail TTL');
  });
  test('cache files are private (0600 in a 0700 directory) and contain no secrets', async () => {
    const s = await mk({HEALTH_DEEP_TOKEN: TOKEN}); await call(s.base, '/api/v1/health'); await deep(s);
    const dir = dirs[dirs.length - 1]; const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.lock'));
    assert.ok(files.length >= 2, files.join());
    for (const f of files) { assert.equal(fs.statSync(path.join(dir, f)).mode & 0o077, 0, `${f} is group/world accessible`); const t = fs.readFileSync(path.join(dir, f), 'utf8'); assert.ok(!t.includes(TOKEN) && !t.includes('203.0.113') && !t.includes('127.0.0.1'), `${f} contains secrets or raw IPs`); }
  });
});
