/**
 * Rice advice supplied by the project owner: one question with its English answer, and one audio recording.
 *
 * HONESTY RULES
 *  - The recording `vie.m4a` is spoken in Vai and explains the rice yellow-leaves question. That was CONFIRMED BY THE PROJECT OWNER on 2026-11-21; no
 *    transcript exists and no independent Vai speaker or agricultural expert has checked it. The screens say "Vai" and nothing more about its content.
 *  - Nothing here claims review by an agronomist or approval by the Ministry of Agriculture: none has been recorded. Keep reviewStatus "Not reviewed"
 *    until a qualified agricultural expert approves the advice.
 */
export const RICE_RECORDING = {
  id: 'rice-recorded-advice',
  /** The original file, kept unchanged in the project root as vie.m4a; this is a byte-for-byte copy served by the app. */
  originalFile: 'vie.m4a',
  url: '/audio/rice/rice-recorded-advice.m4a',
  mimeType: 'audio/mp4',
  bytes: 1082973,
  sha256: 'b29406bf989407d8c61c89c29911a9d06ff4f0902ed60b3c8d35c6b7f8c5abd4',
  durationSec: 130.18,
  technical: 'AAC-LC audio in an MP4 (.m4a) file, mono, 48 kHz, about 63 kbit/s',
  /** The spoken language, as confirmed by the project owner. */
  language: 'Vai' as string | null,
  /** Confirmed by the project owner (not by a transcript or an independent speaker). */
  languageVerified: true,
  topicVerified: true,
  verifiedBy: 'Confirmed by the Agricare Liberia project owner on 2026-11-21. No transcript; no independent review.',
};
/** The project owner confirmed the recording explains the yellow-leaves question. */
export const RECORDING_MATCHES_YELLOW_LEAVES = true;
export const LISTEN_LABEL = 'Listen in Vai';

export const RICE_YELLOW_LEAVES = {
  id: 'rice-yellow-leaves',
  crop: 'Rice',
  cropSlug: 'rice',
  question: 'My rice leaves are turning yellow. What could be the problem?',
  answerEn: 'Yellow leaves may be caused by pests, diseases, lack of nutrients, or too much water. Check the plants carefully and contact an agricultural extension officer for proper advice.',
  source: 'Question and answer text supplied by the Agricare Liberia project team. It is not copied from a published guide.',
  reviewStatus: 'Not reviewed. No agronomist or Ministry of Agriculture review has been recorded for this answer.',
  offline: 'The question and answer are part of the app, so they open without internet once the app has been opened online.',
} as const;
export const recordingLabel = (): string => 'Recorded advice in Vai. Confirmed by the project owner; not reviewed by an agricultural expert.';
