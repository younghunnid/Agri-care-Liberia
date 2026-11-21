/**
 * Rice advice supplied by the project owner: one question with its English answer, and one audio recording.
 *
 * HONESTY RULES (read before changing anything here)
 *  - The recording `vie.m4a` was checked technically (format, size, duration, it plays and contains continuous speech) but NOBODY has yet established, and this
 *    project must not guess, WHICH LANGUAGE is spoken or WHAT it says. Both stay "not verified" until the owner (or a speaker) confirms them.
 *  - It is therefore shown as "Recorded advice (language and topic not yet checked)" and is NOT attached to the yellow-leaves question. To attach it, someone who
 *    has listened must confirm it answers that question, then set RECORDING_MATCHES_YELLOW_LEAVES = true and fill in RICE_RECORDING.language.
 *  - Nothing here claims review by an agronomist or approval by the Ministry of Agriculture: none has been recorded.
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
  /** null = not established. Do not fill this in from a guess. */
  language: null as string | null,
  languageVerified: false,
  topicVerified: false,
};
/** Flip to true ONLY after a person who has listened confirms the recording is the answer to the yellow-leaves question. */
export const RECORDING_MATCHES_YELLOW_LEAVES = false;

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
export const recordingLabel = (): string => 'Recorded advice. Language and topic not yet checked.';
