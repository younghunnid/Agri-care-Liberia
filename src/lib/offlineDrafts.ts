import {dbDelete, dbGetAll, dbPut, kvGet, kvSet} from './offlineDb';
import {normalizeLiberianPhone} from './phone';
import {generateOwnerKey} from './listingKeys';

/**
 * Local records for things a farmer prepared on the phone (marketplace listings, expert
 * questions) plus the queue of write operations that will send them to the server.
 *
 * Rules enforced here:
 *  - A local record is only ever removed by the farmer, never because a sync failed.
 *  - "published" is set ONLY after the server confirmed the write (see syncEngine.ts).
 *  - A phone number is stored/sent only when the farmer ticked consent.
 */

export type RecordStatus = 'draft' | 'pending' | 'failed' | 'published';

export interface ListingData {
  sellerType: 'farmer' | 'supplier';
  sellerName: string;
  farmName: string;
  category: string;
  productName: string;
  quantity: string;
  unit: string;
  priceLrd: string;
  county: string;
  town: string;
  availabilityStatus: 'Available' | 'Limited Stock' | 'Sold Out';
  /** Optional. */
  description: string;
  /** Optional compressed photo (data URL). */
  photoDataUrl: string;
  /** Kept only when phoneConsent is true. */
  sellerPhone: string;
  phoneConsent: boolean;
}

export interface QuestionData {
  farmerName: string;
  category: string;
  county: string;
  title: string;
  description: string;
  photoDataUrl: string;
  voiceNoteDataUrl: string;
  voiceNoteSummary: string;
}

interface BaseRecord {
  localId: string;
  /** Stable idempotency key for the create request. */
  opId: string;
  status: RecordStatus;
  /** Incremented on every local edit. */
  rev: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  /** Last failure was a version conflict (listing changed online). */
  conflict?: boolean;
  serverId?: number;
  serverUpdatedAt?: string;
  firstSentHash?: string;
  syncedAt?: string;
}

export interface ListingRecord extends BaseRecord {
  type: 'listing';
  /** Secret proving ownership of the listing; sent to the server on create (it stores only a hash) and as a header on edits. */
  ownerKey?: string;
  data: ListingData;
}
export interface QuestionRecord extends BaseRecord {
  type: 'question';
  data: QuestionData;
}

export type SyncKind = 'listing.create' | 'listing.update' | 'question.create';

export interface SyncOp {
  opId: string;
  kind: SyncKind;
  localId: string;
  status: 'queued' | 'sending' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  /** For failed ops: true = a later retry may work (network); false = the farmer must fix something. */
  retryable: boolean;
  lastError?: string;
  /** Record revision this op was built from. */
  rev: number;
  /** Overwrite the online version even if it changed (after a conflict the farmer chose this). */
  force?: boolean;
  createdAt: number;
}

export function newId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + Date.now().toString(36);
}

// ---------------------------------------------------------------- in-memory mirror

let listings: ListingRecord[] = [];
let questions: QuestionRecord[] = [];
let ops: SyncOp[] = [];
let lastSyncAt: string | null = null;
let version = 0;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function emitSync(): void {
  version++;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}
export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const getSyncVersion = (): number => version;

export function initDrafts(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [l, q, o, t] = await Promise.all([
        dbGetAll<ListingRecord>('drafts'),
        dbGetAll<QuestionRecord>('questions'),
        dbGetAll<SyncOp>('syncQueue'),
        kvGet<string>('lastSyncAt'),
      ]);
      listings = l;
      questions = q;
      // A page closed mid-send leaves 'sending' behind; the request may or may not have arrived,
      // which is exactly why the same Idempotency-Key is reused on the next attempt.
      ops = o.map((op) => (op.status === 'sending' ? {...op, status: 'queued' as const} : op));
      lastSyncAt = t ?? null;
      await Promise.all(ops.filter((x, i) => x !== o[i]).map((x) => dbPut('syncQueue', x)));
    } catch {
      // IndexedDB unavailable: drafts cannot be kept on this device (UI says so).
    }
  })();
  return initPromise;
}

export const getListingRecords = (): ListingRecord[] => listings;
export const getQuestionRecords = (): QuestionRecord[] => questions;
export const getSyncOps = (): SyncOp[] => ops;
export const getLastSyncAt = (): string | null => lastSyncAt;

export async function setLastSyncAt(iso: string): Promise<void> {
  lastSyncAt = iso;
  await kvSet('lastSyncAt', iso).catch(() => undefined);
  emitSync();
}

// ---------------------------------------------------------------- persistence helpers

export async function putListing(rec: ListingRecord): Promise<void> {
  await dbPut('drafts', rec);
  listings = [rec, ...listings.filter((x) => x.localId !== rec.localId)];
  emitSync();
}
export async function putQuestion(rec: QuestionRecord): Promise<void> {
  await dbPut('questions', rec);
  questions = [rec, ...questions.filter((x) => x.localId !== rec.localId)];
  emitSync();
}
export async function putOp(op: SyncOp): Promise<void> {
  await dbPut('syncQueue', op);
  ops = [...ops.filter((x) => x.opId !== op.opId), op].sort((a, b) => a.createdAt - b.createdAt);
  emitSync();
}
export async function removeOp(opId: string): Promise<void> {
  await dbDelete('syncQueue', opId);
  ops = ops.filter((x) => x.opId !== opId);
  emitSync();
}

export class DraftError extends Error {}

// ---------------------------------------------------------------- validation

