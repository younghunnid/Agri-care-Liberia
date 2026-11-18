import {apiFetch} from './api';
import {kvGet, kvSet, getStorageSummary} from './offlineDb';
import {
  cacheImage,
  getCatalog,
  getLibraryEntries,
  hasNewerVersion,
  isImageCached,
  LibraryStorageError,
  optimizedImageBytes,
  saveLibraryEntries,
  type LibraryEntry,
  type ModuleKey,
} from './offlineLibrary';
import {getOfflineGuides, isGuideDownloaded, OfflineStorageError, saveGuideOffline} from './offlineStorage';

/** Rough average size of one server guide (JSON text), measured from the seeded guides. */
const AVG_SERVER_GUIDE_BYTES = 4_000;
/** Stop early after this many network failures in a row (connection is gone). */
const MAX_CONSECUTIVE_NETWORK_FAILURES = 3;

export interface PackManifest {
  entries: Omit<LibraryEntry, 'downloadedAt'>[];
  imageUrls: string[];
  textBytes: number;
  imageBytes: number;
  byModule: Record<ModuleKey, number>;
}

export function getStarterManifest(): PackManifest {
  const entries = getCatalog();
  const imageUrls = Array.from(new Set(entries.map((e) => e.imageUrl).filter((u): u is string => Boolean(u))));
  const byModule = {crops: 0, pests: 0, soil: 0, livestock: 0, fish: 0, knowledge: 0} as Record<ModuleKey, number>;
  for (const e of entries) byModule[e.module]++;
  return {
    entries,
    imageUrls,
    textBytes: entries.reduce((n, e) => n + e.sizeBytes, 0),
    imageBytes: imageUrls.reduce((n, u) => n + optimizedImageBytes(u), 0),
    byModule,
  };
}

export type PackPhase = 'checking' | 'text' | 'images' | 'guides' | 'done';

export interface PackProgress {
  phase: PackPhase;
  done: number;
  total: number;
  bytes: number;
  message: string;
}

export interface PackFailure {
  kind: 'images' | 'guides' | 'storage';
  id: string;
  reason: string;
}

export interface PackResult {
  status: 'complete' | 'partial' | 'cancelled' | 'failed';
  savedEntries: number;
  savedImages: number;
  savedGuides: number;
  failures: PackFailure[];
  quotaExceeded: boolean;
  message: string;
  finishedAt: string;
}

export interface PackStatus {
  entriesDone: number;
  entriesTotal: number;
  imagesDone: number;
  imagesTotal: number;
  needsUpdate: number;
  lastRun: PackResult | null;
}

export async function getStarterPackStatus(): Promise<PackStatus> {
  const manifest = getStarterManifest();
  const stored = new Map(getLibraryEntries().map((e) => [e.id, e]));
  let entriesDone = 0;
  let needsUpdate = 0;
  for (const e of manifest.entries) {
    const s = stored.get(e.id);
    if (s) {
      entriesDone++;
      if (hasNewerVersion(s)) needsUpdate++;
    }
  }
  let imagesDone = 0;
  for (const u of manifest.imageUrls) if (await isImageCached(u)) imagesDone++;
  return {
    entriesDone,
    entriesTotal: manifest.entries.length,
    imagesDone,
    imagesTotal: manifest.imageUrls.length,
    needsUpdate,
    lastRun: (await kvGet<PackResult | null>('starterPackRun')) ?? null,
  };
}

export interface StorageCheck {
  ok: boolean;
  freeBytes: number | null;
  neededBytes: number;
  message: string;
}

/** Warns before a download that would not fit. Browser estimates are coarse, so keep a margin. */
export async function checkStorageFor(neededBytes: number): Promise<StorageCheck> {
  const s = await getStorageSummary();
  if (!s.supported || s.quotaBytes === null || s.usageBytes === null) {
    return {ok: true, freeBytes: null, neededBytes, message: 'Free space could not be measured on this browser.'};
  }
  const free = s.quotaBytes - s.usageBytes;
  const ok = free > neededBytes * 1.5;
  return {
    ok,
    freeBytes: free,
    neededBytes,
    message: ok ? 'Enough free space.' : 'Your device is almost out of storage for this app.',
  };
}

interface ServerGuideListItem {
  id: number;
}

