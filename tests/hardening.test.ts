import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import type {Fixtures} from './harness/fixtures.ts';
import {MIN_GROUP, suppressSmallGroups, type AggGroup} from '../src/lib/harvestRules.ts';
import {loadRuntimeConfig, resetRuntimeConfigForTests, RuntimeConfigError} from '../server/runtime.ts';
import {computeAggregates, publishedAggregates, resetInsightsSnapshots, KG_STEP, PRICE_STEP} from '../server/insights.ts';
import {seedDemoMarketData} from '../server/demoMarket.ts';
import {inquiryView, INQUIRY_SELECT} from '../server/inquiryView.ts';
import {isStrongDeviceKey} from '../server/security.ts';

/**
 * Phase 1B hardening: legacy inquiry privacy, repeatable demonstration data, conversation authorization, and aggregate suppression (real vs synthetic,
 * filters, totals, repeated visits). In-process backend on a disposable database. Synthetic data only.
 */
const root = path.resolve(import.meta.dirname, '..');
let backend: Backend; let fx: Fixtures; const tmpDirs: string[] = [];
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const KEY = (s: string) => `${s}-${crypto.randomBytes(24).toString('base64url')}`;
before(async () => { backend = await startBackend(); fx = backend.fixtures; });
after(async () => { await backend?.stop(); for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

const cache = new Map<string, Promise<CookieJar>>();
const user = (phone: string, roles: ('farmer' | 'admin')[] = ['farmer']): Promise<CookieJar> => { if (!cache.has(phone)) cache.set(phone, (async () => { await fx.createUser({displayName: `User ${phone.slice(-4)}`, phone, password: 'SafePassword123', roles, county: 'Bong'}); const jar = new CookieJar(); jar.set('agri_device', await fx.trustDevice(phone)); assert.equal((await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password: 'SafePassword123'}})).status, 200); return jar; })()); return cache.get(phone)!; };
const admin = () => user('+231775559401', ['admin']);
const today = (o = 0) => new Date(Date.now() - o * 86_400_000).toISOString().slice(0, 10);
const harvest = (over: Record<string, unknown> = {}) => ({ownerKey: KEY('owner'), sellerName: 'Synthetic Farmer', cropSlug: 'cassava', quantityKg: 500, priceLrd: 60, county: 'Bong', town: 'Gbarnga', harvestDate: today(2), description: 'Synthetic harvest for the test.', ...over});
const create = (body: Record<string, unknown>, headers: Record<string, string> = {}, jar = new CookieJar()) => req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers});
const ask = (listingId: number, body: Record<string, unknown>, jar = new CookieJar(), headers: Record<string, string> = {}) => req(jar, `/api/v1/marketplace/listings/${listingId}/inquiries`, {method: 'POST', body: {buyerName: 'Synthetic Buyer', buyerCounty: 'Bong', message: 'Is this still available?', ...body}, headers});
const reply = (inqId: number, headers: Record<string, string>, jar = new CookieJar(), text = 'Yes, it is ready.') => req(jar, `/api/v1/marketplace/inquiries/${inqId}`, {method: 'PATCH', body: {farmerReply: text}, headers});
const dbw = <T,>(fn: (d: DatabaseSync) => T): T => { const d = new DatabaseSync(process.env.DB_PATH!); try { d.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;'); return fn(d); } finally { d.close(); } };
const one = <T,>(sql: string, ...a: (string | number)[]): T => dbw((d) => d.prepare(sql).get(...a) as T);
const clearMarket = () => dbw((d) => { d.exec('DELETE FROM marketplace_listings WHERE is_harvest_listing = 1; DELETE FROM triage_reports;'); });
const LEGACY_KEYS = ['buyer_county', 'buyer_name', 'buyer_phone', 'buyer_phone_shared', 'created_at', 'farmer_reply', 'id', 'listing_id', 'message', 'price_lrd', 'product_name', 'seller_name', 'status', 'unit', 'updated_at'];
const FORBIDDEN = ['buyer_token', 'buyer_user_id', 'buyer_key_hash', 'owner_key_hash', 'seller_user_id', 'is_demo_inquiry', 'is_simulated', 'requester_key', 'owner_token', 'tok-secret'];

// ============================================================================================================ 1. legacy inquiry privacy
test('1. the legacy inquiry routes (list, create, owner reply) return only an explicit allow-list, and the buyer phone only with consent', async () => {
  const sellerKey = KEY('seller'); const l = (await create(harvest({ownerKey: sellerKey}))).data.listing;
  const keyA = KEY('buyerA'); const keyB = KEY('buyerB');
  const a = await ask(l.id, {buyerPhone: '+231770001111', buyerToken: 'tok-secret-A', requesterKey: keyA, message: 'Question from A, no sharing'});
  const b = await ask(l.id, {buyerPhone: '+231770002222', buyerToken: 'tok-secret-B', requesterKey: keyB, buyerPhoneConsent: true, message: 'Question from B, sharing'});
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  // the create response (to the buyer): allow-listed, own phone visible, no tokens or hashes
  assert.deepEqual(Object.keys(a.data.inquiry).sort(), LEGACY_KEYS); assert.equal(a.data.inquiry.buyer_phone, '+231770001111'); assert.equal(a.data.inquiry.buyer_phone_shared, false);
  for (const f of FORBIDDEN) assert.ok(!JSON.stringify(a.data).includes(f) && !JSON.stringify(b.data).includes(f), `create response has no ${f}`);
  assert.ok(!JSON.stringify(a.data).includes(keyA) && !JSON.stringify(a.data).includes(sellerKey));
  // the seller's list: allow-listed, phone only where the buyer agreed
  const seller = await req(new CookieJar(), `/api/v1/marketplace/inquiries?listingId=${l.id}`, {headers: {'X-Listing-Key': sellerKey}});
  assert.equal(seller.data.inquiries.length, 2);
  for (const row of seller.data.inquiries) assert.deepEqual(Object.keys(row).sort(), LEGACY_KEYS);
  const rowA = seller.data.inquiries.find((r: any) => r.id === a.data.inquiry.id); const rowB = seller.data.inquiries.find((r: any) => r.id === b.data.inquiry.id);
  assert.equal(rowA.buyer_phone, '', 'no consent: no number'); assert.equal(rowA.buyer_phone_shared, false); assert.equal(rowB.buyer_phone, '+231770002222'); assert.equal(rowB.buyer_phone_shared, true);
  for (const f of [...FORBIDDEN, keyA, keyB, sellerKey, '+231770001111']) assert.ok(!JSON.stringify(seller.data).includes(f), `seller list has no ${f}`);
  // the owner's reply response: same allow-list, and the unconsented number is NOT handed back
  const rep = await reply(a.data.inquiry.id, {'X-Listing-Key': sellerKey}); assert.equal(rep.status, 200);
  assert.deepEqual(Object.keys(rep.data.inquiry).sort(), LEGACY_KEYS); assert.equal(rep.data.inquiry.buyer_phone, ''); assert.equal(rep.data.inquiry.farmer_reply, 'Yes, it is ready.');
  for (const f of [...FORBIDDEN, '+231770001111']) assert.ok(!JSON.stringify(rep.data).includes(f), `reply response has no ${f}`);
  // outsiders: nothing
  for (const [who, headers, q] of [['nobody', {}, `?listingId=${l.id}`], ['wrong key', {'X-Listing-Key': KEY('guess')}, `?listingId=${l.id}`], ['a buyer key', {'X-Listing-Key': keyA}, `?listingId=${l.id}`], ['seller key, no listing', {'X-Listing-Key': sellerKey}, '']] as [string, Record<string, string>, string][])
    assert.deepEqual((await req(new CookieJar(), `/api/v1/marketplace/inquiries${q}`, {headers})).data.inquiries, [], who);
  // signed-in accounts: the buyer side and the administrator get the same shape, and the administrator does not see an unconsented number either
  const farmer = await user('+231775559402'); const own = (await create(harvest({ownerKey: undefined, cropSlug: 'okra'}), {}, farmer)).data.listing;
  const buyer = await user('+231775559403'); const made = await ask(own.id, {buyerPhone: '+231770003333', requesterKey: undefined}, buyer); assert.equal(made.status, 201);
  const asSeller = (await req(farmer, '/api/v1/marketplace/inquiries')).data.inquiries; assert.equal(asSeller.length, 1); assert.equal(asSeller[0].buyer_phone, ''); assert.deepEqual(Object.keys(asSeller[0]).sort(), LEGACY_KEYS);
  const asBuyer = (await req(buyer, '/api/v1/marketplace/inquiries')).data.inquiries; assert.equal(asBuyer.length, 1); assert.equal(asBuyer[0].buyer_phone, '+231770003333', 'a buyer sees their own number');
  const asAdmin = (await req(await admin(), '/api/v1/marketplace/inquiries')).data.inquiries; assert.ok(asAdmin.length >= 3); for (const r of asAdmin) { assert.deepEqual(Object.keys(r).sort(), LEGACY_KEYS); if (!r.buyer_phone_shared) assert.equal(r.buyer_phone, ''); }
  assert.deepEqual((await req(await user('+231775559404'), '/api/v1/marketplace/inquiries')).data.inquiries, [], 'an unrelated account sees nothing');
  // the shape itself cannot grow by accident: it is built from named fields, not from the table
  const row = inquiryView({id: 1, listing_id: 2, buyer_user_id: 9, buyer_name: 'n', buyer_phone: 'p', buyer_phone_consent: 0, buyer_county: 'c', message: 'm', status: 's', farmer_reply: '', created_at: 'a', updated_at: 'b', product_name: 'x', price_lrd: 1, unit: 'kg', seller_name: 'sn', seller_user_id: 3, owner_key_hash: 'h', buyer_token: 'T', buyer_key_hash: 'K'} as any, 'seller');
  assert.deepEqual(Object.keys(row).sort(), LEGACY_KEYS); assert.ok(!INQUIRY_SELECT.includes('*') && !/buyer_token|buyer_key_hash/.test(INQUIRY_SELECT));
  const src = fs.readFileSync(path.join(root, 'server/routes/prototype.ts'), 'utf8'); assert.ok(!/SELECT i\.\*/.test(src) && !/SELECT \* FROM marketplace_inquiries/.test(src), 'no route selects raw inquiry rows');
});

test('2. the contract golden entry for this route is unchanged by the fix (it pins only the anonymous empty list)', () => {
  const g = JSON.parse(fs.readFileSync(path.join(root, 'tests/contract/golden/node.v1.json'), 'utf8')) as {steps: {name: string; request: {path: string}; body: unknown}[]};
  const entries = g.steps.filter((s) => /marketplace\/inquiries/.test(s.request.path)); assert.equal(entries.length, 1); assert.deepEqual(entries[0].body, {inquiries: []});
});

// ============================================================================================================ 2. repeatable demonstration data
test('3. seeding the synthetic data is safe to repeat: restarting never erases inquiries, replies or progress; reset is explicit and touches only synthetic rows', async () => {
  clearMarket();
  const real = (await create(harvest({ownerKey: KEY('real-seller'), cropSlug: 'rice', county: 'Grand Bassa'}))).data.listing;
  const adminJar = await admin();
  const first = await req(adminJar, '/api/v1/admin/demo/market-data', {method: 'POST', body: {}}); assert.equal(first.data.listings, 22); assert.equal(first.data.added.listings, 22); assert.equal(first.data.reset, false);
  const syn = one<{id: number; listing_code: string}>("SELECT id, listing_code FROM marketplace_listings WHERE demo_seed_key = 'HL-00-0'");
  // presentation progress on a synthetic listing: a buyer's question, the reply, a status change, a view count
  const q = await ask(syn.id, {requesterKey: KEY('presenter-buyer'), message: 'Presentation question that must survive a restart'}); assert.equal(q.status, 201);
  assert.equal((await reply(q.data.inquiry.id, {}, adminJar, 'Presenter reply that must survive')).status, 200);
  assert.equal((await req(adminJar, `/api/v1/marketplace/listings/${syn.id}`, {method: 'PATCH', body: {availabilityStatus: 'Limited Stock'}})).status, 200);
  dbw((d) => d.prepare('UPDATE marketplace_listings SET view_count = 17 WHERE id = ?').run(syn.id));
  const snapshot = () => dbw((d) => JSON.stringify(d.prepare("SELECT id, listing_code, availability_status, view_count, created_at, demo_seed_key FROM marketplace_listings WHERE owner_token = 'demo-market-seed' ORDER BY id").all()) + JSON.stringify(d.prepare('SELECT id, report_ref, created_at FROM triage_reports WHERE is_synthetic = 1 ORDER BY id').all()));
  const before1 = snapshot();
  // "restart" three times (the start-up path) and press the button again
  for (let i = 0; i < 3; i++) { const r = dbw((d) => seedDemoMarketData(d)); assert.deepEqual(r.added, {listings: 0, checks: 0}); assert.equal(r.listings, 22); }
  const again = await req(adminJar, '/api/v1/admin/demo/market-data', {method: 'POST', body: {}}); assert.equal(again.data.added.listings, 0); assert.match(again.data.note, /Nothing that already exists was changed/);
  assert.equal(snapshot(), before1, 'ids, codes, statuses, view counts and dates are exactly as they were');
  const kept = (await req(adminJar, '/api/v1/marketplace/inquiries')).data.inquiries.find((r: any) => r.listing_id === syn.id);
  assert.ok(kept && kept.message.includes('must survive') && kept.farmer_reply.includes('Presenter reply'), 'the presentation inquiry and its reply survived');
  assert.equal(one<{availability_status: string}>('SELECT availability_status FROM marketplace_listings WHERE id = ?', syn.id).availability_status, 'Limited Stock');
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE owner_token = 'demo-market-seed'").c, 22); assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM triage_reports WHERE is_synthetic = 1').c, first.data.checks);
  assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_listings WHERE id = ?', real.id).c, 1, 'real records are never touched');
  // a missing synthetic record is added back, and only that one
  dbw((d) => d.prepare("DELETE FROM marketplace_listings WHERE demo_seed_key = 'HL-03-1'").run());
  const heal = dbw((d) => seedDemoMarketData(d)); assert.equal(heal.added.listings, 1); assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE owner_token = 'demo-market-seed'").c, 22);
  // data seeded before keys existed adopts them in order, without duplicates
  dbw((d) => d.exec("UPDATE marketplace_listings SET demo_seed_key = NULL WHERE owner_token = 'demo-market-seed'; UPDATE triage_reports SET demo_seed_key = NULL WHERE is_synthetic = 1;"));
  const adopt = dbw((d) => seedDemoMarketData(d)); assert.deepEqual(adopt.added, {listings: 0, checks: 0}); assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE owner_token = 'demo-market-seed'").c, 22);
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE demo_seed_key IS NOT NULL").c, 22); assert.equal(one<{id: number}>("SELECT id FROM marketplace_listings WHERE demo_seed_key = 'HL-00-0'").id, syn.id);
  // the explicit reset: starts the synthetic rows over (their inquiries go), real rows stay; non-admins cannot
  assert.equal((await req(await user('+231775559405'), '/api/v1/admin/demo/market-data', {method: 'POST', body: {reset: true}})).status, 403);
  assert.equal((await req(new CookieJar(), '/api/v1/admin/demo/market-data', {method: 'POST', body: {reset: true}})).status, 401);
  const rst = await req(adminJar, '/api/v1/admin/demo/market-data', {method: 'POST', body: {reset: true}}); assert.equal(rst.data.reset, true); assert.equal(rst.data.added.listings, 22);
  assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_inquiries WHERE listing_id = ?', syn.id).c, 0); assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_listings WHERE id = ?', real.id).c, 1);
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE is_harvest_listing = 1 AND is_fictional_seller = 0").c, 1, 'only the real listing is not synthetic');
  clearMarket();
});

