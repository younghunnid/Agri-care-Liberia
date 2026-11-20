import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, {after, before} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import jsQR from 'jsqr';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {ApiRequestError} from '../src/lib/api.ts';
import {listingBody} from '../src/lib/listingPayload.ts';
import {validateListing, type ListingRecord} from '../src/lib/offlineDrafts.ts';
import type {HarvestListing, HarvestLoad} from '../src/lib/harvestClient.ts';
import {createUssdMarketClient, type MarketClientDeps} from '../src/lib/ussd/marketClient.ts';
import {DEMO_TOWNS, EMPTY_MARKETPLACE, INQUIRY_MESSAGES, type MarketCommand, type MarketplaceEnv} from '../src/lib/ussd/marketTypes.ts';
import {DEFAULT_TIMEOUT_S, finishMarket, newSession, press, tick, view, type Key, type UssdEnv} from '../src/lib/ussd/engine.ts';
import {demoDestination, qrMatrix, qrPath} from '../src/lib/ussd/demoQr.ts';
import {DemoQr, QR_TITLE} from '../src/components/ussd/DemoQr.tsx';

let backend: Backend;
before(async () => { backend = await startBackend(); });
after(async () => { await backend?.stop(); });
const date = () => new Date().toISOString().slice(0, 10);
const rand = () => crypto.randomBytes(32).toString('hex');

/** Engine and adapter contract tests use a disposable HTTP backend. Browser tests exercise the production IndexedDB queue. */
function client(over: Partial<MarketClientDeps> = {}) {
  const jar = new CookieJar(); const rows: ListingRecord[] = []; let online = true; let saves = 0; let last: HarvestLoad = {source: 'none', listings: []}; const key = rand();
  const read = async <T,>(path: string, headers?: Record<string, string>): Promise<T> => {
    if (!online) throw new TypeError('offline');
    // Protected-mode metadata is injected; every marketplace request uses the real test backend.
    if (path === '/environment') return {demoEnvironment: true, syntheticAccountsOnly: true} as T;
    const r = await req(jar, '/api/v1'+path, {headers}); if (r.status >= 400) throw new ApiRequestError(r.status, 'REQUEST_FAILED', 'Server refused'); return r.data as T;
  };
  const post = async <T,>(path: string, body: unknown, headers: Record<string, string>): Promise<T> => { if (!online) throw new TypeError('offline'); const r = await req(jar, '/api/v1'+path, {method: 'POST', body, headers}); if (r.status >= 400) throw new ApiRequestError(r.status, 'REQUEST_FAILED', 'Server refused'); return r.data as T; };
  const deps: MarketClientDeps = {
    enabled: true, online: () => online, uuid: () => crypto.randomUUID(), get: read, post,
    loadMarket: async () => { if (!online) return {...last, source: last.source === 'none' ? 'none' : 'saved'}; const r = await read<{listings: HarvestListing[]}>('/harvest/listings?includeSoldOut=1'); last = {source: 'server', listings: r.listings, asOf: new Date().toISOString()}; return last; },
    init: async () => {}, records: () => rows,
    save: async (data) => { assert.equal(validateListing(data), null); saves++; const t = new Date().toISOString(); const r: ListingRecord = {type: 'listing', localId: crypto.randomUUID(), opId: crypto.randomUUID(), ownerKey: rand(), data, status: 'draft', rev: 1, createdAt: t, updatedAt: t}; rows.push(r); return r; },
    queue: async (id) => { rows.find((r) => r.localId === id)!.status = 'pending'; }, syncSoon: () => {}, requesterKey: () => key, ...over,
  };
  const service = createUssdMarketClient(deps);
  const flush = async () => { for (const r of rows.filter((r) => r.status === 'pending')) { const res = await post<{listing: {id: number; harvest: {code: string}}}>('/marketplace/listings', listingBody(r, false, r.ownerKey), {'Idempotency-Key': r.opId}); r.serverId = res.listing.id; r.listingCode = res.listing.harvest.code; r.status = 'published'; } };
  return {service, deps, rows, jar, key, read, post, flush, get saves() { return saves; }, setOnline: (v: boolean) => { online = v; }};
}
const sell = (token = crypto.randomUUID()): MarketCommand => ({kind: 'sell', token, crop: 'cassava', kg: 650, price: 62, county: 'Bong', town: DEMO_TOWNS[0], harvestDate: date()});
const env = (marketplace: MarketplaceEnv, online = true): UssdEnv => ({now: new Date(), online, market: {source: marketplace.source, asOf: marketplace.asOf, listings: marketplace.listings}, marketplace});
class Phone {
  s = newSession(); t = Date.now();
  constructor(public e: UssdEnv) {}
  key(k: Key) { this.s = press(this.s, k, this.e, ++this.t); return this; }
  choose(value: string) { for (const d of value) this.key(d as Key); return this.key('send'); }
  text() { const v = view(this.s, this.e, this.t); assert.ok(!v.truncated && v.text.length <= 182, v.text); return v.text; }
  review() { for (let n = 0; /\n1 Next\n/.test(this.text()) && n < 30; n++) this.choose('1'); return this; }
}

