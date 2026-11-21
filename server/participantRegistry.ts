import type {DatabaseSync} from 'node:sqlite';
import {MIN_GROUP, suppressSmallGroups} from '../src/lib/harvestRules.ts';
import type {RegistryAggregates, RegistryBlock, RegistryTable} from '../src/lib/participantRegistry.ts';
import {getDb} from './db.ts';

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
export function registryAggregates(db: DatabaseSync = getDb()): RegistryAggregates {
  const result = {} as Record<'real' | 'synthetic', RegistryBlock>;
  for (const source of ['real', 'synthetic'] as const) {
    const rows = db.prepare('SELECT p.id, p.category, p.county FROM participant_registrations p WHERE p.is_synthetic = ? AND EXISTS (SELECT 1 FROM participant_consents c WHERE c.participant_id = p.id) ORDER BY p.id').all(source === 'synthetic' ? 1 : 0) as unknown as {id: number; category: string; county: string}[];
    const saved = db.prepare('SELECT participant_count, payload FROM participant_registry_publications WHERE source = ?').get(source) as {participant_count: number; payload: string} | undefined;
    if (saved && rows.length - saved.participant_count < MIN_GROUP) { result[source] = JSON.parse(saved.payload); continue; }
    const block: RegistryBlock = {total: rows.length >= MIN_GROUP ? rounded(rows.length) : null, categories: table(rows, 'category'), counties: table(rows, 'county')};
    db.prepare('INSERT INTO participant_registry_publications (source, participant_count, payload) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET participant_count=excluded.participant_count, payload=excluded.payload').run(source, rows.length, JSON.stringify(block));
    result[source] = block;
  }
  return {label: 'Agricare participant registry — demonstration, not official Ministry statistics', note: `Only consented registrations. Counts rounded down to multiples of ${MIN_GROUP}; small groups combined or suppressed, in durable batches of ${MIN_GROUP}. Category and county are separate distributions, with no cross-filtering. Categories do not verify expertise.`, minGroup: MIN_GROUP, ...result};
}
