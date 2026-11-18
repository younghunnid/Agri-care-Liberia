import {useSyncExternalStore} from 'react';
import {ApiRequestError, apiFetch} from './api';
import {getDemoOwnerToken} from './demoStorage';
import {
  emitSync,
  getLastSyncAt,
  getListingRecords,
  getQuestionRecords,
  getSyncOps,
  getSyncVersion,
  initDrafts,
  putListing,
  putOp,
  putQuestion,
  removeOp,
  setLastSyncAt,
  subscribeSync,
  type ListingRecord,
  type QuestionRecord,
  type SyncOp,
} from './offlineDrafts';

/**
 * Sends queued offline writes to the server.
 *
 * Safety properties:
 *  - Every create carries an `Idempotency-Key` (the record's opId). Resending after a lost
 *    response returns the stored result instead of creating a duplicate.
 *  - Local records are never deleted here. A record becomes "published" only after the
 *    server answered 2xx, and a failure only changes its status and message.
 *  - Network trouble backs off and retries; mistakes the farmer must fix (validation, sign-in,
 *    conflicts) stop retrying and are shown as "Sync Failed" with the server's reason.
 *  - One run at a time (in this tab and, where supported, across tabs).
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_AUTO_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 5 * 60_000;

export interface SyncSnapshot {
  version: number;
  syncing: boolean;
  queued: number;
  failed: number;
  lastSyncAt: string | null;
  lastRunMessage: string | null;
}

let running = false;
let lastRunMessage: string | null = null;
let snapshot: SyncSnapshot | null = null;

function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

export function getSyncSnapshot(): SyncSnapshot {
  const v = getSyncVersion();
  if (snapshot && snapshot.version === v && snapshot.syncing === running && snapshot.lastRunMessage === lastRunMessage) return snapshot;
  const ops = getSyncOps();
  snapshot = {
    version: v,
    syncing: running,
    queued: ops.filter((o) => o.status !== 'failed').length,
    failed: ops.filter((o) => o.status === 'failed').length,
    lastSyncAt: getLastSyncAt(),
    lastRunMessage,
  };
  return snapshot;
}

export function useSyncState(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

function setRunning(value: boolean, message?: string | null): void {
  running = value;
  if (message !== undefined) lastRunMessage = message;
  emitSync();
}

// ---------------------------------------------------------------- request bodies

function listingBody(rec: ListingRecord, includeImage: boolean): Record<string, unknown> {
  const d = rec.data;
  const phone = d.phoneConsent ? d.sellerPhone : '';
  const baseSeller = (d.sellerName || 'Liberia Farmer').trim();
  const seller = d.sellerType === 'supplier' && !baseSeller.toLowerCase().includes('supplier') ? `${baseSeller} (Supplier)` : baseSeller;
  return {
    ownerToken: getDemoOwnerToken(),
    sellerName: seller,
    farmName: d.farmName,
    category: d.category,
    productName: d.productName,
    quantity: d.quantity,
    unit: d.unit,
    priceLrd: Number(d.priceLrd),
    availabilityStatus: d.availabilityStatus,
    county: d.county,
    town: d.town,
    description: d.description,
    // Never send a number without the farmer's consent.
    sellerPhone: phone,
    phoneConsent: Boolean(d.phoneConsent && phone),
    ...(includeImage && d.photoDataUrl ? {imageUrl: d.photoDataUrl} : {}),
  };
}

function questionBody(rec: QuestionRecord): Record<string, unknown> {
  const d = rec.data;
  return {
    requesterToken: getDemoOwnerToken(),
    farmerName: d.farmerName,
    category: d.category,
    county: d.county,
    title: d.title,
    description: d.description,
    photoDataUrl: d.photoDataUrl || undefined,
    voiceNoteDataUrl: d.voiceNoteDataUrl || undefined,
    voiceNoteSummary: d.voiceNoteSummary || undefined,
  };
}

// ---------------------------------------------------------------- error handling

interface Classified {
  retryable: boolean;
  conflict: boolean;
  network: boolean;
  message: string;
}

function classify(err: unknown): Classified {
  if (err instanceof ApiRequestError) {
    const s = err.status;
    if (s === 409) return {retryable: false, conflict: true, network: false, message: err.message};
    if (s === 408 || s === 425 || s === 429 || s >= 500) {
      return {retryable: true, conflict: false, network: false, message: 'The server is busy. We will try again.'};
    }
    if (s === 401) return {retryable: false, conflict: false, network: false, message: 'Please sign in again, then tap Try again.'};
    if (s === 403) return {retryable: false, conflict: false, network: false, message: err.message || 'You are not allowed to do this.'};
    return {retryable: false, conflict: false, network: false, message: err.message || 'The server did not accept this item.'};
  }
  return {retryable: true, conflict: false, network: true, message: 'No connection to the server. Your item is safe on this phone.'};
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- sending

interface ListingResponse {
  listing: {id: number; updated_at: string};
  replayed?: boolean;
}

async function sendListingCreate(op: SyncOp, rec: ListingRecord): Promise<void> {
  const body = listingBody(rec, true);
  const sentHash = hashOf(body);
  // Remember what the first attempt carried, so a later replay of an older request is noticed.
  const first = rec.firstSentHash ?? sentHash;
  if (!rec.firstSentHash) await putListing({...rec, firstSentHash: first});

  const res = await withTimeout((signal) =>
    apiFetch<ListingResponse>('/marketplace/listings', {
      method: 'POST',
      headers: {'Idempotency-Key': op.opId},
      body: JSON.stringify(body),
      signal,
    })
  );

  const latest = getListingRecords().find((l) => l.localId === rec.localId) ?? rec;
  const needsFollowUp = latest.rev !== op.rev || (res.replayed === true && first !== sentHash);
  const confirmed: ListingRecord = {
    ...latest,
    serverId: res.listing.id,
    serverUpdatedAt: res.listing.updated_at,
    syncedAt: new Date().toISOString(),
    lastError: undefined,
    conflict: false,
    // Published only because the server said 201/2xx.
    status: needsFollowUp ? 'pending' : 'published',
  };
  await putListing(confirmed);
  await removeOp(op.opId);
  if (needsFollowUp) {
    await putOp({
      opId: crypto.randomUUID?.() ?? `${op.opId}-u`,
      kind: 'listing.update',
      localId: rec.localId,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: 0,
      retryable: true,
      rev: latest.rev,
      createdAt: Date.now(),
    });
  }
}

async function sendListingUpdate(op: SyncOp, rec: ListingRecord): Promise<void> {
  if (!rec.serverId) throw new ApiRequestError(400, 'VALIDATION_ERROR', 'This listing has not been published yet.');
  const body = {
    ...listingBody(rec, false),
    ...(op.force || !rec.serverUpdatedAt ? {} : {baseUpdatedAt: rec.serverUpdatedAt}),
  };
  const res = await withTimeout((signal) =>
    apiFetch<ListingResponse>(`/marketplace/listings/${rec.serverId}`, {method: 'PATCH', body: JSON.stringify(body), signal})
  );
  const latest = getListingRecords().find((l) => l.localId === rec.localId) ?? rec;
  const newer = latest.rev !== op.rev;
  await putListing({
    ...latest,
    serverUpdatedAt: res.listing.updated_at,
    syncedAt: new Date().toISOString(),
    lastError: undefined,
    conflict: false,
    status: newer ? 'draft' : 'published',
  });
  await removeOp(op.opId);
}

async function sendQuestion(op: SyncOp, rec: QuestionRecord): Promise<void> {
  const res = await withTimeout((signal) =>
    apiFetch<{request: {id: number}; replayed?: boolean}>('/expert-requests/demo', {
      method: 'POST',
      headers: {'Idempotency-Key': op.opId},
      body: JSON.stringify(questionBody(rec)),
      signal,
    })
  );
  const latest = getQuestionRecords().find((q) => q.localId === rec.localId) ?? rec;
  await putQuestion({
    ...latest,
    serverId: res.request.id,
    syncedAt: new Date().toISOString(),
    lastError: undefined,
    status: 'published', // shown as "Sent" for questions
  });
  await removeOp(op.opId);
}

async function markFailure(op: SyncOp, c: Classified): Promise<void> {
  const attempts = op.attempts + 1;
  const giveUpAuto = !c.retryable || attempts >= MAX_AUTO_ATTEMPTS;
  const delay = Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (attempts - 1)) + Math.floor(Math.random() * 1000);
  await putOp({
    ...op,
    attempts,
    status: giveUpAuto ? 'failed' : 'queued',
    retryable: c.retryable,
    lastError: c.message,
    nextAttemptAt: giveUpAuto ? 0 : Date.now() + delay,
  });
  if (giveUpAuto) {
    // Status only; the record and its data stay exactly as the farmer left them.
    const list = op.kind === 'question.create' ? getQuestionRecords() : getListingRecords();
    const rec = list.find((r) => r.localId === op.localId);
    if (rec) {
      const next = {...rec, status: 'failed' as const, lastError: c.message, conflict: c.conflict};
      if (op.kind === 'question.create') await putQuestion(next as QuestionRecord);
      else await putListing(next as ListingRecord);
    }
  }
}

export interface SyncOptions {
  /** Manual "Sync Now": ignore back-off timers and retry failed items too. */
  manual?: boolean;
}

export interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
  stoppedOffline: boolean;
  message: string;
}

async function runOnce(opts: SyncOptions): Promise<SyncResult> {
  await initDrafts();
  const result: SyncResult = {attempted: 0, succeeded: 0, failed: 0, stoppedOffline: false, message: ''};

  if (opts.manual) {
    // Give failed-but-retryable items another go, and let the farmer re-try the rest too.
    for (const op of getSyncOps().filter((o) => o.status === 'failed')) {
      await putOp({...op, status: 'queued', attempts: 0, nextAttemptAt: 0});
      const list = op.kind === 'question.create' ? getQuestionRecords() : getListingRecords();
      const rec = list.find((r) => r.localId === op.localId);
      if (rec && rec.status === 'failed') {
        const next = {...rec, status: 'pending' as const};
        if (op.kind === 'question.create') await putQuestion(next as QuestionRecord);
        else await putListing(next as ListingRecord);
      }
    }
  }

  for (const queued of [...getSyncOps()]) {
    const op = getSyncOps().find((o) => o.opId === queued.opId);
    if (!op || op.status === 'failed') continue; // cancelled meanwhile, or needs the farmer
    if (!opts.manual && op.nextAttemptAt > Date.now()) continue;

    const rec =
      op.kind === 'question.create'
        ? getQuestionRecords().find((q) => q.localId === op.localId)
        : getListingRecords().find((l) => l.localId === op.localId);
    if (!rec) {
      await removeOp(op.opId); // record was removed by the farmer
      continue;
    }

    result.attempted++;
    await putOp({...op, status: 'sending'});
    try {
      if (op.kind === 'listing.create') await sendListingCreate(op, rec as ListingRecord);
      else if (op.kind === 'listing.update') await sendListingUpdate(op, rec as ListingRecord);
      else await sendQuestion(op, rec as QuestionRecord);
      result.succeeded++;
      await setLastSyncAt(new Date().toISOString());
    } catch (err) {
      const c = classify(err);
      result.failed++;
      const current = getSyncOps().find((o) => o.opId === op.opId);
      if (current) await markFailure(current, c);
      if (c.network) {
        result.stoppedOffline = true;
        break; // connection is gone; later items would fail the same way
      }
    }
  }

  result.message = result.attempted === 0
    ? 'Nothing is waiting to sync.'
    : result.stoppedOffline
    ? 'Could not reach the server. Your items are safe on this phone and will sync when the connection returns.'
    : result.failed === 0
    ? `Synced ${result.succeeded} item${result.succeeded === 1 ? '' : 's'}.`
    : `Synced ${result.succeeded}, ${result.failed} need attention.`;
  return result;
}

