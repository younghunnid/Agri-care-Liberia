import {BAND_INFO, BAND_RULE, caseById, type TriageBand, type TriageCase} from '../data/triageCases';

/** Pure, shared by the browser and the server. The server re-evaluates every submitted report: a client can never choose its own band. */
export interface TriageReason {questionId: string; question: string; answerId: string; answer: string; points: number}
export type TriageResult =
  | {ok: true; caseId: string; crop: TriageCase['crop']; score: number; band: TriageBand; urgent: boolean; reasons: TriageReason[]; headline: string; actions: string[]; cardSlug: string}
  | {ok: false; error: string};

export function bandForScore(score: number, urgent: boolean, minBand?: TriageBand): TriageBand {
  let band: TriageBand = urgent || score >= BAND_RULE.redAt ? 'red' : score >= BAND_RULE.yellowAt ? 'yellow' : 'green';
  if (minBand === 'yellow' && band === 'green') band = 'yellow';
  return band;
}

/** `answers` maps every question id of the case to one of its option ids. Anything missing, extra or unknown is rejected. */
export function evaluateTriage(caseId: unknown, answers: unknown): TriageResult {
  if (typeof caseId !== 'string') return {ok: false, error: 'Choose one of the situations.'};
  const c = caseById(caseId);
  if (!c) return {ok: false, error: 'Unknown situation.'};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {ok: false, error: 'Answers are required.'};
  const given = answers as Record<string, unknown>;
  const keys = Object.keys(given);
  if (keys.length !== c.questions.length || keys.some((k) => !c.questions.some((q) => q.id === k))) return {ok: false, error: 'Answer every question once.'};
  let score = 0;
  let urgent = false;
  const reasons: TriageReason[] = [];
  for (const q of c.questions) {
    const a = given[q.id];
    const opt = typeof a === 'string' ? q.options.find((o) => o.id === a) : undefined;
    if (!opt) return {ok: false, error: `Choose one of the answers for "${q.text}".`};
    score += opt.points;
    if (opt.urgent) urgent = true;
    reasons.push({questionId: q.id, question: q.text, answerId: opt.id, answer: opt.label, points: opt.points});
  }
  const band = bandForScore(score, urgent, c.minBand);
  return {ok: true, caseId: c.id, crop: c.crop, score, band, urgent, reasons, headline: BAND_INFO[band].headline, actions: BAND_INFO[band].actions, cardSlug: c.cardSlug};
}
