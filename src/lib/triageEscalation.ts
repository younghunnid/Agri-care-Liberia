import {BAND_INFO, CROP_LABELS, caseById} from '../data/triageCases';
import type {QuestionData} from './offlineDrafts';
import type {SavedAssessment} from './triageStore';

/**
 * Builds the existing "ask an expert" request from a saved crop check. Pure. What may leave the phone is decided here and nowhere else:
 *  - the situation, the farmer's answers, the attention band and the advice card reference (all of which the farmer saw on screen);
 *  - the photo ONLY when `sendPhoto` is true (an explicit, separate choice);
 *  - never a phone number (the request has no such field), and the name only if the farmer typed one.
 */
export function buildEscalationDraft(a: SavedAssessment, opts: {sendPhoto: boolean; farmerName?: string}): QuestionData {
  const c = caseById(a.caseId);
  const lines = [
    `Crop check (simulated, not a diagnosis): ${c?.title ?? a.caseId}.`,
    ...(c ? c.questions.map((q) => `${q.text} ${q.options.find((o) => o.id === a.answers[q.id])?.label ?? ''}`.trim()) : []),
    `Result of the simple check: ${BAND_INFO[a.band].label}.`,
    `Advice card ${a.adviceCode} version ${a.adviceVersion} (${a.adviceLevel === 'verified' ? 'reviewed' : 'demonstration advice, not reviewed'}).`,
    `Please advise. This request was created from a crop check on the farmer's phone.`,
  ];
  return {
    farmerName: (opts.farmerName ?? '').trim().slice(0, 80) || 'Farmer (crop check)',
    category: CROP_LABELS[a.crop],
    county: a.county,
    title: `Crop check ${a.adviceCode}: ${(c?.title ?? 'crop problem').slice(0, 70)}`,
    description: lines.join('\n').slice(0, 1800),
    photoDataUrl: opts.sendPhoto && a.photo ? a.photo.dataUrl : '',
    voiceNoteDataUrl: '',
    voiceNoteSummary: '',
  };
}