interface ServerGuideDetail {
  guide: {
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
    crop: {slug: string; name: string};
    category: {name: string};
  };
}

/** Downloads one server guide into the offline guide store. Throws a readable Error on failure. */
export async function downloadServerGuide(guideId: number, language: string): Promise<void> {
  const res = await apiFetch<ServerGuideDetail>(`/guides/${guideId}?lang=${encodeURIComponent(language)}`);
  const g = res.guide;
  await saveGuideOffline({
    id: g.id,
    slug: g.slug,
    title: g.title,
    summary: g.summary,
    contentMarkdown: g.contentMarkdown,
    imageUrl: g.imageUrl,
    languageCode: g.languageCode,
    sourceAttribution: g.sourceAttribution,
    isSampleDemo: g.isSampleDemo,
    isPestDisease: g.isPestDisease,
    reviewStatus: g.reviewStatus,
    reviewedByName: g.reviewedByName,
    lastReviewedAt: g.lastReviewedAt,
    version: g.version,
    cropName: g.crop.name,
    cropSlug: g.crop.slug,
    categoryName: g.category.name,
  });
}

/** Turns any thrown value into a message a farmer can act on. */
export function friendlyDownloadError(err: unknown): string {
  if (err instanceof OfflineStorageError || err instanceof LibraryStorageError) return err.message;
  if (err instanceof DOMException && err.name === 'AbortError') return 'Download cancelled.';
  const msg = err instanceof Error ? err.message : '';
  if (/failed to fetch|network|load failed/i.test(msg) || !navigator.onLine) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return msg || 'The download failed. Please try again.';
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (err instanceof LibraryStorageError || err instanceof OfflineStorageError) return false;
  const msg = err instanceof Error ? err.message : '';
  return err instanceof TypeError || /failed to fetch|network|load failed|unavailable/i.test(msg);
}

export interface DownloadOptions {
  language: string;
  signal?: AbortSignal;
  onProgress?: (p: PackProgress) => void;
}

/**
 * Downloads the whole Starter Pack. Safe to run again at any time: whatever is already stored
 * is skipped, so "Retry" and "Resume" are the same call. Nothing already saved is ever
 * removed, so an interrupted run never leaves a farmer with less than before.
 */
