import {CROPS_LIBRARY, type CropGuideEntry} from './cropsLibrary';
import {SAMPLE_COUNTY_WEATHER, type CountyWeatherSample} from './weatherSoilMinistry';

/**
 * Phase 2A guidance content: planting windows and harvest/storage handling for the nine crops the project already supports, for the counties it already supports.
 * HONESTY RULES (checked by tests/phase2a.test.ts):
 *  - Planting months are NOT new claims: every period below is a structured copy of the "plantingWindow" text already in the Crops Library, and a test re-reads that text.
 *  - Harvest and storage bullets come from the Crops Library ("library") or are plain general good practice written for this demonstration ("team"). Each is tagged.
 *  - Nothing here is reviewed by the Ministry of Agriculture or by an agronomist. There are no doses, products, yields, prices or exact dates.
 *  - Weather is the bundled SAMPLE profile per county: not live, not a forecast.
 */

export const GUIDANCE_BANNER =
  'DEMONSTRATION GUIDANCE. Based on the project\'s Crops Library and general good practice. It has NOT been reviewed by the Ministry of Agriculture or by an agronomist. Dates and methods differ by place and by year: check with your county extension officer.';
export const REGIONAL_LIMIT =
  'Regional data is not verified. The planting months below are one general set for Liberia taken from the Crops Library. They are not adjusted for your county, your soil or this year\'s rains.';
export const SAMPLE_WEATHER_LABEL = 'SAMPLE weather. Not live. Not a forecast for today.';
export const OFFLINE_NOTE = 'This guidance is built into the app and works without internet.';

export type Provenance = 'library' | 'team';
export interface GuidanceItem {text: string; source: Provenance}

export interface PlantingPeriod {label: string; /** 1 = January */ from: number; to: number}
export interface PlantingEntry {slug: string; periods: PlantingPeriod[]; /** Said in words by the Crops Library, with no exact months. */ unspecified?: string}

/** Structured copy of CROPS_LIBRARY[slug].plantingWindow. A period may wrap over the new year (from > to). */
export const PLANTING_PERIODS: PlantingEntry[] = [
  {slug: 'rice', periods: [{label: 'Upland', from: 4, to: 6}, {label: 'Swamp', from: 5, to: 8}]},
  {slug: 'cassava', periods: [{label: 'First planting', from: 4, to: 6}, {label: 'Second planting', from: 8, to: 9}]},
  {slug: 'maize', periods: [{label: 'First planting', from: 4, to: 5}, {label: 'Second planting', from: 8, to: 9}]},
  {slug: 'pepper', periods: [{label: 'Nursery', from: 2, to: 4}], unspecified: 'Move seedlings out in the early rains. The Crops Library gives no exact months for this step.'},
  {slug: 'okra', periods: [{label: 'Main planting', from: 3, to: 6}], unspecified: 'The Crops Library also mentions the late rains, without exact months.'},
  {slug: 'tomatoes', periods: [{label: 'Dry-season beds', from: 10, to: 3}], unspecified: 'The Crops Library also mentions late rains and sheltered beds, without exact months.'},
  {slug: 'plantain', periods: [{label: 'Start of the rains', from: 4, to: 6}]},
  {slug: 'sweet-potatoes', periods: [{label: 'On raised ridges', from: 4, to: 9}]},
  {slug: 'groundnuts', periods: [{label: 'First planting', from: 4, to: 5}, {label: 'Second planting', from: 8, to: 9}]},
];

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m: number): string => MONTH_NAMES[(((m - 1) % 12) + 12) % 12];
export const periodText = (p: PlantingPeriod): string => (p.from === p.to ? monthName(p.from) : `${monthName(p.from)} to ${monthName(p.to)}`);

export const cropEntry = (slug: string): CropGuideEntry | undefined => CROPS_LIBRARY.find((c) => c.slug === slug);
export const plantingEntry = (slug: string): PlantingEntry | undefined => PLANTING_PERIODS.find((p) => p.slug === slug);
export const GUIDANCE_CROPS: {slug: string; name: string}[] = CROPS_LIBRARY.map((c) => ({slug: c.slug, name: c.name}));

export const inPeriod = (p: PlantingPeriod, month: number): boolean => (p.from <= p.to ? month >= p.from && month <= p.to : month >= p.from || month <= p.to);
/** Months from `month` until the period starts (0 if it has started or is running). */
export const monthsUntil = (p: PlantingPeriod, month: number): number => (inPeriod(p, month) ? 0 : (p.from - month + 12) % 12);

export type WindowState = 'open' | 'soon' | 'later';
export interface PlantingStatus {slug: string; state: WindowState; open: PlantingPeriod[]; next?: PlantingPeriod; monthsUntilNext?: number}
/** Where this month sits against the Crops Library window: inside it, opening within two months, or further away. Calendar only: it says nothing about this year's rains. */
export function plantingStatus(slug: string, month: number): PlantingStatus | null {
  const e = plantingEntry(slug); if (!e) return null;
  const open = e.periods.filter((p) => inPeriod(p, month));
  if (open.length) return {slug, state: 'open', open};
  const next = [...e.periods].sort((a, b) => monthsUntil(a, month) - monthsUntil(b, month))[0];
  const n = monthsUntil(next, month);
  return {slug, state: n <= 2 ? 'soon' : 'later', open: [], next, monthsUntilNext: n};
}

