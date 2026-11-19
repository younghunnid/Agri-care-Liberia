import {LIBERIA_COUNTIES} from '../../server/constants';
import {GUIDANCE_CROPS, SAMPLE_WEATHER_LABEL, countyGuidance, cropEntry, monthName, periodText, plantingStatus} from '../data/farmGuidance';
import type {SavedAssessment} from './triageStore';

/** Logic for the farmer "Today" screen. Pure and deterministic (the date is passed in), so it can be tested without a browser. */

// ------------------------------------------------------------------------------------------------------------------------------------ profile
export interface FarmProfile {county: string; crops: string[]}
export const PROFILE_KEY = 'phase2a.farm-profile.v1';
export const MAX_CROPS = GUIDANCE_CROPS.length;
export const emptyProfile = (): FarmProfile => ({county: '', crops: []});

/** Keeps only a known county and known crop slugs (no duplicates), so a damaged or tampered saved value can never break the screen. */
export function sanitizeProfile(raw: unknown): FarmProfile {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const county = typeof o.county === 'string' && (LIBERIA_COUNTIES as readonly string[]).includes(o.county) ? o.county : '';
  const known = new Set(GUIDANCE_CROPS.map((c) => c.slug));
  const crops = Array.isArray(o.crops) ? [...new Set(o.crops.filter((c): c is string => typeof c === 'string' && known.has(c)))] : [];
  return {county, crops};
}
export function loadProfile(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): FarmProfile {
  try { const v = storage?.getItem(PROFILE_KEY); return v ? sanitizeProfile(JSON.parse(v)) : emptyProfile(); } catch { return emptyProfile(); }
}
/** Returns false (and keeps working) if the phone refuses to save. */
export function saveProfile(p: FarmProfile, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  try { storage?.setItem(PROFILE_KEY, JSON.stringify(sanitizeProfile(p))); return !!storage; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------------------------------------------ reminders
export type ReminderKind = 'planting' | 'weather' | 'storage';
export interface Reminder {id: string; kind: ReminderKind; tone: 'info' | 'watch'; title: string; detail: string; to: string; tag: string}
export const TAG_GUIDANCE = 'Demonstration guidance';
export const TAG_SAMPLE_WEATHER = 'Sample weather, not live';
/** Crops whose stored product (grain or nuts) suffers from damp, used for the humidity reminder. */
const DAMP_SENSITIVE = ['rice', 'maize', 'groundnuts'];

export function buildReminders(opts: {now: Date; county: string; crops: string[]}): Reminder[] {
  const month = opts.now.getMonth() + 1; const out: Reminder[] = [];
  const profile = sanitizeProfile({county: opts.county, crops: opts.crops});
  for (const slug of profile.crops) {
    const st = plantingStatus(slug, month); const c = cropEntry(slug); if (!st || !c) continue;
    if (st.state === 'open') out.push({id: `plant-${slug}`, kind: 'planting', tone: 'info', title: `${c.name}: the usual planting months are running`, detail: `The Crops Library gives ${st.open.map(periodText).join(' and ')} for ${c.name} (${st.open.map((p) => p.label).join(', ')}). Check this year's rains and your own field before you plant.`, to: `/guidance?crop=${slug}&tab=planting`, tag: TAG_GUIDANCE});
    else if (st.state === 'soon') out.push({id: `soon-${slug}`, kind: 'planting', tone: 'info', title: `${c.name}: the usual planting months start in ${st.monthsUntilNext === 1 ? 'one month' : `${st.monthsUntilNext} months`}`, detail: `The Crops Library gives ${periodText(st.next!)} (${st.next!.label}). Prepare seed and land, and wait for the real rains.`, to: `/guidance?crop=${slug}&tab=planting`, tag: TAG_GUIDANCE});
  }
  if (profile.county) {
    const g = countyGuidance(profile.county);
    if (g.sample) {
      out.push({id: 'weather', kind: 'weather', tone: g.sample.riskLevel === 'Low' ? 'info' : 'watch', title: `${profile.county}: ${g.sample.riskLevel === 'Elevated Rain Risk' ? 'sample rain-risk notice' : 'sample weather notice'}`, detail: `${g.sample.riskNotice} (${SAMPLE_WEATHER_LABEL})`, to: '/weather', tag: TAG_SAMPLE_WEATHER});
      const damp = g.sample.humidityPct >= 82 || g.sample.rainfallMm7d >= 70;
      const mine = profile.crops.filter((s) => DAMP_SENSITIVE.includes(s));
      if (damp && mine.length) out.push({id: 'storage-damp', kind: 'storage', tone: 'watch', title: 'Check that stored grain and nuts are dry', detail: `The sample profile for ${profile.county} is humid or wet. Look at your stored ${mine.map((s) => cropEntry(s)!.name.toLowerCase()).join(', ')} for dampness or a musty smell. (${SAMPLE_WEATHER_LABEL})`, to: `/guidance?crop=${mine[0]}&tab=storage`, tag: TAG_SAMPLE_WEATHER});
    } else {
      out.push({id: 'weather-none', kind: 'weather', tone: 'info', title: `${profile.county}: no county weather sample is bundled`, detail: `${g.note} Look at the sky and listen to local radio for the real weather.`, to: '/weather', tag: TAG_SAMPLE_WEATHER});
    }
  }
  return out;
}
export const monthLabel = (d: Date): string => `${monthName(d.getMonth() + 1)} ${d.getFullYear()}`;
export function greeting(d: Date): string { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

// ------------------------------------------------------------------------------------------------------------------------------------ pending work
export interface PendingInput {listings: {status: string}[]; questions: {status: string}[]; checks: Pick<SavedAssessment, 'share' | 'sync'>[]}
export interface Pending {listings: number; questions: number; checks: number; failed: number; total: number}
/** What is saved on this phone and not yet on the server: listings and questions that are waiting or failed, and crop checks the farmer chose to share that are waiting or failed. Drafts are the farmer's own and not counted as "sending". */
export function pendingWork(i: PendingInput): Pending {
  const waiting = (s: string) => s === 'pending' || s === 'failed';
  const listings = i.listings.filter((r) => waiting(r.status)).length;
  const questions = i.questions.filter((r) => waiting(r.status)).length;
  const sharedChecks = i.checks.filter((c) => c.share && (c.sync.status === 'pending' || c.sync.status === 'failed'));
  const failed = i.listings.filter((r) => r.status === 'failed').length + i.questions.filter((r) => r.status === 'failed').length + sharedChecks.filter((c) => c.sync.status === 'failed').length;
  return {listings, questions, checks: sharedChecks.length, failed, total: listings + questions + sharedChecks.length};
}
