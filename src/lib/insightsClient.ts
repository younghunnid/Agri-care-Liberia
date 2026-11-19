import {idbKv, type KvStore} from './kvStore';

/** Aggregates for the (simulated) Ministry view, with an honest saved copy when offline. Nothing personal is ever in this data. */
export interface HarvestRow {key: string; label: string; listings: number; farmers: number; totalKg: number; averagePriceLrdPerKg: number}
export interface CheckRow {key: string; label: string; checks: number; devices: number; green: number; yellow: number; red: number}
export interface Table<R> {rows: R[]; other: (Omit<R, 'key' | 'label'> & {label: string}) | null; insufficient: boolean}
/** Records entered through the app (real) and invented demonstration records (synthetic) are two separate blocks and are never added together. */
export interface InsightsBlock {
  note: string; asOf: string;
  harvest: {byCounty: Table<HarvestRow>; byCrop: Table<HarvestRow>};
  cropChecks: {byCrop: Table<CheckRow>; byCounty: Table<CheckRow>};
}
export interface Aggregates {
  generatedAt: string; label: string; privacy: {minGroup: number; note: string}; containsSyntheticRecords: boolean;
  real: InsightsBlock; synthetic: InsightsBlock; refresh?: {minChange: number};
}
const isAggregates = (d: unknown): d is Aggregates => Boolean(d && typeof d === 'object' && (d as Aggregates).real && (d as Aggregates).synthetic); // a copy saved by an older version has another shape
export const INSIGHTS_KEY = 'phase1b.insights.snapshot';
export interface InsightsLoad {data: Aggregates | null; source: 'server' | 'saved' | 'none'; savedAt?: string}

export function createInsightsClient(deps: {get: <T>(path: string) => Promise<T>; kv?: KvStore; now?: () => number}) {
  const kv = deps.kv ?? idbKv;
  return {
    async load(): Promise<InsightsLoad> {
      try {
        const data = await deps.get<Aggregates>('/insights/aggregates');
        if (!isAggregates(data)) throw new Error('Unexpected response');
        const savedAt = new Date((deps.now ?? Date.now)()).toISOString();
        try { await kv.set(INSIGHTS_KEY, {savedAt, data}); } catch { /* ignore */ }
        return {data, source: 'server', savedAt};
      } catch {
        const saved = await kv.get<{savedAt: string; data: Aggregates}>(INSIGHTS_KEY);
        return isAggregates(saved?.data) ? {data: saved!.data, source: 'saved', savedAt: saved.savedAt} : {data: null, source: 'none'};
      }
    },
  };
}
