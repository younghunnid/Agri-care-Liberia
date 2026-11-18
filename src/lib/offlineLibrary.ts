import {CROPS_LIBRARY} from '../data/cropsLibrary';
import {LIVESTOCK_LIBRARY} from '../data/livestockLibrary';
import {COMMON_AGRICULTURAL_PROBLEMS, KNOWLEDGE_CATEGORIES} from '../data/knowledgeCenter';
import {
  BUNDLED_CONTENT_UPDATED,
  BUNDLED_CONTENT_VERSION,
  OUTDATED_AFTER_DAYS,
} from '../data/contentVersion';
import {OFFLINE_IMAGE_BYTES} from '../data/offlineImageManifest';
import {dbClear, dbDelete, dbGetAll, dbPutMany, isIndexedDbAvailable, isQuotaError, kvSet} from './offlineDb';
import {getOfflineGuides, type OfflineGuideRecord} from './offlineStorage';
import {ImageStorageError, getStoredImageStats, isImageStored, pruneImages, removeStoredImage, storeImage} from './offlineImages';

/**
 * Offline library for the bundled agricultural content (Crops, Pests & Diseases, Soil,
 * Livestock, Fish Farming, Knowledge Center). Text is copied into IndexedDB so it can be
 * searched and read independently of the service-worker cache; images are small WebP
 * copies cached separately. No agricultural wording is written here: every string below
 * is read from src/data/* unchanged.
 */

export type ModuleKey = 'crops' | 'pests' | 'soil' | 'livestock' | 'fish' | 'knowledge';

export const MODULES: {key: ModuleKey; label: string}[] = [
  {key: 'crops', label: 'Crops Library'},
  {key: 'pests', label: 'Pests & Diseases'},
  {key: 'soil', label: 'Soil & Fertilizer'},
  {key: 'livestock', label: 'Livestock'},
  {key: 'fish', label: 'Fish Farming'},
  {key: 'knowledge', label: 'Knowledge Center'},
];

export function moduleLabel(key: ModuleKey): string {
  return MODULES.find((m) => m.key === key)?.label ?? key;
}

export interface LibrarySection {
  heading: string;
  items: string[];
}

export interface LibraryEntry {
  id: string;
  module: ModuleKey;
  title: string;
  subtitle: string;
  summary: string;
  sections: LibrarySection[];
  /** Safety / disclaimer text exactly as written in the source data. */
  safetyNotice: string;
  /** Optimised (small WebP) image path, or null when no illustration exists. */
  imageUrl: string | null;
  relatedIds: string[];
  language: 'en';
  contentVersion: number;
  /** ISO date (YYYY-MM-DD) the content was last updated. */
  lastUpdated: string;
  sizeBytes: number;
  searchText: string;
  downloadedAt?: string;
}

/** `/src/assets/images/x.jpg` -> `/offline-img/x.webp` (null if no optimised copy exists). */
export function optimizedImage(url: string | null | undefined): string | null {
  if (!url) return null;
  const file = url.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '.webp');
  return file && OFFLINE_IMAGE_BYTES[file] !== undefined ? `/offline-img/${file}` : null;
}

export function optimizedImageBytes(path: string): number {
  return OFFLINE_IMAGE_BYTES[path.split('/').pop() ?? ''] ?? 0;
}

const encoder = new TextEncoder();

function finish(e: Omit<LibraryEntry, 'sizeBytes' | 'searchText' | 'language' | 'contentVersion' | 'lastUpdated'>): Omit<LibraryEntry, 'downloadedAt'> {
  const searchText = [e.title, e.subtitle, e.summary, e.safetyNotice, ...e.sections.flatMap((s) => [s.heading, ...s.items])]
    .join(' \n ')
    .toLowerCase();
  const full = {
    ...e,
    language: 'en' as const,
    contentVersion: BUNDLED_CONTENT_VERSION,
    lastUpdated: BUNDLED_CONTENT_UPDATED,
    searchText,
    sizeBytes: 0,
  };
  full.sizeBytes = encoder.encode(JSON.stringify(full)).length;
  return full;
}

const CATEGORY_MODULE: Record<string, ModuleKey> = {
  'pest-disease-management': 'pests',
  'soil-fertility-land-prep': 'soil',
  'poultry-farming': 'livestock',
  'livestock-management': 'livestock',
  'fish-farming-aquaculture': 'fish',
};

const PROBLEM_MODULE: Record<string, ModuleKey> = {
  'prob-pests-diseases': 'pests',
  'prob-poor-soil': 'soil',
};

let catalogMemo: Omit<LibraryEntry, 'downloadedAt'>[] | null = null;

