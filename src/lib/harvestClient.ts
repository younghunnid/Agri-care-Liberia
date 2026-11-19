import {idbKv, type KvStore} from './kvStore';

/**
 * Buyer discovery on the phone. The full list of available harvest listings is fetched while online and kept on the phone as a SNAPSHOT with the time it was
 * saved; filters are applied on the phone, so they work offline too. Every answer says where it came from, so the screen can say "Saved list from <time>, may be
 * out of date" instead of implying it is current. The list contains only what the server shows every buyer: a seller's phone number is present only when
 * the seller consented.
 */
export interface HarvestListing {
  id: number; code: string | null; cropSlug: string; cropLabel: string; quantityKg: number | null; pricePerKgLrd: number; county: string; town: string; harvestDate: string | null;
  status: string; description: string; sellerName: string; farmName: string; sellerPhone: string; phoneConsent: boolean; synthetic: boolean; createdAt: string; updatedAt: string;
}
export interface HarvestFilters {crop?: string; county?: string; minKg?: number | null; maxPrice?: number | null; status?: string; includeSoldOut?: boolean}
export type HarvestSource = 'server' | 'saved' | 'none';
export interface HarvestLoad {listings: HarvestListing[]; source: HarvestSource; /** When this list was saved on the phone (saved lists) or fetched (server lists). */ asOf?: string; /** The server's clock when it produced the list. */ generatedAt?: string}

export const SNAPSHOT_KEY = 'phase1b.harvest.snapshot';
interface Snapshot {savedAt: string; generatedAt: string; listings: HarvestListing[]}

/** Same rules as GET /harvest/listings: sold-out listings are hidden unless asked for or chosen as the status. */
export function filterListings(list: HarvestListing[], f: HarvestFilters): HarvestListing[] {
  return list.filter((l) => {
    if (f.crop && l.cropSlug !== f.crop) return false;
    if (f.county && l.county !== f.county) return false;
    if (f.status) { if (l.status !== f.status) return false; } else if (!f.includeSoldOut && l.status === 'Sold Out') return false;
    if (f.minKg !== undefined && f.minKg !== null && (l.quantityKg ?? 0) < f.minKg) return false;
    if (f.maxPrice !== undefined && f.maxPrice !== null && l.pricePerKgLrd > f.maxPrice) return false;
    return true;
  });
}

export interface HarvestClientDeps {get: <T>(path: string) => Promise<T>; kv?: KvStore; now?: () => number}
export function createHarvestClient(deps: HarvestClientDeps) {
  const kv = deps.kv ?? idbKv;
  const stamp = () => new Date((deps.now ?? Date.now)()).toISOString();
  return {
    async load(): Promise<HarvestLoad> {
      try {
        const r = await deps.get<{listings: HarvestListing[]; generatedAt: string}>('/harvest/listings?includeSoldOut=1');
        const snap: Snapshot = {savedAt: stamp(), generatedAt: r.generatedAt, listings: r.listings};
        try { await kv.set(SNAPSHOT_KEY, snap); } catch { /* storage full or blocked: the live list is still returned */ }
        return {listings: r.listings, source: 'server', asOf: snap.savedAt, generatedAt: r.generatedAt};
      } catch {
        const saved = await kv.get<Snapshot>(SNAPSHOT_KEY);
        if (saved?.listings) return {listings: saved.listings, source: 'saved', asOf: saved.savedAt, generatedAt: saved.generatedAt};
        return {listings: [], source: 'none'};
      }
    },
  };
}
export type HarvestClient = ReturnType<typeof createHarvestClient>;

/** Finds a SELL reference in a list already on the phone (used when offline). */
export const findByCode = (list: HarvestListing[], code: string): HarvestListing | undefined => list.find((l) => l.code?.toUpperCase() === code.trim().toUpperCase());
