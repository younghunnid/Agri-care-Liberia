import type {TriageBand, TriageCrop} from '../data/triageCases';
import {idbKv, type KvStore} from './kvStore';

/**
 * Crop checks saved ON THIS PHONE (IndexedDB). Everything here works offline. The optional photo is kept only here and is NEVER part of what is sent
 * for the anonymous counts; it leaves the phone only if the farmer explicitly chooses to send it to an extension officer (see triageEscalation.ts).
 */
export const TRIAGE_KEY = 'phase1a.triage.saved';
export const MAX_SAVED_CHECKS = 30;
/** Largest photo kept with a check (characters of the data URL, about 450 KB). Larger photos are compressed further or refused. */
export const MAX_PHOTO_CHARS = 600_000;

export type TriageSyncStatus = 'local' | 'pending' | 'synced' | 'failed';
export interface TriageReceipt {ref: string; status: 'APPLIED' | 'DUPLICATE'; serverTime: string}

export interface SavedAssessment {
  id: string;
  /** Stable idempotency key for the report: every retry carries the same key. */
  opId: string;
  caseId: string;
  crop: TriageCrop;
  county: string;
  answers: Record<string, string>;
  score: number;
  band: TriageBand;
  cardSlug: string;
  adviceCode: string;
  adviceVersion: number;
  /** Verification level of the advice shown at the time (e.g. demo_sample). */
  adviceLevel: string;
  createdAt: string;
  /** Kept on this phone only. */
  photo?: {dataUrl: string; addedAt: string};
  /** The farmer agreed to add the anonymous result (no name, phone or photo) to the county counts. */
  share: boolean;
  escalated: boolean;
  sync: {status: TriageSyncStatus; attempts: number; nextAttemptAt: number; lastError?: string; receipt?: TriageReceipt; serverBand?: TriageBand};
}

export class TriageStoreError extends Error {}

/** Returns a reason when a photo cannot be kept, otherwise null. */
export function photoProblem(dataUrl: string): string | null {
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return 'That file is not a photo this app can keep. Use a JPEG, PNG or WebP picture.';
  if (dataUrl.length > MAX_PHOTO_CHARS) return 'That photo is too large to keep on this phone. Take a smaller picture.';
  return null;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createTriageStore(kv: KvStore = idbKv) {
  const read = async (): Promise<SavedAssessment[]> => (await kv.get<SavedAssessment[]>(TRIAGE_KEY)) ?? [];
  const write = (list: SavedAssessment[]): Promise<void> => kv.set(TRIAGE_KEY, list);
  return {
    list: async (): Promise<SavedAssessment[]> => (await read()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    get: async (id: string): Promise<SavedAssessment | undefined> => (await read()).find((a) => a.id === id),
    /** Adds a new check. When full, the oldest check that is already safe (synced or never to be shared) is dropped; unsent checks are never dropped silently. */
    async save(a: SavedAssessment): Promise<void> {
      if (a.photo) { const p = photoProblem(a.photo.dataUrl); if (p) throw new TriageStoreError(p); }
      let list = (await read()).filter((x) => x.id !== a.id);
      while (list.length >= MAX_SAVED_CHECKS) {
        const droppable = [...list].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).find((x) => x.sync.status === 'synced' || x.sync.status === 'local');
        if (!droppable) throw new TriageStoreError('This phone already holds 30 checks that are waiting to be sent. Connect to the internet or delete one first.');
        list = list.filter((x) => x.id !== droppable.id);
      }
      await write([...list, a]);
    },
    async update(id: string, patch: (a: SavedAssessment) => SavedAssessment): Promise<SavedAssessment | undefined> {
      const list = await read();
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return undefined;
      list[i] = patch(structuredClone(list[i]));
      await write(list);
      return list[i];
    },
    remove: async (id: string): Promise<void> => write((await read()).filter((x) => x.id !== id)),
  };
}
export type TriageStore = ReturnType<typeof createTriageStore>;