/** Every downloadable bundled guide. Built once from src/data/*. */
export function getCatalog(): Omit<LibraryEntry, 'downloadedAt'>[] {
  if (catalogMemo) return catalogMemo;
  const out: Omit<LibraryEntry, 'downloadedAt'>[] = [];

  const kcByModule = (m: ModuleKey) =>
    KNOWLEDGE_CATEGORIES.flatMap((c) => (CATEGORY_MODULE[c.id] === m ? c.articles.map((a) => `kc:${a.id}`) : []));

  for (const c of CROPS_LIBRARY) {
    out.push(
      finish({
        id: `crop:${c.slug}`,
        module: 'crops',
        title: c.name,
        subtitle: `${c.category} · ${c.localNames}`,
        summary: c.summary,
        sections: [
          {heading: 'Overview', items: [c.overview]},
          {heading: 'Planting window', items: [c.plantingWindow]},
          {heading: 'Planting', items: c.plantingInfo},
          {heading: 'Soil requirements', items: c.soilRequirements},
          {heading: 'Water management', items: c.waterManagement},
          {heading: 'Common pests & diseases', items: c.commonPestsDiseases},
          {heading: 'Crop maintenance', items: c.cropMaintenance},
          {heading: 'Harvesting', items: c.harvestingInfo},
          {heading: 'Storage', items: c.storageGuidance},
        ],
        safetyNotice: c.safetyDisclaimer,
        imageUrl: optimizedImage(c.imageUrl),
        relatedIds: [...kcByModule('pests').slice(0, 1), ...kcByModule('soil').slice(0, 1)],
      })
    );
  }

  for (const l of LIVESTOCK_LIBRARY) {
    const isFish = l.slug === 'fish-farming';
    out.push(
      finish({
        id: `livestock:${l.slug}`,
        module: isFish ? 'fish' : 'livestock',
        title: l.name,
        subtitle: l.subtitle,
        summary: l.summary,
        sections: [
          {heading: 'Care guide', items: l.careGuide},
          {heading: 'Feeding', items: l.feedingEducation},
          {heading: 'Housing & sanitation', items: l.housingSanitation},
          {heading: 'Welfare', items: l.welfareGuidance},
          {heading: 'Breeding', items: l.breedingInfo},
          {heading: 'Disease prevention', items: l.diseasePrevention},
        ],
        safetyNotice: l.vetReferralNote,
        imageUrl: optimizedImage(l.imageUrl),
        relatedIds: isFish ? kcByModule('fish') : [],
      })
    );
  }

  for (const cat of KNOWLEDGE_CATEGORIES) {
    const module = CATEGORY_MODULE[cat.id] ?? 'knowledge';
    const siblings = cat.articles.map((a) => `kc:${a.id}`);
    for (const a of cat.articles) {
      out.push(
        finish({
          id: `kc:${a.id}`,
          module,
          title: a.title,
          subtitle: cat.name,
          summary: a.summary,
          sections: [{heading: 'Steps', items: a.steps}],
          safetyNotice: a.cautionNote,
          imageUrl: optimizedImage(a.imageUrl || cat.imageUrl),
          relatedIds: siblings.filter((id) => id !== `kc:${a.id}`),
        })
      );
    }
  }

  for (const p of COMMON_AGRICULTURAL_PROBLEMS) {
    out.push(
      finish({
        id: `problem:${p.id}`,
        module: PROBLEM_MODULE[p.id] ?? 'knowledge',
        title: p.question,
        subtitle: `Common problem · ${p.categoryName}`,
        summary: p.quickSummary,
        sections: [{heading: 'What to do', items: p.steps}],
        safetyNotice: p.safetyDisclaimer,
        imageUrl: null,
        relatedIds: [],
      })
    );
  }

  catalogMemo = out;
  return out;
}

export function getCatalogEntry(id: string): Omit<LibraryEntry, 'downloadedAt'> | undefined {
  return getCatalog().find((e) => e.id === id);
}

// ---------------------------------------------------------------- dates / freshness

export function ageInDays(isoDate: string, now = Date.now()): number {
  const t = Date.parse(isoDate);
  return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : 0;
}

export function isOutdated(isoDate: string | null | undefined, now = Date.now()): boolean {
  if (!isoDate) return false;
  return ageInDays(isoDate, now) > OUTDATED_AFTER_DAYS;
}

/** The app now ships a newer version of this guide than the copy stored on the device. */
export function hasNewerVersion(entry: LibraryEntry): boolean {
  return entry.contentVersion < BUNDLED_CONTENT_VERSION;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
}

// ---------------------------------------------------------------- stored entries

let cache: LibraryEntry[] = [];
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function initOfflineLibrary(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isIndexedDbAvailable()) return;
    try {
      cache = await dbGetAll<LibraryEntry>('library');
    } catch {
      cache = [];
    }
  })();
  return initPromise;
}

export function getLibraryEntries(): LibraryEntry[] {
  return cache;
}

export function getLibraryEntry(id: string): LibraryEntry | null {
  return cache.find((e) => e.id === id) ?? null;
}

export function isEntryDownloaded(id: string): boolean {
  return cache.some((e) => e.id === id);
}