test('4. production protections are intact: demo data and unsafe publication settings are refused in production and the demo environment; the start-up path is additive', () => {
  const base = {NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), DB_PATH: '/srv/data/a.db'} as NodeJS.ProcessEnv;
  assert.throws(() => loadRuntimeConfig({...base, ENABLE_DEMO_MARKET_DATA: '1'}, '/srv/app'), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig({...base, INSIGHTS_MIN_CHANGE: '1'}, '/srv/app'), /INSIGHTS_MIN_CHANGE below 3/);
  assert.throws(() => loadRuntimeConfig({...base, INSIGHTS_MIN_CHANGE: '0'}, '/srv/app'), /whole number/); assert.throws(() => loadRuntimeConfig({...base, INSIGHTS_MIN_CHANGE: 'x'}, '/srv/app'), /whole number/);
  assert.equal(loadRuntimeConfig(base, '/srv/app').insightsMinChange, 3, 'default: batches of 3'); assert.equal(loadRuntimeConfig({...base, INSIGHTS_MIN_CHANGE: '5'}, '/srv/app').insightsMinChange, 5);
  assert.equal(loadRuntimeConfig({INSIGHTS_MIN_CHANGE: '1'} as NodeJS.ProcessEnv, '/srv/app').insightsMinChange, 1, 'allowed only outside production and the demo environment');
  const demoEnv = {...base, NODE_ENV: 'production', APP_ENV: 'demo', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only'} as NodeJS.ProcessEnv;
  assert.throws(() => loadRuntimeConfig({...demoEnv, INSIGHTS_MIN_CHANGE: '2'}, '/srv/app'), /INSIGHTS_MIN_CHANGE below 3/);
  const route = fs.readFileSync(path.join(root, 'server/routes/harvest.ts'), 'utf8'); const i = route.indexOf("harvestRouter.post('/admin/demo/market-data'");
  assert.ok(i > 0 && route.indexOf('getRuntimeConfig().production', i) > i && route.indexOf('getRuntimeConfig().production', i) < route.indexOf('seedDemoMarketData(getDb()', i), 'the production check comes before any seeding'); assert.match(route.slice(i, i + 900), /requireRole\('admin'\)/);
  const startup = fs.readFileSync(path.join(root, 'server.ts'), 'utf8'); assert.match(startup, /if \(rt\.enableDemoMarketData\) seedDemoMarketData\(\);/, 'start-up calls the additive seed with no reset');
  const seed = fs.readFileSync(path.join(root, 'server/demoMarket.ts'), 'utf8'); assert.ok(/if \(reset\) \{[\s\S]*?DELETE FROM marketplace_listings WHERE owner_token = \?[\s\S]*?DELETE FROM triage_reports WHERE is_synthetic = 1/.test(seed) && (seed.match(/DELETE FROM/g) ?? []).length === 2, 'the only deletes are the explicit reset, limited to synthetic rows');
});

// ============================================================================================================ 3. conversation authorization
test('5. harvest conversations: sellers and buyers see only their own; keys cannot be swapped between roles; guessable keys are refused; hidden listings close', async () => {
  clearMarket();
  const s1 = KEY('S1'); const s2 = KEY('S2'); const b1 = KEY('B1'); const b2 = KEY('B2');
  const L1 = (await create(harvest({ownerKey: s1, cropSlug: 'rice'}))).data.listing; const L2 = (await create(harvest({ownerKey: s2, cropSlug: 'okra'}))).data.listing;
  const q11 = (await ask(L1.id, {requesterKey: b1, message: 'B1 asks seller one'})).data.inquiry; const q21 = (await ask(L1.id, {requesterKey: b2, message: 'B2 asks seller one'})).data.inquiry; const q12 = (await ask(L2.id, {requesterKey: b1, message: 'B1 asks seller two'})).data.inquiry;
  const list = (headers: Record<string, string>, q = '', jar = new CookieJar()) => req(jar, `/api/v1/harvest/inquiries${q}`, {headers});
  // each buyer sees only their own conversations
  assert.deepEqual((await list({'X-Requester-Key': b1})).data.inquiries.map((i: any) => i.id).sort(), [q11.id, q12.id].sort()); assert.deepEqual((await list({'X-Requester-Key': b2})).data.inquiries.map((i: any) => i.id), [q21.id]);
  // each seller sees only conversations on their own listing
  assert.deepEqual((await list({'X-Listing-Key': s1}, `?listingId=${L1.id}`)).data.inquiries.map((i: any) => i.id).sort(), [q11.id, q21.id].sort());
  assert.deepEqual((await list({'X-Listing-Key': s1}, `?listingId=${L2.id}`)).data.inquiries, []); assert.deepEqual((await list({'X-Listing-Key': s2}, `?listingId=${L1.id}`)).data.inquiries, []);
  assert.deepEqual((await list({'X-Listing-Key': s2}, `?listingId=${L2.id}`)).data.inquiries.map((i: any) => i.id), [q12.id]);
  // keys cannot be used in the other role, or for the other listing
  assert.deepEqual((await list({'X-Requester-Key': s1})).data.inquiries, [], 'a seller key is not a buyer key'); assert.deepEqual((await list({'X-Listing-Key': b1}, `?listingId=${L1.id}`)).data.inquiries, [], 'a buyer key is not a seller key');
  assert.equal((await reply(q11.id, {'X-Listing-Key': b1})).status, 403); assert.equal((await reply(q11.id, {'X-Listing-Key': s2})).status, 403, 'another seller cannot answer'); assert.equal((await reply(q11.id, {'X-Requester-Key': b1})).status, 403, 'the buyer cannot answer for the seller');
  assert.equal((await reply(q11.id, {})).status, 403); assert.equal((await reply(q11.id, {}, await user('+231775559410'))).status, 403, 'a signed-in stranger'); assert.equal((await reply(987654, {'X-Listing-Key': s1})).status, 404);
  // one request cannot carry both roles to widen access: the seller key with ?listingId opens that listing only
  const both = await list({'X-Listing-Key': s1, 'X-Requester-Key': b2}, `?listingId=${L1.id}`); assert.deepEqual(both.data.inquiries.map((i: any) => i.id).sort(), [q11.id, q21.id].sort(), 'union of what each credential entitles, nothing more'); assert.ok(!both.data.inquiries.some((i: any) => i.id === q12.id));
  // an account cannot read a device conversation and a device cannot read an account's
  const acct = await user('+231775559411'); const qa = (await ask(L1.id, {requesterKey: undefined}, acct)).data.inquiry;
  assert.deepEqual((await list({'X-Requester-Key': b1})).data.inquiries.some((i: any) => i.id === qa.id), false); assert.deepEqual((await list({}, '', acct)).data.inquiries.map((i: any) => i.id), [qa.id]);
  // guessable device keys are refused where they would grant access
  const weak = ['a'.repeat(40), '123456789'.repeat(5), 'abcabcabcabcabcabcabcabcabcabcabc']; for (const w of weak) { assert.equal(isStrongDeviceKey(w), false, w); assert.equal((await ask(L1.id, {requesterKey: w})).status, 400, `inquiry key ${w}`); assert.equal((await create(harvest({ownerKey: w}))).status, 400, `listing key ${w}`); assert.deepEqual((await list({'X-Requester-Key': w})).data.inquiries, [], 'and a weak header opens nothing'); }
  assert.equal(isStrongDeviceKey(KEY('x')), true); assert.equal(isStrongDeviceKey('short'), false); assert.equal(isStrongDeviceKey(undefined), false);
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_inquiries WHERE buyer_key_hash = ''").c >= 1, true, 'the signed-in buyer stores no device key');
  // hidden listings: no new questions (the same 404 as a missing listing), no seller replies, an administrator can still answer, nothing leaks to outsiders
  await req(await admin(), `/api/v1/admin/marketplace/${L1.id}/moderate`, {method: 'POST', body: {moderationStatus: 'hidden'}});
  const missing = await ask(987654, {requesterKey: KEY('late')}); const hidden = await ask(L1.id, {requesterKey: KEY('late2')});
  assert.equal(hidden.status, 404); assert.deepEqual(hidden.data, missing.data, 'a hidden listing is indistinguishable from a missing one');
  const closed = await reply(q11.id, {'X-Listing-Key': s1}); assert.equal(closed.status, 403); assert.match(closed.data.error.message, /replies are closed/);
  assert.equal((await reply(q11.id, {}, await admin(), 'Moderator note')).status, 200);
  assert.equal((await req(new CookieJar(), `/api/v1/harvest/listings/${L1.listing_code ?? one<{listing_code: string}>('SELECT listing_code FROM marketplace_listings WHERE id = ?', L1.id).listing_code}`)).status, 404);
  assert.ok((await list({'X-Listing-Key': s1}, `?listingId=${L1.id}`)).data.inquiries.length >= 2, 'the seller still reads their own conversations'); assert.ok((await list({'X-Requester-Key': b1})).data.inquiries.some((i: any) => i.id === q11.id), 'and the buyer theirs');
  assert.equal((await reply(q12.id, {'X-Listing-Key': s2})).status, 200, 'a visible listing is unaffected');
  clearMarket();
});

// ============================================================================================================ 4. aggregates
const grp = (key: string, records: number, contributors: number): AggGroup<{n: number}> => ({key, records, contributors: new Set(Array.from({length: contributors}, (_x, i) => `${key}-c${i}`)), metrics: {n: records}});
const merge = (a: {n: number}, b: {n: number}) => ({n: a.n + b.n}); const empty = {n: 0};

test('6. suppression invariants hold for 2000 random datasets, and a single added record can only change the combined row or un-fold a group, never the figures of a group that stays published', () => {
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 2000; t++) {
    const n = 1 + Math.floor(rnd() * 7); const groups = Array.from({length: n}, (_x, i) => { const rec = 1 + Math.floor(rnd() * 6); return grp(`g${i}`, rec, 1 + Math.floor(rnd() * rec)); });
    const v = suppressSmallGroups(groups, merge, empty); const all = groups.reduce((s, g) => s + g.records, 0);
    const shown = v.published.reduce((s, g) => s + g.records, 0) + (v.other?.records ?? 0);
    if (v.insufficient) { assert.equal(v.published.length, 0); assert.equal(v.other, null); continue; }
    assert.equal(shown, all, 'every record appears exactly once'); assert.ok(v.published.every((g) => g.records >= MIN_GROUP && g.contributors.size >= MIN_GROUP), 'only groups with k records from k contributors are named');
    if (v.other) { assert.ok(v.other.records >= MIN_GROUP && v.other.contributors >= MIN_GROUP, 'the combined row is itself safe'); }
    const names = new Set(v.published.map((g) => g.key)); assert.equal(names.size, v.published.length);
    // a hidden group is never named, and its exact figures are not published on their own
    for (const g of groups) if (!names.has(g.key)) assert.ok(!v.published.some((p) => p.key === g.key));
    // adding ONE record (a new contributor) to a hidden group: a group that is published both before and after keeps exactly the same figures. (The combined row changes,
    // and a group that had to be folded into it can be un-folded: that single-record signal is why the public numbers are also published in batches, see test 9.)
    const hiddenG = groups.find((g) => !names.has(g.key) && g.records < MIN_GROUP);
    if (hiddenG) {
      const grown = groups.map((g) => (g === hiddenG ? {...g, records: g.records + 1, contributors: new Set([...g.contributors, 'new'])} : g)); const v2 = suppressSmallGroups(grown, merge, empty);
      if (!v2.insufficient) for (const p of v2.published) { const was = v.published.find((x) => x.key === p.key); if (was) { assert.equal(p.records, was.records); assert.equal(p.contributors.size, was.contributors.size); } }
      assert.ok(v2.published.every((g) => g.key !== hiddenG.key || (g.records >= MIN_GROUP && g.contributors.size >= MIN_GROUP)), 'the grown group is named only if it is now large enough');
    }
  }
});

