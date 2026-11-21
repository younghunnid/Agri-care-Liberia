import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test, {before, after} from 'node:test';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {getDb, closeDb, runMigrations} from '../server/db.ts';
import {PARTICIPANT_CATEGORIES, REGISTRY_CONSENT_VERSION} from '../src/lib/participantRegistry.ts';
import {newEnrollment, enrollmentPress, enrollmentText, type EnrollmentState, PROPOSED_USSD_CODE} from '../src/lib/ussd/enrollment.ts';
import {safeScreenSpeech, createScreenSpeaker} from '../src/lib/ussd/screenVoice.ts';
import {registryAggregates} from '../server/participantRegistry.ts';
import type {Key} from '../src/lib/ussd/engine.ts';
import {SESSION_COOKIE_NAME, signSessionToken} from '../server/security.ts';
let backend: Backend;
before(async () => { assert.ok(!process.env.API_BASE_URL, 'new registry tests require their own disposable SQLite backend'); backend = await startBackend(); });
after(async () => { await backend?.stop(); });
const key = () => crypto.randomBytes(32).toString('hex');
const body = (over = {}) => ({category: 'Farmer', county: 'Bong', consent: true, consentVersion: REGISTRY_CONSENT_VERSION, ...over});
const enroll = (k: string, jar = new CookieJar(), over = {}) => req(jar, '/api/v1/participants/enroll', {method: 'POST', headers: {'X-Requester-Key': k}, body: body(over)});
const me = (k: string, jar = new CookieJar()) => req(jar, '/api/v1/participants/me', {headers: {'X-Requester-Key': k}});
let sequence = 400;
async function account(roles: ('farmer' | 'admin')[] = ['farmer']) {
  const phone = '+23177000' + String(++sequence).padStart(4, '0'); const password = 'Private-QA!48xyz';
  const user = await backend.fixtures.createUser({displayName: 'Synthetic QA Participant', phone, password, roles});
  const jar = new CookieJar(); jar.set('agri_device', await backend.fixtures.trustDevice(phone));
  assert.equal((await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password}})).status, 200);
  return {jar, id: user.id};
}
const type = (s: EnrollmentState, value: string) => { for (const d of value) s = enrollmentPress(s, d as Key).state; return enrollmentPress(s, 'send'); };

test('upgrading an existing SQLite schema preserves user records, roles and profiles', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const directory = new URL('../server/migrations/', import.meta.url);
    for (const file of fs.readdirSync(directory).filter((f) => f.endsWith('.sql') && !f.startsWith('2026')).sort()) {
      db.exec(fs.readFileSync(new URL(file, directory), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    }
    const id = db.prepare("INSERT INTO users (display_name, phone, password_hash) VALUES ('Synthetic Upgrade Farmer', '+231770008888', 'non-login-test-hash')").run().lastInsertRowid;
    const role = db.prepare("INSERT INTO roles (name, description) VALUES ('farmer', 'Synthetic QA role')").run().lastInsertRowid;
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, role);
    db.prepare("INSERT INTO farmer_profiles (user_id, county) VALUES (?, 'Bong')").run(id);
    const snapshot = () => ['users', 'user_roles', 'farmer_profiles'].map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    const original = snapshot();
    // Filename versions are independent of a concurrently reserved sequential auth slot.
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run('012_auth_numbering_fixture.sql');
    assert.deepEqual(runMigrations(db), ['20261121_ussd_440_participant_registry.sql', '20261122_participant_registry_classes.sql']);
    assert.deepEqual(snapshot(), original);
    assert.deepEqual(runMigrations(db), [], 'migration is applied once');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    // Entirely fabricated records exercise both source flags; no real people are used.
    for (const synthetic of [0, 1]) for (let n = 0; n < 3; n++) {
      const participant = db.prepare('INSERT INTO participant_registrations (requester_hash, category, county, is_synthetic) VALUES (?, ?, ?, ?)').run(key(), synthetic ? 'Buyer' : 'Farmer', synthetic ? 'Nimba' : 'Bong', synthetic).lastInsertRowid;
      db.prepare("INSERT INTO participant_consents (participant_id, consent_version, consent_text, identity_kind) VALUES (?, ?, 'Fabricated QA consent', 'device')").run(participant, REGISTRY_CONSENT_VERSION);
    }
    const aggregate = registryAggregates(db);
    assert.equal(aggregate.anonymous.total, 3, 'device-only non-synthetic participants are reported as ANONYMOUS browser participants'); assert.equal(aggregate.real.total, null, 'and are never counted as genuine account participants'); assert.equal(aggregate.synthetic.total, 3);
    assert.deepEqual(aggregate.anonymous.categories.rows, [{label: 'Farmer', participants: 3}]);
    assert.deepEqual(aggregate.synthetic.categories.rows, [{label: 'Buyer', participants: 3}]);
  } finally { db.close(); }
});

