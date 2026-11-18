import {
  dbClear,
  dbDelete,
  dbGetAll,
  dbPut,
  dbPutMany,
  isIndexedDbAvailable,
  isQuotaError,
  kvGet,
  kvSet,
  requestPersistentStorage,
} from './offlineDb';

export interface OfflineGuideRecord {
  id: number;
  slug: string;
  title: string;
  summary: string;
  contentMarkdown: string;
  imageUrl: string;
  languageCode: string;
  sourceAttribution: string;
  isSampleDemo: boolean;
  isPestDisease: boolean;
  reviewStatus: string;
  reviewedByName: string | null;
  lastReviewedAt: string | null;
  version: number;
  cropName: string;
  cropSlug: string;
  categoryName: string;
  downloadedAt: string;
}

/** Legacy (v1) storage location, migrated to IndexedDB once and then removed. */
const LEGACY_STORAGE_KEY = 'agri_advisory_offline_guides_v1';
// These names MUST match the runtimeCaching cacheNames in vite.config.ts. Entries added here are
// then served by the service worker's CacheFirst / NetworkFirst routes while offline.
const IMAGE_CACHE_NAME = 'agri-local-images';
const GUIDE_API_CACHE_NAME = 'agri-public-guides-api';
const MIGRATED_FLAG = 'guidesMigratedFromLocalStorage';

export class OfflineStorageError extends Error {
  quotaExceeded: boolean;
  constructor(message: string, quotaExceeded = false) {
    super(message);
    this.name = 'OfflineStorageError';
    this.quotaExceeded = quotaExceeded;
  }
}

/**
 * Reads are synchronous from this in-memory copy so existing pages keep working
 * unchanged. It is hydrated from IndexedDB by initOfflineStorage() before React
 * renders, and every write goes to IndexedDB first.
 */
let guidesCache: OfflineGuideRecord[] = [];
let idbUsable = isIndexedDbAvailable();
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // listener errors must not break storage
    }
  });
}

export function subscribeOfflineGuides(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function readLegacyGuides(): OfflineGuideRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortGuides(list: OfflineGuideRecord[]): OfflineGuideRecord[] {
  return [...list].sort((a, b) => (a.downloadedAt < b.downloadedAt ? 1 : -1));
}

export function initOfflineStorage(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!idbUsable) {
      guidesCache = readLegacyGuides();
      return;
    }
    try {
      const alreadyMigrated = await kvGet<boolean>(MIGRATED_FLAG);
      if (!alreadyMigrated) {
        const legacy = readLegacyGuides();
        if (legacy.length > 0) {
          await dbPutMany('guides', legacy);
        }
        await kvSet(MIGRATED_FLAG, true);
        // Remove the legacy copy only after the IndexedDB commit succeeded.
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      guidesCache = sortGuides(await dbGetAll<OfflineGuideRecord>('guides'));
      // Ask the browser to keep downloads under storage pressure (best effort).
      void requestPersistentStorage();
    } catch {
      // IndexedDB failed (private mode, blocked...): degrade to legacy storage.
      idbUsable = false;
      guidesCache = readLegacyGuides();
    }
  })();
  return initPromise;
}

export function getOfflineGuides(): OfflineGuideRecord[] {
  return guidesCache;
}

export function getOfflineGuideByIdOrSlug(idOrSlug: string | number): OfflineGuideRecord | null {
  const key = String(idOrSlug);
  return guidesCache.find((g) => String(g.id) === key || g.slug === key) || null;
}

export function isGuideDownloaded(id: number): boolean {
  return guidesCache.some((g) => g.id === id);
}

function persistLegacy(list: OfflineGuideRecord[]): void {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    throw new OfflineStorageError(
      'Not enough device storage to save this guide offline. Remove some downloads and try again.',
      true
    );
  }
}

export async function saveGuideOffline(guide: Omit<OfflineGuideRecord, 'downloadedAt'>): Promise<OfflineGuideRecord[]> {
  await initOfflineStorage();
  const record: OfflineGuideRecord = {...guide, downloadedAt: new Date().toISOString()};
  const next = sortGuides([record, ...guidesCache.filter((g) => g.id !== guide.id)]);

  if (idbUsable) {
    try {
      await dbPut('guides', record);
    } catch (err) {
      if (isQuotaError(err)) {
        throw new OfflineStorageError(
          'Not enough device storage to save this guide offline. Remove some downloads and try again.',
          true
        );
      }
      throw new OfflineStorageError('Could not save this guide offline on this device.');
    }
  } else {
    persistLegacy(next);
  }
  guidesCache = next;
  emit();

  // Pre-cache the guide's image asset and API JSON so they render offline too.
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      if (guide.imageUrl) {
        const imageCache = await caches.open(IMAGE_CACHE_NAME);
        await imageCache.add(guide.imageUrl).catch(() => undefined);
      }
      const apiCache = await caches.open(GUIDE_API_CACHE_NAME);
      await apiCache.add(`/api/v1/guides/${guide.id}?lang=${guide.languageCode}`).catch(() => undefined);
    } catch {
      // Cache API may be unavailable; structured guide text is already in IndexedDB.
    }
  }

  return next;
}

export async function removeOfflineGuide(id: number): Promise<OfflineGuideRecord[]> {
  await initOfflineStorage();
  const next = guidesCache.filter((g) => g.id !== id);
  if (idbUsable) {
    await dbDelete('guides', id);
  } else {
    persistLegacy(next);
  }
  guidesCache = next;
  emit();
  return next;
}

export async function clearAllOfflineGuides(): Promise<void> {
  await initOfflineStorage();
  if (idbUsable) {
    await dbClear('guides');
  } else {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  guidesCache = [];
  emit();
  // Images are shared with the rest of the app, so only the guide API snapshots are cleared.
  if (typeof window !== 'undefined' && 'caches' in window) {
    await caches.delete(GUIDE_API_CACHE_NAME).catch(() => undefined);
  }
}

/** Approximate size of the stored guide text (excludes cached images). */
export function estimateOfflineStorageBytes(): number {
  try {
    return new Blob([JSON.stringify(guidesCache)]).size;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
