import {
  AUDIENCE, CAMPAIGN_TEMPLATES, type CampaignTemplate, type DemoCounty, type ProductionRow, type SignalRow, WEATHER_DEMO,
} from '../data/ministryDemo';

/**
 * Pure logic for the Ministry & Extension View (Demo): index maths, filters, aggregates, severity rule, SMS counting, message safety checks and the
 * dispatch SIMULATION. No network, no storage, no imports from authentication code. Everything is deterministic so it can be tested exactly.
 */

// ================================================================== Illustrative Food Security Index (Team 8 demo)
export const FSI_LABEL = 'Illustrative Team 8 Demo Index — Not an official food-security assessment.';
export const FSI_WEIGHTS = {availability: 0.4, weather: 0.3, cropHealth: 0.3} as const;

export interface FsiInputs { availability: number; weather: number; cropHealth: number }
export interface FsiResult {
  score: number;
  raw: number;
  parts: {key: keyof FsiInputs; label: string; weight: number; input: number; points: number}[];
  formula: string;
}

/** FSI = 0.40 x availability + 0.30 x weather + 0.30 x crop health, each input 0 to 100; result rounded to a whole number. Throws on invalid input. */
export function computeFsi(inputs: FsiInputs): FsiResult {
  const labels: Record<keyof FsiInputs, string> = {availability: 'Availability', weather: 'Weather', cropHealth: 'Crop health'};
  const parts = (Object.keys(FSI_WEIGHTS) as (keyof FsiInputs)[]).map((key) => {
    const v = inputs[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new RangeError(`${labels[key]} must be a number from 0 to 100`);
    const weight = FSI_WEIGHTS[key];
    return {key, label: labels[key], weight, input: v, points: Math.round(weight * v * 100) / 100};
  });
  // Integer arithmetic first (percent weights), so 58.5 is exactly 58.5 and rounds up like a person would expect.
  const raw = (40 * inputs.availability + 30 * inputs.weather + 30 * inputs.cropHealth) / 100;
  const a = inputs.availability, w = inputs.weather, c = inputs.cropHealth;
  return {score: Math.round(raw), raw, parts, formula: `0.40 × ${a} + 0.30 × ${w} + 0.30 × ${c} = ${raw.toFixed(1)} → ${Math.round(raw)}`};
}

export type FsiBand = 'Secure' | 'Caution' | 'Critical';
/** Illustrative bands for the demo index: 70 and above, 60 to 69, below 60. Not an official classification. */
export function fsiBand(score: number): FsiBand { return score >= 70 ? 'Secure' : score >= 60 ? 'Caution' : 'Critical'; }
export const fsiOf = (r: ProductionRow): number => computeFsi(r).score;

// ================================================================== production filters and aggregates
export interface ProductionFilter { county: DemoCounty | 'All'; crop: string }
export const ALL = 'All';

export function filterProduction(rows: ProductionRow[], f: ProductionFilter): ProductionRow[] {
  return rows.filter((r) => (f.county === 'All' || r.county === f.county) && (f.crop === ALL || r.crop === f.crop));
}

export type SortKey = 'county' | 'crop' | 'plantedHa' | 'expectedMt' | 'actualMt' | 'achievement' | 'fsi';
export const achievementPct = (r: Pick<ProductionRow, 'expectedMt' | 'actualMt'>): number => (r.expectedMt > 0 ? Math.round((r.actualMt / r.expectedMt) * 1000) / 10 : 0);

export function sortProduction(rows: ProductionRow[], key: SortKey, asc: boolean): ProductionRow[] {
  const val = (r: ProductionRow): string | number => (key === 'achievement' ? achievementPct(r) : key === 'fsi' ? fsiOf(r) : r[key]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (asc ? c : -c) || a.id.localeCompare(b.id);
  });
}

export function summarise(rows: ProductionRow[]): {rows: number; plantedHa: number; expectedMt: number; actualMt: number; achievementPct: number; meanFsi: number | null} {
  const expectedMt = rows.reduce((s, r) => s + r.expectedMt, 0);
  const actualMt = rows.reduce((s, r) => s + r.actualMt, 0);
  return {
    rows: rows.length, plantedHa: rows.reduce((s, r) => s + r.plantedHa, 0), expectedMt, actualMt,
    achievementPct: expectedMt > 0 ? Math.round((actualMt / expectedMt) * 1000) / 10 : 0,
    meanFsi: rows.length ? Math.round((rows.reduce((s, r) => s + fsiOf(r), 0) / rows.length) * 10) / 10 : null,
  };
}

export interface Bar { id: string; label: string; expected: number; actual: number; pct: number }
/** The chart is built from exactly these numbers (and a text table shows the same rows). */
export function expectedActualBars(rows: ProductionRow[]): {bars: Bar[]; max: number} {
  const bars = rows.map((r) => ({id: r.id, label: `${r.county} · ${r.crop}`, expected: r.expectedMt, actual: r.actualMt, pct: achievementPct(r)}));
  return {bars, max: bars.reduce((m, b) => Math.max(m, b.expected, b.actual), 0)};
}

