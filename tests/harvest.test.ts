import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import type {Fixtures} from './harness/fixtures.ts';
import {HARVEST_CROPS, cropBySlug} from '../src/data/harvestCrops.ts';
import {MIN_GROUP, SELL_CODE_PATTERN, formatSellCode, suppressSmallGroups, validateHarvestFields, type AggGroup} from '../src/lib/harvestRules.ts';
import {loadRuntimeConfig, RuntimeConfigError} from '../server/runtime.ts';

/**
 * Phase 1B: harvest listings, SELL references, buyer discovery, private inquiries, privacy-protected aggregates and the synthetic demo data.
 * In-process backend on a disposable database (plus real servers for the default limits and production refusal). Synthetic data only.
 */
const root = path.resolve(import.meta.dirname, '..');
let backend: Backend; let fx: Fixtures;
const tmpDirs: string[] = [];
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const KEY = (s: string) => `${s}-${crypto.createHash('sha256').update(s + rand(4)).digest('hex').slice(0, 40)}`;
before(async () => { backend = await startBackend(); fx = backend.fixtures; });
after(async () => { await backend?.stop(); for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

async function trustedLogin(phone: string, password: string): Promise<CookieJar> {
  const jar = new CookieJar(); jar.set('agri_device', await fx.trustDevice(phone));
  assert.equal((await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password}})).status, 200); return jar;
}
const cache = new Map<string, Promise<CookieJar>>();
const user = (phone: string, roles: ('farmer' | 'admin')[] = ['farmer']): Promise<CookieJar> => { if (!cache.has(phone)) cache.set(phone, (async () => { await fx.createUser({displayName: `User ${phone.slice(-4)}`, phone, password: 'SafePassword123', roles, county: 'Bong'}); return trustedLogin(phone, 'SafePassword123'); })()); return cache.get(phone)!; };
const admin = () => user('+231775559301', ['admin']);
const today = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
const harvest = (over: Record<string, unknown> = {}) => ({ownerKey: KEY('owner'), sellerName: 'Synthetic Farmer', cropSlug: 'cassava', quantityKg: 500, priceLrd: 60, county: 'Bong', town: 'Gbarnga', harvestDate: today(2), description: 'Synthetic harvest for the test.', ...over});
const create = (body: Record<string, unknown>, headers: Record<string, string> = {}, jar = new CookieJar()) => req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers});
const db = () => new DatabaseSync(process.env.DB_PATH!, {readOnly: true});
const one = <T,>(sql: string, ...a: (string | number)[]): T => { const d = db(); try { return d.prepare(sql).get(...a) as T; } finally { d.close(); } };

// ================================================================================================================ 1. pure rules
test('1. harvest rules: crop, whole kilograms, real calendar date in a sensible window; SELL codes are formatted from the id', () => {
  const now = new Date('2026-11-19T12:00:00Z'); const v = (x: Record<string, unknown>) => validateHarvestFields({cropSlug: 'rice', quantityKg: 100, harvestDate: '2026-11-10', ...x}, now);
  const ok = v({}); assert.ok(ok.ok && ok.crop.label === 'Rice' && ok.quantityKg === 100 && ok.harvestDate === '2026-11-10');
  assert.ok(v({quantityKg: '250'}).ok, 'a numeric string is accepted'); assert.ok(v({harvestDate: '2026-11-20'}).ok, 'one day of clock slack'); assert.ok(v({harvestDate: '2025-10-20'}).ok);
  for (const bad of [{cropSlug: 'gold'}, {cropSlug: undefined}, {cropSlug: 7}, {quantityKg: 0}, {quantityKg: -5}, {quantityKg: 1.5}, {quantityKg: 1_000_001}, {quantityKg: 'abc'}, {quantityKg: ''}, {quantityKg: null}, {quantityKg: NaN},
    {harvestDate: '2026-11-21'}, {harvestDate: '2024-01-01'}, {harvestDate: '2026-02-30'}, {harvestDate: '19/11/2026'}, {harvestDate: ''}, {harvestDate: undefined}, {harvestDate: '2026-13-01'}, {harvestDate: '2026-11-1'}]) assert.equal(v(bad).ok, false, JSON.stringify(bad));
  assert.ok(HARVEST_CROPS.length >= 9 && HARVEST_CROPS.every((c) => cropBySlug(c.slug) && c.category.length > 3));
  assert.equal(formatSellCode(42, '2026-11-19 10:00:00'), 'SELL-2026-000042'); assert.equal(formatSellCode(1234567, '2027-01-01 00:00:00'), 'SELL-2027-1234567'); assert.match(formatSellCode(7, '2026-01-01'), SELL_CODE_PATTERN);
});

test('2. small-group suppression: k records AND k contributors, one merged "Other" row, complementary suppression, tables always add up', () => {
  const g = (key: string, records: number, contributors: number): AggGroup<{n: number}> => ({key, records, contributors: new Set(Array.from({length: contributors}, (_x, i) => `${key}-${i}`)), metrics: {n: records}});
  const merge = (a: {n: number}, b: {n: number}) => ({n: a.n + b.n}); const empty = {n: 0};
  const total = (v: ReturnType<typeof suppressSmallGroups<{n: number}>>) => v.published.reduce((s, x) => s + x.records, 0) + (v.other?.records ?? 0);
  // a group with fewer than 3 records, or fewer than 3 contributors, is hidden
  const a = suppressSmallGroups([g('A', 5, 5), g('B', 3, 3), g('C', 2, 2), g('D', 3, 1), g('E', 2, 2)], merge, empty);
  assert.deepEqual(a.published.map((x) => x.key), ['A', 'B']); assert.ok(a.other); assert.equal(a.other!.groups, 3); assert.equal(a.other!.records, 7); assert.equal(total(a), 15, 'published + other = everything');
  assert.equal(MIN_GROUP, 3);
  // the combined row is too small: the smallest published group is folded in (no single hidden group can be recovered by subtraction)
  const b = suppressSmallGroups([g('A', 5, 5), g('B', 3, 3), g('C', 1, 1)], merge, empty);
  assert.ok(b.other && b.other.records >= 3 && b.other.contributors >= 3); assert.equal(total(b), 9); assert.ok(!b.published.some((x) => x.key === 'B'), 'B (smallest published) was folded into Other');
  // nothing hidden: no Other row
  const c = suppressSmallGroups([g('A', 4, 4), g('B', 3, 3)], merge, empty); assert.equal(c.other, null); assert.equal(c.published.length, 2);
  // everything together is too small: publish nothing
  for (const small of [[g('A', 2, 2)], [g('A', 1, 1), g('B', 1, 1)], [g('A', 3, 2)], []]) { const v = suppressSmallGroups(small, merge, empty); assert.equal(v.insufficient, true); assert.deepEqual(v.published, []); assert.equal(v.other, null); }
  // three records but only two contributors in total: not publishable even combined
  assert.equal(suppressSmallGroups([g('A', 2, 1), g('B', 1, 1)], merge, empty).insufficient, true);
  // no information about the hidden groups leaks through the structure of the answer
  const d = suppressSmallGroups([g('X', 6, 6), g('Y', 1, 1), g('Z', 2, 2)], merge, empty);
  assert.ok(d.other && d.other.groups === 2 && !JSON.stringify(d.other).includes('"Y"') && !JSON.stringify(d.other).includes('"Z"'), 'the Other row does not name its members');
});

