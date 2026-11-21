import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, {after, before} from 'node:test';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {ApiRequestError} from '../src/lib/api.ts';
import {listingBody} from '../src/lib/listingPayload.ts';
import {validateListing, type ListingRecord} from '../src/lib/offlineDrafts.ts';
import type {HarvestListing, HarvestLoad} from '../src/lib/harvestClient.ts';
import {createUssdMarketClient, type MarketClientDeps} from '../src/lib/ussd/marketClient.ts';
import {DEMO_TOWNS, INQUIRY_MESSAGES, REAL_INQUIRY_MESSAGES, REAL_TOWNS, USSD_DEMO_MARKER, USSD_REAL_MARKER, type MarketCommand, type MarketplaceEnv} from '../src/lib/ussd/marketTypes.ts';
import {newSession, press, view, type Key, type UssdEnv} from '../src/lib/ussd/engine.ts';

/**
 * The USSD marketplace in a REAL-USER deployment (signed-in account, no synthetic markers, no demo wording). The adapter talks to a disposable backend; the
 * server's environment answer is injected so the real-user branch is exercised end to end (the server side of real mode is tested in real-mode.test.ts).
 */
let backend: Backend;
before(async () => { backend = await startBackend(); });
after(async () => { await backend?.stop(); });
const rand = () => crypto.randomBytes(32).toString('hex');
const date = () => new Date().toISOString().slice(0, 10);
type Account = {id: number; displayName: string} | null;
function client(environment: Record<string, unknown>, account: () => Account) {
  const jar = new CookieJar(); const rows: ListingRecord[] = []; let last: HarvestLoad = {source: 'none', listings: []}; const key = rand();
  const read = async <T,>(path: string, headers?: Record<string, string>): Promise<T> => { if (path === '/environment') return environment as T; const r = await req(jar, '/api/v1' + path, {headers}); if (r.status >= 400) throw new ApiRequestError(r.status, 'REQUEST_FAILED', 'Server refused'); return r.data as T; };
  const post = async <T,>(path: string, body: unknown, headers: Record<string, string>): Promise<T> => { const r = await req(jar, '/api/v1' + path, {method: 'POST', body, headers}); if (r.status >= 400) throw new ApiRequestError(r.status, 'REQUEST_FAILED', 'Server refused'); return r.data as T; };
  const deps: MarketClientDeps = {
    enabled: true, online: () => true, uuid: () => crypto.randomUUID(), get: read, post, account,
    loadMarket: async () => { const r = await read<{listings: HarvestListing[]}>('/harvest/listings?includeSoldOut=1'); last = {source: 'server', listings: r.listings, asOf: new Date().toISOString()}; return last; },
    init: async () => {}, records: () => rows,
    save: async (data) => { assert.equal(validateListing(data), null); const t = new Date().toISOString(); const r: ListingRecord = {type: 'listing', localId: crypto.randomUUID(), opId: crypto.randomUUID(), ownerKey: rand(), data, status: 'draft', rev: 1, createdAt: t, updatedAt: t}; rows.push(r); return r; },
    queue: async (id) => { rows.find((r) => r.localId === id)!.status = 'pending'; }, syncSoon: () => {}, requesterKey: () => key,
  };
  const service = createUssdMarketClient(deps);
  const flush = async () => { for (const r of rows.filter((r) => r.status === 'pending')) { const res = await post<{listing: {id: number; harvest: {code: string}}}>('/marketplace/listings', listingBody(r, false, r.ownerKey), {'Idempotency-Key': r.opId}); r.serverId = res.listing.id; r.listingCode = res.listing.harvest.code; r.status = 'published'; } };
  return {service, rows, flush, jar};
}
const REAL = {demoEnvironment: false, syntheticAccountsOnly: false, registryMode: 'real'};
const env = (marketplace: MarketplaceEnv): UssdEnv => ({now: new Date(), online: true, market: {source: marketplace.source, asOf: marketplace.asOf, listings: marketplace.listings}, marketplace});
class Phone {
  s = newSession(); t = Date.now();
  constructor(public e: UssdEnv) {}
  key(k: Key) { this.s = press(this.s, k, this.e, ++this.t); return this; }
  choose(v: string) { for (const d of v) this.key(d as Key); return this.key('send'); }
  text() { const v = view(this.s, this.e, this.t); assert.ok(!v.truncated && v.text.length <= 182, v.text); return v.text; }
}

test('real mode needs a signed-in account; signed out, the marketplace stays closed and says why', async () => {
  const out = client(REAL, () => null); const snap = await out.service.load();
  assert.equal(snap.allowed, false); assert.match(snap.reason, /Sign in/);
  const inn = client(REAL, () => ({id: 7, displayName: 'Mary Kollie'})); const ok = await inn.service.load();
  assert.equal(ok.allowed, true); assert.equal(ok.mode, 'real'); assert.equal(ok.identityName, 'Mary Kollie');
  const demo = client({demoEnvironment: true, syntheticAccountsOnly: true, registryMode: 'synthetic'}, () => null); const d = await demo.service.load();
  assert.equal(d.allowed, true); assert.equal(d.mode, 'demo', 'the protected demo behaves as before');
  const neither = client({demoEnvironment: false, syntheticAccountsOnly: false}, () => ({id: 1, displayName: 'X'})); assert.equal((await neither.service.load()).allowed, false, 'not demo and not real: closed');
});

