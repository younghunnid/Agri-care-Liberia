import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test, {after, before} from 'node:test';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {SNAPSHOT_KEY, createHarvestClient, filterListings, findByCode, type HarvestFilters, type HarvestListing} from '../src/lib/harvestClient.ts';
import {INSIGHTS_KEY, createInsightsClient} from '../src/lib/insightsClient.ts';
import {listingBody} from '../src/lib/listingPayload.ts';
import {validateListing, type ListingData} from '../src/lib/offlineDrafts.ts';
import {memoryKv} from '../src/lib/kvStore.ts';
import {SELL_CODE_PATTERN} from '../src/lib/harvestRules.ts';

/** Phase 1B browser-side logic: filters equal the server's, honest offline snapshot, listing payload, and an offline-lost-response-retry run against the real server. */
const root = path.resolve(import.meta.dirname, '..');
let backend: Backend;
before(async () => { backend = await startBackend(); });
after(async () => { await backend?.stop(); });
const rand = (n = 16) => crypto.randomBytes(n).toString('hex');
const KEY = (s: string) => `${s}-${rand(20)}`;
const today = (o = 0) => new Date(Date.now() - o * 86_400_000).toISOString().slice(0, 10);

const data = (over: Partial<ListingData> = {}): ListingData => ({
  sellerType: 'farmer', sellerName: 'Synthetic Farmer', farmName: '', category: 'Cassava and root crops', productName: 'Cassava', quantity: '500', unit: 'kg', priceLrd: '60', county: 'Bong', town: 'Gbarnga',
  availabilityStatus: 'Available', description: 'Synthetic', photoDataUrl: '', sellerPhone: '', phoneConsent: false, cropSlug: 'cassava', quantityKg: 500, harvestDate: today(1), ...over,
});

test('1. the harvest form data is validated before it is queued, and the request body carries the structured fields (and nothing private)', () => {
  assert.equal(validateListing(data()), null);
  for (const [over, why] of [[{quantityKg: 0}, 'kg 0'], [{quantityKg: '2.5'}, 'fraction'], [{quantityKg: ''}, 'empty kg'], [{cropSlug: 'gold'}, 'crop'], [{harvestDate: today(-9)}, 'future'], [{harvestDate: 'soon'}, 'text date'], [{priceLrd: '0'}, 'price'], [{county: ''}, 'county'], [{town: ' '}, 'town'], [{phoneConsent: true, sellerPhone: '12'}, 'phone']] as [Partial<ListingData>, string][]) assert.ok(validateListing(data(over)), why);
  const b = listingBody({data: data({phoneConsent: true, sellerPhone: '+231770001234'})}, false, 'k'.repeat(40));
  assert.equal(b.cropSlug, 'cassava'); assert.equal(b.quantityKg, 500); assert.equal(typeof b.harvestDate, 'string'); assert.equal(b.unit, 'kg'); assert.equal(b.priceLrd, 60); assert.equal(b.ownerKey, 'k'.repeat(40)); assert.equal(b.sellerPhone, '+231770001234'); assert.equal(b.phoneConsent, true);
  const noConsent = listingBody({data: data({phoneConsent: false, sellerPhone: '+231770001234'})}, false);
  assert.equal(noConsent.sellerPhone, '', 'no consent, no number in the request'); assert.equal(noConsent.phoneConsent, false); assert.ok(!('ownerKey' in noConsent), 'the secret is sent only on create');
  assert.ok(!('imageUrl' in listingBody({data: data({photoDataUrl: 'data:image/png;base64,AAAA'})}, false))); assert.ok('imageUrl' in listingBody({data: data({photoDataUrl: 'data:image/png;base64,AAAA'})}, true));
  const plain = listingBody({data: data({cropSlug: undefined, quantityKg: undefined, harvestDate: undefined})}, false); assert.ok(!('cropSlug' in plain) && !('quantityKg' in plain) && !('harvestDate' in plain), 'a plain listing sends exactly what it always did');
});