// ================================================================== weather helpers (draft)
export type MoistureLabel = 'Dry' | 'Adequate' | 'Wet';
/** Draft display bands (not agronomist-approved): under 45 dry, 45 to 75 adequate, above 75 wet. */
export const moistureLabel = (pct: number): MoistureLabel => (pct < 45 ? 'Dry' : pct <= 75 ? 'Adequate' : 'Wet');
export const weatherFor = (county: DemoCounty) => WEATHER_DEMO.find((w) => w.county === county);

// ================================================================== disease surveillance (aggregated; a signal is never a diagnosis)
export type Severity = 'High' | 'Caution' | 'Low';
/**
 * Illustrative rule: 5 or more reports in 7 days = High; livestock illness clusters of 3 or more are escalated earlier (High); 2 to 4 = Caution; 1 = Low.
 * It only decides who should look at a signal first. It makes no diagnosis.
 */
export function severityOf(s: Pick<SignalRow, 'category' | 'reports7d'>): Severity {
  if (s.reports7d >= 5) return 'High';
  if (s.category === 'Livestock' && s.reports7d >= 3) return 'High';
  return s.reports7d >= 2 ? 'Caution' : 'Low';
}
export const filterSignals = (rows: SignalRow[], county: DemoCounty | 'All'): SignalRow[] => (county === 'All' ? rows : rows.filter((r) => r.county === county));

export type EscalationStatus = 'Pending' | 'Assigned' | 'Reviewed';
export interface Escalation { id: string; signalId: string; county: DemoCounty; subject: string; reason: string; status: EscalationStatus; assignee: string | null }

/** Every High signal enters the queue for a human to look at. */
export function buildEscalations(rows: SignalRow[]): Escalation[] {
  return rows.filter((s) => severityOf(s) === 'High').map((s, i) => ({
    id: `ESC-${String(i + 1).padStart(3, '0')}`, signalId: s.id, county: s.county, subject: `${s.concern} (${s.reports7d} reports in 7 days)`,
    reason: s.category === 'Livestock' ? 'Livestock cluster: ask a veterinary officer to review' : 'High number of reports: ask an extension officer to review', status: 'Pending' as const, assignee: null,
  }));
}
export const officerFor = (e: Pick<Escalation, 'subject' | 'reason'>): string => (/veterinary/i.test(e.reason) ? 'Veterinary officer (demo)' : 'Extension officer (demo)');
export function assignEscalation(list: Escalation[], id: string): Escalation[] {
  return list.map((e) => (e.id === id && e.status === 'Pending' ? {...e, status: 'Assigned', assignee: officerFor(e)} : e));
}
export function reviewEscalation(list: Escalation[], id: string): Escalation[] {
  return list.map((e) => (e.id === id && e.status === 'Assigned' ? {...e, status: 'Reviewed'} : e));
}

// ================================================================== SMS counting (GSM-7 vs UCS-2)
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';
export interface SmsInfo { encoding: 'GSM-7' | 'UCS-2'; units: number; segments: number; perSegment: number; remaining: number }
export function smsInfo(text: string): SmsInfo {
  let gsm = true; let septets = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) septets += 1; else if (GSM_EXT.includes(ch)) septets += 2; else { gsm = false; break; }
  }
  if (gsm) {
    const segments = septets === 0 ? 1 : septets <= 160 ? 1 : Math.ceil(septets / 153);
    const cap = segments === 1 ? 160 : 153;
    return {encoding: 'GSM-7', units: septets, segments, perSegment: cap, remaining: cap * segments - septets};
  }
  const units = text.length; // UTF-16 code units, as the network counts them
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  const cap = segments === 1 ? 70 : 67;
  return {encoding: 'UCS-2', units, segments, perSegment: cap, remaining: cap * segments - units};
}