test('7. real and synthetic records are two separate blocks, never added together, never mixed; synthetic data cannot create or reveal a real group', async () => {
  clearMarket();
  dbw((d) => seedDemoMarketData(d));
  for (const s of ['r1', 'r2']) await create(harvest({ownerKey: KEY(s), county: 'Bong', cropSlug: 'cassava'})); // two REAL Bong listings: below k
  let r = (await req(new CookieJar(), '/api/v1/insights/aggregates')).data;
  assert.equal(r.real.harvest.byCounty.insufficient, true, 'two real records plus 8 synthetic Bong ones: the real block is still too small'); assert.equal(r.real.harvest.byCounty.rows.length, 0);
  assert.equal(r.synthetic.harvest.byCounty.rows.find((x: any) => x.key === 'Bong').listings, 8, 'the synthetic Bong figure does not include the real records');
  await create(harvest({ownerKey: KEY('r3'), county: 'Bong', cropSlug: 'cassava'}));
  r = (await req(new CookieJar(), '/api/v1/insights/aggregates')).data;
  assert.equal(r.real.harvest.byCounty.rows.find((x: any) => x.key === 'Bong').listings, 3, 'three real farmers: now the real group is published, on its own'); assert.equal(r.synthetic.harvest.byCounty.rows.find((x: any) => x.key === 'Bong').listings, 8);
  assert.match(r.real.note, /entered through this app/); assert.match(r.real.note, /Not official statistics/); assert.match(r.synthetic.note, /INVENTED/); assert.match(r.synthetic.note, /do not come from any farmer/);
  assert.ok(!('harvest' in r) && !('cropChecks' in r), 'there is no combined block to difference against'); assert.equal(r.containsSyntheticRecords, true);
  // a real crop check never lands in the synthetic block, and the other way round
  for (const k of ['c1', 'c2', 'c3']) await req(new CookieJar(), '/api/v1/triage/reports', {method: 'POST', body: {requesterKey: KEY(k), caseId: 'cassava-patchy-young-leaves', answers: {extent: 'many', spread: 'fast', insects: 'yes'}, county: 'Bong'}});
  r = (await req(new CookieJar(), '/api/v1/insights/aggregates')).data;
  assert.equal(r.real.cropChecks.byCounty.rows.find((x: any) => x.key === 'Bong').checks, 3); assert.equal(r.synthetic.cropChecks.byCounty.rows.find((x: any) => x.key === 'Bong').checks, 9, 'six synthetic Bong checks plus three Bong rice checks, no real one');
  const sumTable = (t: any, f: string) => t.rows.reduce((s: number, x: any) => s + x[f], 0) + (t.other?.[f] ?? 0);
  assert.equal(sumTable(r.real.harvest.byCounty, 'listings'), 3); assert.equal(sumTable(r.synthetic.harvest.byCounty, 'listings'), 22);
  clearMarket();
});

