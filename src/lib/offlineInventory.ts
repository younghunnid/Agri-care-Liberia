import {LIBERIA_COUNTIES} from '../../server/constants';
import {getStorageSummary, type StorageSummary} from './offlineDb';
import {
  getListingRecords,
  getQuestionRecords,
  getSyncOps,
  type ListingRecord,
  type QuestionRecord,
  type RecordStatus,
  type SyncOp,
} from './offlineDrafts';
import {getCatalog, getLibraryEntries, hasNewerVersion} from './offlineLibrary';
import {getStoredImageStats} from './offlineImages';
import {getOfflineGuides} from './offlineStorage';
import {getDownloadedAudio, type AudioMeta} from './audioStore';
import {listSavedGuidance, type SavedGuidance} from './cropProblem';
import {listSavedCalcs, type SavedCalc} from './farmCalculator';
import {cacheGet, MINISTRY_SUMMARY_KEY, loadWeatherSnapshot, type CachedSnapshot, type LiveWeatherData} from './dataCache';

/** Everything the app keeps on this device, with sizes measured rather than guessed. */

export const jsonBytes = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
};

export type StatusCounts = Record<RecordStatus, number>;

export function countByStatus(records: {status: RecordStatus}[]): StatusCounts {
  const out: StatusCounts = {draft: 0, pending: 0, failed: 0, published: 0};
  for (const r of records) out[r.status]++;
  return out;
}

/** Sum of the byte sizes of every response in a Cache Storage cache (0 if it does not exist). */
export async function cacheBytes(name: string): Promise<{count: number; bytes: number}> {
  if (typeof caches === 'undefined') return {count: 0, bytes: 0};
  try {
    if (!(await caches.has(name))) return {count: 0, bytes: 0};
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      if (res) bytes += (await res.clone().blob()).size;
    }
    return {count: keys.length, bytes};
  } catch {
    return {count: 0, bytes: 0};
  }
}

/** Sizes and counts of the H1 items kept in the IndexedDB `kv` store (saved crop advice, saved calculations). */
export interface SavedWorkSummary {
  advice: {items: SavedGuidance[]; bytes: number; newestSavedAt: string | null};
  calculations: {items: SavedCalc[]; bytes: number; newestSavedAt: string | null};
}

export function summariseSavedWork(advice: SavedGuidance[], calcs: SavedCalc[]): SavedWorkSummary {
  const newest = (xs: {savedAt: string}[]) => xs.map((x) => x.savedAt).filter(Boolean).sort().pop() ?? null;
  return {
    advice: {items: advice, bytes: advice.length ? jsonBytes(advice) : 0, newestSavedAt: newest(advice)},
    calculations: {items: calcs, bytes: calcs.length ? jsonBytes(calcs) : 0, newestSavedAt: newest(calcs)},
  };
}

export interface Inventory {
  takenAt: string;
  storage: StorageSummary;
  guides: {
    bundledSaved: number;
    bundledTotal: number;
    bundledBytes: number;
    serverSaved: number;
    serverBytes: number;
    sampleServerGuides: number;
    newestSavedAt: string | null;
    needUpdate: number;
  };
  images: {count: number; bytes: number};
  audio: {items: AudioMeta[]; bytes: number};
  listings: {records: ListingRecord[]; counts: StatusCounts; bytes: number};
  questions: {records: QuestionRecord[]; counts: StatusCounts; bytes: number};
  queue: SyncOp[];
  savedWork: SavedWorkSummary;
  weather: CachedSnapshot<LiveWeatherData>[];
  ministry: CachedSnapshot<Record<string, number>> | null;
  /** Total of everything above that this app measured. */
  measuredBytes: number;
}

export async function takeInventory(): Promise<Inventory> {
  const library = getLibraryEntries();
  const serverGuides = getOfflineGuides();
  const audioItems = getDownloadedAudio();
  const listings = getListingRecords();
  const questions = getQuestionRecords();

  const [storage, images, ministry, weatherAll, savedAdvice, savedCalcs] = await Promise.all([
    getStorageSummary(),
    getStoredImageStats(),
    cacheGet<Record<string, number>>(MINISTRY_SUMMARY_KEY),
    Promise.all(LIBERIA_COUNTIES.map((c) => loadWeatherSnapshot(c))),
    listSavedGuidance().catch(() => [] as SavedGuidance[]),
    listSavedCalcs().catch(() => [] as SavedCalc[]),
  ]);
  const savedWork = summariseSavedWork(savedAdvice, savedCalcs);

  const bundledBytes = library.reduce((n, e) => n + e.sizeBytes, 0);
  const serverBytes = serverGuides.length ? jsonBytes(serverGuides) : 0;
  const audioBytes = audioItems.reduce((n, a) => n + a.bytes, 0);
  const listingBytes = listings.length ? jsonBytes(listings) : 0;
  const questionBytes = questions.length ? jsonBytes(questions) : 0;
  const weather = weatherAll.filter((w): w is CachedSnapshot<LiveWeatherData> => Boolean(w));
  const cacheRecordBytes = (ministry ? jsonBytes(ministry) : 0) + (weather.length ? jsonBytes(weather) : 0);

  const dates = [...library.map((e) => e.downloadedAt), ...serverGuides.map((g) => g.downloadedAt)].filter((d): d is string => Boolean(d));
  return {
    takenAt: new Date().toISOString(),
    storage,
    guides: {
      bundledSaved: library.length,
      bundledTotal: getCatalog().length,
      bundledBytes,
      serverSaved: serverGuides.length,
      serverBytes,
      sampleServerGuides: serverGuides.filter((g) => g.isSampleDemo).length,
      newestSavedAt: dates.sort().pop() ?? null,
      needUpdate: library.filter(hasNewerVersion).length,
    },
    images,
    audio: {items: audioItems, bytes: audioBytes},
    listings: {records: listings, counts: countByStatus(listings), bytes: listingBytes},
    questions: {records: questions, counts: countByStatus(questions), bytes: questionBytes},
    queue: getSyncOps(),
    savedWork,
    weather,
    ministry,
    measuredBytes: bundledBytes + serverBytes + images.bytes + audioBytes + listingBytes + questionBytes + cacheRecordBytes + savedWork.advice.bytes + savedWork.calculations.bytes,
  };
}

/** Unsent = something the farmer wrote that the server does not have yet. */
export function unsentCount(inv: Pick<Inventory, 'listings' | 'questions'>): number {
  const unsent = (r: {status: RecordStatus}) => r.status !== 'published';
  return inv.listings.records.filter(unsent).length + inv.questions.records.filter(unsent).length;
}
