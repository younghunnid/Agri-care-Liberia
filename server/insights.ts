import type {DatabaseSync} from 'node:sqlite';
import {cropBySlug} from '../src/data/harvestCrops.ts';
import {CROP_LABELS, type TriageBand, type TriageCrop} from '../src/data/triageCases.ts';
import {MIN_GROUP, suppressSmallGroups, type AggGroup} from '../src/lib/harvestRules.ts';
import {getDb} from './db.ts';

/**
 * Privacy-protected aggregates for the (simulated) Ministry view. Only counts and totals are produced: never a name, phone number, town, reference code,
 * device key, date of a single record or any other field of an individual record. A group is published only with >= MIN_GROUP records from
 * >= MIN_GROUP different contributors (distinct sellers / distinct devices or accounts); smaller groups are merged into one "Other" row, see
 * suppressSmallGroups(). Each dimension is published as its own table; there is no cross-tab and no grand-total row.
 */
export const INSIGHTS_LABEL = 'SIMULATED DEMONSTRATION. This is not an official Ministry system and these are not official statistics.';
export const PRIVACY_NOTE = `A group is shown only when it has at least ${MIN_GROUP} records from at least ${MIN_GROUP} different farmers or devices. Smaller groups are combined into one "Other" row. No names, phone numbers, villages, reference codes or photos are ever included.`;

interface HarvestM {kg: number; priceSum: number}
const mergeHarvest = (a: HarvestM, b: HarvestM): HarvestM => ({kg: a.kg + b.kg, priceSum: a.priceSum + b.priceSum});
interface CheckM {green: number; yellow: number; red: number}
const mergeCheck = (a: CheckM, b: CheckM): CheckM => ({green: a.green + b.green, yellow: a.yellow + b.yellow, red: a.red + b.red});

function group<M>(rows: {key: string; contributor: string; m: M}[], merge: (a: M, b: M) => M, empty: M): AggGroup<M>[] {
  const map = new Map<string, AggGroup<M>>();
  for (const r of rows) {
    const g = map.get(r.key) ?? {key: r.key, records: 0, contributors: new Set<string>(), metrics: empty};
    g.records++; g.contributors.add(r.contributor); g.metrics = merge(g.metrics, r.m);
    map.set(r.key, g);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface HarvestRow {key: string; label: string; listings: number; farmers: number; totalKg: number; averagePriceLrdPerKg: number}
export interface CheckRow {key: string; label: string; checks: number; devices: number; green: number; yellow: number; red: number}
export interface Table<R> {rows: R[]; other: (Omit<R, 'key' | 'label'> & {label: string; groupsCombined: number}) | null; insufficient: boolean}

function harvestTable(rows: {key: string; label: string; contributor: string; kg: number; price: number}[]): Table<HarvestRow> {
  const labels = new Map(rows.map((r) => [r.key, r.label]));
  const view = suppressSmallGroups(group(rows.map((r) => ({key: r.key, contributor: r.contributor, m: {kg: r.kg, priceSum: r.price}})), mergeHarvest, {kg: 0, priceSum: 0}), mergeHarvest, {kg: 0, priceSum: 0});
  const avg = (m: HarvestM, n: number) => (n ? Math.round(m.priceSum / n) : 0);
  return {
    insufficient: view.insufficient,
    rows: view.published.map((g) => ({key: g.key, label: labels.get(g.key) ?? g.key, listings: g.records, farmers: g.contributors.size, totalKg: g.metrics.kg, averagePriceLrdPerKg: avg(g.metrics, g.records)})),
    other: view.other ? {label: 'Other (small groups combined)', groupsCombined: view.other.groups, listings: view.other.records, farmers: view.other.contributors, totalKg: view.other.metrics.kg, averagePriceLrdPerKg: avg(view.other.metrics, view.other.records)} : null,
  };
}
function checkTable(rows: {key: string; label: string; contributor: string; band: TriageBand}[]): Table<CheckRow> {
  const labels = new Map(rows.map((r) => [r.key, r.label]));
  const m = (b: TriageBand): CheckM => ({green: b === 'green' ? 1 : 0, yellow: b === 'yellow' ? 1 : 0, red: b === 'red' ? 1 : 0});
  const empty: CheckM = {green: 0, yellow: 0, red: 0};
  const view = suppressSmallGroups(group(rows.map((r) => ({key: r.key, contributor: r.contributor, m: m(r.band)})), mergeCheck, empty), mergeCheck, empty);
  return {
    insufficient: view.insufficient,
    rows: view.published.map((g) => ({key: g.key, label: labels.get(g.key) ?? g.key, checks: g.records, devices: g.contributors.size, ...g.metrics})),
    other: view.other ? {label: 'Other (small groups combined)', groupsCombined: view.other.groups, checks: view.other.records, devices: view.other.contributors, ...view.other.metrics} : null,
  };
}

export function computeAggregates(db: DatabaseSync = getDb()) {
  const listings = db.prepare(
    `SELECT county, crop_slug, quantity_kg, price_lrd, is_fictional_seller AS synthetic,
            COALESCE('u' || seller_user_id, NULLIF(owner_key_hash, ''), 'l' || id) AS contributor
     FROM marketplace_listings WHERE is_harvest_listing = 1 AND moderation_status = 'approved' AND quantity_kg IS NOT NULL`
  ).all() as {county: string; crop_slug: string; quantity_kg: number; price_lrd: number; synthetic: number; contributor: string}[];
  const checks = db.prepare(
    `SELECT county, crop, band, is_synthetic AS synthetic, COALESCE('u' || user_id, NULLIF(requester_key_hash, ''), 'r' || id) AS contributor FROM triage_reports`
  ).all() as {county: string; crop: string; band: TriageBand; synthetic: number; contributor: string}[];
  const cropLabel = (slug: string) => cropBySlug(slug)?.label ?? slug;
  return {
    generatedAt: new Date().toISOString(),
    label: INSIGHTS_LABEL,
    privacy: {minGroup: MIN_GROUP, note: PRIVACY_NOTE},
    containsSyntheticRecords: listings.some((l) => l.synthetic === 1) || checks.some((c) => c.synthetic === 1),
    harvest: {
      byCounty: harvestTable(listings.map((l) => ({key: l.county, label: l.county, contributor: l.contributor, kg: l.quantity_kg, price: l.price_lrd}))),
      byCrop: harvestTable(listings.map((l) => ({key: l.crop_slug, label: cropLabel(l.crop_slug), contributor: l.contributor, kg: l.quantity_kg, price: l.price_lrd}))),
    },
    cropChecks: {
      byCrop: checkTable(checks.map((c) => ({key: c.crop, label: CROP_LABELS[c.crop as TriageCrop] ?? c.crop, contributor: c.contributor, band: c.band}))),
      byCounty: checkTable(checks.map((c) => ({key: c.county, label: c.county, contributor: c.contributor, band: c.band}))),
    },
  };
}
