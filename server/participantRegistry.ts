import type {DatabaseSync} from 'node:sqlite';
import {MIN_GROUP, suppressSmallGroups} from '../src/lib/harvestRules.ts';
import type {RegistryAggregates, RegistryBlock, RegistryTable} from '../src/lib/participantRegistry.ts';
import {getDb} from './db.ts';
import {registryMode} from './registryMode.ts';

const rounded = (n: number) => Math.floor(n / MIN_GROUP) * MIN_GROUP;
function table(rows: {id: number; category: string; county: string}[], dimension: 'category' | 'county'): RegistryTable {
  const map = new Map<string, {key: string; records: number; contributors: Set<string>; metrics: number}>();
  for (const row of rows) {
    const key = row[dimension]; const group = map.get(key) ?? {key, records: 0, contributors: new Set<string>(), metrics: 0};
    group.records++; group.contributors.add(String(row.id)); map.set(key, group);
  }
  const s = suppressSmallGroups([...map.values()], (a, b) => a + b, 0);
  return {insufficient: s.insufficient, rows: [...s.published.map((r) => ({label: r.key, participants: rounded(r.records)})), ...(s.other ? [{label: 'Other (combined)', participants: rounded(s.other.records)}] : [])].sort((a, b) => a.label.localeCompare(b.label))};
}
type Source = 'real' | 'anonymous' | 'synthetic';
const SELECTORS: Record<Source, string> = {
  // Genuine: a non-synthetic participant bound to an account. Phone numbers are NOT verified (no SMS), so verification is reported separately below.
  real: 'p.is_synthetic = 0 AND p.user_id IS NOT NULL',
  // Anonymous browser participants (device identity, no account): never counted as genuine people.
  anonymous: 'p.is_synthetic = 0 AND p.user_id IS NULL',
  synthetic: 'p.is_synthetic = 1',
};
/** Durable batches: the published value changes only after MIN_GROUP more records exist, so one new registration cannot be isolated by comparing two visits. */
function batched<T>(db: DatabaseSync, source: string, count: number, compute: () => T): T {
  const saved = db.prepare('SELECT participant_count, payload FROM participant_registry_publications WHERE source = ?').get(source) as {participant_count: number; payload: string} | undefined;
  if (saved && count - saved.participant_count < MIN_GROUP) return JSON.parse(saved.payload) as T;
  const value = compute();
  db.prepare('INSERT INTO participant_registry_publications (source, participant_count, payload) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET participant_count=excluded.participant_count, payload=excluded.payload').run(source, count, JSON.stringify(value));
  return value;
}
export function registryAggregates(db: DatabaseSync = getDb()): RegistryAggregates {
  const result = {} as Record<Source, RegistryBlock>;
  for (const source of ['real', 'anonymous', 'synthetic'] as const) {
    const rows = db.prepare(`SELECT p.id, p.category, p.county FROM participant_registrations p WHERE ${SELECTORS[source]} AND EXISTS (SELECT 1 FROM participant_consents c WHERE c.participant_id = p.id) ORDER BY p.id`).all() as unknown as {id: number; category: string; county: string}[];
    result[source] = batched(db, source, rows.length, (): RegistryBlock => ({total: rows.length >= MIN_GROUP ? rounded(rows.length) : null, categories: table(rows, 'category'), counties: table(rows, 'county')}));
  }
  // Genuine participants split by phone status (verified means proven by an SMS code or similar; always 0 while no SMS exists). Each number is suppressed on its own.
  const phone = (verified: boolean) => {
    const count = (db.prepare(`SELECT COUNT(*) AS c FROM participant_registrations p JOIN users u ON u.id = p.user_id WHERE ${SELECTORS.real} AND (u.phone_verified_at IS NOT NULL) = ? AND EXISTS (SELECT 1 FROM participant_consents c WHERE c.participant_id = p.id)`).get(verified ? 1 : 0) as {c: number}).c;
    return batched<{value: number | null}>(db, verified ? 'real-phone-verified' : 'real-phone-unverified', count, () => ({value: count >= MIN_GROUP ? rounded(count) : null})).value;
  };
  result.real = {...result.real, phone: {unverified: phone(false), verified: phone(true)}};
  const real = registryMode() === 'real';
  return {label: real ? 'Agricare participant registry — not official Ministry statistics' : 'Agricare participant registry — demonstration, not official Ministry statistics',
    note: `Only consented registrations, in four separate classes: genuine account participants (their phone numbers are not verified), anonymous browser participants, and synthetic demonstration records. Counts are rounded down to multiples of ${MIN_GROUP}; small groups are combined or suppressed, in durable batches of ${MIN_GROUP}. Category and county are separate distributions, with no cross-filtering. Categories do not verify expertise.`,
    minGroup: MIN_GROUP, real: result.real, anonymous: result.anonymous, synthetic: result.synthetic};
}