// ------------------------------------------------------------------------------------------------------------------------------------ counties
export interface CountyGuidance {county: string; hasSample: boolean; region: string | null; note: string; sampleCrops: string[]; sample: CountyWeatherSample | null}
/** County notes come from the bundled SAMPLE weather profiles (six counties). Other counties honestly say that nothing county-specific is bundled. */
export function countyGuidance(county: string): CountyGuidance {
  const s = SAMPLE_COUNTY_WEATHER.find((c) => c.county === county) ?? null;
  return s
    ? {county, hasSample: true, region: s.region, note: s.plantingGuidance, sampleCrops: s.recommendedCropSlugs, sample: s}
    : {county, hasSample: false, region: null, note: `No county sample is bundled for ${county} yet. The general Crops Library months apply and are not verified for this county.`, sampleCrops: [], sample: null};
}

// ------------------------------------------------------------------------------------------------------------------------------------ storage
/** General good practice written for the demonstration (tagged "team"). No numbers, products or doses. */
interface TeamStorage {handling: string[]; watchFor: string[]; sellTip: string}
const TEAM_STORAGE: Record<string, TeamStorage> = {
  rice: {handling: ['Clean the grain of dust and trash before you store it.', 'Keep old and new grain in separate sacks so a problem in one does not spread.'], watchFor: ['A musty smell or caked, darkened grain can mean damp got in. Dry it again before you use it.', 'Small holes or fine dust in a sack can mean insects. Move the grain and check the sacks beside it.'], sellTip: 'Dry, clean grain keeps better while you wait for a buyer.'},
  cassava: {handling: ['Handle roots gently: cut or bruised roots spoil faster.', 'Roots get worse quickly after digging, so arrange the buyer or the processing before you dig.'], watchFor: ['Dark streaks inside a root or a sour smell mean it is spoiling. Do not sell or eat it.'], sellTip: 'Speak to the buyer first, then dig only what can be collected or processed that day.'},
  maize: {handling: ['Remove husks and any rotten or mouldy cobs before storing.', 'Keep dried grain in closed containers so insects and damp cannot get in.'], watchFor: ['Powder, small holes or moving insects can mean weevils. Do not mix that grain with clean grain.', 'Mouldy grain should not be eaten or fed to animals.'], sellTip: 'Keep dried maize apart from fresh cobs.'},
  pepper: {handling: ['Pick in the cool morning and keep the fruit in the shade.', 'Pack loosely so air can move, and take out soft fruit before packing.'], watchFor: ['Soft, wrinkled or mouldy fruit spreads trouble to firm fruit. Remove it quickly.'], sellTip: 'Sort by firmness so a few soft fruits do not spoil the whole load.'},
  okra: {handling: ['Pick young pods often and handle them gently.', 'Keep picked pods in the shade with air around them.'], watchFor: ['Hard, woody pods and dark soft spots mean old or damaged pods. Keep them apart from good ones.'], sellTip: 'Plan to reach the market within a day or two, as the Crops Library suggests.'},
  tomatoes: {handling: ['Pick firm fruit and handle it as little as you can.', 'Pack in a shallow container so the fruit at the bottom is not crushed.'], watchFor: ['Split or soft fruit rots quickly. Separate it from firm fruit.'], sellTip: 'If the road is long, pick at a firmer stage, as the harvest advice above says.'},
  plantain: {handling: ['Carry bunches carefully: knocks cause dark marks.', 'Keep bunches in the shade, not on hot bare ground.'], watchFor: ['Fingers that turn black early on the road were probably bruised. Handle bunches more gently next time.'], sellTip: 'Arrange transport before you cut the bunch.'},
  'sweet-potatoes': {handling: ['Dig gently so the roots are not cut, and cure them in the shade as described above before storing.', 'Store sound roots in dry baskets, not in a closed damp sack.'], watchFor: ['Cut, soft or mouldy roots should be used or removed first so they do not spoil the others.'], sellTip: 'Sell cut roots first and store the sound ones.'},
  groundnuts: {handling: ['Dry the pods fully before storing and keep them off the ground.', 'Keep nuts in a dry, airy place and shell only what you need.'], watchFor: ['Mouldy, shrivelled or discoloured nuts should be thrown away. Never eat, sell or feed them to animals.'], sellTip: 'Sell only nuts that are dry and look and smell clean.'},
};

export interface StorageGuide {slug: string; name: string; atHarvest: GuidanceItem[]; storage: GuidanceItem[]; handling: GuidanceItem[]; watchFor: GuidanceItem[]; sellTip: GuidanceItem}
const lib = (xs: string[]): GuidanceItem[] => xs.map((text) => ({text, source: 'library' as const}));
const team = (xs: string[]): GuidanceItem[] => xs.map((text) => ({text, source: 'team' as const}));

export function storageGuide(slug: string): StorageGuide | null {
  const c = cropEntry(slug); const t = TEAM_STORAGE[slug]; if (!c || !t) return null;
  return {slug, name: c.name, atHarvest: lib(c.harvestingInfo), storage: lib(c.storageGuidance), handling: team(t.handling), watchFor: team(t.watchFor), sellTip: {text: t.sellTip, source: 'team'}};
}

export const COMMON_STORAGE_CHECKS: string[] = [
  'Clean your hands, tools and containers before handling the harvest.',
  'Sort out damaged, soft or mouldy produce first and keep it apart.',
  'Keep stored produce off the bare ground and away from walls that get damp and from leaking roofs.',
  'Look at what you have stored regularly, and use older stock first.',
];
export const PROVENANCE_LABEL: Record<Provenance, string> = {library: 'From the Crops Library', team: 'General good practice (demonstration)'};
