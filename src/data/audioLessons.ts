import {RICE_DEMO_FIXTURE} from './audioFixtures.generated';

/**
 * Registry of downloadable audio lessons.
 *
 * HONESTY RULES
 *  - Only files that really exist under public/audio/ are listed as available.
 *  - The only file today is an English DEMONSTRATION made with a computer voice from existing guide
 *    text (see scripts/make-audio-fixture.ts). It is labelled as such everywhere it is shown.
 *  - Kpelle, Bassa and Mano have NO recordings yet. They are registered below only so the
 *    interface can say so; nothing is translated or synthesised for them.
 *
 * ADDING A REAL RECORDING LATER
 *  1. Put the file in public/audio/<code>/ (m4a/mp3/ogg; mono, about 24-48 kbps keeps it small).
 *  2. Add an entry to AUDIO_LESSONS with `kind: 'lesson'`, `synthetic: false`, the real byte size,
 *     duration, and the transcript the speaker actually read.
 *  3. Have a native speaker review it, and record that in `reviewedBy`.
 */

export type AudioLanguageCode = 'en' | 'kpe' | 'bas' | 'man';

export interface AudioLanguage {
  code: AudioLanguageCode;
  label: string;
  /** 'available' = at least one file exists. */
  status: 'available' | 'awaiting-recordings';
}

export const AUDIO_LANGUAGES: AudioLanguage[] = [
  {code: 'en', label: 'English', status: 'available'},
  {code: 'kpe', label: 'Kpelle', status: 'awaiting-recordings'},
  {code: 'bas', label: 'Bassa', status: 'awaiting-recordings'},
  {code: 'man', label: 'Mano', status: 'awaiting-recordings'},
];

export interface AudioLesson {
  id: string;
  /** Offline library entry this audio belongs to (see offlineLibrary ids). */
  guideId: string;
  title: string;
  language: AudioLanguageCode;
  /** 'demonstration' = test fixture, not an official lesson. */
  kind: 'demonstration' | 'lesson';
  /** True when made with a computer voice rather than a human speaker. */
  synthetic: boolean;
  /** Short honest label shown next to the player. */
  label: string;
  url: string;
  mimeType: string;
  bytes: number;
  durationSec: number;
  transcript: string;
  version: number;
  reviewedBy?: string;
}

export const AUDIO_LESSONS: AudioLesson[] = [
  {
    id: 'en-rice-planting-demo',
    guideId: 'crop:rice',
    title: 'Rice: planting basics (demonstration)',
    language: 'en',
    kind: 'demonstration',
    synthetic: true,
    label: 'English demonstration recording — computer voice reading the Rice guide. Not a full audio lesson.',
    url: '/audio/en/rice-planting-demo.m4a',
    mimeType: 'audio/mp4',
    bytes: RICE_DEMO_FIXTURE.bytes,
    durationSec: RICE_DEMO_FIXTURE.durationSec,
    transcript: RICE_DEMO_FIXTURE.transcript,
    version: 1,
  },
];

export function getLesson(id: string): AudioLesson | undefined {
  return AUDIO_LESSONS.find((l) => l.id === id);
}

export function lessonsForGuide(guideId: string): AudioLesson[] {
  return AUDIO_LESSONS.filter((l) => l.guideId === guideId);
}

export function languageLabel(code: AudioLanguageCode): string {
  return AUDIO_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function languagesAwaitingRecordings(): AudioLanguage[] {
  return AUDIO_LANGUAGES.filter((l) => l.status === 'awaiting-recordings');
}