export async function downloadStarterPack(opts: DownloadOptions): Promise<PackResult> {
  const {language, signal, onProgress} = opts;
  const manifest = getStarterManifest();
  const failures: PackFailure[] = [];
  let savedEntries = 0;
  let savedImages = 0;
  let savedGuides = 0;
  let bytes = 0;
  let quotaExceeded = false;
  let cancelled = false;

  const report = (phase: PackPhase, done: number, total: number, message: string) =>
    onProgress?.({phase, done, total, bytes, message});

  const finalize = async (status: PackResult['status'], message: string): Promise<PackResult> => {
    const result: PackResult = {
      status,
      savedEntries,
      savedImages,
      savedGuides,
      failures,
      quotaExceeded,
      message,
      finishedAt: new Date().toISOString(),
    };
    await kvSet('starterPackRun', result).catch(() => undefined);
    report('done', 1, 1, message);
    return result;
  };

  report('checking', 0, 1, 'Checking storage and what is already saved…');
  const stored = new Map(getLibraryEntries().map((e) => [e.id, e]));
  const entriesToSave = manifest.entries.filter((e) => {
    const s = stored.get(e.id);
    return !s || hasNewerVersion(s);
  });
  const imagesToFetch: string[] = [];
  for (const u of manifest.imageUrls) if (!(await isImageCached(u))) imagesToFetch.push(u);

  // Server guides (need the backend). If the list cannot be fetched, the rest still downloads.
  let guideIds: number[] = [];
  try {
    const list = await apiFetch<{guides: ServerGuideListItem[]}>(`/guides?lang=${encodeURIComponent(language)}`);
    guideIds = list.guides.map((g) => g.id).filter((id) => !isGuideDownloaded(id));
  } catch (err) {
    failures.push({kind: 'guides', id: 'list', reason: friendlyDownloadError(err)});
  }

  const needed =
    entriesToSave.reduce((n, e) => n + e.sizeBytes, 0) +
    imagesToFetch.reduce((n, u) => n + optimizedImageBytes(u), 0) +
    guideIds.length * AVG_SERVER_GUIDE_BYTES;
  const storage = await checkStorageFor(needed);
  if (!storage.ok) {
    quotaExceeded = true;
    failures.push({kind: 'storage', id: 'space', reason: storage.message});
    return finalize('failed', 'Not enough free storage for the Starter Pack. Remove some downloads and try again.');
  }

  const total = entriesToSave.length + imagesToFetch.length + guideIds.length;
  let done = 0;
  let consecutive = 0;

  // 1. Guide text (local, no network) in small batches so progress is visible and writes stay atomic.
  try {
    for (let i = 0; i < entriesToSave.length; i += 8) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const batch = entriesToSave.slice(i, i + 8);
      await saveLibraryEntries(batch);
      savedEntries += batch.length;
      bytes += batch.reduce((n, e) => n + e.sizeBytes, 0);
      done += batch.length;
      report('text', done, total, `Saving guides (${done} of ${total})…`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') cancelled = true;
    else {
      if (err instanceof LibraryStorageError && err.quotaExceeded) quotaExceeded = true;
      failures.push({kind: 'storage', id: 'text', reason: friendlyDownloadError(err)});
      return finalize('failed', friendlyDownloadError(err));
    }
  }

  // 2. Images (small WebP copies).
  for (const url of cancelled ? [] : imagesToFetch) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }
    try {
      bytes += await cacheImage(url, signal);
      savedImages++;
      consecutive = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        cancelled = true;
        break;
      }
      failures.push({kind: 'images', id: url, reason: friendlyDownloadError(err)});
      if (err instanceof LibraryStorageError && err.quotaExceeded) {
        quotaExceeded = true;
        break;
      }
      if (isNetworkFailure(err) && ++consecutive >= MAX_CONSECUTIVE_NETWORK_FAILURES) break;
    }
    done++;
    report('images', done, total, `Saving pictures (${done} of ${total})…`);
  }

  // 3. Server guides.
  for (const id of cancelled || quotaExceeded || consecutive >= MAX_CONSECUTIVE_NETWORK_FAILURES ? [] : guideIds) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }
    try {
      await downloadServerGuide(id, language);
      savedGuides++;
      consecutive = 0;
    } catch (err) {
      failures.push({kind: 'guides', id: String(id), reason: friendlyDownloadError(err)});
      if (err instanceof OfflineStorageError && err.quotaExceeded) {
        quotaExceeded = true;
        break;
      }
      if (isNetworkFailure(err) && ++consecutive >= MAX_CONSECUTIVE_NETWORK_FAILURES) break;
    }
    done++;
    report('guides', done, total, `Saving crop guides (${done} of ${total})…`);
  }

  if (cancelled) {
    return finalize('cancelled', 'Download cancelled. What was already saved is kept; tap Resume to finish.');
  }
  if (failures.length === 0) {
    return finalize(
      'complete',
      typeof window !== 'undefined' && !window.isSecureContext
        ? 'Starter Pack saved on this phone. To install the app and open it without internet, use the secure https:// address.'
        : 'Starter Pack saved. These guides now work without internet.'
    );
  }
  if (quotaExceeded) {
    return finalize('partial', 'Storage is full. Part of the Starter Pack was saved; free some space and tap Resume.');
  }
  return finalize(
    'partial',
    `Part of the Starter Pack was saved. ${failures.length} item${failures.length === 1 ? '' : 's'} could not be downloaded; check your connection and tap Retry.`
  );
}

/** Downloads one bundled guide (and its picture) for offline use. Throws a readable Error. */
export async function downloadBundledEntry(id: string): Promise<void> {
  const entry = getCatalog().find((e) => e.id === id);
  if (!entry) throw new Error('This guide is not available.');
  if (entry.imageUrl && !(await isImageCached(entry.imageUrl))) {
    try {
      await cacheImage(entry.imageUrl);
    } catch (err) {
      // Text is still useful without the picture, but a storage error must stop here.
      if (err instanceof LibraryStorageError) throw err;
    }
  }
  await saveLibraryEntries([entry]);
}

export function downloadedGuideCount(): number {
  return getLibraryEntries().length + getOfflineGuides().length;
}