test('8. filters, paging and other query parameters cannot narrow the aggregates to a small group; totals do not leak; rounded values; no merged-group count', async () => {
  clearMarket(); dbw((d) => seedDemoMarketData(d));
  for (const [i, c] of ['Lofa', 'Lofa', 'Margibi'].entries()) await create(harvest({ownerKey: KEY(`small${i}`), county: c, cropSlug: 'pepper', quantityKg: 33 + i, priceLrd: 401 + i}));
  const get = async (q = '') => (await req(new CookieJar(), `/api/v1/insights/aggregates${q}`)).data; const plain = await get();
  const strip = (d: any) => { const c = JSON.parse(JSON.stringify(d)); delete c.generatedAt; for (const k of ['real', 'synthetic']) delete c[k].asOf; return c; };
  for (const q of ['?county=Lofa', '?crop=pepper&county=Lofa', '?minKg=1&maxPrice=999', '?limit=1&offset=0', '?includeSynthetic=0', '?group=Lofa', '?key=Lofa&format=csv', '?county=Lofa&crop=pepper&status=Available&listingId=1'])
    assert.deepEqual(strip(await get(q)), strip(plain), `query ${q} changes nothing`);
  const text = JSON.stringify(plain);
  for (const hidden of ['Lofa', 'Margibi', 'pepper']) { /* Lofa and Margibi are hidden in the synthetic block and below k in the real one */ }
  const named = (b: any) => JSON.stringify([b.harvest.byCounty.rows, b.harvest.byCrop.rows, b.cropChecks.byCounty.rows, b.cropChecks.byCrop.rows]);
  assert.ok(!/Margibi/.test(named(plain.real)) && !/Margibi/.test(named(plain.synthetic)), 'a county below k is never named'); assert.ok(!/Lofa/.test(named(plain.real)), 'two real Lofa listings are hidden');
  assert.ok(!/groupsCombined|"groups"/.test(text), 'the number of merged groups is not published');
  assert.ok(!Object.keys(plain).some((k) => /total/i.test(k)) && !Object.keys(plain.real).some((k) => /total/i.test(k)) && !Object.keys(plain.synthetic).some((k) => /total/i.test(k)), 'no grand-total fields');
  const kgs: number[] = []; const prices: number[] = []; const walk = (t: any) => { for (const r of [...t.rows, ...(t.other ? [t.other] : [])]) { if ('totalKg' in r) { kgs.push(r.totalKg); prices.push(r.averagePriceLrdPerKg); } } };
  for (const b of [plain.real, plain.synthetic]) { walk(b.harvest.byCounty); walk(b.harvest.byCrop); }
  assert.ok(kgs.length > 0 && kgs.every((v) => v % KG_STEP === 0) && prices.every((v) => v % PRICE_STEP === 0), 'kilogram totals and prices are rounded');
  // the exact (unrounded) figures are not recoverable from a published row: 3 + 400 kg groups round to the same step
  assert.ok(plain.privacy.note.includes('rounded') && plain.privacy.note.includes('batches'));
  clearMarket();
});