test('dial, welcome, all categories, county pages, explicit consent, decline and safe navigation', () => {
  let s = newEnrollment(); assert.match(enrollmentText(s), /proposed|Proposed/);
  assert.equal(type(s, '1').state.stage, 'dial');
  s = type(s, PROPOSED_USSD_CODE).state; assert.equal(s.stage, 'welcome');
  const voice = type(s, '1'); assert.equal(voice.action, 'voice-on'); assert.equal(voice.state.stage, 'checking');
  assert.equal(type(s, '2').action, 'voice-off');
  for (let n = 1; n <= 5; n++) {
    s = {...newEnrollment(), stage: 'category'}; s = type(s, String(n)).state;
    assert.equal(s.category, PARTICIPANT_CATEGORIES[n - 1]);
    const second = type(s, '99').state; assert.equal(second.page, 1); assert.match(enrollmentText(second), /2\/3/);
    s = type(s, '2').state; assert.equal(s.county, 'Bong');
    const texts: string[] = [];
    while (true) { assert.ok(enrollmentText({...s, notice: 'Not confirmed. Retry or use public advice.'}).length <= 182); texts.push(enrollmentText(s)); const r = type(s, '1'); if (r.action === 'save') break; s = r.state; }
    assert.match(texts.join(' '), /consent/); assert.match(texts.join(' '), /Agricare/);
    const decline = type(s, '2'); assert.equal(decline.action, 'open'); assert.equal(decline.state.publicOnly, true);
    assert.equal(enrollmentPress(s, 'cancel').state.stage, 'dial');
    assert.equal(enrollmentPress(s, 'back').state.stage, 'county');
  }
  for (const stage of ['dial', 'welcome', 'category', 'county', 'consent', 'saving', 'checking'] as const) {
    for (let page = 0; page < (stage === 'county' ? 3 : 1); page++) assert.ok(enrollmentText({...newEnrollment(), stage, page, notice: 'Not confirmed. Retry or use public advice.'}).length <= 182, `${stage} error screen exceeds USSD limit`);
  }
});

test('enrollment requires CSRF, a strong private key, explicit versioned consent and allowlisted fields', async () => {
  const before = getDb().prepare('SELECT count(*) n FROM participant_registrations').get() as {n: number};
  for (const over of [{consent: false}, {consent: 'true'}, {consentVersion: 'old'}, {category: 'admin'}, {county: 'unknown'}, {phone: '+231770001234'}, {userId: 1}, {phoneVerified: true}, {phone_verified_at: '2026-11-21'}, {isSynthetic: false}]) assert.equal((await enroll(key(), new CookieJar(), over)).status, 400);
  assert.equal((await enroll('a'.repeat(64))).status, 400);
  assert.equal((await req(new CookieJar(), '/api/v1/participants/enroll', {method: 'POST', skipCsrf: true, headers: {'X-Requester-Key': key()}, body: body()})).status, 403);
  assert.deepEqual(getDb().prepare('SELECT count(*) n FROM participant_registrations').get(), before);
});