test('keypad sale reviews every field, never emits before confirmation, and repeated dispatch saves once', async () => {
  const c = client(); const p = new Phone(env(await c.service.load()));
  p.key('send').choose('3'); assert.match(p.text(), /1 Buy Produce\n2 Sell My Harvest\n3 My Listings\n4 My Inquiries\n5 Back/);
  p.choose('2').choose('4').choose('650').choose('62').choose('2').choose('1');
  assert.equal(p.s.pending, null); assert.match(p.text(), /Review demo sale/); p.review(); assert.equal(c.saves, 0); assert.match(p.text(), /Save & send when online/);
  p.choose('1'); const cmd = p.s.pending!; assert.equal(cmd.kind, 'sell'); assert.equal(c.saves, 0);
  const results = await Promise.all([c.service.run(cmd), c.service.run(cmd)]); assert.equal(c.saves, 1); assert.equal(results[0].status, 'pending'); assert.equal(c.rows[0].data.sellerPhone, ''); assert.equal(c.rows[0].data.phoneConsent, false);
  p.s = finishMarket(p.s, cmd.token, results[0], p.t); p.e = env(c.service.snapshot()); p.review(); assert.match(p.text(), /Pending Sync/); assert.ok(!p.text().includes('SELL-'));
  await c.flush(); p.e = env(await c.service.load()); p.key('home').choose('3').choose('3').choose('1').review(); assert.match(p.text(), /SELL-\d{4}-\d{6}/); assert.equal(c.rows.length, 1);
});

test('keypad buying sends an authorized inquiry; ownership protects the conversation and replies', async () => {
  const seller = client(); await seller.service.load(); await seller.service.run(sell()); await seller.flush();
  const buyer = client(); const p = new Phone(env(await buyer.service.load()));
  p.key('send').choose('3').choose('1').choose('4').choose('2'); assert.match(p.text(), /Produce \(live\)/); p.choose('1').review().choose('1').choose('2').review(); assert.match(p.text(), /Send demo inquiry/); assert.equal(p.s.pending, null);
  p.choose('1'); const cmd = p.s.pending!; assert.equal(cmd.kind, 'inquiry'); const result = await buyer.service.run(cmd); assert.equal(result.status, 'synced'); p.s = finishMarket(p.s, cmd.token, result, p.t); assert.match(p.text(), /Server confirmed/);
  const inquiries = (await buyer.service.load()).inquiries; assert.ok(inquiries.some((i) => i.message === INQUIRY_MESSAGES[1])); assert.ok(inquiries.every((i) => !('buyerPhone' in i)));
  const owner = seller.rows[0]; const outsider = await req(new CookieJar(), `/api/v1/harvest/inquiries?listingId=${owner.serverId}`, {headers: {'X-Listing-Key': rand()}}); assert.deepEqual(outsider.data.inquiries, []);
  const received = (await seller.service.load()).inquiries.find((i) => i.listingId === owner.serverId)!; assert.equal(received.role, 'seller');
  const denied = await req(new CookieJar(), `/api/v1/marketplace/inquiries/${received.id}`, {method: 'PATCH', body: {farmerReply: 'Not my listing.'}, headers: {'X-Listing-Key': rand()}}); assert.equal(denied.status, 403);
  const reply = await req(seller.jar, `/api/v1/marketplace/inquiries/${received.id}`, {method: 'PATCH', headers: {'X-Listing-Key': owner.ownerKey!}, body: {farmerReply: 'Synthetic harvest is ready.'}}); assert.equal(reply.status, 200);
  assert.ok((await buyer.service.load()).inquiries.some((i) => i.reply === 'Synthetic harvest is ready.'));
});

