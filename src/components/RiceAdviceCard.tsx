import React from 'react';
import {FileCheck2, Sprout, WifiOff} from 'lucide-react';
import {LISTEN_LABEL, RECORDING_MATCHES_YELLOW_LEAVES, RICE_RECORDING, RICE_YELLOW_LEAVES, recordingLabel} from '../data/riceAdvice';
import {RecordedAdvicePlayer} from './RecordedAdvicePlayer';

/** The recording is shown with the question ONLY when someone has confirmed it answers it (see src/data/riceAdvice.ts). */
export const RiceAdviceCard: React.FC<{recordingMatches?: boolean}> = ({recordingMatches = RECORDING_MATCHES_YELLOW_LEAVES}) => {
  const q = RICE_YELLOW_LEAVES;
  return (
    <article className="rounded-3xl border-2 border-[#16803C]/40 bg-white p-4 sm:p-6 space-y-4 text-[#183B2B]" aria-labelledby="rice-q-h" data-testid="rice-advice-card">
      <p className="flex items-center gap-2 text-base font-extrabold text-[#0F5C2A]"><Sprout className="w-5 h-5" aria-hidden /> Crop: <span data-testid="rice-crop">{q.crop}</span></p>
      <div><p className="text-sm font-bold uppercase tracking-wide">Question</p><h3 id="rice-q-h" className="text-2xl font-extrabold leading-snug" data-testid="rice-question">{q.question}</h3></div>
      <div><p className="text-sm font-bold uppercase tracking-wide">Answer in English</p><p className="text-xl leading-relaxed" data-testid="rice-answer">{q.answerEn}</p></div>
      {recordingMatches
        ? <RecordedAdvicePlayer source={RICE_RECORDING} title="Recorded advice in Vai" playLabel={LISTEN_LABEL} note="Spoken in Vai. Confirmed by the project owner as the answer to this question. Not yet reviewed by an agricultural expert." />
        : <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base font-semibold text-amber-950" data-testid="rice-no-audio-here">No recording is attached to this answer.</p>}
      <dl className="space-y-2 rounded-2xl bg-[#F3F8F0] p-3 text-base">
        <div><dt className="flex items-center gap-2 font-extrabold"><FileCheck2 className="w-5 h-5" aria-hidden /> Source and review status</dt><dd data-testid="rice-source">{q.source} <strong data-testid="rice-review">{q.reviewStatus}</strong></dd></div>
        <div><dt className="flex items-center gap-2 font-extrabold"><WifiOff className="w-5 h-5" aria-hidden /> Offline</dt><dd data-testid="rice-offline">{q.offline}</dd></div>
      </dl>
    </article>
  );
};

/** Facts about the recording. The player itself is in the question card above (one player per page, so two recordings can never play together). */
export const RiceRecordingSection: React.FC = () => (
  <section aria-labelledby="rice-rec-h" className="space-y-2" data-testid="rice-recording-section">
    <h3 id="rice-rec-h" className="text-xl font-extrabold text-[#183B2B]">About the Vai recording</h3>
    <p className="text-base" data-testid="rice-recording-lang">{recordingLabel()} {RICE_RECORDING.verifiedBy}</p>
    <p className="text-sm text-[#183B2B]/80" data-testid="rice-recording-facts">Recording: {RICE_RECORDING.technical}, {Math.floor(RICE_RECORDING.durationSec / 60)}:{String(Math.round(RICE_RECORDING.durationSec % 60)).padStart(2, '0')}. Original file: {RICE_RECORDING.originalFile}.</p>
  </section>
);