/** Runs one synchronisation pass. Concurrent calls share the run in progress. */
let current: Promise<SyncResult> | null = null;
export function syncNow(opts: SyncOptions = {}): Promise<SyncResult> {
  if (current) return current;
  setRunning(true);
  const run = (async (): Promise<SyncResult> => {
    const locks = (navigator as Navigator & {locks?: LockManager}).locks;
    if (locks?.request) {
      // Another tab already syncing? Skip rather than send everything twice.
      const r = await locks.request('agri-sync', {ifAvailable: true}, async (lock) => (lock ? runOnce(opts) : null));
      return r ?? {attempted: 0, succeeded: 0, failed: 0, stoppedOffline: false, message: 'Another window is syncing.'};
    }
    return runOnce(opts);
  })();
  current = run;
  const done = (message: string | null) => {
    current = null;
    setRunning(false, message);
  };
  run.then((r) => done(r.message), () => done('Sync stopped unexpectedly. Your items are still saved on this phone.'));
  return run;
}

// ---------------------------------------------------------------- automatic sync

let autoStarted = false;

/** Retries when connectivity returns, the app is reopened, or a timer says an item is due. */
export function startAutoSync(): void {
  if (autoStarted || typeof window === 'undefined') return;
  autoStarted = true;
  const attempt = () => {
    if (!navigator.onLine) return;
    const due = getSyncOps().some((o) => o.status === 'queued' && o.nextAttemptAt <= Date.now());
    if (due) void syncNow();
  };
  window.addEventListener('online', attempt);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt();
  });
  setInterval(attempt, 15_000);
  void initDrafts().then(attempt);
}

/** Queue + immediate attempt when the phone believes it is online. */
export function syncSoon(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine) void syncNow();
}
