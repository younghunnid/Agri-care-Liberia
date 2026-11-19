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
import {CookieJar, getBaseUrl, req} from './harness/http.ts';
import type {Fixtures} from './harness/fixtures.ts';
import {BAND_INFO, BAND_RULE, NO_CONFIDENCE_NOTE, SIMULATED_BANNER, TRIAGE_CASES, caseById, casesForCrop, type TriageBand} from '../src/data/triageCases.ts';
import {ADVICE_CARD_SEED, cardSeedBySlug} from '../src/data/adviceCardsSeed.ts';
import {bandForScore, evaluateTriage} from '../src/lib/triageRules.ts';
import {cardVerification, DEMO_ADVICE_LABEL} from '../src/lib/adviceLabels.ts';
import {MAX_SAVED_CHECKS, createTriageStore, newId, photoProblem, type SavedAssessment} from '../src/lib/triageStore.ts';
import {createTriageSync, payloadFor} from '../src/lib/triageSync.ts';
import {buildEscalationDraft} from '../src/lib/triageEscalation.ts';
import {createAdviceClient, bundledFull, LIST_KEY, cardKey} from '../src/lib/adviceCardsClient.ts';
import {memoryKv} from '../src/lib/kvStore.ts';
import {validateQuestion} from '../src/lib/offlineDrafts.ts';

/**
 * Phase 1A: crop check ("triage") and versioned advice cards. Unit tests for the shared rules and the offline client logic (in-memory storage, fake
 * network), black-box API tests on a disposable in-process backend, and one real-server test for the default rate limits. Synthetic data only.
 */
const root = path.resolve(import.meta.dirname, '..');
let backend: Backend;
let fx: Fixtures;
const tmpDirs: string[] = [];
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const KEY = (s: string) => `${s}-${crypto.createHash('sha256').update(s).digest('hex').slice(0, 40)}`;

before(async () => { backend = await startBackend(); fx = backend.fixtures; });
after(async () => { await backend?.stop(); for (const d of tmpDirs) fs.rmSync(d, {recursive: true, force: true}); });

const adminJarP = (async () => null) as unknown as () => Promise<CookieJar>;
async function trustedLogin(phone: string, password: string): Promise<CookieJar> {
  const jar = new CookieJar();
  jar.set('agri_device', await fx.trustDevice(phone));
  const r = await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password}});
  assert.equal(r.status, 200, `login ${phone}`);
  return jar;
}
let cachedAdmin: Promise<CookieJar> | null = null;
const adminJar = (): Promise<CookieJar> => (cachedAdmin ??= (async () => { await fx.createUser({displayName: 'Triage Admin', phone: '+231775559001', password: 'AdminTestPass!123', roles: ['admin']}); return trustedLogin('+231775559001', 'AdminTestPass!123'); })());
const farmerCache = new Map<string, Promise<CookieJar>>();
const farmerJar = (phone: string): Promise<CookieJar> => { if (!farmerCache.has(phone)) farmerCache.set(phone, (async () => { await fx.createUser({displayName: `Farmer ${phone.slice(-4)}`, phone, password: 'SafePassword123', roles: ['farmer'], county: 'Bong'}); return trustedLogin(phone, 'SafePassword123'); })()); return farmerCache.get(phone)!; };
void adminJarP;

const sorted = <T,>(a: T[]): T[] => [...a].sort();
const RED_ANSWERS: Record<string, Record<string, string>> = {
  'poultry-sudden-deaths': {extent: 'many', spread: 'fast', deaths: 'three-plus'},
};
const answersFor = (caseId: string, pick: (qId: string, opts: string[]) => string): Record<string, string> => Object.fromEntries(caseById(caseId)!.questions.map((q) => [q.id, pick(q.id, q.options.map((o) => o.id))]));
const reportBody = (caseId: string, answers: Record<string, string>, extra: Record<string, unknown> = {}) => ({requesterKey: KEY(`dev-${rand(4)}`), caseId, answers, county: 'Bong', ...extra});

// ====================================================================================================================== 1. rules and content
test('1. six cases (two per crop) and the point rule: every answer combination gives the documented band', () => {
  assert.equal(TRIAGE_CASES.length, 6);
  for (const crop of ['cassava', 'rice', 'poultry'] as const) assert.equal(casesForCrop(crop).length, 2, crop);
  assert.equal(new Set(TRIAGE_CASES.map((c) => c.id)).size, 6);
  assert.deepEqual(BAND_RULE, {yellowAt: 2, redAt: 4});
  let combos = 0;
  for (const c of TRIAGE_CASES) {
    const qs = c.questions;
    const walk = (i: number, picked: Record<string, string>, score: number, urgent: boolean): void => {
      if (i === qs.length) {
        combos++;
        const r = evaluateTriage(c.id, picked);
        assert.ok(r.ok);
        const expected: TriageBand = urgent || score >= 4 ? 'red' : score >= 2 || c.minBand === 'yellow' ? 'yellow' : 'green';
        assert.equal((r as {band: TriageBand}).band, expected, `${c.id} ${JSON.stringify(picked)} score ${score}`);
        assert.equal((r as {score: number}).score, score);
        return;
      }
      for (const o of qs[i].options) walk(i + 1, {...picked, [qs[i].id]: o.id}, score + o.points, urgent || o.urgent === true);
    };
    walk(0, {}, 0, false);
  }
  assert.equal(combos, 6 * 27);
  // boundaries and special rules
  assert.equal(bandForScore(1, false), 'green'); assert.equal(bandForScore(2, false), 'yellow'); assert.equal(bandForScore(3, false), 'yellow'); assert.equal(bandForScore(4, false), 'red');
  assert.equal(bandForScore(0, true), 'red', 'an urgent answer is always red'); assert.equal(bandForScore(0, false, 'yellow'), 'yellow', 'minimum band');
  const calm = evaluateTriage('poultry-sudden-deaths', {extent: 'few', spread: 'same', deaths: 'none'});
  assert.ok(calm.ok && calm.band === 'yellow', 'sick or dead birds are never just "watch"');
  const urgent = evaluateTriage('poultry-sudden-deaths', RED_ANSWERS['poultry-sudden-deaths']);
  assert.ok(urgent.ok && urgent.band === 'red' && urgent.urgent);
  const worst = evaluateTriage('poultry-sudden-deaths', {extent: 'few', spread: 'same', deaths: 'three-plus'});
  assert.ok(worst.ok && worst.band === 'red', 'three or more deaths is red even when everything else is calm');
});