// ================================================================== campaign message safety (a campaign is NOT a login code, NOT chemical advice)
export const MAX_CAMPAIGN_CHARS = 306; // two GSM-7 segments
export function validateCampaignMessage(text: string): string[] {
  const t = text.trim();
  const p: string[] = [];
  if (t.length < 15) p.push('Message is too short (at least 15 characters of guidance).');
  if (smsInfo(t).units > MAX_CAMPAIGN_CHARS) p.push(`Message is too long for the demo (maximum ${MAX_CAMPAIGN_CHARS} characters).`);
  if (/(?<!\d)\d{6}(?!\d)/.test(t) || /\b(otp|one[- ]time|verification code|login code|passcode|pin)\b/i.test(t)) p.push('Campaign messages must never contain login or verification codes. Those are sent only by the sign-in service.');
  if (/\*\d{1,5}(\*\d+)*#/.test(t)) p.push('Do not include a USSD short code: none has been assigned or registered.');
  if (/https?:\/\/|www\./i.test(t)) p.push('Do not include web links in demo messages.');
  if (/(\+?231[\d\s-]{6,})|(?<!\d)0?7\d{8}(?!\d)/.test(t)) p.push('Do not include phone numbers.');
  if (/\b\d+(\.\d+)?\s?(ml|mg|litres?|liters?|tablespoons?|teaspoons?|cups?|ppm|%)(?![a-z])/i.test(t)) p.push('Do not include chemical doses or amounts.');
  if (/\b(pesticide|insecticide|fungicide|herbicide|spray(ing)?|cypermethrin|imidacloprid|dimethoate|glyphosate|mancozeb|paraquat|neem|bleach|kerosene|diesel)\b/i.test(t)) p.push('Do not include chemical or spray advice. Refer farmers to an extension or veterinary officer.');
  if (/\b(cures?|kills?|guaranteed|proven|vaccinat\w*|medicine|drug|antibiotic\w*)\b/i.test(t)) p.push('Do not make treatment or cure claims.');
  if (/\b(ministry|moa|kpaa|government|official)\b/i.test(t)) p.push('Do not claim a Ministry, government or official sender. This is a Team 8 demonstration.');
  return p;
}

export const fillTemplate = (t: CampaignTemplate, county: DemoCounty): string => t.text.replace(/\{county\}/g, county);
export const templatesFor = (crop: string): CampaignTemplate[] => CAMPAIGN_TEMPLATES.filter((t) => t.crop === crop || t.id === 'storage-dry');

export function audienceSize(county: DemoCounty | 'All', crop: keyof (typeof AUDIENCE)[DemoCounty]): number {
  if (county === 'All') return (Object.keys(AUDIENCE) as DemoCounty[]).reduce((s, c) => s + AUDIENCE[c][crop], 0);
  return AUDIENCE[county][crop];
}

// ================================================================== dispatch SIMULATION (nothing is sent anywhere)
export interface SimulatedDispatch {
  id: string;
  status: 'SIMULATED';
  county: DemoCounty | 'All';
  crop: string;
  excerpt: string;
  segments: number;
  audience: number;
  delivered: number;
  failed: number;
  deliveryRatePct: number;
}
function hash32(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Deterministic pseudo-results (delivery rate 95.5 to 99.0 percent from a hash of the inputs). No network, no randomness, no side effects. */
export function simulateDispatch(input: {county: DemoCounty | 'All'; crop: string; text: string; audience: number; sequence: number}): SimulatedDispatch {
  const h = hash32(`${input.county}|${input.crop}|${input.text}`);
  const rate = 95.5 + (h % 36) / 10; // 95.5 .. 99.0
  const delivered = Math.min(input.audience, Math.floor((input.audience * rate) / 100));
  return {
    id: `SIM-${String(input.sequence).padStart(4, '0')}`, status: 'SIMULATED', county: input.county, crop: input.crop, excerpt: input.text.trim().slice(0, 80),
    segments: smsInfo(input.text.trim()).segments, audience: input.audience, delivered, failed: input.audience - delivered, deliveryRatePct: Math.round((delivered / Math.max(1, input.audience)) * 1000) / 10,
  };
}

// ================================================================== USSD-style preview (our own demo menu; NO short code exists)
export const USSD_NOTICE = 'Preview only. No USSD short code has been assigned, registered or activated, and nothing here is connected to any telecom network.';
export const USSD_MAX_CHARS = 182;
export interface UssdScreen { kind: 'CON' | 'END'; text: string; valid: boolean }

export function ussdScreen(path: string, ctx: {county: DemoCounty; advice: string}): UssdScreen {
  const w = weatherFor(ctx.county);
  const cut = (s: string) => (s.length > USSD_MAX_CHARS ? `${s.slice(0, USSD_MAX_CHARS - 1)}…` : s);
  const mk = (kind: 'CON' | 'END', text: string, valid = true): UssdScreen => ({kind, text: cut(text), valid});
  switch (path) {
    case '': return mk('CON', 'Agricare (demo)\n1. Advice\n2. Weather\n3. Report a problem\n0. Exit');
    case '1': return mk('END', `Advice (draft):\n${ctx.advice.replace(/^Agricare demo:\s*/i, '')}`);
    case '2': return mk('END', w ? `${ctx.county} weather (demo data):\n${w.d3.tempC}C, ${w.d3.rainMm} mm rain in 3 days.\nSoil moisture ${w.d3.soilMoisture}%.\n${w.draftGuidance.replace(/^Draft:\s*/, 'Draft: ')}` : 'No demo forecast.');
    case '3': return mk('CON', 'Report a problem:\n1. Crop\n2. Animal\n0. Back');
    case '3*1': case '3*2': return mk('END', 'Demo only: no report was sent. In a real service an extension officer would review it.');
    case '0': return mk('END', 'Goodbye. (demo)');
    default: return mk('CON', 'Not a valid choice in this demo.\n0. Back', false);
  }
}
