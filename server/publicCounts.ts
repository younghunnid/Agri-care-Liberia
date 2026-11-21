import {getRuntimeConfig} from './runtime.ts';

/**
 * Privacy rules for counters shown to the PUBLIC (no sign-in). Exact counters let anyone who polls the site learn that "one more farmer registered" or
 * "one more inquiry arrived". Same idea as the Ministry aggregates (server/insights.ts), applied to single numbers:
 *  - fewer than MIN_PUBLIC_COUNT records are shown as 0 (never a small exact number);
 *  - larger values are rounded to the nearest PUBLIC_STEP;
 *  - the shown value only moves after the real value drifted by at least `insightsMinChange` records, so two visits cannot be subtracted to isolate one record.
 * Administrators see exact values. The snapshots live in memory (they restart with the server, which is harmless).
 */
export const MIN_PUBLIC_COUNT = 3;
export const PUBLIC_STEP = 5;
const snaps = new Map<string, number>();

export function publicCount(key: string, actual: number, minChange: number = getRuntimeConfig().insightsMinChange): number {
  const held = snaps.get(key);
  let basis = actual;
  if (held !== undefined && Math.abs(actual - held) < minChange) basis = held;
  else snaps.set(key, actual);
  return basis < MIN_PUBLIC_COUNT ? 0 : Math.round(basis / PUBLIC_STEP) * PUBLIC_STEP;
}
export function resetPublicCountsForTests(): void { snaps.clear(); }
export const PUBLIC_COUNTS_NOTE = `Approximate public numbers: fewer than ${MIN_PUBLIC_COUNT} are shown as 0, larger ones are rounded to the nearest ${PUBLIC_STEP} and change only after a few records are added or removed. Signed-in administrators see exact numbers.`;