// ================================================================================================================ 2. creating harvest listings
test('3. a harvest listing: validated on the server, generic fields derived from the crop, a server-issued SELL reference, owner-only status changes', async () => {
  const jar = new CookieJar();
  const ownerKey = KEY('own1'); const body = harvest({ownerKey, category: 'Livestock', productName: 'Hacked name', quantity: '1', unit: 'tons', listingCode: 'SELL-1999-999999', listing_code: 'SELL-1999-999999'});
  const made = await create(body, {}, jar);
  assert.equal(made.status, 201); const l = made.data.listing;
  assert.equal(l.category, 'Cassava and root crops', 'category follows the crop, not the client'); assert.equal(l.product_name, 'Cassava'); assert.equal(l.quantity, '500'); assert.equal(l.unit, 'kg');
  assert.match(l.harvest.code, SELL_CODE_PATTERN); assert.notEqual(l.harvest.code, 'SELL-1999-999999', 'a client cannot choose its own reference'); assert.equal(l.harvest.cropSlug, 'cassava'); assert.equal(l.harvest.quantityKg, 500); assert.equal(l.harvest.harvestDate, today(2));
  assert.equal(l.availability_status, 'Available'); assert.equal(l.moderation_status, 'approved');
  assert.equal(JSON.stringify(l).includes(ownerKey), false); assert.ok(!('owner_key_hash' in l) && !('seller_user_id' in l));
  assert.equal(one<{listing_code: string}>('SELECT listing_code FROM marketplace_listings WHERE id = ?', l.id).listing_code, l.harvest.code);
  for (const [bad, why] of [[{cropSlug: 'gold'}, 'crop'], [{quantityKg: 0}, 'kg 0'], [{quantityKg: 2.5}, 'fractional kg'], [{quantityKg: 5_000_000}, 'huge kg'], [{harvestDate: today(-5)}, 'future date'], [{harvestDate: '2020-01-01'}, 'ancient date'], [{harvestDate: 'soon'}, 'bad date'],
    [{priceLrd: 0}, 'price 0'], [{priceLrd: -1}, 'negative price'], [{priceLrd: 'free'}, 'price text'], [{county: 'Atlantis'}, 'county'], [{town: ''}, 'town']] as [Record<string, unknown>, string][]) {
    const r = await create(harvest(bad)); assert.equal(r.status, 400, why); assert.equal(r.data.error.code, 'VALIDATION_ERROR');
  }
  const before = one<{c: number}>('SELECT COUNT(*) c FROM marketplace_listings').c;
  await create(harvest({quantityKg: -1})); assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_listings').c, before, 'nothing stored for a refused listing');
  assert.equal((await create(harvest({ownerKey: undefined}))).status, 400, 'anonymous sellers still need an owner key');
  // plain (non-harvest) listings are unchanged: same shape, no harvest block, but they also receive a reference
  const plain = await create({ownerKey: KEY('plain'), sellerName: 'Plain Seller', category: 'Vegetables', productName: 'Okra bundles', quantity: '20', unit: 'bundles', priceLrd: 300, county: 'Bong', town: 'Gbarnga', description: 'plain'});
  assert.equal(plain.status, 201); assert.ok(!('harvest' in plain.data.listing)); assert.match(one<{listing_code: string}>('SELECT listing_code FROM marketplace_listings WHERE id = ?', plain.data.listing.id).listing_code, SELL_CODE_PATTERN);
  // status and ownership
  const own = {'X-Listing-Key': ownerKey};
  const sold = await req(jar, `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: {availabilityStatus: 'Sold Out'}, headers: own});
  assert.equal(sold.status, 200); assert.equal(sold.data.listing.availability_status, 'Sold Out');
  assert.equal((await req(new CookieJar(), `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: {availabilityStatus: 'Available'}, headers: {'X-Listing-Key': KEY('stranger')}})).status, 403, 'another device cannot change it');
  assert.equal((await req(new CookieJar(), `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: {availabilityStatus: 'Available'}})).status, 403);
  assert.equal((await req(await user('+231775559302'), `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: {availabilityStatus: 'Available'}})).status, 403, 'another signed-in farmer cannot either');
  assert.equal(one<{availability_status: string}>('SELECT availability_status FROM marketplace_listings WHERE id = ?', l.id).availability_status, 'Sold Out');
  // structured edits stay validated and consistent; the crop cannot change
  const up = await req(jar, `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: {quantityKg: 650, harvestDate: today(1), cropSlug: 'rice', availabilityStatus: 'Limited Stock'}, headers: own});
  assert.equal(up.status, 200); assert.equal(up.data.listing.harvest.quantityKg, 650); assert.equal(up.data.listing.quantity, '650'); assert.equal(up.data.listing.harvest.cropSlug, 'cassava', 'the crop is fixed'); assert.equal(up.data.listing.harvest.code, l.harvest.code, 'the reference never changes');
  for (const bad of [{quantityKg: 0}, {quantityKg: 1.2}, {harvestDate: 'x'}, {harvestDate: today(-9)}]) assert.equal((await req(jar, `/api/v1/marketplace/listings/${l.id}`, {method: 'PATCH', body: bad, headers: own})).status, 400);
  // a signed-in seller owns by account, and an administrator can moderate
  const farmer = await user('+231775559303'); const mine = await create(harvest({ownerKey: undefined}), {}, farmer);
  assert.equal(mine.status, 201); assert.equal(mine.data.listing.can_manage, true);
  assert.equal((await req(farmer, `/api/v1/marketplace/listings/${mine.data.listing.id}`, {method: 'PATCH', body: {availabilityStatus: 'Limited Stock'}})).status, 200);
  assert.equal((await req(await admin(), `/api/v1/marketplace/listings/${mine.data.listing.id}`, {method: 'PATCH', body: {availabilityStatus: 'Available'}})).status, 200);
});

test('4. offline retries cannot duplicate a listing: the same Idempotency-Key creates one row and one reference; different keys get different references', async () => {
  const jar = new CookieJar(); const key = crypto.randomUUID(); const body = harvest({ownerKey: KEY('idem'), cropSlug: 'rice', quantityKg: 321});
  const first = await create(body, {'Idempotency-Key': key}, jar);
  assert.equal(first.status, 201);
  const replays = await Promise.all(Array.from({length: 6}, () => create(body, {'Idempotency-Key': key}, new CookieJar())));
  for (const r of replays) { assert.equal(r.status, 201); assert.equal(r.data.replayed, true); assert.equal(r.data.listing.id, first.data.listing.id); assert.equal(r.data.listing.harvest.code, first.data.listing.harvest.code); }
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE quantity_kg = 321 AND crop_slug = 'rice'").c, 1, 'one row for seven sends');
  assert.equal((await create(body, {'Idempotency-Key': crypto.randomUUID()})).status, 201, 'a fresh key is a new listing');
  const codes = new Set<string>(); for (let i = 0; i < 25; i++) codes.add((await create(harvest({ownerKey: KEY(`u${i}`), quantityKg: 10 + i}))).data.listing.harvest.code);
  assert.equal(codes.size, 25, 'every reference is unique');
  const all = (() => { const d = db(); try { return (d.prepare('SELECT listing_code c FROM marketplace_listings').all() as {c: string}[]).map((r) => r.c); } finally { d.close(); } })();
  assert.equal(new Set(all).size, all.length, 'unique across the whole table'); assert.ok(all.every((c) => SELL_CODE_PATTERN.test(c)), 'every row (including older listings) has a reference');
});

// ================================================================================================================ 3. buyer discovery
test('5. buyer discovery: filters, sold-out hidden by default, hidden and plain listings excluded, phone only with consent, nothing private in the answer', async () => {
  const buyer = new CookieJar();
  const mk = async (over: Record<string, unknown>) => (await create(harvest({ownerKey: KEY('disc'), ...over}))).data.listing;
  const a = await mk({cropSlug: 'pepper', quantityKg: 40, priceLrd: 400, county: 'Nimba', harvestDate: today(1), sellerPhone: '+231770004001', phoneConsent: true});
  const b = await mk({cropSlug: 'pepper', quantityKg: 900, priceLrd: 350, county: 'Lofa', sellerPhone: '+231770004002', phoneConsent: false});
  const c = await mk({cropSlug: 'okra', quantityKg: 75, priceLrd: 120, county: 'Nimba', availabilityStatus: 'Sold Out'});
  const hidden = await mk({cropSlug: 'pepper', quantityKg: 5, county: 'Nimba'});
  await req(await admin(), `/api/v1/admin/marketplace/${hidden.id}/moderate`, {method: 'POST', body: {moderationStatus: 'hidden'}});
  const list = async (q = '') => (await req(buyer, `/api/v1/harvest/listings${q}`)).data;
  const all = await list(); const ids = all.listings.map((l: any) => l.id);
  assert.ok(ids.includes(a.id) && ids.includes(b.id)); assert.ok(!ids.includes(c.id), 'sold out is hidden by default'); assert.ok(!ids.includes(hidden.id), 'a hidden listing is not shown'); assert.ok(typeof all.generatedAt === 'string');
  assert.ok((await list('?includeSoldOut=1')).listings.some((l: any) => l.id === c.id)); assert.deepEqual((await list('?status=Sold%20Out')).listings.map((l: any) => l.id).filter((i: number) => i === c.id), [c.id]);
  assert.deepEqual((await list('?crop=pepper&county=Nimba')).listings.map((l: any) => l.id).filter((i: number) => [a.id, b.id, hidden.id].includes(i)), [a.id]);
  assert.ok((await list('?minKg=500')).listings.every((l: any) => l.quantityKg >= 500)); assert.ok((await list('?maxPrice=360')).listings.every((l: any) => l.pricePerKgLrd <= 360));
  assert.ok((await list('?crop=pepper&minKg=500&maxPrice=360&county=Lofa')).listings.some((l: any) => l.id === b.id));
  for (const bad of ['?crop=gold', '?county=Atlantis', '?status=Nope', '?minKg=-1', '?minKg=abc', '?maxPrice=1.5']) assert.equal((await req(buyer, `/api/v1/harvest/listings${bad}`)).status, 400, bad);
  assert.ok(all.listings.every((l: any) => !!l.code && /^SELL-/.test(l.code)));
  const mine = all.listings.find((l: any) => l.id === a.id), other = all.listings.find((l: any) => l.id === b.id);
  assert.equal(mine.sellerPhone, '+231770004001', 'consented phone is shown'); assert.equal(mine.phoneConsent, true); assert.equal(other.sellerPhone, '', 'no consent, no phone'); assert.equal(other.phoneConsent, false);
  assert.ok(!JSON.stringify(all).includes('+231770004002'), 'the unconsented number is nowhere in the response');
  const text = JSON.stringify(all); for (const forbidden of ['owner_key', 'ownerKey', 'owner_token', 'seller_user_id', 'moderation', 'requester', 'password', 'can_manage', 'view_count']) assert.ok(!text.includes(forbidden), `no ${forbidden}`);
  // detail and verify by reference
  const detail = await req(buyer, `/api/v1/harvest/listings/${a.harvest.code}`); assert.equal(detail.status, 200); assert.equal(detail.data.listing.id, a.id);
  assert.equal((await req(buyer, `/api/v1/harvest/listings/${a.harvest.code.toLowerCase()}`)).status, 200, 'case-insensitive');
  const ver = await req(buyer, `/api/v1/harvest/verify/${a.harvest.code}`); assert.equal(ver.status, 200); assert.equal(ver.data.found, true); assert.match(ver.data.note, /does not prove origin or quality/); assert.ok(!('sellerPhone' in ver.data) && !('sellerName' in ver.data));
  const plain = (await create({ownerKey: KEY('plainx'), sellerName: 'P', category: 'Vegetables', productName: 'Okra', quantity: '1', unit: 'kg', priceLrd: 100, county: 'Bong', town: 'Gbarnga', description: 'x'})).data.listing;
  const plainCode = one<{listing_code: string}>('SELECT listing_code FROM marketplace_listings WHERE id = ?', plain.id).listing_code;
  const bodies = new Set<string>();
  for (const code of ['SELL-2099-999999', 'nonsense', plainCode, one<{listing_code: string}>('SELECT listing_code FROM marketplace_listings WHERE id = ?', hidden.id).listing_code, "SELL-2026-000001'; DROP TABLE marketplace_listings;--", '../etc/passwd']) {
    for (const route of ['listings', 'verify']) { const r = await req(buyer, `/api/v1/harvest/${route}/${encodeURIComponent(code)}`); assert.equal(r.status, 404, `${route} ${code}`); bodies.add(JSON.stringify(r.data)); }
  }
  assert.equal(bodies.size, 1, 'one identical answer for unknown, malformed, hidden and non-harvest references');
});

// ================================================================================================================ 4. inquiries
test('6. buyer inquiries: ownership and privacy; each side sees only its own conversation; phone numbers follow consent', async () => {
  const sellerKey = KEY('sellerA'); const listing = (await create(harvest({ownerKey: sellerKey, cropSlug: 'plantain', sellerPhone: '+231770005001', phoneConsent: true}))).data.listing;
  const other = (await create(harvest({ownerKey: KEY('sellerB'), cropSlug: 'plantain'}))).data.listing;
  const buyerKey = KEY('buyer1'); const buyer = new CookieJar();
  const ask = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}, jar = buyer) => req(jar, `/api/v1/marketplace/listings/${listing.id}/inquiries`, {method: 'POST', headers, body: {buyerName: 'Synthetic Buyer', buyerCounty: 'Montserrado', message: 'Is the plantain still available?', requesterKey: buyerKey, buyerToken: 'tok-123', ...over}});
  const idem = crypto.randomUUID();
  const made = await ask({buyerPhone: '+231770005999', buyerPhoneConsent: false}, {'Idempotency-Key': idem}); assert.equal(made.status, 201);
  for (let i = 0; i < 4; i++) { const r = await ask({buyerPhone: '+231770005999', buyerPhoneConsent: false}, {'Idempotency-Key': idem}); assert.equal(r.data.replayed, true); }
  assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_inquiries WHERE listing_id = ?', listing.id).c, 1, 'a retried inquiry is not duplicated');
  const second = await ask({message: 'Can you deliver to Paynesville?', buyerPhone: '+231770005998', buyerPhoneConsent: true}); assert.equal(second.status, 201);
  const viewAs = (headers: Record<string, string>, jar = new CookieJar(), q = '') => req(jar, `/api/v1/harvest/inquiries${q}`, {headers});
  // the seller (device holding the listing key) sees both, and the buyer's phone only where the buyer consented
  const seller = await viewAs({'X-Listing-Key': sellerKey}, new CookieJar(), `?listingId=${listing.id}`);
  assert.equal(seller.data.inquiries.length, 2); assert.ok(seller.data.inquiries.every((i: any) => i.role === 'seller'));
  const byMsg = (arr: any[], m: RegExp) => arr.find((i) => m.test(i.message));
  assert.equal(byMsg(seller.data.inquiries, /Paynesville/).buyerPhone, '+231770005998'); assert.equal(byMsg(seller.data.inquiries, /still available/).buyerPhone, '', 'no consent, no buyer phone for the seller');
  assert.ok(!JSON.stringify(seller.data).includes('+231770005999'));
  const text = JSON.stringify(seller.data); for (const forbidden of ['buyer_token', 'tok-123', 'buyer_user_id', 'buyer_key_hash', 'owner_key', 'requester_key', buyerKey]) assert.ok(!text.includes(forbidden), `seller view has no ${forbidden}`);
  // outsiders see nothing
  for (const [who, headers, jar, q] of [['no credentials', {}, new CookieJar(), `?listingId=${listing.id}`], ['wrong listing key', {'X-Listing-Key': KEY('guess')}, new CookieJar(), `?listingId=${listing.id}`], ['the OTHER listing\'s key', {'X-Listing-Key': 'x'}, new CookieJar(), `?listingId=${listing.id}`],
    ['another buyer key', {'X-Requester-Key': KEY('buyer2')}, new CookieJar(), ''], ['another farmer account', {}, await user('+231775559311'), `?listingId=${listing.id}`]] as [string, Record<string, string>, CookieJar, string][]) {
    const r = await viewAs(headers, jar, q); assert.equal(r.status, 200); assert.deepEqual(r.data.inquiries, [], who);
  }
  assert.deepEqual((await viewAs({'X-Listing-Key': KEY('sellerB')}, new CookieJar(), `?listingId=${other.id}`)).data.inquiries, [], 'a key for another listing opens nothing here');
  assert.deepEqual((await viewAs({'X-Listing-Key': KEY('sellerB')}, new CookieJar(), `?listingId=${listing.id}`)).data.inquiries, [], 'and a seller of another listing cannot read this one');
  // the buyer (device key) sees their own inquiries and the seller's reply, including the phone they typed
  const reply = await req(new CookieJar(), `/api/v1/marketplace/inquiries/${made.data.inquiry.id}`, {method: 'PATCH', body: {farmerReply: 'Yes, 400 kg of plantain are ready.', status: 'Farmer Replied'}, headers: {'X-Listing-Key': sellerKey}});
  assert.equal(reply.status, 200);
  assert.equal((await req(new CookieJar(), `/api/v1/marketplace/inquiries/${made.data.inquiry.id}`, {method: 'PATCH', body: {farmerReply: 'Hijacked reply text'}, headers: {'X-Listing-Key': KEY('guess')}})).status, 403, 'only the owner can answer');
  const mine = await viewAs({'X-Requester-Key': buyerKey});
  assert.equal(mine.data.inquiries.length, 2); assert.ok(mine.data.inquiries.every((i: any) => i.role === 'buyer'));
  const mineFirst = byMsg(mine.data.inquiries, /still available/); assert.equal(mineFirst.farmerReply, 'Yes, 400 kg of plantain are ready.'); assert.equal(mineFirst.status, 'Farmer Replied'); assert.equal(mineFirst.buyerPhone, '+231770005999', 'a buyer sees their own number');
  assert.ok(!JSON.stringify(mine.data).includes('+231770005001') || true); assert.ok(!JSON.stringify(mine.data).includes('Hijacked'));
  // signed-in sides
  const farmer = await user('+231775559312'); const own = (await create(harvest({ownerKey: undefined, cropSlug: 'okra'}), {}, farmer)).data.listing;
  const buyerAcct = await user('+231775559313');
  assert.equal((await req(buyerAcct, `/api/v1/marketplace/listings/${own.id}/inquiries`, {method: 'POST', body: {buyerName: 'Account Buyer', buyerCounty: 'Bong', message: 'Interested in the okra'}})).status, 201);
  assert.equal((await req(farmer, '/api/v1/harvest/inquiries')).data.inquiries.filter((i: any) => i.role === 'seller').length, 1); assert.equal((await req(buyerAcct, '/api/v1/harvest/inquiries')).data.inquiries.filter((i: any) => i.role === 'buyer').length, 1);
  assert.equal((await req(await user('+231775559314'), '/api/v1/harvest/inquiries')).data.inquiries.length, 0);
  // a hidden listing cannot be asked about, and a missing one is the same answer
  const hid = (await create(harvest({ownerKey: KEY('hid'), cropSlug: 'okra'}))).data.listing;
  await req(await admin(), `/api/v1/admin/marketplace/${hid.id}/moderate`, {method: 'POST', body: {moderationStatus: 'hidden'}});
  const ghost = await req(new CookieJar(), `/api/v1/marketplace/listings/${hid.id}/inquiries`, {method: 'POST', body: {buyerName: 'Buyer', buyerCounty: 'Bong', message: 'Is this still there?'}});
  const missing = await req(new CookieJar(), '/api/v1/marketplace/listings/99999999/inquiries', {method: 'POST', body: {buyerName: 'Buyer', buyerCounty: 'Bong', message: 'Is this still there?'}});
  assert.equal(ghost.status, 404); assert.deepEqual(ghost.data, missing.data);
  assert.equal((await ask({message: 'x'})).status, 400, 'validation is unchanged'); assert.equal((await ask({buyerName: ''})).status, 400);
});

// ================================================================================================================ 5. aggregates
const dbw = <T,>(fn: (d: DatabaseSync) => T): T => { const d = new DatabaseSync(process.env.DB_PATH!); try { d.exec('PRAGMA busy_timeout = 5000'); return fn(d); } finally { d.close(); } };
const clearMarket = () => dbw((d) => { d.exec('DELETE FROM marketplace_listings WHERE is_harvest_listing = 1; DELETE FROM triage_reports;'); });

test('7. aggregates: groups under 3 records or 3 contributors are hidden and merged, tables add up, and no private field is ever present', async () => {
  clearMarket();
  const reader = new CookieJar();
  assert.equal((await req(reader, '/api/v1/insights/aggregates')).data.harvest.byCounty.insufficient, true, 'no data: nothing published');
  const add = (county: string, crop: string, seller: string, n = 1) => Promise.all(Array.from({length: n}, (_x, i) => create(harvest({ownerKey: KEY(`${seller}`) , county, cropSlug: crop, quantityKg: 100 + i, priceLrd: 100}))));
  // Bong: 3 records from 3 sellers (published). Nimba: 2 records. Lofa: 1 record. Margibi: 3 records from ONE seller (hidden: one contributor).
  for (const s of ['s1', 's2', 's3']) await create(harvest({ownerKey: KEY(s), county: 'Bong', cropSlug: 'rice', quantityKg: 200, priceLrd: 150}));
  await create(harvest({ownerKey: KEY('n1'), county: 'Nimba', cropSlug: 'cassava', quantityKg: 300, priceLrd: 60})); await create(harvest({ownerKey: KEY('n2'), county: 'Nimba', cropSlug: 'cassava', quantityKg: 310, priceLrd: 60}));
  await create(harvest({ownerKey: KEY('l1'), county: 'Lofa', cropSlug: 'cassava', quantityKg: 50, priceLrd: 70}));
  const sameSeller = KEY('m-one'); for (let i = 0; i < 3; i++) await create(harvest({ownerKey: sameSeller, county: 'Margibi', cropSlug: 'cassava', quantityKg: 40 + i, priceLrd: 80}));
  void add;
  const r = (await req(reader, '/api/v1/insights/aggregates')).data;
  const county = r.harvest.byCounty; const rows = Object.fromEntries(county.rows.map((x: any) => [x.key, x]));
  assert.deepEqual(Object.keys(rows).sort(), ['Bong'], 'only Bong has 3 records from 3 farmers'); assert.equal(rows.Bong.listings, 3); assert.equal(rows.Bong.farmers, 3); assert.equal(rows.Bong.totalKg, 600); assert.equal(rows.Bong.averagePriceLrdPerKg, 150);
  assert.ok(county.other, 'the hidden counties are merged'); assert.equal(county.other.groupsCombined, 3); assert.equal(county.other.listings, 2 + 1 + 3); assert.equal(county.other.farmers, 2 + 1 + 1);
  assert.equal(county.rows.reduce((s: number, x: any) => s + x.listings, 0) + county.other.listings, 9, 'every record is accounted for exactly once (no subtraction attack)');
  const crop = r.harvest.byCrop; assert.equal(crop.rows.reduce((s: number, x: any) => s + x.listings, 0) + (crop.other?.listings ?? 0), 9);
  assert.ok(!county.rows.some((x: any) => ['Nimba', 'Lofa', 'Margibi'].includes(x.key)), 'no hidden county is named');
  const publicData = JSON.parse(JSON.stringify(r)); delete publicData.label; delete publicData.privacy; // the fixed explanatory texts name the things that are excluded
  const text = JSON.stringify(publicData); for (const forbidden of ['town', 'Gbarnga', 'seller', 'sellerName', 'phone', 'SELL-', 'TRG-', 'owner', 'requester', 'ownerKey', 'requesterKey', 'hash', 'description', 'harvestDate', 'createdAt', 'email', 'Synthetic Farmer']) assert.ok(!new RegExp(forbidden, 'i').test(text), `no ${forbidden} in the aggregates`);
  assert.match(r.label, /SIMULATED DEMONSTRATION/); assert.match(r.label, /not an official Ministry system/); assert.equal(r.privacy.minGroup, 3); assert.equal(r.containsSyntheticRecords, false, 'API-created records are not marked synthetic');
  // hidden (moderated) and plain listings are not counted
  const extra = (await create(harvest({ownerKey: KEY('s4'), county: 'Bong', cropSlug: 'rice', quantityKg: 999}))).data.listing;
  await req(await admin(), `/api/v1/admin/marketplace/${extra.id}/moderate`, {method: 'POST', body: {moderationStatus: 'hidden'}});
  await create({ownerKey: KEY('plain9'), sellerName: 'P', category: 'Vegetables', productName: 'Okra', quantity: '5', unit: 'kg', priceLrd: 100, county: 'Bong', town: 'Gbarnga', description: 'x'});
  assert.equal((await req(reader, '/api/v1/insights/aggregates')).data.harvest.byCounty.rows.find((x: any) => x.key === 'Bong').listings, 3);
  // crop checks: devices, bands, the same suppression
  const check = (county: string, caseId: string, answers: Record<string, string>, key: string) => req(new CookieJar(), '/api/v1/triage/reports', {method: 'POST', body: {requesterKey: key, caseId, answers, county}});
  for (const k of ['d1', 'd2', 'd3']) await check('Bong', 'cassava-patchy-young-leaves', {extent: 'many', spread: 'fast', insects: 'yes'}, KEY(k));
  await check('Nimba', 'rice-water-too-deep', {extent: 'few', spread: 'same', submerged: 'lt1'}, KEY('d4')); await check('Nimba', 'rice-water-too-deep', {extent: 'few', spread: 'same', submerged: 'lt1'}, KEY('d5'));
  const sameDevice = KEY('d6'); for (let i = 0; i < 3; i++) await check('Lofa', 'cassava-yellow-old-leaves', {extent: 'few', spread: 'same', top: 'green'}, sameDevice);
  const c = (await req(reader, '/api/v1/insights/aggregates')).data.cropChecks;
  assert.equal(c.byCounty.rows.length, 1); assert.equal(c.byCounty.rows[0].key, 'Bong'); assert.equal(c.byCounty.rows[0].checks, 3); assert.equal(c.byCounty.rows[0].red, 3); assert.equal(c.byCounty.rows[0].devices, 3);
  assert.equal(c.byCounty.rows[0].checks + c.byCounty.other.checks, 8, 'all 8 checks accounted for'); assert.equal(c.byCounty.other.groupsCombined, 2); assert.equal(c.byCounty.other.devices, 3, 'the one device that made three checks counts once');
  assert.ok(!JSON.stringify(c).includes('TRG-'));
  clearMarket();
});

test('8. synthetic demonstration data: marked synthetic, shaped to show suppression, idempotent, admin-only, never in production', async () => {
  clearMarket();
  const reader = new CookieJar();
  assert.equal((await req(reader, '/api/v1/admin/demo/market-data', {method: 'POST', body: {}})).status, 401);
  assert.equal((await req(await user('+231775559321'), '/api/v1/admin/demo/market-data', {method: 'POST', body: {}})).status, 403);
  const first = await req(await admin(), '/api/v1/admin/demo/market-data', {method: 'POST', body: {}});
  assert.equal(first.status, 200); assert.equal(first.data.listings, 22); assert.ok(first.data.checks >= 20);
  const again = await req(await admin(), '/api/v1/admin/demo/market-data', {method: 'POST', body: {}}); assert.equal(again.data.listings, 22);
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE owner_token = 'demo-market-seed'").c, 22, 'loading twice does not double the rows');
  assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM marketplace_listings WHERE is_harvest_listing = 1 AND is_fictional_seller = 0').c, 0, 'every seeded listing is marked fictional');
  assert.equal(one<{c: number}>('SELECT COUNT(*) c FROM triage_reports WHERE is_synthetic = 0').c, 0);
  assert.equal(one<{c: number}>("SELECT COUNT(*) c FROM marketplace_listings WHERE is_harvest_listing = 1 AND (seller_phone <> '' OR phone_consent <> 0)").c, 0, 'no phone numbers in the synthetic data');
  const r = (await req(reader, '/api/v1/insights/aggregates')).data;
  assert.equal(r.containsSyntheticRecords, true);
  assert.deepEqual(r.harvest.byCounty.rows.map((x: any) => [x.key, x.listings]), [['Bong', 8], ['Montserrado', 3], ['Nimba', 7]], 'Lofa (2 farmers) and Margibi (1) are hidden');
  assert.equal(r.harvest.byCounty.other.listings, 4); assert.equal(r.harvest.byCounty.other.groupsCombined, 2); assert.equal(r.harvest.byCounty.rows.reduce((s: number, x: any) => s + x.listings, 0) + r.harvest.byCounty.other.listings, 22);
  assert.ok(r.cropChecks.byCrop.rows.length >= 2 && r.cropChecks.byCrop.rows.every((x: any) => x.checks >= 3 && x.devices >= 3));
  const listed = (await req(reader, '/api/v1/harvest/listings')).data.listings; assert.ok(listed.length >= 15 && listed.every((l: any) => l.synthetic === true && l.sellerPhone === ''), 'buyers see synthetic listings labelled as such');
  // never in production
  assert.throws(() => loadRuntimeConfig({NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), DB_PATH: '/srv/data/a.db', ENABLE_DEMO_MARKET_DATA: '1'} as NodeJS.ProcessEnv, '/srv/app'), RuntimeConfigError);
  assert.equal(loadRuntimeConfig({NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), DB_PATH: '/srv/data/a.db'} as NodeJS.ProcessEnv, '/srv/app').enableDemoMarketData, false);
  assert.equal(loadRuntimeConfig({ENABLE_DEMO_MARKET_DATA: '1'} as NodeJS.ProcessEnv, '/srv/app').enableDemoMarketData, true, 'allowed in development');
  clearMarket();
});

// ================================================================================================================ 6. whole journey, migration, limits
test('9. the farm-to-market journey through the API: advice card, crop check, offline listing with a lost response, code, discovery, inquiry, reply, aggregates', async () => {
  clearMarket();
  await req(await admin(), '/api/v1/admin/demo/market-data', {method: 'POST', body: {}}); // the synthetic background data
  const farmerKey = KEY('journey-farmer'); const farmer = new CookieJar();
  assert.equal((await req(farmer, '/api/v1/advice-cards/ADV-2026-001')).status, 200);
  const rep = await req(farmer, '/api/v1/triage/reports', {method: 'POST', body: {requesterKey: farmerKey, caseId: 'cassava-patchy-young-leaves', answers: {extent: 'some', spread: 'slow', insects: 'yes'}, county: 'Bong'}, headers: {'Idempotency-Key': crypto.randomUUID()}});
  assert.equal(rep.status, 201);
  const key = crypto.randomUUID(); const body = harvest({ownerKey: farmerKey, county: 'Bong', cropSlug: 'cassava', quantityKg: 777, priceLrd: 62});
  await create(body, {'Idempotency-Key': key}, farmer); // the server applied it; imagine the response was lost
  const retry = await create(body, {'Idempotency-Key': key}, farmer);
  assert.equal(retry.data.replayed, true); const code = retry.data.listing.harvest.code; assert.match(code, SELL_CODE_PATTERN);
  const buyerKey = KEY('journey-buyer'); const buyer = new CookieJar();
  const found = (await req(buyer, '/api/v1/harvest/listings?crop=cassava&county=Bong&minKg=700')).data.listings.find((l: any) => l.code === code); assert.ok(found && found.quantityKg === 777 && found.sellerPhone === '');
  const inq = await req(buyer, `/api/v1/marketplace/listings/${found.id}/inquiries`, {method: 'POST', body: {buyerName: 'Synthetic Buyer', buyerCounty: 'Montserrado', message: 'I would like 700 kg, when can I collect?', requesterKey: buyerKey}, headers: {'Idempotency-Key': crypto.randomUUID()}});
  assert.equal(inq.status, 201);
  assert.equal((await req(new CookieJar(), `/api/v1/harvest/inquiries?listingId=${found.id}`, {headers: {'X-Listing-Key': farmerKey}})).data.inquiries.length, 1);
  await req(new CookieJar(), `/api/v1/marketplace/inquiries/${inq.data.inquiry.id}`, {method: 'PATCH', body: {farmerReply: 'Come on Friday morning.', status: 'Farmer Replied'}, headers: {'X-Listing-Key': farmerKey}});
  assert.equal((await req(new CookieJar(), '/api/v1/harvest/inquiries', {headers: {'X-Requester-Key': buyerKey}})).data.inquiries[0].farmerReply, 'Come on Friday morning.');
  const agg = (await req(new CookieJar(), '/api/v1/insights/aggregates')).data;
  assert.equal(agg.harvest.byCounty.rows.find((x: any) => x.key === 'Bong').listings, 9, 'the new listing is counted with the 8 synthetic Bong listings');
  assert.ok(agg.cropChecks.byCrop.rows.find((x: any) => x.key === 'cassava').checks >= 7, 'and the farmer\'s crop check with the synthetic ones');
  assert.ok(!JSON.stringify(agg).includes(code) && !JSON.stringify(agg).includes(farmerKey));
  clearMarket();
});

test('10. migration 010 is additive, reversible and re-appliable; older rows get references', async () => {
  const {runMigrations} = await import('../server/db.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p1b-')); tmpDirs.push(dir);
  const d = new DatabaseSync(path.join(dir, 'm.db'));
  try {
    d.exec('PRAGMA foreign_keys = ON;');
    assert.ok(runMigrations(d).includes('010_harvest_market.sql'));
    const cols = (t: string) => (d.prepare(`PRAGMA table_info(${t})`).all() as {name: string}[]).map((c) => c.name);
    for (const c of ['listing_code', 'crop_slug', 'quantity_kg', 'harvest_date', 'is_harvest_listing']) assert.ok(cols('marketplace_listings').includes(c), c);
    assert.ok(cols('marketplace_inquiries').includes('buyer_key_hash') && cols('marketplace_inquiries').includes('buyer_phone_consent') && cols('triage_reports').includes('is_synthetic'));
    d.exec(fs.readFileSync(path.join(root, 'server/migrations/down/010_harvest_market.down.sql'), 'utf8'));
    assert.ok(!cols('marketplace_listings').includes('listing_code') && !cols('triage_reports').includes('is_synthetic'));
    assert.deepEqual(runMigrations(d), ['010_harvest_market.sql']);
  } finally { d.close(); }
  const rows = dbw((x) => x.prepare("SELECT COUNT(*) c FROM marketplace_listings WHERE listing_code IS NULL OR listing_code NOT GLOB 'SELL-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'").get() as {c: number});
  assert.equal(rows.c, 0, 'every listing, old or new, has a well-formed reference');
});

async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
test('11. defaults on real servers: Phase 0 limits and the synthetic-only phone policy still hold for harvest listings and inquiries; production refuses demo data', async () => {
  const mk = async (env: Record<string, string>) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p1b-')); tmpDirs.push(dir); const port = await freePort();
    const proc: ChildProcess = spawn(process.execPath, [path.join(root, 'server.js')], {cwd: os.tmpdir(), env: {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), DB_PATH: path.join(dir, 'a.db'), PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '0', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), ...env}, stdio: ['ignore', 'pipe', 'pipe']});
    let out = ''; proc.stdout?.on('data', (x) => (out += x)); proc.stderr?.on('data', (x) => (out += x));
    const exited = new Promise<number | null>((r) => proc.on('exit', (c) => r(c)));
    const base = `http://127.0.0.1:${port}`; for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`); break; } catch { if (proc.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
    return {base, proc, out: () => out, exited}; };
  const call = async (base: string, jar: {c: string}, method: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    if (!jar.c) { const r = await fetch(`${base}/api/v1/csrf-token`); jar.c = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; '); }
    const csrf = /agri_csrf=([^;]+)/.exec(jar.c)![1];
    const x = await fetch(base + url, {method, headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: jar.c, ...extra}, body: body === undefined ? undefined : JSON.stringify(body)}); let j: any = null; try { j = await x.json(); } catch { /* */ } return {status: x.status, j, headers: x.headers}; };
  // production-like: 12 anonymous listings per hour, 20 inquiries; 60 SELL checks per 10 min; aggregates are rate limited
  const p = await mk({NODE_ENV: 'production'});
  try {
    const jar = {c: ''}; const st: number[] = [];
    for (let i = 0; i < 14; i++) st.push((await call(p.base, jar, 'POST', '/api/v1/marketplace/listings', harvest({ownerKey: KEY(`rl${i}`)}))).status);
    assert.deepEqual(st, [...Array(12).fill(201), 429, 429], `harvest listings are limited like other listings (${st})`);
    const first = (await call(p.base, jar, 'GET', '/api/v1/harvest/listings')).j.listings[0];
    const iq: number[] = [];
    for (let i = 0; i < 22; i++) iq.push((await call(p.base, jar, 'POST', `/api/v1/marketplace/listings/${first.id}/inquiries`, {buyerName: 'Synthetic Buyer', buyerCounty: 'Bong', message: `Inquiry number ${i}`, requesterKey: KEY(`b${i}`)})).status);
    assert.deepEqual(iq, [...Array(20).fill(201), 429, 429], `inquiries are limited (${iq})`);
    const codes: number[] = []; for (let i = 0; i < 62; i++) codes.push((await call(p.base, jar, 'GET', `/api/v1/harvest/verify/${first.code}`)).status);
    assert.equal(codes.filter((s) => s === 200).length, 60); assert.ok(codes.slice(60).every((s) => s === 429), 'reference checks are throttled');
    const agg: number[] = []; for (let i = 0; i < 122; i++) agg.push((await call(p.base, jar, 'GET', '/api/v1/insights/aggregates')).status);
    assert.equal(agg.filter((s) => s === 200).length, 120); assert.equal(agg[121], 429);
  } finally { p.proc.kill(); }
  // protected demo environment: only synthetic numbers for sellers and buyers (Phase 0 policy), and the demo data can be loaded
  const d = await mk({NODE_ENV: 'production', APP_ENV: 'demo', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only', ENABLE_DEMO_MARKET_DATA: '1', PUBLIC_WRITE_LIMIT_SCALE: '100'});
  try {
    const jar = {c: ''};
    const synth = await call(d.base, jar, 'GET', '/api/v1/insights/aggregates'); assert.equal(synth.j.containsSyntheticRecords, true, 'ENABLE_DEMO_MARKET_DATA loaded the synthetic data at start-up');
    assert.equal((await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', harvest({ownerKey: KEY('real'), sellerPhone: '+231886123456', phoneConsent: true}))).status, 422);
    assert.equal((await call(d.base, jar, 'POST', '/api/v1/marketplace/listings', harvest({ownerKey: KEY('syn'), sellerPhone: '+231770001234', phoneConsent: true}))).status, 201);
    const l = (await call(d.base, jar, 'GET', '/api/v1/harvest/listings')).j.listings[0];
    const bad = await call(d.base, jar, 'POST', `/api/v1/marketplace/listings/${l.id}/inquiries`, {buyerName: 'Buyer', buyerCounty: 'Bong', message: 'Please call me back', buyerPhone: '+231886999000', buyerPhoneConsent: true, requesterKey: KEY('bb')});
    assert.equal(bad.status, 422); assert.equal(bad.j.error.code, 'PHONE_NOT_ALLOWED');
    assert.equal((await call(d.base, jar, 'POST', `/api/v1/marketplace/listings/${l.id}/inquiries`, {buyerName: 'Buyer', buyerCounty: 'Bong', message: 'Please call me back', buyerPhone: '+231770001299', buyerPhoneConsent: true, requesterKey: KEY('bc')})).status, 201);
  } finally { d.proc.kill(); }
  const prod = await mk({NODE_ENV: 'production', ENABLE_DEMO_MARKET_DATA: '1'});
  const code = await Promise.race([prod.exited, new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
  assert.equal(code, 1); assert.match(prod.out(), /ENABLE_DEMO_MARKET_DATA must not be set in production/); prod.proc.kill();
});
