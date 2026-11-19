import {HARVEST_LIMITS, cropBySlug, type HarvestCrop} from '../data/harvestCrops';

/** Pure harvest-listing rules shared by the browser (form checks) and the server (the real validation). */
export type HarvestFieldsResult =
  | {ok: true; crop: HarvestCrop; quantityKg: number; harvestDate: string}
  | {ok: false; error: string};

const DAY = 86_400_000;

/** `today` is injectable for tests. The harvest date is a calendar date (YYYY-MM-DD), not in the future (one day of clock slack) and not older than 400 days. */
export function validateHarvestFields(input: {cropSlug?: unknown; quantityKg?: unknown; harvestDate?: unknown}, today: Date = new Date()): HarvestFieldsResult {
  const crop = typeof input.cropSlug === 'string' ? cropBySlug(input.cropSlug) : undefined;
  if (!crop) return {ok: false, error: 'Choose one of the listed crops.'};
  const kgRaw = typeof input.quantityKg === 'string' && input.quantityKg.trim() !== '' ? Number(input.quantityKg) : input.quantityKg;
  if (typeof kgRaw !== 'number' || !Number.isInteger(kgRaw) || kgRaw < HARVEST_LIMITS.minKg || kgRaw > HARVEST_LIMITS.maxKg) {
    return {ok: false, error: `Quantity must be a whole number of kilograms from ${HARVEST_LIMITS.minKg} to ${HARVEST_LIMITS.maxKg.toLocaleString('en-US')}.`};
  }
  const d = typeof input.harvestDate === 'string' ? input.harvestDate.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  const valid = m && !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  if (!valid) return {ok: false, error: 'Enter the harvest date as year-month-day (for example 2026-11-18).'};
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (t > startOfToday + HARVEST_LIMITS.maxFutureDays * DAY) return {ok: false, error: 'The harvest date cannot be in the future.'};
  if (t < startOfToday - HARVEST_LIMITS.maxAgeDays * DAY) return {ok: false, error: 'The harvest date is too long ago for a current listing.'};
  return {ok: true, crop, quantityKg: kgRaw, harvestDate: d};
}

/** SELL-YYYY-NNNNNN from the database id and creation year: unique by construction (the id is unique), assigned only by the server. */
export function formatSellCode(id: number, createdAt: string | Date): string {
  const year = typeof createdAt === 'string' ? createdAt.slice(0, 4) : String(createdAt.getUTCFullYear());
  return `SELL-${/^\d{4}$/.test(year) ? year : '0000'}-${String(id).padStart(6, '0')}`;
}
export const SELL_CODE_PATTERN = /^SELL-\d{4}-\d{6}$/;

// ------------------------------------------------------------------------------------------------------------------------------ small-group suppression
export const MIN_GROUP = 3;
export interface AggGroup<M> {
  key: string;
  records: number;
  contributors: Set<string>;
  metrics: M;
}
export interface SuppressedView<M> {
  /** Groups with at least MIN_GROUP records AND MIN_GROUP distinct contributors, in the order given. */
  published: AggGroup<M>[];
  /** Everything else, combined into ONE row. Present only when the combination itself is large enough (>= MIN_GROUP records and contributors). */
  other: {groups: number; records: number; contributors: number; metrics: M} | null;
  /** True when nothing can be shown safely. */
  insufficient: boolean;
}

/**
 * Small-group suppression for published tables. A group is shown only with >= `k` records from >= `k` different contributors. Hidden groups are merged
 * into a single "Other" row so that every table still adds up to the same total (a table that silently dropped small groups would let a reader subtract
 * one table from another and recover the hidden numbers). If the merged row is itself too small, the smallest published groups are folded into it until it
 * is large enough (complementary suppression); if even everything together is too small, nothing is published.
 * This is k-anonymity style protection for a demonstration, not a formal privacy guarantee.
 */
export function suppressSmallGroups<M>(groups: AggGroup<M>[], merge: (a: M, b: M) => M, empty: M, k: number = MIN_GROUP): SuppressedView<M> {
  const ok = (g: {records: number; contributors: Set<string>}): boolean => g.records >= k && g.contributors.size >= k;
  let published = groups.filter(ok);
  const hidden = groups.filter((g) => !ok(g));
  const total = {records: groups.reduce((s, g) => s + g.records, 0), contributors: new Set(groups.flatMap((g) => [...g.contributors]))};
  if (!ok(total)) return {published: [], other: null, insufficient: true};
  const fold = (list: AggGroup<M>[]) => ({
    groups: list.length,
    records: list.reduce((s, g) => s + g.records, 0),
    contribs: new Set(list.flatMap((g) => [...g.contributors])),
    metrics: list.reduce((m, g) => merge(m, g.metrics), empty),
  });
  let other = hidden.length ? fold(hidden) : null;
  while (other && !ok({records: other.records, contributors: other.contribs}) && published.length > 0) {
    const smallest = [...published].sort((a, b) => a.records - b.records || a.key.localeCompare(b.key))[0];
    published = published.filter((g) => g !== smallest);
    other = fold([...hidden, ...groups.filter((g) => ok(g) && !published.includes(g))]);
  }
  if (other && !ok({records: other.records, contributors: other.contribs})) return {published: [], other: null, insufficient: true};
  return {published, other: other ? {groups: other.groups, records: other.records, contributors: other.contribs.size, metrics: other.metrics} : null, insufficient: false};
}