test('2. the filters on the phone give the same answer as the server for every combination', async () => {
  const jar = new CookieJar();
  const mk = async (over: Record<string, unknown>) => req(new CookieJar(), '/api/v1/marketplace/listings', {method: 'POST', body: {ownerKey: KEY('f'), sellerName: 'S', cropSlug: 'rice', quantityKg: 100, priceLrd: 100, county: 'Bong', town: 'Gbarnga', harvestDate: today(1), description: 'x', ...over}});
  for (const o of [{cropSlug: 'rice', quantityKg: 50, priceLrd: 90, county: 'Bong'}, {cropSlug: 'rice', quantityKg: 800, priceLrd: 150, county: 'Lofa'}, {cropSlug: 'cassava', quantityKg: 300, priceLrd: 60, county: 'Nimba', availabilityStatus: 'Limited Stock'}, {cropSlug: 'pepper', quantityKg: 20, priceLrd: 400, county: 'Nimba', availabilityStatus: 'Sold Out'}, {cropSlug: 'okra', quantityKg: 1000, priceLrd: 120, county: 'Bong', availabilityStatus: 'Sold Out'}]) assert.equal((await mk(o)).status, 201);
  const all = (await req(jar, '/api/v1/harvest/listings?includeSoldOut=1')).data.listings as HarvestListing[];
  assert.ok(all.length >= 5);
  const combos: HarvestFilters[] = [];
  for (const crop of [undefined, 'rice', 'pepper']) for (const county of [undefined, 'Bong', 'Nimba']) for (const status of [undefined, 'Available', 'Sold Out']) for (const includeSoldOut of [false, true]) for (const minKg of [null, 100, 500]) for (const maxPrice of [null, 100]) combos.push({crop, county, status, includeSoldOut, minKg, maxPrice});
  for (const f of combos) {
    const q = new URLSearchParams(); if (f.crop) q.set('crop', f.crop); if (f.county) q.set('county', f.county); if (f.status) q.set('status', f.status); if (f.includeSoldOut) q.set('includeSoldOut', '1'); if (f.minKg !== null && f.minKg !== undefined) q.set('minKg', String(f.minKg)); if (f.maxPrice !== null && f.maxPrice !== undefined) q.set('maxPrice', String(f.maxPrice));
    const server = ((await req(jar, `/api/v1/harvest/listings?${q}`)).data.listings as HarvestListing[]).map((l) => l.id).sort((a, b) => a - b);
    assert.deepEqual(filterListings(all, f).map((l) => l.id).sort((a, b) => a - b), server, JSON.stringify(f));
  }
  assert.equal(findByCode(all, all[0].code!.toLowerCase())?.id, all[0].id); assert.equal(findByCode(all, 'SELL-2099-999999'), undefined);
});

test('3. the buyer\'s list is saved with the time it was saved; offline it is shown as a saved list, never as current; no list means a clear "none"', async () => {
  const kv = memoryKv(); const clock = {t: Date.UTC(2026, 10, 19, 8, 0, 0)}; let up = true;
  const listing = (over: Partial<HarvestListing> = {}): HarvestListing => ({id: 1, code: 'SELL-2026-000001', cropSlug: 'rice', cropLabel: 'Rice', quantityKg: 100, pricePerKgLrd: 100, county: 'Bong', town: 'Gbarnga', harvestDate: today(1), status: 'Available', description: '', sellerName: 'S', farmName: '', sellerPhone: '', phoneConsent: false, synthetic: true, createdAt: '', updatedAt: '', ...over});
  const get = async <T,>(_p: string): Promise<T> => { if (!up) throw new TypeError('offline'); return {listings: [listing(), listing({id: 2, code: 'SELL-2026-000002', sellerPhone: '+231770001234', phoneConsent: true})], generatedAt: new Date(clock.t).toISOString()} as T; };
  const client = createHarvestClient({get, kv, now: () => clock.t});
  assert.deepEqual(await createHarvestClient({get: async () => { throw new TypeError('offline'); }, kv: memoryKv()}).load(), {listings: [], source: 'none'});
  const online = await client.load(); assert.equal(online.source, 'server'); assert.equal(online.listings.length, 2); assert.equal(online.asOf, new Date(clock.t).toISOString());
  up = false; clock.t += 3 * 3_600_000;
  const off = await client.load();
  assert.equal(off.source, 'saved'); assert.equal(off.listings.length, 2); assert.equal(off.asOf, new Date(Date.UTC(2026, 10, 19, 8, 0, 0)).toISOString(), 'the time it was SAVED, not now'); assert.ok(off.generatedAt);
  assert.equal(off.listings.find((l) => l.id === 1)!.sellerPhone, '', 'the saved list carries no number the seller did not share'); assert.equal(off.listings.find((l) => l.id === 2)!.sellerPhone, '+231770001234');
  assert.ok(await kv.get(SNAPSHOT_KEY));
  // pages state the rules
  const page = fs.readFileSync(path.join(root, 'src/pages/public/HarvestMarketPage.tsx'), 'utf8');
  assert.match(page, /Saved list from/); assert.match(page, /may be out of date/); assert.match(page, /Questions need a connection/); assert.match(page, /The seller has not shared a phone number/);
});

