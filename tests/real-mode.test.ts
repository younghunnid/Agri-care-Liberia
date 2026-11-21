import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {CookieJar, req, setBaseUrl} from './harness/http.ts';
import {listingBody} from '../src/lib/listingPayload.ts';
import {hashPassword} from '../server/security.ts';
import {REAL_REGISTRY_CONSENT_VERSION, REGISTRY_CONSENT_VERSION} from '../src/lib/participantRegistry.ts';
import {USSD_REAL_MARKER, REAL_INQUIRY_MESSAGES} from '../src/lib/ussd/marketTypes.ts';

/**
 * REAL-USER MODE: NODE_ENV=production, no APP_ENV, SMS off, no demo seeding, disposable SQLite database, synthetic test people.
 * Covers *440# enrollment of genuine accounts, the Ministry registry classes, the marketplace used by the USSD handset, and the demo-to-real preparation tool.
 */
const PW = 'Garden-Harvest-7391!';
const phoneOf = (n: number) => `+2318864${String(n).padStart(5, '0')}`;
let proc: ChildProcess; let dir = ''; let dbPath = ''; let base = ''; let out = '';
const db = (ro = false) => new DatabaseSync(dbPath, ro ? {readOnly: true} : {});
const freePort = (): Promise<number> => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const clearLimits = () => { const d = db(); d.prepare('DELETE FROM rate_limit_attempts').run(); d.close(); };
const key = () => crypto.randomBytes(24).toString('hex');
const consent = {privacyConsent: true, privacyVersion: 'privacy-v1'};
const register = (jar: CookieJar, phone: string, name: string, county = 'Bong') => req(jar, '/api/v1/auth/register', {method: 'POST', body: {...consent, displayName: name, phone, password: PW, county, preferredLanguage: 'en', cropsOfInterest: []}});
const login = (jar: CookieJar, identifier: string, password = PW) => req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier, password}});
const enrollBody = (over: Record<string, unknown> = {}) => ({category: 'Farmer', county: 'Bong', consent: true, consentVersion: REAL_REGISTRY_CONSENT_VERSION, ...over});
const enroll = (jar: CookieJar, over: Record<string, unknown> = {}) => req(jar, '/api/v1/participants/enroll', {method: 'POST', headers: {'X-Requester-Key': key()}, body: enrollBody(over)});
const idOf = (phone: string) => (db(true).prepare('SELECT id FROM users WHERE phone = ?').get(phone) as {id: number}).id;
async function member(n: number, name: string, county = 'Bong'): Promise<{jar: CookieJar; phone: string; id: number}> {
  clearLimits(); const phone = phoneOf(n); const jar = new CookieJar();
  assert.equal((await register(jar, phone, name, county)).status, 201); return {jar, phone, id: idOf(phone)};
}
function grant(phone: string, role: string) { const d = db(); d.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ((SELECT id FROM users WHERE phone = ?), (SELECT id FROM roles WHERE name = ?))').run(phone, role); d.close(); }
const tool = (script: string, args: string[], extra: Record<string, string> = {}) => spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}`, ...args], {cwd: process.cwd(), env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DB_PATH: dbPath, ...extra}, encoding: 'utf8'});

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-real-')); dbPath = path.join(dir, 'p.db');
  for (let attempt = 1; attempt <= 4; attempt++) {
    const port = await freePort(); out = '';
    proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '1',
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

test('1. the configuration is genuinely real-user mode: SMS off, no demo seed, no staging diagnostics, registry mode real', async () => {
  const env = await (await fetch(`${base}/api/v1/environment`)).json();
  assert.deepEqual(env, {demoEnvironment: false, simulatedSms: false, phoneVerification: 'none', registryMode: 'real', syntheticAccountsOnly: false});
  assert.equal((db(true).prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c, 0, 'no demonstration accounts were seeded');
  assert.equal((await fetch(`${base}/api/v1/__staging/`)).status, 404, 'staging diagnostics are not mounted');
  assert.equal((await fetch(`${base}/api/v1/dev/simulated-sms`)).status, 404, 'no simulated SMS inbox');
  assert.match(out, /Phone number \+ password sign-in, NO SMS codes/);
});

test('2. *440# enrollment in real mode needs a signed-in account; a browser key or a phone number alone enrolls and identifies nobody', async () => {
  const anon = new CookieJar();
  const refused = await enroll(anon); assert.equal(refused.status, 401); assert.equal(refused.data.error.code, 'SIGN_IN_REQUIRED');
  const k = key(); const me = await req(anon, '/api/v1/participants/me', {headers: {'X-Requester-Key': k}}); assert.equal(me.status, 200); assert.equal(me.data.participant, null); assert.equal(me.data.signInRequired, true);
  for (const extra of [{phone: phoneOf(1)}, {identifier: phoneOf(1)}, {userId: 1}]) assert.equal((await enroll(anon, extra)).status, 401, 'still no account, still refused');
  assert.equal((db(true).prepare('SELECT COUNT(*) AS c FROM participant_registrations').get() as {c: number}).c, 0, 'nothing was created');
  const noPw = await req(new CookieJar(), '/api/v1/auth/login', {method: 'POST', body: {identifier: phoneOf(1)}}); assert.ok([400, 401].includes(noPw.status));
});

test('3. register or sign in, accept the notice, enroll: one genuine, non-synthetic participant per account; the phone stays unverified; no duplicates', async () => {
  const a = await member(1, 'Real Farmer One'); const before = db(true).prepare('SELECT password_hash, phone_verified_at, session_version, phone FROM users WHERE id = ?').get(a.id);
  assert.equal((await enroll(a.jar, {consentVersion: REGISTRY_CONSENT_VERSION})).status, 400, 'the demo consent version is not accepted in real mode');
  for (const extra of [{phone: a.phone}, {phoneVerified: true}, {phone_verified_at: 'now'}, {role: 'admin'}]) assert.equal((await enroll(a.jar, extra)).status, 400, JSON.stringify(extra));
  const ok = await enroll(a.jar, {category: 'Buyer'}); assert.equal(ok.status, 200);
  assert.equal(ok.data.participant.synthetic, false); assert.equal(ok.data.participant.identity, 'account'); assert.equal(ok.data.participant.phoneVerified, false); assert.equal(ok.data.participant.consentVersion, REAL_REGISTRY_CONSENT_VERSION);
  assert.equal((await enroll(a.jar, {category: 'Farmer'})).status, 200, 'a retry reuses the same participant');
  assert.equal((await enroll(a.jar)).data.participant.category, 'Buyer', 'the first registered category is kept');
  const rows = db(true).prepare('SELECT user_id, is_synthetic, category FROM participant_registrations').all() as {user_id: number; is_synthetic: number; category: string}[];
  assert.equal(rows.length, 1); assert.deepEqual({...rows[0]}, {user_id: a.id, is_synthetic: 0, category: 'Buyer'});
  assert.deepEqual(db(true).prepare('SELECT password_hash, phone_verified_at, session_version, phone FROM users WHERE id = ?').get(a.id), before, 'enrollment changed no authentication field');
  assert.equal(((db(true).prepare('SELECT phone_verified_at FROM users WHERE id = ?').get(a.id)) as {phone_verified_at: string | null}).phone_verified_at, null);
  // the returning user, on a NEW browser, signs in with phone + password and is recognised: no second participant
  const other = new CookieJar(); assert.equal((await login(other, a.phone)).status, 200);
  const again = await req(other, '/api/v1/participants/me', {headers: {'X-Requester-Key': key()}}); assert.equal(again.data.participant.category, 'Buyer');
  // a second registration with the same number is refused (no duplicate account)
  clearLimits(); assert.equal((await register(new CookieJar(), a.phone, 'Duplicate Person')).status, 409);
  assert.equal((db(true).prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c, 1);
  // an expert label is only a label
  const e = await member(2, 'Self Described Expert'); assert.equal((await enroll(e.jar, {category: 'Agricultural Expert'})).status, 200);
  const user = (await req(e.jar, '/api/v1/auth/me')).data.user; assert.deepEqual(user.roles, ['farmer']);
  assert.equal((await req(e.jar, '/api/v1/ministry/participants')).status, 403); assert.equal((await req(e.jar, '/api/v1/admin/overview')).status, 403);
});

test('4. synthetic and demonstration accounts can never be genuine participants', async () => {
  const s = await member(3, 'Demo Look'); const d = db(); d.prepare("UPDATE users SET phone = '+231770000321' WHERE id = ?").run(s.id); d.close();
  const j = new CookieJar(); assert.equal((await login(j, '+231770000321')).status, 200);
  const r = await enroll(j); assert.equal(r.status, 403); assert.equal(r.data.error.code, 'SYNTHETIC_ACCOUNT');
  const shared = await member(4, 'Shared Demo'); const d2 = db(); d2.prepare('UPDATE users SET is_shared_demo = 1 WHERE id = ?').run(shared.id); d2.close();
  assert.equal((await enroll(shared.jar)).status, 403);
  assert.equal((db(true).prepare('SELECT COUNT(*) AS c FROM participant_registrations WHERE user_id IN (?, ?)').get(s.id, shared.id) as {c: number}).c, 0);
});

test('5. the Ministry registry separates genuine accounts, phone status, anonymous browser participants and synthetic records, with suppression', async () => {
  const admin = await member(10, 'Registry Admin'); grant(admin.phone, 'admin'); const adminJar = new CookieJar(); assert.equal((await login(adminJar, admin.phone)).status, 200);
  assert.equal((await req(new CookieJar(), '/api/v1/ministry/participants')).status, 401);
  const farmer = await member(11, 'Not Admin'); assert.equal((await req(farmer.jar, '/api/v1/ministry/participants')).status, 403);
  // fewer than three genuine participants: suppressed (one exists from test 3, plus the self-described expert)
  const first = await req(adminJar, '/api/v1/ministry/participants'); assert.equal(first.status, 200);
  assert.equal(first.data.real.total, null, 'two genuine participants are suppressed'); assert.equal(first.data.real.phone.unverified, null);
  for (let n = 12; n < 15; n++) { const m = await member(n, `Genuine ${n}`, 'Nimba'); assert.equal((await enroll(m.jar, {category: 'Farmer', county: 'Nimba'})).status, 200); }
  const d = db(); // synthetic and anonymous records (disposable database): three of each, consented
  const add = (synthetic: number, n: number) => { const id = d.prepare('INSERT INTO participant_registrations (user_id, requester_hash, category, county, is_synthetic) VALUES (NULL, ?, ?, ?, ?)').run(key(), 'Other', 'Lofa', synthetic).lastInsertRowid; d.prepare("INSERT INTO participant_consents (participant_id, consent_version, consent_text, identity_kind) VALUES (?, 'ussd-demo-v1', 'QA', 'device')").run(id); void n; };
  for (let n = 0; n < 3; n++) { add(1, n); add(0, n); } d.close();
  const second = (await req(adminJar, '/api/v1/ministry/participants')).data;
  assert.equal(second.real.total, 3, 'five genuine participants are published rounded down to 3'); assert.equal(second.anonymous.total, 3); assert.equal(second.synthetic.total, 3);
  assert.equal(second.real.phone.unverified, 3, 'all genuine numbers are reported NOT verified'); assert.equal(second.real.phone.verified, null, 'none is verified');
  const labels = (t: {rows: {label: string}[]}) => t.rows.map((r) => r.label);
  for (const table of [second.real.counties, second.real.categories]) for (const row of table.rows) { assert.ok(row.participants >= 3 && row.participants % 3 === 0, 'every published group has at least 3 and is rounded down to a multiple of 3'); }
  assert.ok(labels(second.real.counties).every((l) => ['Bong', 'Nimba', 'Other (combined)'].includes(l)), 'only counties of genuine participants; synthetic and anonymous counties (Lofa) never leak into the genuine class');
  assert.ok(!JSON.stringify(second.real).includes('Lofa'));
  assert.ok(!/requester_hash|user_id|participant_id|\+231/.test(JSON.stringify(second)), 'no identifiers or phone numbers');
  // a sixth genuine registration cannot be isolated: the published value stays until another batch of three
  const m = await member(15, 'Genuine 15', 'Nimba'); assert.equal((await enroll(m.jar, {category: 'Farmer', county: 'Nimba'})).status, 200);
  assert.deepEqual((await req(adminJar, '/api/v1/ministry/participants')).data, second);
});

test('6. marketplace in real mode: a signed-in member sells and another asks, as the USSD handset does, with no SMS, no phone shown and nothing marked verified', async () => {
  const seller = await member(20, 'Real Seller', 'Bong'); const buyer = await member(21, 'Real Buyer', 'Montserrado');
  const body = listingBody({data: {sellerType: 'farmer', sellerName: 'Real Seller', farmName: '', category: 'Cereals & Grains', productName: 'Rice', quantity: '400', unit: 'kg', priceLrd: '150', county: 'Bong', town: 'Gbarnga', availabilityStatus: 'Available', description: USSD_REAL_MARKER, photoDataUrl: '', sellerPhone: '', phoneConsent: false, cropSlug: 'rice', quantityKg: 400, harvestDate: new Date().toISOString().slice(0, 10)}} as never, false, crypto.randomBytes(24).toString('hex'));
  const created = await req(seller.jar, '/api/v1/marketplace/listings', {method: 'POST', headers: {'Idempotency-Key': crypto.randomUUID()}, body}); assert.equal(created.status, 201, JSON.stringify(created.data));
  const listing = created.data.listing; assert.equal(listing.is_fictional_seller, 0, 'a genuine listing, not a fictional sample'); assert.equal(listing.phone_verified, 0); assert.ok(!listing.seller_phone, 'no phone number is published');
  const code = listing.harvest?.code ?? null;
  const pub = await req(new CookieJar(), '/api/v1/harvest/listings'); const mine = pub.data.listings.find((l: {id: number}) => l.id === listing.id); assert.ok(mine, 'it appears in the public harvest list'); assert.notEqual(mine.synthetic, true);
  for (let i = 0; i < REAL_INQUIRY_MESSAGES.length; i++) assert.ok(!/synthetic|demo/i.test(REAL_INQUIRY_MESSAGES[i]));
  const asked = await req(buyer.jar, `/api/v1/marketplace/listings/${listing.id}/inquiries`, {method: 'POST', headers: {'Idempotency-Key': crypto.randomUUID()}, body: {buyerName: 'Real Buyer', buyerCounty: 'Montserrado', message: REAL_INQUIRY_MESSAGES[0], requesterKey: key(), buyerToken: '', buyerPhoneConsent: false, isSimulated: false}});
  assert.equal(asked.status, 201, JSON.stringify(asked.data));
  const inbox = await req(seller.jar, '/api/v1/harvest/inquiries', {headers: {'X-Requester-Key': key()}}); const got = inbox.data.inquiries.find((q: {listingId: number}) => q.listingId === listing.id);
  assert.ok(got, 'the seller receives it through their account'); assert.equal(got.message, REAL_INQUIRY_MESSAGES[0]); assert.ok(!got.buyerPhone, 'no buyer phone shared');
  const bsee = await req(buyer.jar, '/api/v1/harvest/inquiries', {headers: {'X-Requester-Key': key()}}); assert.ok(bsee.data.inquiries.some((q: {listingId: number}) => q.listingId === listing.id), 'the buyer sees their own inquiry');
  assert.ok(!(await req(new CookieJar(), '/api/v1/harvest/inquiries', {headers: {'X-Requester-Key': key()}})).data.inquiries.length, 'a stranger sees none');
  void code;
  // a demonstration account cannot contact this genuine seller
  const synth = await member(22, 'Demo Buyer Look'); const d = db(); d.prepare("UPDATE users SET phone = '+231770000322' WHERE id = ?").run(synth.id); d.close();
  const sj = new CookieJar(); assert.equal((await login(sj, '+231770000322')).status, 200);
  const blocked = await req(sj, `/api/v1/marketplace/listings/${listing.id}/inquiries`, {method: 'POST', headers: {'Idempotency-Key': crypto.randomUUID()}, body: {buyerName: 'Demo', buyerCounty: 'Bong', message: REAL_INQUIRY_MESSAGES[1], requesterKey: key(), buyerToken: '', buyerPhoneConsent: false, isSimulated: true}});
  assert.equal(blocked.status, 403);
});

test('7. demo-to-real preparation tool: read-only check, suspends demonstration accounts, never touches administrators, deletes nothing', async () => {
  // build a legacy demonstration state inside the disposable database
  const d = db(); const pwHash = hashPassword('FarmerDemo!2026');
  const farmer = d.prepare("INSERT INTO users (display_name, phone, password_hash, status) VALUES ('Demo Farmer', '+231770000101', ?, 'active')").run(pwHash).lastInsertRowid;
  const expert = d.prepare("INSERT INTO users (display_name, phone, password_hash, status) VALUES ('Demo Expert', '+231770000201', ?, 'active')").run(hashPassword('Private-Expert-9921!')).lastInsertRowid;
  const demoAdmin = d.prepare("INSERT INTO users (display_name, phone, password_hash, status) VALUES ('Demo Admin', '+231770000999', ?, 'active')").run(hashPassword('Private-Admin-7741!')).lastInsertRowid;
  const role = (n: string) => (d.prepare('SELECT id FROM roles WHERE name = ?').get(n) as {id: number}).id;
  d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(farmer, role('farmer')); d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(expert, role('expert')); d.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(demoAdmin, role('admin')); d.close();
  const usersBefore = (db(true).prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c;
  const snapshot = fs.readFileSync(dbPath);
  const check = tool('real-mode-prep.ts', ['--check']); assert.equal(check.status, 3, check.stderr + check.stdout);
  assert.match(check.stdout, /BLOCKER: 1 account\(s\) still use a PUBLISHED demo password \(\+231770000101\)/); assert.match(check.stdout, /administrator account\(s\) on the reserved demo range/); assert.match(check.stdout, /RESULT: NOT READY/);
  assert.ok(!/FarmerDemo|Private-/.test(check.stdout + check.stderr), 'no password is ever printed');
  assert.ok(snapshot.equals(fs.readFileSync(dbPath)), '--check changed nothing (read-only)');
  assert.notEqual(tool('real-mode-prep.ts', ['--suspend-demo']).status, 0, 'refuses without --confirm');
  const run = tool('real-mode-prep.ts', ['--suspend-demo', '--confirm']); assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /suspended \+231770000101/); assert.match(run.stdout, /suspended \+231770000201/); assert.match(run.stdout, /KEPT\s+\+231770000999/);
  const st = Object.fromEntries((db(true).prepare("SELECT phone, status FROM users WHERE phone LIKE '+23177000%'").all() as {phone: string; status: string}[]).map((u) => [u.phone, u.status]));
  assert.equal(st['+231770000101'], 'suspended'); assert.equal(st['+231770000201'], 'suspended'); assert.equal(st['+231770000999'], 'active', 'the administrator is never suspended by the tool');
  assert.equal((db(true).prepare('SELECT COUNT(*) AS c FROM users').get() as {c: number}).c, usersBefore, 'no account was deleted');
  clearLimits(); const sj = new CookieJar(); const r = await login(sj, '+231770000201', 'Private-Expert-9921!'); assert.equal(r.status, 403); assert.equal(r.data.error.code, 'ACCOUNT_INACTIVE');
  // remaining blockers are reported honestly (published password and the demo-range administrator)
  assert.match(tool('real-mode-prep.ts', ['--check']).stdout, /NOT READY/);
  // a real administrator and a private password make the database ready
  const d2 = db(); d2.prepare("UPDATE users SET password_hash = ? WHERE phone = '+231770000101'").run(hashPassword('Private-Farmer-5521!')).changes; d2.close();
  const adm = await member(30, 'Real Administrator'); grant(adm.phone, 'admin');
  const d3 = db(); d3.prepare("UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE name = 'farmer') WHERE user_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'admin')").run(demoAdmin); d3.close();
  const ready = tool('real-mode-prep.ts', ['--check']); assert.match(ready.stdout, /active administrators on real numbers: [1-9]/);
});

test('8. option-8 style public data and offline behaviour are unchanged in real mode: public advice and guides need no account', async () => {
  const anon = new CookieJar();
  for (const p of ['/api/v1/crops', '/api/v1/harvest/listings', '/api/v1/environment', '/api/v1/health']) assert.equal((await req(anon, p)).status, 200, p);
  for (const p of ['/ussd-demo', '/privacy', '/guides']) assert.equal((await fetch(`${base}${p}`)).status, 200, p);
});
