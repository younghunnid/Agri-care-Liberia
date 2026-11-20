import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {dbDelete, dbPut} from '../src/lib/offlineDb.ts';
import {getListingRecords, getSyncOps, initDrafts, queueRecord, saveListingDraft, type ListingData} from '../src/lib/offlineDrafts.ts';
import {syncNow} from '../src/lib/syncEngine.ts';
import {apiFetch} from '../src/lib/api.ts';

const data: ListingData = {sellerType: 'farmer', sellerName: 'Synthetic QA Farmer', farmName: '', category: 'Crops', productName: 'Rice', quantity: '100', unit: 'kg', priceLrd: '50', county: 'Bong', town: 'Demo Town A', availabilityStatus: 'Available', description: '', photoDataUrl: '', sellerPhone: '', phoneConsent: false, cropSlug: 'rice', quantityKg: 100, harvestDate: new Date().toISOString().slice(0, 10)};

test('a queued write deadline also aborts a stalled CSRF bootstrap', async () => {
  const originalFetch = globalThis.fetch;
  let timer: ReturnType<typeof setTimeout> | undefined;
  globalThis.fetch = async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal!.reason), {once: true});
  });
  try {
    await assert.rejects(Promise.race([
      apiFetch('/marketplace/listings', {method: 'POST', body: '{}', signal: AbortSignal.timeout(30)}),
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('CSRF ignored the request deadline')), 200); }),
    ]), {name: 'TimeoutError'});
  } finally { clearTimeout(timer); globalThis.fetch = originalFetch; }
});

test('a tab refreshes durable drafts and queue after acquiring the sync lock', async () => {
  await initDrafts();
  const rec = await saveListingDraft(data);
  await queueRecord('listing', rec.localId);
  // A different tab has already published and removed the operation from IndexedDB.
  await dbPut('drafts', {...rec, status: 'published', serverId: 42, listingCode: 'SELL-2026-000042'});
  await dbDelete('syncQueue', rec.opId);
  let writes = 0;
  const originalFetch = globalThis.fetch;
  const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', {configurable: true, value: {request: async (_name: string, _opts: unknown, run: (lock: object) => unknown) => run({})}});
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/csrf-token')) return Response.json({csrfToken: 'qa'});
    writes++;
    return Response.json({listing: {id: 42, updated_at: new Date().toISOString(), harvest: {code: 'SELL-2026-000042'}}, replayed: true});
  };
  try {
    const result = await syncNow({manual: true});
    assert.equal(writes, 0, 'a stale tab must not resend a completed operation');
    assert.equal(result.attempted, 0);
    assert.equal(getListingRecords().find((r) => r.localId === rec.localId)?.serverId, 42);
    assert.equal(getSyncOps().length, 0);
    // A later lock holder must also discover writes queued by a different tab.
    const remote = await saveListingDraft(data);
    await dbPut('drafts', {...remote, status: 'pending'});
    await dbPut('syncQueue', {opId: remote.opId, kind: 'listing.create', localId: remote.localId, status: 'sending', attempts: 0, nextAttemptAt: 0, retryable: true, rev: remote.rev, createdAt: Date.now()});
    const resumed = await syncNow({manual: true});
    assert.equal(resumed.succeeded, 1);
    assert.equal(writes, 1);
    assert.equal(getListingRecords().find((r) => r.localId === remote.localId)?.status, 'published');
    assert.equal(getSyncOps().length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
    else Reflect.deleteProperty(navigator, 'locks');
  }
});

test('production precache includes every shipped guide picture and bundled audio fixture', () => {
  const sw = fs.readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  for (const directory of ['offline-img', 'src/assets/images', 'audio/en']) {
    const files = fs.readdirSync(new URL(`../dist/${directory}/`, import.meta.url));
    assert.ok(files.length > 0);
    for (const file of files) assert.ok(sw.includes(`url:"${directory}/${file}"`), `not precached: ${directory}/${file}`);
  }
});
