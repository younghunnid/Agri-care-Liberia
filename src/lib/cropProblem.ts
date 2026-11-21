import {
  CASSAVA_CAUSES, CASSAVA_REVIEW, CASSAVA_SYMPTOMS, GENERAL_GUIDANCE, NONE_OF_THESE_ADVICE, NOT_A_DIAGNOSIS_NOTICE,
  type Cause, type ReviewInfo,
} from '../data/cassavaProblems';
import {idbKv, type KvStore} from './kvStore';

export interface CauseMatch {
  cause: Cause;
  /** How many of the farmer's chosen symptoms this possible cause is consistent with. */
  matched: number;
  of: number;
}

/** Possible causes for the chosen symptoms, most consistent first (ties keep the content order). Unknown ids are ignored. */
export function matchCauses(symptomIds: string[], causes: Cause[] = CASSAVA_CAUSES): CauseMatch[] {
  const chosen = new Set(symptomIds.filter((id) => CASSAVA_SYMPTOMS.some((s) => s.id === id)));
  if (chosen.size === 0) return [];
  return causes
    .map((cause, order) => ({cause, order, matched: cause.matches.filter((m) => chosen.has(m)).length}))
    .filter((m) => m.matched > 0)
    .sort((a, b) => b.matched - a.matched || a.order - b.order)
    .map(({cause, matched}) => ({cause, matched, of: chosen.size}));
}

export interface SavedGuidance {
  id: string;
  crop: 'cassava';
  county: string;
  symptomIds: string[];
  symptomLabels: string[];
  causes: {id: string; name: string; whyItMayMatch: string; checks: string[]; firstResponse: string[]; askExpertWhen: string}[];
  generalGuidance: string[];
  notice: string;
  review: ReviewInfo;
  savedAt: string;
}

export const SAVED_KEY = 'h1.cropProblem.saved';
export const MAX_SAVED = 20;

/** Builds the offline copy. The text is copied in full so it can be read with no connection and no bundle lookup. */
export function buildSavedGuidance(county: string, symptomIds: string[], now: Date = new Date(), id?: string): SavedGuidance | null {
  const matches = matchCauses(symptomIds);
  const labels = CASSAVA_SYMPTOMS.filter((s) => symptomIds.includes(s.id));
  if (labels.length === 0) return null;
  return {
    id: id ?? `cg-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    crop: 'cassava',
    county,
    symptomIds: labels.map((s) => s.id),
    symptomLabels: labels.map((s) => s.label),
    causes: matches.map(({cause}) => ({
      id: cause.id, name: cause.name, whyItMayMatch: cause.whyItMayMatch, checks: cause.checks, firstResponse: cause.firstResponse, askExpertWhen: cause.askExpertWhen,
    })),
    generalGuidance: matches.length ? GENERAL_GUIDANCE : [NONE_OF_THESE_ADVICE, ...GENERAL_GUIDANCE],
    notice: NOT_A_DIAGNOSIS_NOTICE,
    review: CASSAVA_REVIEW,
    savedAt: now.toISOString(),
  };
}

export async function listSavedGuidance(kv: KvStore = idbKv): Promise<SavedGuidance[]> {
  const rows = await kv.get<SavedGuidance[]>(SAVED_KEY);
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.causes)) : [];
}

export async function saveGuidance(g: SavedGuidance, kv: KvStore = idbKv): Promise<SavedGuidance[]> {
  const rest = (await listSavedGuidance(kv)).filter((r) => r.id !== g.id);
  const next = [g, ...rest].slice(0, MAX_SAVED); // newest first; oldest drops past the cap
  await kv.set(SAVED_KEY, next);
  return next;
}

export async function deleteSavedGuidance(id: string, kv: KvStore = idbKv): Promise<SavedGuidance[]> {
  const next = (await listSavedGuidance(kv)).filter((r) => r.id !== id);
  await kv.set(SAVED_KEY, next);
  return next;
}

export interface ExpertPrefill {
  title: string;
  desc: string;
  county: string;
  category: string;
}

/** Category name in the existing Ask-an-Expert form (must equal an entry of KNOWLEDGE_CATEGORIES). */
export const EXPERT_CATEGORY = 'Pest and crop disease management';

/** Text for the existing Ask an Expert form. Facts only: what the farmer chose; no diagnosis is claimed. */
export function buildExpertPrefill(county: string, symptomLabels: string[], possibleCauseNames: string[]): ExpertPrefill {
  const first = symptomLabels[0] ?? 'cassava plant problem';
  const desc = [
    'Crop: cassava.',
    `What I see: ${symptomLabels.join('; ') || 'not sure'}.`,
    possibleCauseNames.length ? `The Agricare guide listed these POSSIBLE causes (not confirmed): ${possibleCauseNames.join('; ')}.` : 'The guide could not match my problem.',
    'Please advise me on what to check and what to do first.',
  ].join(' ');
  return {title: `Cassava problem: ${first}`.slice(0, 120), desc: desc.slice(0, 900), county, category: EXPERT_CATEGORY};
}

export function expertLink(p: ExpertPrefill): string {
  const q = new URLSearchParams({title: p.title, desc: p.desc, county: p.county, category: p.category});
  return `/experts?${q.toString()}`;
}