test('offline sale stays pending; inquiry cannot be sent or queued offline', async () => {
  const c = client(); await c.service.load(); c.setOnline(false); assert.equal((await c.service.run(sell())).status, 'pending'); assert.equal(c.service.snapshot().own[0].code, null);
  const inquiry = await c.service.run({kind: 'inquiry', token: 'offline-question', listingId: 1, county: 'Bong', message: INQUIRY_MESSAGES[0]}); assert.equal(inquiry.status, 'failed'); assert.match(inquiry.message, /No inquiry was sent or queued/); assert.equal(c.rows.length, 1);
  c.setOnline(true); await c.flush(); assert.match(c.service.snapshot().own[0].code!, /^SELL-/);
});

test('writes require both configuration and protected synthetic-only environment metadata', async () => {
  for (const over of [{enabled: false}, {get: async <T,>() => ({demoEnvironment: false, syntheticAccountsOnly: false} as T)}]) {
    const c = client(over); await c.service.load(); assert.equal(c.service.snapshot().allowed, false); assert.equal((await c.service.run(sell())).status, 'failed'); assert.equal(c.saves, 0);
  }
  const p = new Phone(env({...EMPTY_MARKETPLACE})); p.key('send').choose('3').choose('2').choose('4').choose('650').choose('62').choose('2').choose('1').review().choose('1'); assert.equal(p.s.pending, null); assert.match(p.text(), /Demo submissions disabled/);
});

test('validation and blocked storage produce no invented success or reference', async () => {
  const c = client(); await c.service.load(); for (const bad of [{kg: 0}, {price: 0}, {county: 'Unknown'}, {town: 'Real personal location'}, {harvestDate: 'not-a-date'}]) assert.equal((await c.service.run({...sell(), ...bad} as MarketCommand)).status, 'failed'); assert.equal(c.saves, 0);
  const blocked = client({save: async () => { throw new Error('storage blocked'); }}); await blocked.service.load(); assert.equal((await blocked.service.run(sell())).status, 'failed'); assert.equal(blocked.rows.length, 0);
  const p = new Phone(env(c.service.snapshot())); p.key('send').choose('3').choose('2').choose('4').choose('1000001'); assert.match(p.text(), /Not a valid number of kg/); p.choose('1').choose('50000001'); assert.match(p.text(), /Not a valid price/);
});

test('lost inquiry response retries the same idempotency operation and stores one inquiry', async () => {
  const seller = client(); await seller.service.load(); await seller.service.run(sell()); await seller.flush();
  const buyer = client(); await buyer.service.load(); const listing = buyer.service.snapshot().listings.find((l) => l.id === seller.rows[0].serverId)!;
  const sent: string[] = []; const actualPost = buyer.deps.post; let lost = true;
  buyer.deps.post = async <T,>(path: string, body: unknown, headers: Record<string, string>) => { sent.push(headers['Idempotency-Key']); const result = await actualPost<T>(path, body, headers); if (lost) { lost = false; throw new TypeError('lost response'); } return result; };
  const cmd: MarketCommand = {kind: 'inquiry', token: 'same-inquiry', listingId: listing.id, county: 'Bong', message: INQUIRY_MESSAGES[0]};
  assert.equal((await buyer.service.run(cmd)).status, 'unconfirmed'); assert.equal((await buyer.service.run(cmd)).status, 'synced'); assert.equal(sent[0], sent[1]); assert.equal((await buyer.service.load()).inquiries.filter((i) => i.listingId === listing.id).length, 1);
});

test('a stalled inquiry reaches an unconfirmed state with a bounded deadline', async () => {
  const seller = client(); await seller.service.load(); await seller.service.run(sell()); await seller.flush();
  const buyer = client({timeoutMs: 100, post: async <T,>() => new Promise<T>(() => {})}); await buyer.service.load();
  const result = await buyer.service.run({kind: 'inquiry', token: 'stalled', listingId: seller.rows[0].serverId!, county: 'Bong', message: INQUIRY_MESSAGES[0]});
  assert.equal(result.status, 'unconfirmed'); assert.match(result.message, /Delivery is unconfirmed/); assert.equal(result.code, undefined);
});

test('private phone numbers and non-demo listings never enter projections', async () => {
  const fixture = {id: 999, code: 'SELL-2026-000999', cropSlug: 'rice', quantityKg: 20, pricePerKgLrd: 4, county: 'Bong', town: 'Demo Town A', status: 'Available', description: 'ordinary listing', synthetic: false, sellerPhone: '+231770001111', phoneConsent: true} as HarvestListing;
  const c = client({loadMarket: async () => ({source: 'server', listings: [fixture, {...fixture, id: 1000, synthetic: true}]})}); const s = await c.service.load(); assert.deepEqual(s.listings.map((l) => l.id), [1000]); assert.equal(s.legacy?.listings.length, 2, 'original read-only market retains all public rows'); assert.deepEqual(Object.keys(s.legacy!.listings[0]).sort(), ['code', 'county', 'cropSlug', 'pricePerKgLrd', 'quantityKg', 'status']); assert.ok(!JSON.stringify(s).includes('+231')); assert.ok(!JSON.stringify(s).includes('sellerPhone'));
});