test('9. repeated visits cannot isolate one record: numbers change only after at least 3 records were added or removed, per block', async () => {
  clearMarket(); const prev = process.env.INSIGHTS_MIN_CHANGE;
  try {
    process.env.INSIGHTS_MIN_CHANGE = '3'; resetRuntimeConfigForTests(); resetInsightsSnapshots();
    const get = async () => (await req(new CookieJar(), '/api/v1/insights/aggregates')).data;
    const bong = (r: any) => r.real.harvest.byCounty.rows.find((x: any) => x.key === 'Bong')?.listings ?? 0;
    const t0 = await get(); assert.equal(bong(t0), 0); assert.equal(t0.refresh.minChange, 3);
    await create(harvest({ownerKey: KEY('a1'), cropSlug: 'rice'})); assert.equal(bong(await get()), 0, '1 new record: nothing changes');
    await create(harvest({ownerKey: KEY('a2'), cropSlug: 'rice'})); const t2 = await get(); assert.equal(bong(t2), 0, '2 new records: still nothing'); assert.equal(t2.real.asOf, t0.real.asOf, 'the batch time is unchanged while nothing is published');
    await create(harvest({ownerKey: KEY('a3'), cropSlug: 'rice'})); const t3 = await get(); assert.equal(bong(t3), 3, '3 new records: published together, so no single one can be told apart'); assert.notEqual(t3.real.asOf, t0.real.asOf);
    await create(harvest({ownerKey: KEY('a4'), cropSlug: 'rice'})); assert.equal(bong(await get()), 3, 'the 4th is not shown yet');
    for (const k of ['a5', 'a6']) await create(harvest({ownerKey: KEY(k), cropSlug: 'rice'})); assert.equal(bong(await get()), 6, 'after 3 more it moves by the whole batch');
    // removal is batched the same way
    dbw((d) => d.prepare("DELETE FROM marketplace_listings WHERE id = (SELECT MAX(id) FROM marketplace_listings WHERE is_harvest_listing = 1)").run()); assert.equal(bong(await get()), 6, 'one removal is not visible');
    // the synthetic block has its own batches: seeding 22 synthetic records refreshes it but does NOT refresh the real block
    const realAsOf = (await get()).real.asOf; dbw((d) => seedDemoMarketData(d)); resetInsightsSnapshots('synthetic'); const t7 = await get();
    assert.equal(t7.real.asOf, realAsOf, 'synthetic changes do not move the real numbers'); assert.ok(t7.synthetic.harvest.byCounty.rows.length > 0);
    // with batching off (tests only) every change is published
    process.env.INSIGHTS_MIN_CHANGE = '1'; resetRuntimeConfigForTests(); assert.equal(bong(await get()), 5, 'min change 1 publishes immediately');
  } finally { if (prev === undefined) delete process.env.INSIGHTS_MIN_CHANGE; else process.env.INSIGHTS_MIN_CHANGE = prev; resetRuntimeConfigForTests(); resetInsightsSnapshots(); clearMarket(); }
  // the unbatched function is exact, the published one never is when batching is on (documented in the code, covered above)
  assert.equal(typeof computeAggregates, 'function'); assert.equal(typeof publishedAggregates, 'function');
});