test('2. the rule engine refuses anything that is not exactly one valid answer per question', () => {
  const ok = {extent: 'few', spread: 'same', insects: 'no'};
  assert.ok(evaluateTriage('cassava-patchy-young-leaves', ok).ok);
  for (const [id, a] of [
    ['nope', ok], [undefined, ok], [42, ok], ['cassava-patchy-young-leaves', null], ['cassava-patchy-young-leaves', 'x'], ['cassava-patchy-young-leaves', []],
    ['cassava-patchy-young-leaves', {extent: 'few', spread: 'same'}], ['cassava-patchy-young-leaves', {...ok, extra: 'few'}], ['cassava-patchy-young-leaves', {...ok, insects: 'maybe'}],
    ['cassava-patchy-young-leaves', {...ok, insects: 3}], ['cassava-patchy-young-leaves', {extent: 'few', spread: 'same', insects: 'no', __proto__x: 1}],
  ] as [unknown, unknown][]) assert.equal(evaluateTriage(id, a).ok, false, JSON.stringify([id, a]));
});

test('3. cases and cards: every case has a card, codes are unique, nothing is seeded as verified, and the wording makes no AI or medicine claims', () => {
  assert.equal(ADVICE_CARD_SEED.length, 6);
  assert.equal(new Set(ADVICE_CARD_SEED.map((c) => c.code)).size, 6); assert.equal(new Set(ADVICE_CARD_SEED.map((c) => c.slug)).size, 6);
  for (const c of ADVICE_CARD_SEED) assert.match(c.code, /^ADV-\d{4}-\d{3}$/);
  for (const c of TRIAGE_CASES) assert.ok(cardSeedBySlug(c.cardSlug), `card for ${c.id}`);
  const all = ADVICE_CARD_SEED.map((c) => [c.title, c.summary, ...c.steps, c.askWhen, c.sourceNote].join(' ')).join('\n');
  assert.ok(!/\b\d+\s?(ml|mg|g|kg|litres?|liters?|tablets?)\b/i.test(all), 'no doses or amounts');
  assert.ok(!/spray|pesticide|fungicide|insecticide|herbicide|antibiotic|vaccin|inject|cure\b|cures\b/i.test(all.replace(/Team 8 does not prescribe poultry medicines\./g, '')), 'no treatment, product or cure claims');
  assert.ok(!/\bAI\b|artificial intelligence|machine learning|neural|confidence|% (accurate|sure)/i.test(all + JSON.stringify(TRIAGE_CASES)), 'no AI or accuracy claims in the content');
  assert.match(SIMULATED_BANNER, /not a diagnosis/i); assert.match(SIMULATED_BANNER, /No computer program has analysed your photo/);
  assert.match(NO_CONFIDENCE_NOTE, /No confidence percentage is shown/);
  for (const b of ['green', 'yellow', 'red'] as const) assert.ok(BAND_INFO[b].label.length > 5 && BAND_INFO[b].actions.length >= 2);
  assert.match(BAND_INFO.red.actions.join(' '), /TODAY/); assert.match(BAND_INFO.red.actions.join(' '), /Do not use any chemical or medicine/);
  // the screens never call the result a diagnosis, an AI result or a confirmed finding
  const page = fs.readFileSync(path.join(root, 'src/pages/public/CropCheckPage.tsx'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/\bAI\b|artificial|machine learning|detected|detects|analysed by|% confident|confidence score/i.test(page.replace(/No computer program has analysed|not analysed by any computer program|NO_CONFIDENCE_NOTE/g, '')), 'the page makes no AI claim');
  assert.match(page, /SIMULATED_BANNER/); assert.match(page, /not analysed by any computer program/); assert.match(page, /It will not contain your phone number/);
});

test('4. verification labels: only a named reviewer, organisation and date make a card "reviewed"; everything else says NOT reviewed', () => {
  const demo = cardVerification({level: 'demo_sample'});
  assert.equal(demo.reviewed, false); assert.equal(demo.badge, DEMO_ADVICE_LABEL);
  for (const level of ['team_draft', 'pending_review']) { const v = cardVerification({level}); assert.equal(v.reviewed, false); assert.match(v.badge, /NOT/); }
  assert.equal(cardVerification({level: 'verified'}).reviewed, false, 'verified without a reviewer is not shown as reviewed');
  assert.equal(cardVerification({level: 'verified', reviewerName: 'Dr Grace Kollie', reviewerOrg: 'Independent Review Panel'}).reviewed, false, 'no date, not reviewed');
  assert.equal(cardVerification({level: 'verified', reviewerName: 'Sample Demo Reviewer', reviewerOrg: 'Independent Review Panel', reviewedAt: '2026-01-01'}).reviewed, false, 'a placeholder reviewer never counts');
  assert.equal(cardVerification({level: 'verified', reviewerName: 'Dr Grace Kollie', reviewerOrg: 'Demo Org', reviewedAt: '2026-01-01'}).reviewed, false, 'a placeholder organisation never counts');
  const real = cardVerification({level: 'verified', reviewerName: 'Dr Grace Kollie', reviewerOrg: 'Independent Review Panel', reviewedAt: '2026-01-01'});
  assert.equal(real.reviewed, true); assert.match(real.badge, /Reviewed by Dr Grace Kollie, Independent Review Panel, on 2026-01-01/);
  assert.equal(cardVerification({level: 'something-else'}).reviewed, false);
});

// ====================================================================================================================== 2. client storage
const sample = (over: Partial<SavedAssessment> = {}): SavedAssessment => ({
  id: newId(), opId: newId(), caseId: 'poultry-sudden-deaths', crop: 'poultry', county: 'Bong', answers: RED_ANSWERS['poultry-sudden-deaths'], score: 5, band: 'red', cardSlug: 'poultry-sudden-deaths',
  adviceCode: 'ADV-2026-006', adviceVersion: 1, adviceLevel: 'demo_sample', createdAt: new Date().toISOString(), share: true, escalated: false, sync: {status: 'pending', attempts: 0, nextAttemptAt: 0}, ...over,
});
const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(2000);

test('5. saved checks live on the phone: save, list, update, remove; photos are validated and capped; unsent checks are never dropped silently', async () => {
  const store = createTriageStore(memoryKv());
  const a = sample({photo: {dataUrl: JPEG, addedAt: new Date().toISOString()}, createdAt: '2026-01-01T00:00:00.000Z'});
  await store.save(a);
  assert.equal((await store.list()).length, 1); assert.equal((await store.get(a.id))!.photo!.dataUrl, JPEG);
  await store.update(a.id, (x) => ({...x, escalated: true})); assert.equal((await store.get(a.id))!.escalated, true);
  await store.remove(a.id); assert.equal((await store.list()).length, 0);
  assert.equal(photoProblem(JPEG), null);
  for (const bad of ['', 'data:text/html;base64,AAAA', 'http://x/y.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(700_000), 'data:image/jpeg;base64,<script>']) assert.ok(photoProblem(bad), bad.slice(0, 30));
  await assert.rejects(() => store.save(sample({photo: {dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(700_000), addedAt: ''}})), /too large/);
  // capacity: old SYNCED checks make room; when 30 are all waiting to be sent, a 31st is refused rather than losing one
  const full = createTriageStore(memoryKv());
  for (let i = 0; i < MAX_SAVED_CHECKS; i++) await full.save(sample({createdAt: new Date(2026, 0, 1, 0, i).toISOString(), share: false, sync: {status: 'local', attempts: 0, nextAttemptAt: 0}}));
  await full.save(sample({createdAt: new Date(2026, 0, 2).toISOString()}));
  assert.equal((await full.list()).length, MAX_SAVED_CHECKS, 'the oldest local-only check made room');
  const pend = createTriageStore(memoryKv());
  for (let i = 0; i < MAX_SAVED_CHECKS; i++) await pend.save(sample({createdAt: new Date(2026, 0, 1, 0, i).toISOString()}));
  await assert.rejects(() => pend.save(sample()), /waiting to be sent/);
  assert.equal((await pend.list()).length, MAX_SAVED_CHECKS);
});

// ====================================================================================================================== 3. offline sync logic
interface FakeServer {reports: Map<string, any>; sends: {opId: string; payload: any}[]; behave: (opId: string, n: number) => 'ok' | 'offline' | 'lost-response' | {status: number; retryAfterMs?: number | null}}
function fakeServer(behave: FakeServer['behave']): FakeServer & {send: (p: Record<string, unknown>, opId: string) => Promise<{status: number; body: any}>} {
  const s: FakeServer = {reports: new Map(), sends: [], behave};
  let calls = 0;
  return {...s, reports: s.reports, sends: s.sends, behave, async send(payload, opId) {
    s.sends.push({opId, payload}); calls++;
    const how = behave(opId, calls);
    if (how === 'offline') throw new TypeError('network down');
    if (typeof how === 'object') throw {status: how.status, retryAfterMs: how.retryAfterMs ?? null, message: 'server said no'};
    const existing = s.reports.get(opId);
    if (!existing) s.reports.set(opId, {ref: `TRG-2026-${String(s.reports.size + 1).padStart(6, '0')}`, band: 'red'});
    if (how === 'lost-response') throw new TypeError('connection dropped after the server answered');
    const r = s.reports.get(opId);
    return {status: 201, body: {report: r, receipt: {status: 'APPLIED', serverTime: new Date().toISOString()}, ...(existing ? {replayed: true} : {})}};
  }};
}
const mkSync = (srv: ReturnType<typeof fakeServer>, clock: {t: number}, kv = memoryKv()) => {
  const store = createTriageStore(kv);
  return {store, sync: createTriageSync({store, send: srv.send, requesterKey: () => KEY('device'), now: () => clock.t, random: () => 0})};
};

test('6. offline creation, then reconnect: the check is queued with the SAME key, sent once, and shows a receipt; the photo and the check are untouched', async () => {
  const clock = {t: 1_000_000};
  let online = false;
  const srv = fakeServer(() => (online ? 'ok' : 'offline'));
  const {store, sync} = mkSync(srv, clock);
  const a = sample({photo: {dataUrl: JPEG, addedAt: ''}});
  await store.save(a);
  const r1 = await sync.sync();
  assert.equal(r1.stoppedOffline, true); assert.equal(srv.reports.size, 0);
  let cur = (await store.get(a.id))!;
  assert.equal(cur.sync.status, 'pending'); assert.equal(cur.sync.attempts, 1); assert.equal(cur.sync.nextAttemptAt, clock.t + 5000); assert.ok(cur.photo && cur.answers.deaths === 'three-plus', 'nothing lost while offline');
  assert.equal((await sync.sync()).attempted, 0, 'not retried before its time (no hammering)');
  clock.t += 6000; online = true;
  const r2 = await sync.sync();
  assert.equal(r2.succeeded, 1); cur = (await store.get(a.id))!;
  assert.equal(cur.sync.status, 'synced'); assert.equal(cur.sync.receipt!.status, 'APPLIED'); assert.match(cur.sync.receipt!.ref, /^TRG-/);
  assert.equal(new Set(srv.sends.map((s) => s.opId)).size, 1, 'every attempt used the same Idempotency-Key'); assert.equal(srv.sends[0].opId, a.opId);
  assert.equal(srv.reports.size, 1);
  assert.equal((await sync.sync()).attempted, 0, 'a synced check is never sent again');
});

test('7. a lost response never creates a second report: the retry is answered as a DUPLICATE receipt', async () => {
  const clock = {t: 0};
  const srv = fakeServer((_k, n) => (n === 1 ? 'lost-response' : 'ok'));
  const {store, sync} = mkSync(srv, clock);
  const a = sample(); await store.save(a);
  assert.equal((await sync.sync()).stoppedOffline, true);
  assert.equal(srv.reports.size, 1, 'the server DID apply the first request');
  clock.t += 10_000;
  assert.equal((await sync.sync()).succeeded, 1);
  const cur = (await store.get(a.id))!;
  assert.equal(cur.sync.receipt!.status, 'DUPLICATE'); assert.equal(srv.reports.size, 1, 'still exactly one report');
});

test('8. Retry-After is honoured even beyond the normal back-off; being told to wait is not a failure; after 12 waits the farmer decides', async () => {
  const clock = {t: 5_000_000};
  const srv = fakeServer(() => ({status: 429, retryAfterMs: 900_000}));
  const {store, sync} = mkSync(srv, clock);
  const a = sample(); await store.save(a);
  await sync.sync();
  let cur = (await store.get(a.id))!;
  assert.equal(cur.sync.status, 'pending'); assert.equal(cur.sync.nextAttemptAt, clock.t + 900_000, '15 minutes, not the 5-minute cap'); assert.match(cur.sync.lastError!, /asked us to wait/);
  clock.t += 899_000; assert.equal((await sync.sync()).attempted, 0, 'still waiting 1 s early');
  for (let i = 1; i < 12; i++) { clock.t += 901_000; await sync.sync(); }
  cur = (await store.get(a.id))!;
  assert.equal(cur.sync.status, 'failed', 'after 12 server-directed waits the item is handed back to the farmer'); assert.ok(cur.answers && cur.photo === undefined || cur.answers, 'the check itself is intact');
  // a later success (the limit lifted) with "Try again" uses the same key and creates one report
  const ok = fakeServer(() => 'ok');
  const again = createTriageSync({store, send: ok.send, requesterKey: () => KEY('device'), now: () => clock.t, random: () => 0});
  assert.equal((await again.sync({manual: true})).succeeded, 1); assert.equal(ok.sends[0].opId, a.opId); assert.equal(ok.reports.size, 1);
});

test('9. rejected reports stop retrying and keep the check; only shared checks are sent; the payload carries no photo, name or phone; runs do not overlap', async () => {
  const clock = {t: 0};
  const srv = fakeServer(() => ({status: 400}));
  const {store, sync} = mkSync(srv, clock);
  const a = sample({photo: {dataUrl: JPEG, addedAt: ''}}); const local = sample({share: false, sync: {status: 'local', attempts: 0, nextAttemptAt: 0}});
  await store.save(a); await store.save(local);
  const r = await sync.sync();
  assert.equal(r.failed, 1); assert.equal(srv.sends.length, 1, 'the unshared check was never sent');
  const cur = (await store.get(a.id))!; assert.equal(cur.sync.status, 'failed'); assert.equal(cur.sync.attempts, 1); assert.ok(cur.photo, 'the check and photo are kept');
  assert.equal((await sync.sync()).attempted, 0, 'a rejected check is not retried automatically');
  const p = payloadFor(a, KEY('device'));
  assert.deepEqual(sorted(Object.keys(p)), sorted(['requesterKey', 'caseId', 'answers', 'county', 'capturedAt', 'escalated']));
  assert.ok(!JSON.stringify(p).includes('data:image'), 'no photo in the payload');
  // two overlapping calls share one run
  const slow = fakeServer(() => 'ok'); let release!: () => void; const gate = new Promise<void>((res) => { release = res; });
  const {store: s2, sync: sync2} = (() => { const st = createTriageStore(memoryKv()); return {store: st, sync: createTriageSync({store: st, send: async (pl, id) => { await gate; return slow.send(pl, id); }, requesterKey: () => 'k', now: () => 0, random: () => 0})}; })();
  await s2.save(sample());
  const p1 = sync2.sync(), p2 = sync2.sync(); release(); await Promise.all([p1, p2]);
  assert.equal(slow.sends.length, 1, 'concurrent calls ran once');
});

// ====================================================================================================================== 4. advice client offline
test('10. advice cards open online, from the saved copy, or from the bundled demonstration copy; a missing card is a clear "not found"', async () => {
  const kv = memoryKv(); const clock = {t: Date.UTC(2026, 10, 1)};
  const server = {up: true, cards: ADVICE_CARD_SEED.map((c) => ({...bundledFull(c), version: 2}))};
  const get = async <T,>(p: string): Promise<T> => {
    if (!server.up) throw new TypeError('offline');
    if (p === '/advice-cards') return {cards: server.cards} as T;
    const ref = decodeURIComponent(p.replace('/advice-cards/', ''));
    const c = server.cards.find((x) => x.code === ref || x.slug === ref);
    if (!c) throw Object.assign(new Error('nope'), {status: 404});
    return {card: c} as T;
  };
  const client = createAdviceClient({get, kv, now: () => clock.t});
  const l1 = await client.listCards(); assert.equal(l1.source, 'server'); assert.equal(l1.data.length, 6);
  const c1 = await client.getCard('ADV-2026-001'); assert.equal(c1!.source, 'server'); assert.equal(c1!.data.version, 2);
  assert.equal(await client.prefetchAll(l1.data), 6);
  server.up = false;
  const l2 = await client.listCards(); assert.equal(l2.source, 'saved'); assert.ok(l2.savedAt);
  const c2 = await client.getCard('cassava-patchy-young-leaves'); assert.equal(c2!.source, 'saved'); assert.equal(c2!.data.version, 2, 'the saved copy, not the bundled one');
  // a phone that never saved anything still opens the six cards (bundled version 1, still labelled demonstration)
  const fresh = createAdviceClient({get, kv: memoryKv()});
  const l3 = await fresh.listCards(); assert.equal(l3.source, 'bundled'); assert.equal(l3.data.length, 6); assert.ok(l3.data.every((c) => !c.verification.reviewed));
  const c3 = await fresh.getCard('ADV-2026-004'); assert.equal(c3!.source, 'bundled'); assert.equal(c3!.data.version, 1); assert.ok(c3!.data.steps.length >= 3); assert.equal(c3!.data.verification.reviewed, false);
  assert.equal(await fresh.getCard('ADV-2099-999'), null, 'unknown card offline');
  server.up = true; assert.equal(await client.getCard('ADV-2099-999'), null, 'the server answered 404: no such card');
  assert.ok(await kv.get(LIST_KEY)); assert.ok(await kv.get(cardKey('ADV-2026-001')));
});

// ====================================================================================================================== 5. escalation
test('11. asking an officer: what leaves the phone is explicit (no phone number; the photo only with its own consent)', () => {
  const a = sample({photo: {dataUrl: JPEG, addedAt: ''}, caseId: 'cassava-patchy-young-leaves', crop: 'cassava', answers: {extent: 'many', spread: 'fast', insects: 'yes'}, band: 'red', adviceCode: 'ADV-2026-001'});
  const noPhoto = buildEscalationDraft(a, {sendPhoto: false});
  assert.equal(noPhoto.photoDataUrl, '', 'photo stays on the phone unless sent on purpose');
  const withPhoto = buildEscalationDraft(a, {sendPhoto: true, farmerName: '  Synthetic Farmer  '});
  assert.equal(withPhoto.photoDataUrl, JPEG); assert.equal(withPhoto.farmerName, 'Synthetic Farmer');
  assert.equal(buildEscalationDraft(sample({photo: undefined}), {sendPhoto: true}).photoDataUrl, '');
  for (const d of [noPhoto, withPhoto]) {
    assert.equal(validateQuestion(d), null, 'passes the existing expert-question validation');
    assert.ok(!/\+?231\d|\b0?[2-9]\d{8,9}\b|tel:|phone number|\d{7,}/i.test(`${d.title} ${d.description} ${d.farmerName}`), 'no phone number or long digit string');
    assert.match(d.description, /simulated, not a diagnosis/); assert.match(d.description, /ADV-2026-001 version 1 \(demonstration advice, not reviewed\)/); assert.match(d.description, /RED: urgent/);
    assert.equal(d.county, 'Bong'); assert.equal(d.category, 'Cassava'); assert.equal(d.voiceNoteDataUrl, '');
  }
  assert.equal(buildEscalationDraft(a, {sendPhoto: false}).farmerName, 'Farmer (crop check)');
});

// ====================================================================================================================== 6. API: cards
test('12. cards API: six demonstration cards, codes, versions, history; nothing is verified; unknown or malformed codes look identical', async () => {
  const jar = new CookieJar();
  const list = await req(jar, '/api/v1/advice-cards');
  assert.equal(list.status, 200); assert.equal(list.data.cards.length, 6);
  assert.deepEqual(list.data.cards.map((c: {code: string}) => c.code), ['ADV-2026-001', 'ADV-2026-002', 'ADV-2026-003', 'ADV-2026-004', 'ADV-2026-005', 'ADV-2026-006']);
  assert.ok(list.data.cards.every((c: any) => c.verification.level === 'demo_sample' && c.verification.reviewed === false && c.version === 1));
  assert.ok(!/reviewer/i.test(JSON.stringify(list.data.cards.map((c: any) => Object.keys(c.verification)))), 'no reviewer details for unreviewed cards');
  assert.equal((await req(jar, '/api/v1/advice-cards?crop=rice')).data.cards.length, 2);
  const one = await req(jar, '/api/v1/advice-cards/ADV-2026-003');
  assert.equal(one.data.card.slug, 'rice-brown-leaf-spots'); assert.equal(one.data.card.versions.length, 1); assert.ok(one.data.card.steps.length >= 3);
  assert.equal((await req(jar, '/api/v1/advice-cards/rice-brown-leaf-spots')).data.card.code, 'ADV-2026-003');
  assert.equal((await req(jar, '/api/v1/advice-cards/adv-2026-003')).status, 200, 'codes are case-insensitive');
  assert.equal((await req(jar, '/api/v1/advice-cards/ADV-2026-003/versions/1')).data.card.isCurrent, true);
  for (const bad of ['/api/v1/advice-cards/ADV-2099-999', '/api/v1/advice-cards/ADV-2026-003/versions/9', '/api/v1/advice-cards/ADV-2026-003/versions/x']) assert.equal((await req(jar, bad)).status, 404, bad);
  const ok = await req(jar, '/api/v1/advice/verify/ADV-2026-002');
  assert.equal(ok.status, 200); assert.equal(ok.data.found, true); assert.equal(ok.data.verification.reviewed, false); assert.equal(ok.data.version, 1);
  const bodies = new Set<string>();
  for (const code of ['ADV-2099-999', 'nonsense', 'ADV-26-1', "ADV-2026-001'; DROP TABLE advice_cards;--", '../../etc/passwd', 'ADV-2026-0010000']) { const r = await req(jar, `/api/v1/advice/verify/${encodeURIComponent(code)}`); assert.equal(r.status, 404, code); bodies.add(JSON.stringify(r.data)); }
  assert.equal(bodies.size, 1, 'one identical answer for every unknown or malformed code');
  const db = new DatabaseSync(process.env.DB_PATH!, {readOnly: true});
  try { assert.equal((db.prepare("SELECT COUNT(*) c FROM advice_card_versions WHERE verification_level = 'verified'").get() as {c: number}).c, 0, 'the seed never verifies anything'); } finally { db.close(); }
});

test('13. versions are immutable; an administrator can add a version (never edit one); a new version starts as a team draft', async () => {
  const jar = new CookieJar(); const admin = await adminJar();
  const body = {title: 'Cassava with patchy leaves: updated first steps', summary: 'An updated summary for the demonstration card, longer than ten characters.', steps: ['Check the plants every morning this week.', 'Keep knives clean between plots.'], askWhen: 'Ask an officer if many plants are affected.', sourceNote: 'Team 8 test edit (disposable database).', changeNote: 'Shortened the steps'};
  assert.equal((await req(jar, '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body})).status, 401);
  assert.equal((await req(await farmerJar('+231775559101'), '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body})).status, 403);
  assert.equal((await req(admin, '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body, skipCsrf: true})).status, 403, 'CSRF protected');
  const v1 = (await req(jar, '/api/v1/advice-cards/ADV-2026-001/versions/1')).data.card;
  const made = await req(admin, '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body});
  assert.equal(made.status, 201); assert.equal(made.data.card.version, 2); assert.equal(made.data.card.currentVersion, 2);
  assert.equal(made.data.card.verification.level, 'team_draft'); assert.equal(made.data.card.verification.reviewed, false); assert.equal(made.data.card.versions.length, 2);
  assert.deepEqual((await req(jar, '/api/v1/advice-cards/ADV-2026-001/versions/1')).data.card.steps, v1.steps, 'version 1 is unchanged');
  assert.equal((await req(jar, '/api/v1/advice-cards/ADV-2026-001')).data.card.version, 2);
  assert.equal((await req(admin, '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body})).status, 409, 'identical content is not a new version');
  for (const bad of [{...body, title: 'abc'}, {...body, steps: []}, {...body, steps: Array(9).fill('A valid step text.')}, {...body, steps: ['x']}, {...body, changeNote: ''}, {...body, askWhen: 'no'}, {...body, summary: 'x'.repeat(601)}, {...body, steps: 'not an array'}]) assert.equal((await req(admin, '/api/v1/admin/advice-cards/ADV-2026-001/versions', {method: 'POST', body: bad})).status, 400);
  assert.equal((await req(admin, '/api/v1/admin/advice-cards/ADV-2099-999/versions', {method: 'POST', body})).status, 404);
  // the database itself refuses to overwrite a version
  const {getDb} = await import('../server/db.ts');
  assert.throws(() => getDb().prepare("UPDATE advice_card_versions SET title = 'Silently changed' WHERE version = 1").run(), /immutable/);
  assert.throws(() => getDb().prepare("UPDATE advice_card_versions SET steps_json = '[]' WHERE version = 1").run(), /immutable/);
  assert.throws(() => getDb().prepare("UPDATE advice_card_versions SET verification_level = 'verified' WHERE version = 1").run(), /constraint|CHECK/i, 'verified without a reviewer is impossible even by direct SQL');
});

test('14. only a named, non-placeholder reviewer with an explicit attestation can verify a card, and a later change does not inherit the review', async () => {
  const jar = new CookieJar(); const admin = await adminJar(); const url = '/api/v1/admin/advice-cards/ADV-2026-002/review';
  const good = {decision: 'verified', reviewerName: 'Dr Grace Kollie', reviewerOrg: 'Independent Review Panel', reviewerNote: 'Checked against the extension manual.', attestation: true};
  assert.equal((await req(jar, url, {method: 'POST', body: good})).status, 401);
  assert.equal((await req(await farmerJar('+231775559102'), url, {method: 'POST', body: good})).status, 403);
  for (const [bad, status, code] of [
    [{...good, attestation: undefined}, 400, 'ATTESTATION_REQUIRED'], [{...good, attestation: 'yes'}, 400, 'ATTESTATION_REQUIRED'], [{...good, reviewerName: 'ab'}, 400, 'VALIDATION_ERROR'],
    [{...good, reviewerOrg: ''}, 400, 'VALIDATION_ERROR'], [{...good, reviewerName: 'Sample Demo Reviewer (Unverified Demonstration)'}, 422, 'PLACEHOLDER_REVIEWER'], [{...good, reviewerName: 'Test Agronomist'}, 422, 'PLACEHOLDER_REVIEWER'],
    [{...good, reviewerOrg: 'Demo Organisation'}, 422, 'PLACEHOLDER_REVIEWER'], [{...good, decision: 'approved'}, 400, 'VALIDATION_ERROR'], [{...good, version: 7}, 400, 'VALIDATION_ERROR'],
  ] as [Record<string, unknown>, number, string][]) { const r = await req(admin, url, {method: 'POST', body: bad}); assert.equal(r.status, status, JSON.stringify(bad)); assert.equal(r.data.error.code, code); }
  assert.equal((await req(jar, '/api/v1/advice-cards/ADV-2026-002')).data.card.verification.reviewed, false, 'every refusal left the card unreviewed');
  const done = await req(admin, url, {method: 'POST', body: good});
  assert.equal(done.status, 200); const v = done.data.card.verification;
  assert.equal(v.level, 'verified'); assert.equal(v.reviewed, true); assert.equal(v.reviewerName, 'Dr Grace Kollie'); assert.equal(v.reviewerOrg, 'Independent Review Panel'); assert.match(v.reviewedAt, /^\d{4}-\d{2}-\d{2}$/); assert.match(v.badge, /^Reviewed by Dr Grace Kollie/);
  assert.equal((await req(jar, '/api/v1/advice/verify/ADV-2026-002')).data.verification.reviewed, true);
  // a content change is a NEW version and is NOT reviewed
  const next = await req(admin, '/api/v1/admin/advice-cards/ADV-2026-002/versions', {method: 'POST', body: {title: 'Cassava with yellow lower leaves: revised', summary: 'A revised summary that is long enough to be valid.', steps: ['Look at the whole plot weekly.', 'Add compost to tired plots.'], askWhen: 'Ask an officer if yellowing climbs.', sourceNote: 'disposable', changeNote: 'Revised wording'}});
  assert.equal(next.status, 201); assert.equal(next.data.card.verification.reviewed, false); assert.equal(next.data.card.verification.level, 'team_draft');
  const hist = next.data.card.versions; assert.equal(hist.find((x: any) => x.version === 1).verification.reviewed, true, 'the earlier version keeps its own review in the history'); assert.equal(hist.find((x: any) => x.version === 2).verification.reviewed, false);
  // demote
  assert.equal((await req(admin, url, {method: 'POST', body: {decision: 'team_draft', version: 1}})).status, 200);
  assert.equal((await req(jar, '/api/v1/advice-cards/ADV-2026-002/versions/1')).data.card.verification.reviewed, false); assert.ok(!('reviewerName' in (await req(jar, '/api/v1/advice-cards/ADV-2026-002/versions/1')).data.card.verification));
});

// ====================================================================================================================== 7. API: reports
test('15. crop-check reports: the server decides the band, stores no personal data, and replays a retry instead of duplicating it', async () => {
  const jar = new CookieJar(); const key = crypto.randomUUID();
  const red = reportBody('poultry-sudden-deaths', RED_ANSWERS['poultry-sudden-deaths'], {band: 'green', score: 0, adviceCode: 'ADV-9999-999', is_simulated: 0});
  const a = await req(jar, '/api/v1/triage/reports', {method: 'POST', body: red, headers: {'Idempotency-Key': key}});
  assert.equal(a.status, 201); assert.equal(a.data.report.band, 'red', 'a client cannot choose its band'); assert.equal(a.data.report.adviceCode, 'ADV-2026-006'); assert.equal(a.data.report.simulated, true);
  assert.match(a.data.report.ref, /^TRG-\d{4}-\d{6}$/); assert.equal(a.data.receipt.status, 'APPLIED'); assert.equal(a.data.receipt.opId, key); assert.match(a.data.receipt.note, /Not a diagnosis/);
  const b = await req(jar, '/api/v1/triage/reports', {method: 'POST', body: red, headers: {'Idempotency-Key': key}});
  assert.equal(b.status, 201); assert.equal(b.data.replayed, true); assert.equal(b.data.report.ref, a.data.report.ref); assert.equal(b.headers.get('idempotent-replay'), 'true');
  const {getDb} = await import('../server/db.ts'); const db = getDb();
  assert.equal((db.prepare('SELECT COUNT(*) c FROM triage_reports WHERE report_ref = ?').get(a.data.report.ref) as {c: number}).c, 1, 'one row for two sends');
  const cols = (db.prepare('PRAGMA table_info(triage_reports)').all() as {name: string}[]).map((c) => c.name);
  for (const forbidden of ['photo', 'image', 'phone', 'name', 'email', 'description', 'notes', 'audio']) assert.ok(!cols.some((c) => c.includes(forbidden)), `triage_reports has no ${forbidden} column`);
  const row = db.prepare('SELECT * FROM triage_reports WHERE report_ref = ?').get(a.data.report.ref) as any;
  assert.equal(row.band, 'red'); assert.equal(row.is_simulated, 1); assert.equal(row.user_id, null); assert.ok(row.requester_key_hash && row.requester_key_hash !== red.requesterKey && !JSON.stringify(row).includes(red.requesterKey), 'the device key is stored only as a keyed hash');
  assert.throws(() => db.prepare("INSERT INTO triage_reports (report_ref, case_id, crop, county, answers_json, score, band, advice_code, advice_version, is_simulated) VALUES ('X','c','c','Bong','{}',1,'green','A',1,0)").run(), /constraint|CHECK/i, 'a report can never be stored as non-simulated');
  // a signed-in farmer needs no device key; an anonymous caller without one is refused
  const farmer = await farmerJar('+231775559103');
  assert.equal((await req(farmer, '/api/v1/triage/reports', {method: 'POST', body: {caseId: 'rice-water-too-deep', answers: answersFor('rice-water-too-deep', (_q, o) => o[0]), county: 'Nimba'}})).status, 201);
  assert.equal((await req(new CookieJar(), '/api/v1/triage/reports', {method: 'POST', body: {caseId: 'rice-water-too-deep', answers: answersFor('rice-water-too-deep', (_q, o) => o[0]), county: 'Nimba'}})).status, 400);
});

test('16. crop-check reports: strict validation, and photos, names, phone numbers and free text are refused', async () => {
  const jar = new CookieJar(); const ans = answersFor('cassava-yellow-old-leaves', (_q, o) => o[0]);
  const post = (body: unknown, headers: Record<string, string> = {}) => req(jar, '/api/v1/triage/reports', {method: 'POST', body, headers});
  const before = (await import('../server/db.ts')).getDb().prepare('SELECT COUNT(*) c FROM triage_reports').get() as {c: number};
  for (const [body, code] of [
    [reportBody('nope', ans), 'VALIDATION_ERROR'], [reportBody('cassava-yellow-old-leaves', {}), 'VALIDATION_ERROR'], [reportBody('cassava-yellow-old-leaves', {...ans, extra: 'x'}), 'VALIDATION_ERROR'],
    [reportBody('cassava-yellow-old-leaves', {...ans, top: 'purple'}), 'VALIDATION_ERROR'], [reportBody('cassava-yellow-old-leaves', ans, {county: 'Atlantis'}), 'VALIDATION_ERROR'], [reportBody('cassava-yellow-old-leaves', ans, {county: undefined}), 'VALIDATION_ERROR'],
    [reportBody('cassava-yellow-old-leaves', ans, {capturedAt: 'yesterday-ish'}), 'VALIDATION_ERROR'], [{...reportBody('cassava-yellow-old-leaves', ans), requesterKey: 'short'}, 'VALIDATION_ERROR'],
    [reportBody('cassava-yellow-old-leaves', ans, {photoDataUrl: 'data:image/jpeg;base64,AAAA'}), 'FIELD_NOT_ACCEPTED'], [reportBody('cassava-yellow-old-leaves', ans, {phone: '+231770000001'}), 'FIELD_NOT_ACCEPTED'],
    [reportBody('cassava-yellow-old-leaves', ans, {description: 'free text with my village'}), 'FIELD_NOT_ACCEPTED'], [reportBody('cassava-yellow-old-leaves', ans, {farmerName: 'Real Person'}), 'FIELD_NOT_ACCEPTED'], [reportBody('cassava-yellow-old-leaves', ans, {email: 'a@b.co'}), 'FIELD_NOT_ACCEPTED'],
  ] as [unknown, string][]) { const r = await post(body); assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80)); assert.equal(r.data.error.code, code); }
  assert.equal(((await import('../server/db.ts')).getDb().prepare('SELECT COUNT(*) c FROM triage_reports').get() as {c: number}).c, before.c, 'nothing was stored for any refused report');
  // capturedAt: accepted when recent, stored as null (not trusted) when outside the allowed window
  const recent = await post(reportBody('cassava-yellow-old-leaves', ans, {capturedAt: new Date(Date.now() - 3_600_000).toISOString()}));
  const ancient = await post(reportBody('cassava-yellow-old-leaves', ans, {capturedAt: '2001-01-01T00:00:00Z'}));
  const {getDb} = await import('../server/db.ts');
  assert.ok((getDb().prepare('SELECT captured_at FROM triage_reports WHERE report_ref = ?').get(recent.data.report.ref) as any).captured_at);
  assert.equal((getDb().prepare('SELECT captured_at FROM triage_reports WHERE report_ref = ?').get(ancient.data.report.ref) as any).captured_at, null);
  assert.equal((await req(jar, '/api/v1/triage/reports', {method: 'POST', body: reportBody('cassava-yellow-old-leaves', ans), skipCsrf: true})).status, 403, 'CSRF protected');
});

test('17. people see only their own reports', async () => {
  const kA = KEY('owner-a'), kB = KEY('owner-b'); const ans = answersFor('rice-brown-leaf-spots', (_q, o) => o[1]);
  const mk = (key: string) => req(new CookieJar(), '/api/v1/triage/reports', {method: 'POST', body: {requesterKey: key, caseId: 'rice-brown-leaf-spots', answers: ans, county: 'Lofa'}});
  const a = await mk(kA); await mk(kA); const b = await mk(kB);
  const list = (key?: string, jar = new CookieJar()) => req(jar, '/api/v1/triage/reports', {headers: key ? {'X-Requester-Key': key} : {}});
  assert.equal((await list(kA)).data.reports.length, 2); assert.equal((await list(kB)).data.reports.length, 1);
  assert.ok(!(await list(kB)).data.reports.some((r: any) => r.ref === a.data.report.ref), 'B cannot see A\'s report');
  assert.deepEqual((await list()).data.reports, [], 'no key, no reports'); assert.deepEqual((await list(KEY('someone-else'))).data.reports, []);
  assert.equal((await list(kA, new CookieJar())).data.reports.every((r: any) => !('requester_key_hash' in r) && !('userId' in r) && !('user_id' in r)), true);
  const f1 = await farmerJar('+231775559104'), f2 = await farmerJar('+231775559105');
  await req(f1, '/api/v1/triage/reports', {method: 'POST', body: {caseId: 'rice-brown-leaf-spots', answers: ans, county: 'Lofa'}});
  assert.equal((await req(f1, '/api/v1/triage/reports')).data.reports.length, 1); assert.equal((await req(f2, '/api/v1/triage/reports')).data.reports.length, 0);
});

// ====================================================================================================================== 8. integration
test('18. end to end offline-to-online against the REAL server: a lost response and a retry produce exactly one report, and the receipt says so', async () => {
  const keyFor = KEY('e2e-device'); const base = getBaseUrl();
  let phase: 'offline' | 'lost' | 'online' = 'offline';
  const jar = new CookieJar();
  const store = createTriageStore(memoryKv()); const clock = {t: Date.now()};
  const send = async (payload: Record<string, unknown>, opId: string) => {
    if (phase === 'offline') throw new TypeError('network down');
    const r = await req(jar, '/api/v1/triage/reports', {method: 'POST', body: payload, headers: {'Idempotency-Key': opId}});
    if (phase === 'lost') throw new TypeError('connection dropped after the server answered');
    if (r.status >= 400) throw {status: r.status, retryAfterMs: Number(r.headers.get('retry-after')) * 1000 || null, message: r.data?.error?.message};
    return {status: r.status, body: r.data};
  };
  const sync = createTriageSync({store, send, requesterKey: () => keyFor, now: () => clock.t, random: () => 0});
  const a = sample({caseId: 'rice-water-too-deep', crop: 'rice', answers: {extent: 'many', spread: 'fast', submerged: 'gt2'}, band: 'red', cardSlug: 'rice-water-too-deep', adviceCode: 'ADV-2026-004', county: 'Nimba', photo: {dataUrl: JPEG, addedAt: ''}});
  await store.save(a);
  await sync.sync();                                    // offline: queued
  phase = 'lost'; clock.t += 10_000; await sync.sync(); // the server applies it, the answer is lost
  phase = 'online'; clock.t += 60_000; await sync.sync();
  const cur = (await store.get(a.id))!;
  assert.equal(cur.sync.status, 'synced'); assert.equal(cur.sync.receipt!.status, 'DUPLICATE'); assert.equal(cur.sync.serverBand, 'red', 'the server computed the same band');
  const mine = await req(new CookieJar(), '/api/v1/triage/reports', {headers: {'X-Requester-Key': keyFor}});
  assert.equal(mine.data.reports.length, 1, 'exactly one report on the server'); assert.equal(mine.data.reports[0].ref, cur.sync.receipt!.ref);
  void base;
});

test('19. asking an officer from a check goes through the existing expert-request path and stays private (Phase 0 protections hold)', async () => {
  const a = sample({caseId: 'cassava-patchy-young-leaves', crop: 'cassava', answers: {extent: 'many', spread: 'fast', insects: 'yes'}, band: 'red', adviceCode: 'ADV-2026-001', photo: {dataUrl: JPEG, addedAt: ''}});
  const draft = buildEscalationDraft(a, {sendPhoto: false, farmerName: 'CHECK-VISITOR-MARKER'});
  const visitor = new CookieJar();
  const made = await req(visitor, '/api/v1/expert-requests/demo', {method: 'POST', body: {requesterKey: KEY('esc'), ...draft}, headers: {'Idempotency-Key': crypto.randomUUID()}});
  assert.equal(made.status, 201); assert.equal(made.data.request.photo_data_url, '', 'no photo was consented to'); assert.match(made.data.request.description, /ADV-2026-001/);
  const id = made.data.request.id;
  const listed = await req(new CookieJar(), '/api/v1/expert-requests/demo'); assert.ok(!JSON.stringify(listed.data).includes('CHECK-VISITOR-MARKER'), 'another visitor cannot see it');
  const sharedExpert = await trustedLogin('+231770000201', 'ExpertDemo!2026');
  assert.ok(!JSON.stringify((await req(sharedExpert, '/api/v1/expert-requests/demo')).data).includes('CHECK-VISITOR-MARKER'), 'the shared demo expert cannot see it');
  assert.equal((await req(sharedExpert, `/api/v1/expert-requests/demo/${id}/reply`, {method: 'PATCH', body: {expertReply: 'Spray anything on it.', status: 'Answered'}})).status, 403);
  await fx.createUser({displayName: 'Private Officer P1A', phone: '+231775559201', password: 'OfficerPrivate!2026x', roles: ['expert'], expertStatus: 'approved'});
  const officer = await trustedLogin('+231775559201', 'OfficerPrivate!2026x');
  assert.ok((await req(officer, '/api/v1/expert-requests/demo')).data.requests.some((r: any) => r.id === id), 'a real officer (private password) sees it');
  // with consent, the photo travels
  const withPhoto = await req(visitor, '/api/v1/expert-requests/demo', {method: 'POST', body: {requesterKey: KEY('esc2'), ...buildEscalationDraft(a, {sendPhoto: true})}});
  assert.equal(withPhoto.status, 201); assert.equal(withPhoto.data.request.photo_data_url, JPEG);
});

// ====================================================================================================================== 9. migration, limits
test('20. migration 009 is additive, reversible and re-appliable', async () => {
  const {runMigrations} = await import('../server/db.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p1a-')); tmpDirs.push(dir);
  const db = new DatabaseSync(path.join(dir, 'm.db'));
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    assert.ok(runMigrations(db).includes('009_advice_cards_triage.sql'));
    const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {name: string}[]).map((t) => t.name);
    for (const t of ['advice_cards', 'advice_card_versions', 'triage_reports']) assert.ok(tables().includes(t), t);
    db.exec(fs.readFileSync(path.join(root, 'server/migrations/down/009_advice_cards_triage.down.sql'), 'utf8'));
    for (const t of ['advice_cards', 'advice_card_versions', 'triage_reports']) assert.ok(!tables().includes(t), `${t} dropped`);
    assert.ok(!(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as {name: string}[]).some((t) => t.name === 'advice_card_versions_immutable'));
    assert.deepEqual(runMigrations(db), ['009_advice_cards_triage.sql']);
  } finally { db.close(); }
});

async function freePort(): Promise<number> { return new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); }
test('21. default limits on a real server: reports are rate limited with a real Retry-After, a replayed retry is free, and code checks are throttled', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-p1a-')); tmpDirs.push(dir);
  const port = await freePort();
  const proc: ChildProcess = spawn(process.execPath, [path.join(root, 'server.js')], {cwd: os.tmpdir(), env: {PATH: process.env.PATH ?? '', HOME: os.tmpdir(), NODE_ENV: 'production', SESSION_SECRET: rand(), OTP_HMAC_SECRET: rand(), TRUST_PROXY: '0', DB_PATH: path.join(dir, 'a.db'), PORT: String(port), HOST: '127.0.0.1'}, stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    const c = await fetch(`${base}/api/v1/csrf-token`); const {csrfToken} = (await c.json()) as {csrfToken: string};
    const cookie = c.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    const post = (body: unknown, extra: Record<string, string> = {}) => fetch(`${base}/api/v1/triage/reports`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie, ...extra}, body: JSON.stringify(body)});
    const ans = answersFor('cassava-yellow-old-leaves', (_q, o) => o[0]);
    const keyed = crypto.randomUUID(); const first = reportBody('cassava-yellow-old-leaves', ans);
    assert.equal((await post(first, {'Idempotency-Key': keyed})).status, 201);
    for (let i = 0; i < 25; i++) assert.equal((await post(first, {'Idempotency-Key': keyed})).headers.get('idempotent-replay'), 'true', 'retries are replayed and free');
    const st: number[] = [];
    for (let i = 0; i < 21; i++) st.push((await post(reportBody('cassava-yellow-old-leaves', ans))).status);
    assert.deepEqual(st, [...Array(19).fill(201), 429, 429], `20 per hour per address, replays excluded (${st})`);
    const limited = await post(reportBody('cassava-yellow-old-leaves', ans));
    const ra = Number(limited.headers.get('retry-after')); assert.ok(ra >= 1 && ra <= 3600, `Retry-After ${ra}`);
    const codes: number[] = [];
    for (let i = 0; i < 63; i++) codes.push((await fetch(`${base}/api/v1/advice/verify/ADV-2026-00${(i % 6) + 1}`)).status);
    assert.equal(codes.filter((s) => s === 200).length, 60); assert.ok(codes.slice(60).every((s) => s === 429), 'the 61st code check in 10 minutes is throttled');
  } finally { proc.kill(); }
});