export class LibraryStorageError extends Error {
  quotaExceeded: boolean;
  constructor(message: string, quotaExceeded: boolean) {
    super(message);
    this.name = 'LibraryStorageError';
    this.quotaExceeded = quotaExceeded;
  }
}

/** Writes entries in one IndexedDB transaction; nothing is half-saved if it fails. */
export async function saveLibraryEntries(entries: Omit<LibraryEntry, 'downloadedAt'>[]): Promise<void> {
  await initOfflineLibrary();
  const stamp = new Date().toISOString();
  const records: LibraryEntry[] = entries.map((e) => ({...e, downloadedAt: stamp}));
  try {
    await dbPutMany('library', records);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new LibraryStorageError('Not enough storage on this device. Remove some downloads and try again.', true);
    }
    throw new LibraryStorageError('Could not save these guides on this device.', false);
  }
  const ids = new Set(records.map((r) => r.id));
  cache = [...records, ...cache.filter((e) => !ids.has(e.id))];
  emit();
}

export async function removeLibraryEntry(id: string): Promise<void> {
  await initOfflineLibrary();
  await dbDelete('library', id);
  cache = cache.filter((e) => e.id !== id);
  emit();
}

export async function clearLibrary(): Promise<void> {
  await initOfflineLibrary();
  await dbClear('library');
  cache = [];
  emit();
  await kvSet('starterPackRun', null).catch(() => undefined);
}

// ---------------------------------------------------------------- images
// Stored as Blobs in IndexedDB (works on any origin); see offlineImages.ts for why.

export async function getCachedImageBytes(): Promise<Record<string, number>> {
  return (await getStoredImageStats()).sizes;
}

export const isImageCached = isImageStored;

/** Downloads one optimised picture and keeps it on the device. Throws on failure. */
export async function cacheImage(url: string, signal?: AbortSignal): Promise<number> {
  try {
    return await storeImage(url, signal);
  } catch (err) {
    if (err instanceof ImageStorageError && err.quotaExceeded) throw new LibraryStorageError(err.message, true);
    throw err;
  }
}

export const removeCachedImage = removeStoredImage;

/** Removes optimised pictures that no remaining saved guide (bundled or server) still uses. */
export async function pruneUnusedImages(): Promise<void> {
  const used = new Set<string>();
  for (const e of cache) if (e.imageUrl) used.add(e.imageUrl);
  for (const g of getOfflineGuides()) {
    const small = optimizedImage(g.imageUrl);
    if (small) used.add(small);
  }
  await pruneImages(used);
}

// ---------------------------------------------------------------- search

export interface SearchResult {
  kind: 'library' | 'guide';
  id: string;
  module: ModuleKey;
  title: string;
  snippet: string;
  to: string;
  lastUpdated: string | null;
  outdated: boolean;
  score: number;
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function guideModule(g: OfflineGuideRecord): ModuleKey {
  return g.isPestDisease ? 'pests' : 'crops';
}

function snippetAround(text: string, tokens: string[]): string {
  const lower = fold(text);
  const idx = Math.min(...tokens.map((t) => (lower.indexOf(t) >= 0 ? lower.indexOf(t) : Infinity)));
  if (!Number.isFinite(idx)) return text.slice(0, 140);
  const start = Math.max(0, idx - 40);
  return (start > 0 ? '…' : '') + text.slice(start, start + 150).trim() + (start + 150 < text.length ? '…' : '');
}

/** Searches only what is stored on the device, so it works with no network. */
export function searchOffline(query: string, module: ModuleKey | 'all' = 'all'): SearchResult[] {
  const tokens = fold(query).split(/\s+/).filter((t) => t.length > 0);
  const results: SearchResult[] = [];

  const consider = (
    kind: SearchResult['kind'],
    id: string,
    mod: ModuleKey,
    title: string,
    summary: string,
    body: string,
    to: string,
    lastUpdated: string | null
  ) => {
    if (module !== 'all' && mod !== module) return;
    const t = fold(title);
    const s = fold(summary);
    const b = fold(body);
    let score = 0;
    for (const tok of tokens) {
      if (t.includes(tok)) score += 5;
      else if (s.includes(tok)) score += 3;
      else if (b.includes(tok)) score += 1;
      else return; // every word must appear somewhere
    }
    results.push({
      kind,
      id,
      module: mod,
      title,
      snippet: tokens.length ? snippetAround(summary + ' ' + body, tokens) : summary,
      to,
      lastUpdated,
      outdated: isOutdated(lastUpdated),
      score,
    });
  };

  for (const e of cache) {
    consider('library', e.id, e.module, e.title, e.summary, e.searchText, `/offline/read/${encodeURIComponent(e.id)}`, e.lastUpdated);
  }
  for (const g of getOfflineGuides()) {
    consider('guide', `guide:${g.id}`, guideModule(g), g.title, g.summary, g.contentMarkdown, `/guides/${g.slug}`, g.lastReviewedAt);
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
