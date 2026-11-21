/**
 * SYNTHETIC DEMONSTRATION DATA for the "Ministry & Extension View (Demo)".
 *
 * Adapted from the illustrative tables in a teammate's HTML prototype (used as a functional reference). NOTHING here is a real statistic, a
 * Ministry figure, a real forecast, a verified diagnosis or an agronomist-approved rule. It contains no personal data: no names, phone numbers or
 * individual records. Safe to bundle, safe to show offline.
 */
export const DEMO_COUNTIES = ['Bong', 'Nimba', 'Lofa', 'Margibi', 'Montserrado'] as const;
export type DemoCounty = (typeof DEMO_COUNTIES)[number];

export const DEMO_DATASET_LABEL = 'Synthetic demonstration data, Team 8 prototype. Not official statistics.';

export interface ProductionRow {
  id: string;
  county: DemoCounty;
  crop: string;
  plantedHa: number;
  expectedMt: number;
  actualMt: number;
  /** The three inputs of the illustrative index, each 0 to 100. */
  availability: number;
  weather: number;
  cropHealth: number;
}

export const PRODUCTION: ProductionRow[] = [
  {id: 'bong-cassava', county: 'Bong', crop: 'Cassava', plantedHa: 1420, expectedMt: 17040, actualMt: 11928, availability: 70, weather: 65, cropHealth: 68},
  {id: 'bong-rice', county: 'Bong', crop: 'Rice', plantedHa: 980, expectedMt: 2450, actualMt: 1862, availability: 72, weather: 65, cropHealth: 74},
  {id: 'bong-pepper', county: 'Bong', crop: 'Pepper', plantedHa: 210, expectedMt: 840, actualMt: 512, availability: 58, weather: 54, cropHealth: 72},
  {id: 'nimba-rice', county: 'Nimba', crop: 'Rice', plantedHa: 1640, expectedMt: 4100, actualMt: 2747, availability: 67, weather: 72, cropHealth: 56},
  {id: 'nimba-cassava', county: 'Nimba', crop: 'Cassava', plantedHa: 1150, expectedMt: 13800, actualMt: 10902, availability: 79, weather: 74, cropHealth: 76},
  {id: 'nimba-pepper', county: 'Nimba', crop: 'Pepper', plantedHa: 320, expectedMt: 1280, actualMt: 960, availability: 75, weather: 70, cropHealth: 73},
  {id: 'lofa-rice', county: 'Lofa', crop: 'Rice', plantedHa: 1390, expectedMt: 3475, actualMt: 2710, availability: 78, weather: 76, cropHealth: 72},
  {id: 'lofa-palm', county: 'Lofa', crop: 'Palm Oil', plantedHa: 640, expectedMt: 1920, actualMt: 1555, availability: 81, weather: 74, cropHealth: 78},
  {id: 'margibi-cassava', county: 'Margibi', crop: 'Cassava', plantedHa: 880, expectedMt: 10560, actualMt: 7498, availability: 71, weather: 69, cropHealth: 64},
  {id: 'margibi-okra', county: 'Margibi', crop: 'Okra', plantedHa: 240, expectedMt: 960, actualMt: 758, availability: 79, weather: 72, cropHealth: 77},
  {id: 'montserrado-pepper', county: 'Montserrado', crop: 'Pepper', plantedHa: 195, expectedMt: 780, actualMt: 445, availability: 57, weather: 58, cropHealth: 61},
  {id: 'montserrado-okra', county: 'Montserrado', crop: 'Okra', plantedHa: 265, expectedMt: 1060, actualMt: 795, availability: 75, weather: 66, cropHealth: 74},
];

export const DEMO_CROPS: string[] = [...new Set(PRODUCTION.map((r) => r.crop))].sort();

// ------------------------------------------------------------------ overview (synthetic unless a card says otherwise)
export const OVERVIEW_SYNTHETIC = {
  registeredFarmers: 4860,
  activeFarmers30d: 2970,
  cropReports30d: 1340,
  expertRequests30d: 214,
};

// ------------------------------------------------------------------ weather (synthetic; the "window" labels are DRAFT rules, not agronomist-approved)
export type PlantingWindow = 'Open' | 'Caution' | 'Closed';
export interface ForecastWindow { tempC: number; rainMm: number; soilMoisture: number; window: PlantingWindow; note: string }
export interface CountyWeatherDemo {
  county: DemoCounty;
  station: string;
  d3: ForecastWindow;
  d7: ForecastWindow;
  draftGuidance: string;
}
export const WEATHER_DEMO: CountyWeatherDemo[] = [
  {county: 'Bong', station: 'Demo station, Gbarnga area',
    d3: {tempC: 27, rainMm: 14, soilMoisture: 64, window: 'Open', note: 'Moderate rain; soil moisture adequate.'},
    d7: {tempC: 29, rainMm: 22, soilMoisture: 58, window: 'Caution', note: 'A drier spell may arrive mid-week.'},
    draftGuidance: 'Draft: conditions look workable for cassava. For pepper, wait for steadier moisture and ask your extension officer.'},
  {county: 'Nimba', station: 'Demo station, Sanniquellie area',
    d3: {tempC: 26, rainMm: 44, soilMoisture: 81, window: 'Caution', note: 'Heavy rain: flooding risk on low fields.'},
    d7: {tempC: 27, rainMm: 58, soilMoisture: 84, window: 'Caution', note: 'Wet week: check drainage.'},
    draftGuidance: 'Draft: check that drains and bunds around rice fields are clear before heavy rain. Keep harvested grain dry.'},
  {county: 'Lofa', station: 'Demo station, Voinjama area',
    d3: {tempC: 25, rainMm: 18, soilMoisture: 70, window: 'Open', note: 'Moderate rain; good field conditions.'},
    d7: {tempC: 26, rainMm: 31, soilMoisture: 68, window: 'Open', note: 'Steady, favourable week.'},
    draftGuidance: 'Draft: moderate rainfall suits upland crops. Check animals daily after damp mornings and contact a veterinary officer if any look unwell.'},
  {county: 'Margibi', station: 'Demo station, Kakata area',
    d3: {tempC: 33, rainMm: 2, soilMoisture: 41, window: 'Closed', note: 'Hot and dry: soil is drying out.'},
    d7: {tempC: 33, rainMm: 6, soilMoisture: 38, window: 'Closed', note: 'Little rain expected all week.'},
    draftGuidance: 'Draft: hot and dry. Water early in the morning, mulch young plants, and delay new planting until rain returns.'},
  {county: 'Montserrado', station: 'Demo station, Monrovia coast',
    d3: {tempC: 28, rainMm: 11, soilMoisture: 62, window: 'Open', note: 'Light rain; humid.'},
    d7: {tempC: 30, rainMm: 19, soilMoisture: 59, window: 'Caution', note: 'Humidity may rise later in the week.'},
    draftGuidance: 'Draft: humid coastal conditions. Look at pepper and okra leaves regularly before transplanting and keep seedlings off wet soil.'},
];