test('10. the panel and the demo page show the two blocks separately, say so, and say how the numbers are refreshed', () => {
  const panel = fs.readFileSync(path.join(root, 'src/components/ministry/LiveInsightsPanel.tsx'), 'utf8'); const client = fs.readFileSync(path.join(root, 'src/lib/insightsClient.ts'), 'utf8');
  assert.match(panel, /Contributions entered through this app/); assert.match(panel, /Synthetic demonstration statistics \(invented\)/); assert.match(panel, /scope="real"/); assert.match(panel, /scope="synthetic"/); assert.match(panel, /refreshed only after at least/);
  assert.ok(!/groupsCombined/.test(panel + client), 'no merged-group count in the client'); assert.match(client, /isAggregates/, 'a copy saved by an older version is ignored, not mis-shown');
});

// ============================================================================================================ 5. migration 011
test('11. migration 011 is additive, reversible and re-appliable; the down file does not delete records', async () => {
  const {runMigrations} = await import('../server/db.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-hard-')); tmpDirs.push(dir); const d = new DatabaseSync(path.join(dir, 'm.db'));
  try {
    d.exec('PRAGMA foreign_keys = ON;'); assert.ok(runMigrations(d).includes('011_demo_seed_keys.sql'));
    const cols = (t: string) => (d.prepare(`PRAGMA table_info(${t})`).all() as {name: string}[]).map((c) => c.name);
    assert.ok(cols('marketplace_listings').includes('demo_seed_key') && cols('triage_reports').includes('demo_seed_key'));
    d.prepare("INSERT INTO marketplace_listings (owner_token, seller_name, category, product_name, quantity, unit, price_lrd, county, town, description, image_url, availability_status, demo_seed_key) VALUES ('t','S','Vegetables','Okra','5','kg',100,'Bong','Gbarnga','x','','Available','K1')").run();
    assert.throws(() => d.prepare("INSERT INTO marketplace_listings (owner_token, seller_name, category, product_name, quantity, unit, price_lrd, county, town, description, image_url, availability_status, demo_seed_key) VALUES ('t','S','Vegetables','Okra','5','kg',100,'Bong','Gbarnga','x','','Available','K1')").run(), /UNIQUE/, 'a key identifies one record');
    d.prepare("INSERT INTO marketplace_listings (owner_token, seller_name, category, product_name, quantity, unit, price_lrd, county, town, description, image_url, availability_status) VALUES ('t','S','Vegetables','Okra','5','kg',100,'Bong','Gbarnga','x','','Available')").run();
    d.prepare("INSERT INTO marketplace_listings (owner_token, seller_name, category, product_name, quantity, unit, price_lrd, county, town, description, image_url, availability_status) VALUES ('t','S','Vegetables','Okra','5','kg',100,'Bong','Gbarnga','x','','Available')").run(); // real rows have no key and may repeat
    const n = (d.prepare('SELECT COUNT(*) c FROM marketplace_listings').get() as {c: number}).c;
    d.exec(fs.readFileSync(path.join(root, 'server/migrations/down/011_demo_seed_keys.down.sql'), 'utf8'));
    assert.ok(!cols('marketplace_listings').includes('demo_seed_key') && !cols('triage_reports').includes('demo_seed_key')); assert.equal((d.prepare('SELECT COUNT(*) c FROM marketplace_listings').get() as {c: number}).c, n, 'no record was lost');
    assert.deepEqual(runMigrations(d), ['011_demo_seed_keys.sql']); assert.ok(cols('triage_reports').includes('demo_seed_key'));
  } finally { d.close(); }
});