test('the keypad sale in real mode: member name, no demo or synthetic wording, county market town, one confirmed command', async () => {
  const c = client(REAL, () => ({id: 7, displayName: 'Mary Kollie'})); const p = new Phone(env(await c.service.load()));
  p.key('send').choose('3'); p.choose('2').choose('4').choose('650').choose('62').choose('2');
  // the review is paged: read every page before the confirming choice
  let confirm = p.text(); for (let n = 0; /\n1 Next\n/.test(p.text()) && n < 30; n++) { p.choose('1'); confirm += '\n' + p.text(); }
  assert.match(confirm, /650 kg/); assert.match(confirm, /Gbarnga/); assert.match(confirm, /Mary Kollie/); assert.ok(!/demo|synthetic/i.test(confirm), confirm);
  p.choose('1'); const command = p.s.pending ?? undefined; assert.ok(command, 'a confirmed command is produced only after the final choice'); assert.equal(command!.kind, 'sell'); assert.equal((command as {town: string}).town, REAL_TOWNS['Bong']);
  const result = await c.service.run(command!); assert.equal(result.status, 'pending');
  const rec = c.rows[0]; assert.equal(rec.data.sellerName, 'Mary Kollie'); assert.equal(rec.data.description, USSD_REAL_MARKER); assert.equal(rec.data.sellerPhone, ''); assert.equal(rec.data.phoneConsent, false);
  assert.ok(!rec.data.description.includes(USSD_DEMO_MARKER));
  const again = await c.service.run(command!); assert.equal(again.status, 'pending'); assert.equal(c.rows.length, 1, 'a repeated dispatch saves once');
});

test('real listings are shown, synthetic and demo-marked ones are not; inquiries use the real questions only', async () => {
  const seller = new CookieJar();
  await req(seller, '/api/v1/auth/register', {method: 'POST', body: {privacyConsent: true, privacyVersion: 'privacy-v1', displayName: 'Seed Seller', phone: '+231886500001', password: 'Garden-Harvest-7391!', county: 'Bong'}});
  const mk = (marker: string) => listingBody({data: {sellerType: 'farmer', sellerName: 'Seed Seller', farmName: '', category: 'Cereals & Grains', productName: 'Rice', quantity: '300', unit: 'kg', priceLrd: '150', county: 'Bong', town: marker === USSD_DEMO_MARKER ? DEMO_TOWNS[0] : 'Gbarnga', availabilityStatus: 'Available', description: marker, photoDataUrl: '', sellerPhone: '', phoneConsent: false, cropSlug: 'rice', quantityKg: 300, harvestDate: date()}} as never, false, rand());
  const real = await req(seller, '/api/v1/marketplace/listings', {method: 'POST', headers: {'Idempotency-Key': crypto.randomUUID()}, body: mk(USSD_REAL_MARKER)});
  const demo = await req(seller, '/api/v1/marketplace/listings', {method: 'POST', headers: {'Idempotency-Key': crypto.randomUUID()}, body: mk(USSD_DEMO_MARKER)});
  assert.equal(real.status, 201); assert.equal(demo.status, 201);
  const c = client(REAL, () => ({id: 9, displayName: 'Buyer Person'})); const snap = await c.service.load();
  const ids = snap.listings.map((l) => l.id); assert.ok(ids.includes(real.data.listing.id), 'a real listing is offered'); assert.ok(!ids.includes(demo.data.listing.id), 'a demo-marked listing is not offered in real mode');
  assert.ok(snap.listings.every((l) => l.id !== undefined));
  const base = {kind: 'inquiry' as const, listingId: real.data.listing.id, county: 'Montserrado'};
  const bad = await c.service.run({...base, token: crypto.randomUUID(), message: INQUIRY_MESSAGES[0]}); assert.equal(bad.status, 'failed', 'the synthetic demo question is refused in real mode');
  const sent = await c.service.run({...base, token: crypto.randomUUID(), message: REAL_INQUIRY_MESSAGES[0]}); assert.equal(sent.status, 'synced', sent.message);
  assert.match(sent.message, /inquiry/i);
});

test('real-mode screens never say demo or synthetic in the Buy & Sell flow and stay within 182 characters', async () => {
  const c = client(REAL, () => ({id: 9, displayName: 'Buyer Person'})); const m = await c.service.load();
  const p = new Phone(env(m)); const texts: string[] = [];
  p.key('send').choose('3'); texts.push(p.text()); p.choose('1'); texts.push(p.text()); p.choose('4'); texts.push(p.text()); p.choose('1'); texts.push(p.text());
  p.key('home'); p.choose('3'); p.choose('3'); texts.push(p.text()); p.key('home'); p.choose('3'); p.choose('4'); texts.push(p.text());
  for (const t of texts) assert.ok(!/demo|synthetic/i.test(t), t);
});