// ------------------------------------------------------------------ disease surveillance (aggregated, synthetic; "possible concern", never a diagnosis)
export type ConcernCategory = 'Crop' | 'Livestock';
export interface SignalRow {
  id: string;
  county: DemoCounty;
  category: ConcernCategory;
  /** Plain description of what farmers reported. NOT a diagnosis. */
  concern: string;
  reports7d: number;
}
export const SIGNALS: SignalRow[] = [
  {id: 'SIG-001', county: 'Bong', category: 'Crop', concern: 'Cassava leaves yellow, patchy or curled', reports7d: 10},
  {id: 'SIG-002', county: 'Nimba', category: 'Crop', concern: 'Rice leaf spots after heavy rain', reports7d: 5},
  {id: 'SIG-003', county: 'Lofa', category: 'Livestock', concern: 'Goats looking unwell (reported by owners)', reports7d: 3},
  {id: 'SIG-004', county: 'Margibi', category: 'Crop', concern: 'Cassava stems browning or drying', reports7d: 2},
  {id: 'SIG-005', county: 'Montserrado', category: 'Crop', concern: 'Pepper leaves curling', reports7d: 2},
  {id: 'SIG-006', county: 'Margibi', category: 'Livestock', concern: 'Chickens looking unwell (reported by owners)', reports7d: 1},
];

// ------------------------------------------------------------------ campaign material (SIMULATION ONLY)
export const CAMPAIGN_CROPS = ['Cassava', 'Rice', 'Pepper', 'Okra', 'Goats', 'Poultry'] as const;
/** Synthetic audience sizes (opted-in demo subscribers). Invented for the simulation. */
export const AUDIENCE: Record<DemoCounty, Record<(typeof CAMPAIGN_CROPS)[number], number>> = {
  Bong: {Cassava: 2340, Rice: 1620, Pepper: 490, Okra: 310, Goats: 420, Poultry: 510},
  Nimba: {Cassava: 1790, Rice: 1850, Pepper: 610, Okra: 380, Goats: 530, Poultry: 470},
  Lofa: {Cassava: 1120, Rice: 1540, Pepper: 330, Okra: 240, Goats: 940, Poultry: 390},
  Margibi: {Cassava: 1310, Rice: 820, Pepper: 410, Okra: 460, Goats: 280, Poultry: 640},
  Montserrado: {Cassava: 740, Rice: 410, Pepper: 520, Okra: 590, Goats: 210, Poultry: 890},
};

export interface CampaignTemplate { id: string; label: string; crop: (typeof CAMPAIGN_CROPS)[number]; text: string }
/** Team 8 DRAFT demo templates: general, non-chemical, no doses, no treatment claims, no short code. {county} is replaced. */
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {id: 'cassava-leaves', label: 'Cassava: yellow or curled leaves', crop: 'Cassava', text: 'Agricare demo: Cassava leaves yellow or curled in {county}? Use clean cuttings next time and ask your extension officer.'},
  {id: 'rice-rain', label: 'Rice: heavy rain', crop: 'Rice', text: 'Agricare demo: Heavy rain expected in {county}. Check drains and bunds around rice fields. Dry harvested grain on raised mats.'},
  {id: 'pepper-dry', label: 'Pepper: dry days ahead', crop: 'Pepper', text: 'Agricare demo: Dry days ahead in {county}. Mulch young pepper and water early in the morning. Ask your extension officer before planting more.'},
  {id: 'okra-harvest', label: 'Okra: harvest and storage', crop: 'Okra', text: 'Agricare demo: Harvest okra young and often in {county}. Keep picked pods in the shade and sell or use them the same day.'},
  {id: 'goats-unwell', label: 'Goats: animals look unwell', crop: 'Goats', text: 'Agricare demo: Goats unwell in {county}? Keep sick animals apart from healthy ones and contact your district veterinary officer.'},
  {id: 'poultry-unwell', label: 'Poultry: birds look unwell', crop: 'Poultry', text: 'Agricare demo: Chickens unwell in {county}? Keep sick birds apart and contact your district veterinary officer.'},
  {id: 'storage-dry', label: 'Any crop: dry storage', crop: 'Cassava', text: 'Agricare demo: Keep harvested food dry. Use raised mats and put sacks on pallets away from damp walls in {county}.'},
];