export function validateListing(d: ListingData): string | null {
  if (d.productName.trim().length < 2) return 'Enter the product name.';
  if (!d.category) return 'Choose a category.';
  if (!d.quantity.trim()) return 'Enter the quantity.';
  if (!d.unit.trim()) return 'Choose a measurement unit.';
  const price = Number(d.priceLrd);
  if (!Number.isFinite(price) || price <= 0) return 'Enter the price in Liberian dollars (LRD).';
  if (!d.county) return 'Choose a county.';
  if (d.town.trim().length < 2) return 'Enter the town or community.';
  if (d.phoneConsent) {
    const check = normalizeLiberianPhone(d.sellerPhone);
    if (!check.valid) return check.error || 'Enter a valid Liberian phone number.';
  }
  return null;
}

export function validateQuestion(d: QuestionData): string | null {
  if (d.title.trim().length < 4) return 'Write a short title (at least 4 letters).';
  if (d.description.trim().length < 10) return 'Describe the problem (at least 10 letters).';
  return null;
}

/** Applies the privacy rule: no consent, no phone number kept on the device. */
function cleanListing(d: ListingData): ListingData {
  return {...d, sellerPhone: d.phoneConsent ? d.sellerPhone.trim() : ''};
}

// ---------------------------------------------------------------- listing drafts

export function isLocked(rec: {status: RecordStatus}): boolean {
  return rec.status === 'pending';
}

/** Creates or updates a listing on this phone. Never contacts the server. */
export async function saveListingDraft(data: ListingData, localId?: string): Promise<ListingRecord> {
  await initDrafts();
  const now = new Date().toISOString();
  const existing = localId ? listings.find((l) => l.localId === localId) : undefined;
  if (existing && isLocked(existing)) {
    throw new DraftError('This listing is waiting to sync. Cancel the sync first if you want to change it.');
  }
  const rec: ListingRecord = existing
    ? {...existing, data: cleanListing(data), rev: existing.rev + 1, status: 'draft', lastError: undefined, conflict: false, updatedAt: now}
    : {
        type: 'listing',
        localId: newId(),
        opId: newId(),
        status: 'draft',
        rev: 1,
        createdAt: now,
        updatedAt: now,
        data: cleanListing(data),
        ownerKey: generateOwnerKey(),
      };
  await putListing(rec);
  return rec;
}

export async function saveQuestionDraft(data: QuestionData, localId?: string): Promise<QuestionRecord> {
  await initDrafts();
  const now = new Date().toISOString();
  const existing = localId ? questions.find((q) => q.localId === localId) : undefined;
  if (existing && isLocked(existing)) {
    throw new DraftError('This question is waiting to sync. Cancel the sync first if you want to change it.');
  }
  const rec: QuestionRecord = existing
    ? {...existing, data, rev: existing.rev + 1, status: 'draft', lastError: undefined, updatedAt: now}
    : {type: 'question', localId: newId(), opId: newId(), status: 'draft', rev: 1, createdAt: now, updatedAt: now, data};
  await putQuestion(rec);
  return rec;
}

// ---------------------------------------------------------------- queueing

/** Marks a record "Pending Sync" and adds its write operation to the queue. */
export async function queueRecord(type: 'listing' | 'question', localId: string): Promise<void> {
  await initDrafts();
  const rec = type === 'listing' ? listings.find((l) => l.localId === localId) : questions.find((q) => q.localId === localId);
  if (!rec) throw new DraftError('That item is no longer on this phone.');
  const problem = type === 'listing' ? validateListing((rec as ListingRecord).data) : validateQuestion((rec as QuestionRecord).data);
  if (problem) throw new DraftError(problem);

  const kind: SyncKind = type === 'question' ? 'question.create' : rec.serverId ? 'listing.update' : 'listing.create';
  // Create ops reuse the record's stable key; updates are idempotent by nature.
  const opId = kind === 'listing.update' ? newId() : rec.opId;
  await putOp({
    opId,
    kind,
    localId,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    retryable: true,
    rev: rec.rev,
    createdAt: Date.now(),
  });
  const next = {...rec, status: 'pending' as const, lastError: undefined, conflict: false, updatedAt: new Date().toISOString()};
  if (type === 'listing') await putListing(next as ListingRecord);
  else await putQuestion(next as QuestionRecord);
}

/** Takes an item out of the queue. It stays on the phone as a draft. */
export async function cancelSync(type: 'listing' | 'question', localId: string): Promise<void> {
  for (const op of ops.filter((o) => o.localId === localId)) await removeOp(op.opId);
  const rec = type === 'listing' ? listings.find((l) => l.localId === localId) : questions.find((q) => q.localId === localId);
  if (!rec || rec.status === 'published') return;
  const next = {...rec, status: 'draft' as const, updatedAt: new Date().toISOString()};
  if (type === 'listing') await putListing(next as ListingRecord);
  else await putQuestion(next as QuestionRecord);
}

/** Only the farmer removes local records. Removing a "published" one never touches the server. */
export async function deleteLocalRecord(type: 'listing' | 'question', localId: string): Promise<void> {
  const rec = type === 'listing' ? listings.find((l) => l.localId === localId) : questions.find((q) => q.localId === localId);
  if (rec && isLocked(rec)) throw new DraftError('Cancel the sync before removing this item.');
  for (const op of ops.filter((o) => o.localId === localId)) await removeOp(op.opId);
  await dbDelete(type === 'listing' ? 'drafts' : 'questions', localId);
  if (type === 'listing') listings = listings.filter((l) => l.localId !== localId);
  else questions = questions.filter((q) => q.localId !== localId);
  emitSync();
}

export const STATUS_LABEL: Record<RecordStatus, string> = {
  draft: 'Draft',
  pending: 'Pending Sync',
  failed: 'Sync Failed',
  published: 'Published',
};