test('4. the Ministry numbers keep an honest saved copy; the panel is labelled simulated and says what is excluded', async () => {
  const kv = memoryKv(); let up = true; const agg = {generatedAt: '2026-11-19T08:00:00Z', label: 'SIMULATED', privacy: {minGroup: 3, note: 'n'}, containsSyntheticRecords: true, real: {note: 'r', asOf: 'x', harvest: {}, cropChecks: {}}, synthetic: {note: 's', asOf: 'x', harvest: {}, cropChecks: {}}};
  const client = createInsightsClient({get: async <T,>() => { if (!up) throw new TypeError('offline'); return agg as T; }, kv, now: () => 5});
  assert.equal((await client.load()).source, 'server'); up = false; const off = await client.load(); assert.equal(off.source, 'saved'); assert.ok(off.savedAt); assert.ok(await kv.get(INSIGHTS_KEY));
  assert.deepEqual(await createInsightsClient({get: async () => { throw new TypeError('x'); }, kv: memoryKv()}).load(), {data: null, source: 'none'});
  const panel = fs.readFileSync(path.join(root, 'src/components/ministry/LiveInsightsPanel.tsx'), 'utf8'); const ministry = fs.readFileSync(path.join(root, 'src/pages/public/MinistryAnalyticsPage.tsx'), 'utf8');
  assert.match(panel, /not an official Ministry system/); assert.match(panel, /Saved copy from/); assert.match(panel, /No names, phone numbers, villages, reference codes or photos/); assert.match(panel, /Includes synthetic demonstration records/); assert.match(ministry, /<LiveInsightsPanel \/>/);
  assert.ok(!/blockchain|official statistics are|approved by the ministry|endorsed/i.test(panel.replace(/not an official Ministry system/g, '').replace(/these are not official statistics/g, '')), 'no claim of official status');
});

test('5. the SELL reference is shown only as a server-issued lookup number: never made on the phone, never called blockchain or proof', () => {
  const sell = fs.readFileSync(path.join(root, 'src/pages/public/SellHarvestPage.tsx'), 'utf8'); const market = fs.readFileSync(path.join(root, 'src/pages/public/HarvestMarketPage.tsx'), 'utf8'); const crops = fs.readFileSync(path.join(root, 'src/data/harvestCrops.ts'), 'utf8');
  assert.match(sell, /the server will issue it after this reaches it/); assert.match(sell, /SELL_CODE_NOTE/);
  for (const src of [sell, market]) assert.ok(!/formatSellCode|SELL-\$\{|`SELL-/.test(src), 'no code is generated in the browser');
  assert.match(crops, /not a blockchain, not a signature, and not proof of origin or quality/);
  for (const [name, src] of [['sell', sell], ['market', market], ['panel', fs.readFileSync(path.join(root, 'src/components/ministry/LiveInsightsPanel.tsx'), 'utf8')]] as [string, string][]) assert.ok(!/blockchain|cryptograph|tamper|immutable|guarantee/i.test(src), `${name} makes no traceability claim`);
  assert.match(sell, /saveListingDraft/); assert.match(sell, /queueRecord\('listing'/); assert.match(sell, /syncSoon\(\)/); assert.match(sell, /There are <strong>no payments<\/strong>/);
  const eng = fs.readFileSync(path.join(root, 'src/lib/syncEngine.ts'), 'utf8'); assert.match(eng, /listingCode: res\.listing\.harvest\?\.code/); assert.match(eng, /headers: \{'Idempotency-Key': op\.opId\}/);
});

test('6. offline creation, a lost response and retries (real server): one listing, one reference, the same key every time', async () => {
  const jar = new CookieJar(); const ownerKey = KEY('offline-owner'); const opId = crypto.randomUUID();
  const rec = {data: data({quantityKg: 4321, county: 'Grand Bassa'})}; const body = listingBody(rec, true, ownerKey);
  let phase: 'offline' | 'lost' | 'online' = 'offline'; let attempts = 0;
  const send = async () => {
    attempts++;
    if (phase === 'offline') throw new TypeError('network down');
    const r = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers: {'Idempotency-Key': opId}});
    if (phase === 'lost') throw new TypeError('connection dropped after the server answered');
    return r;
  };
  await assert.rejects(send, TypeError);               // created offline: nothing reached the server
  phase = 'lost'; await assert.rejects(send, TypeError); // the server applied it, the answer was lost
  phase = 'online'; const ok = await send();
  assert.equal(ok.status, 201); assert.equal(ok.data.replayed, true, 'the server recognised the key and replayed the stored result');
  assert.match(ok.data.listing.harvest.code, SELL_CODE_PATTERN); assert.equal(ok.data.listing.harvest.quantityKg, 4321); assert.equal(attempts, 3);
  const again = await send(); assert.equal(again.data.listing.id, ok.data.listing.id);
  const found = (await req(new CookieJar(), '/api/v1/harvest/listings?county=Grand%20Bassa&minKg=4000')).data.listings.filter((l: HarvestListing) => l.quantityKg === 4321);
  assert.equal(found.length, 1, 'exactly one listing exists'); assert.equal(found[0].code, ok.data.listing.harvest.code);
  // the owner can then change the status with the same key the phone kept
  assert.equal((await req(new CookieJar(), `/api/v1/marketplace/listings/${ok.data.listing.id}`, {method: 'PATCH', body: listingBody({data: data({availabilityStatus: 'Sold Out', quantityKg: 4321, county: 'Grand Bassa'})}, false), headers: {'X-Listing-Key': ownerKey}})).data.listing.availability_status, 'Sold Out');
});