test('concurrent/repeated enrollment creates one participant and immutable consent; no raw identity in responses or storage', async () => {
  const k = key(); const responses = await Promise.all([enroll(k), enroll(k), enroll(k)]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(responses[0].headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(responses[0].data, responses[1].data);
  assert.equal(responses[0].data.participant.identity, 'device');
  assert.ok(!JSON.stringify(responses[0].data).includes(k));
  assert.equal((getDb().prepare('SELECT count(*) n FROM participant_registrations').get() as {n: number}).n, 1);
  assert.equal((getDb().prepare('SELECT count(*) n FROM participant_consents').get() as {n: number}).n, 1);
  assert.ok(!(getDb().prepare('SELECT requester_hash h FROM participant_registrations').get() as {h: string}).h.includes(k));
  assert.equal((await me(key())).data.participant, null);
  assert.equal((await req(new CookieJar(), '/api/v1/participants/me?userId=1&phone=anything', {headers: {'X-Requester-Key': key()}})).data.participant, null);
});

test('explicit account linkage reuses registration and follows authenticated account, never submitted account IDs', async () => {
  const k = key(); await enroll(k); const a = await account();
  assert.equal((await me(k, a.jar)).data.participant, null, 'unlinked device is not silently treated as account enrollment');
  const linked = await enroll(k, a.jar); assert.equal(linked.data.participant.identity, 'account');
  assert.equal((await me(key(), a.jar)).data.participant.identity, 'account', 'same account on another private device');
  assert.equal((await me(k)).data.participant, null, 'signing out removes account identity access');
  const other = await account();
  assert.equal((await me(k, other.jar)).data.participant, null);
  assert.equal((await enroll(k, other.jar)).status, 403);
  assert.equal((await enroll(key(), a.jar)).status, 200);
  assert.equal((getDb().prepare('SELECT count(*) n FROM participant_registrations WHERE user_id = ?').get(a.id) as {n: number}).n, 1);
  assert.equal((getDb().prepare('SELECT count(*) n FROM participant_consents c JOIN participant_registrations p ON p.id=c.participant_id WHERE p.user_id=?').get(a.id) as {n: number}).n, 2);
});

test('self-selecting Agricultural Expert never changes account roles or expert approval', async () => {
  const a = await account(); assert.equal((await enroll(key(), a.jar, {category: 'Agricultural Expert'})).status, 200);
  const user = (await req(a.jar, '/api/v1/auth/me')).data.user;
  assert.deepEqual(user.roles, ['farmer']); assert.ok(!user.expertStatus);
  assert.equal((await req(a.jar, '/api/v1/expert/questions')).status, 403);
  assert.equal((await req(a.jar, '/api/v1/ministry/participants')).status, 403);
});

test('a password-authenticated unverified account links once without claiming phone verification', async () => {
  const phone = '+231770008765';
  const user = await backend.fixtures.createUser({displayName: 'Synthetic Unverified Participant', phone, password: 'Private-Unverified!76xyz', roles: ['farmer'], phoneVerified: false});
  const snapshot = () => getDb().prepare('SELECT phone, phone_verified_at, phone_claim_expires_at, password_hash, session_version FROM users WHERE id = ?').get(user.id) as {session_version: number; phone_verified_at: string | null};
  const original = snapshot(); assert.equal(original.phone_verified_at, null);
  // Test only the integration boundary: emulate a valid session issued by password auth.
  // This does not pretend the old SMS login flow is Claude's new implementation.
  const jar = new CookieJar(); jar.set(SESSION_COOKIE_NAME, signSessionToken(user.id, original.session_version));
  assert.equal((await req(jar, '/api/v1/auth/me')).data.user.id, user.id);
  const device = key(); await enroll(device);
  assert.equal((await enroll(device, jar, {category: 'Agricultural Expert'})).data.participant.identity, 'account');
  for (const identity of [device, key(), key()]) assert.equal((await enroll(identity, jar)).status, 200);
  assert.equal((getDb().prepare('SELECT count(*) n FROM participant_registrations WHERE user_id = ?').get(user.id) as {n: number}).n, 1);
  assert.deepEqual(snapshot(), original, 'registry leaves password, phone verification/claim and session fields unchanged');
  const account = (await req(jar, '/api/v1/auth/me')).data.user;
  assert.deepEqual(account.roles, ['farmer']);
  assert.equal((await req(jar, '/api/v1/expert/questions')).status, 403);
  assert.equal((await req(jar, '/api/v1/ministry/participants')).status, 403);
});

test('Ministry registry API is admin-only, suppresses small groups and persists separate rounded publication batches', async () => {
  assert.equal((await req(new CookieJar(), '/api/v1/ministry/participants')).status, 401);
  const admin = await account(['admin']);
  const first = await req(admin.jar, '/api/v1/ministry/participants?county=Bong&category=Farmer'); assert.equal(first.status, 200);
  assert.equal(first.data.minGroup, 3); assert.equal(first.data.real.total, null);
  const visible = JSON.stringify(first.data); assert.ok(!/requester_hash|user_id|participant_id|\+231|"phoneNumber"|"msisdn"/.test(visible), 'no identifiers or phone numbers in the aggregate (only suppressed phone-STATUS totals)');
  assert.ok(first.data.synthetic.total === null || first.data.synthetic.total % 3 === 0);
  await enroll(key(), new CookieJar(), {category: 'Cooperative', county: 'Nimba'});
  closeDb();
  const second = await req(admin.jar, '/api/v1/ministry/participants');
  assert.deepEqual(second.data, first.data, 'one new participant remains unpublished across database reopen');
  await enroll(key(), new CookieJar(), {category: 'Buyer', county: 'Lofa'});
  await enroll(key(), new CookieJar(), {category: 'Other', county: 'Lofa'});
  const third = registryAggregates(); assert.equal(third.synthetic.total, first.data.synthetic.total + 3);
  for (const d of ['categories', 'counties'] as const) for (const row of third.synthetic[d].rows) assert.ok(row.participants >= 3 && row.participants % 3 === 0);
});

test('default enrollment rate limit is enforced with Retry-After and does not leak account existence', async () => {
  const scale = process.env.PUBLIC_WRITE_LIMIT_SCALE; process.env.PUBLIC_WRITE_LIMIT_SCALE = '1';
  getDb().prepare("DELETE FROM rate_limit_attempts WHERE action_type = 'participant_enroll'").run();
  try { for (let i = 0; i < 12; i++) assert.equal((await enroll(key())).status, 200); const blocked = await enroll(key()); assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('Retry-After')) > 0); }
  finally { process.env.PUBLIC_WRITE_LIMIT_SCALE = scale; }
});