test('End, Home and timeout cannot reopen an old action or repeat its confirmation', () => {
  const p = new Phone(env({...EMPTY_MARKETPLACE, allowed: true})); p.key('send').choose('3').choose('2').choose('4').choose('650').choose('62').choose('2').choose('1').review().choose('1'); const token = p.s.pending!.token; const pending = p.s;
  p.key('end'); assert.equal(p.s.status, 'ended'); assert.equal(finishMarket(p.s, token, {status: 'synced', message: 'Confirmed.'}, p.t).status, 'ended');
  assert.equal(tick(pending, pending.lastActivity + DEFAULT_TIMEOUT_S * 1000).pending, null);
  p.s = finishMarket(pending, token, {status: 'pending', message: 'Queued.'}, p.t); p.key('back'); assert.equal(p.s.frames.at(-1)!.id, 'market.menu'); assert.equal(p.s.pending, null);
});

test('failed owned drafts can be retried without duplicating a listing; unknown ownership is refused', async () => {
  const c = client(); await c.service.load(); await c.service.run(sell()); c.rows[0].status = 'failed'; c.rows[0].lastError = 'Server refused this demo.';
  const p = new Phone(env(c.service.snapshot())); p.key('send').choose('3').choose('3').choose('1').review(); assert.match(p.text(), /Retry my saved draft/); p.choose('1'); assert.equal(p.s.pending?.kind, 'retry'); assert.equal((await c.service.run(p.s.pending!)).status, 'pending'); assert.equal(c.rows.length, 1);
  assert.equal((await c.service.run({kind: 'retry', token: 'not-owned', localId: 'somebody-else'})).status, 'failed');
});

test('unstable requester storage refuses private inquiries rather than losing ownership', async () => {
  const c = client({requesterKey: rand}); await c.service.load(); assert.ok(c.service.snapshot().error); assert.equal(c.service.snapshot().inquiries.length, 0);
});

// URL fixture only: this is never a configured deployment or assertion that the public host serves our app.
const URL_FIXTURE = 'https://openai.com';
test('QR configuration rejects local, placeholder, credential and token-bearing destinations', () => {
  for (const bad of ['', 'http://openai.com', 'https://localhost', 'https://localhost.', 'https://demo.home.arpa', 'https://127.0.0.1', 'https://192.168.0.1', 'https://[::1]', 'https://demo.local', 'https://example.org', 'https://user:password@openai.com', 'https://openai.com?token=secret', 'https://openai.com/#credential', 'https://openai.com:3000', 'https://openai.com/login']) assert.equal(demoDestination(bad).ok, false, bad);
  assert.deepEqual(demoDestination(URL_FIXTURE), {ok: true, url: URL_FIXTURE+'/ussd-demo'});
  const absent = renderToStaticMarkup(React.createElement(DemoQr, {poster: true, configured: ''})); assert.match(absent, /Public demo link needs setup/); assert.ok(!absent.includes('data-testid="qr-code"'));
});

test('QR decodes to the configured /ussd-demo destination and its navigation link matches', () => {
  const target = demoDestination(URL_FIXTURE); assert.ok(target.ok); if (!target.ok) return;
  const matrix = qrMatrix(target.url); const scale = 7, side = (matrix.length + 8) * scale; const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  // Decode pixels rasterized from the actual SVG path, including its quiet zone.
  for (const m of qrPath(matrix).matchAll(/M(\d+),(\d+)h1v1h-1z/g)) for (let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++) {
    const i=((Number(m[2])*scale+dy)*side+Number(m[1])*scale+dx)*4; pixels[i]=pixels[i+1]=pixels[i+2]=0;
  }
  const decoded = jsQR(pixels, side, side); assert.equal(decoded?.data, target.url); assert.ok(qrPath(matrix).startsWith('M'));
  const markup = renderToStaticMarkup(React.createElement(DemoQr, {poster: true, configured: URL_FIXTURE})); assert.ok(markup.includes(`href="${decoded!.data}"`)); assert.ok(markup.includes(QR_TITLE));
});