test('returning identity requires current recorded consent and shared demo sign-ins cannot enroll', async () => {
  const k = key(); await enroll(k);
  const row = getDb().prepare('SELECT MAX(id) id FROM participant_registrations').get() as {id: number};
  getDb().prepare("UPDATE participant_consents SET consent_version = 'obsolete' WHERE participant_id = ?").run(row.id);
  assert.equal((await me(k)).data.participant, null);
  assert.equal((await enroll(k)).status, 200);
  assert.equal((await me(k)).data.participant.consentVersion, REGISTRY_CONSENT_VERSION);
  const jar = new CookieJar(); jar.set('agri_device', await backend.fixtures.trustDevice('+231770000201'));
  assert.equal((await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231770000201', password: 'ExpertDemo!2026'}})).status, 200);
  assert.equal((await enroll(key(), jar)).status, 403);
  assert.equal((await me(key(), jar)).data.participant, null);
});

test('the synthetic enrollment guard refuses non-demo requests outside the test environment', async () => {
  const environment = process.env.APP_ENV;
  // This is still the disposable test server/database, with demoEnvironment=false.
  process.env.APP_ENV = 'development';
  try { const result = await enroll(key()); assert.equal(result.status, 403); assert.equal(result.data.error.code, 'DEMO_ONLY'); }
  finally { process.env.APP_ENV = environment; }
});

test('speech boundary omits credentials, private phone numbers and long device tokens; unavailable speech falls back to text', () => {
  const speech = safeScreenSpeech('FARM ADVICE\n1 Crops\nPIN 1234\nPassword abc\n+231 77 123 4567\n+44 7700 900123\n' + 'ab19df23847cde59'.repeat(4));
  assert.match(speech, /1 Crops/); assert.ok(!/1234|abc|4567|900123|ab19df/.test(speech));
  let notice = ''; createScreenSpeaker((s) => { notice = s; }).read('1 Crops'); assert.match(notice, /unavailable/);
});
