import React from 'react';
import {Link} from 'react-router-dom';
import {FileCheck2, Sprout, WifiOff} from 'lucide-react';
import {RECORDING_MATCHES_YELLOW_LEAVES, RICE_RECORDING, RICE_YELLOW_LEAVES, recordingLabel} from '../data/riceAdvice';
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
        ? <RecordedAdvicePlayer source={RICE_RECORDING} title="Play recorded advice" />
        : <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base font-semibold text-amber-950" data-testid="rice-no-audio-here">No recording is attached to this answer. The recording in the Rice section has not been checked against this question yet, so it is not shown here. <Link to="/crops/rice" className="underline font-bold">Go to the Rice recording</Link></p>}
      <dl className="space-y-2 rounded-2xl bg-[#F3F8F0] p-3 text-base">
        <div><dt className="flex items-center gap-2 font-extrabold"><FileCheck2 className="w-5 h-5" aria-hidden /> Source and review status</dt><dd data-testid="rice-source">{q.source} <strong data-testid="rice-review">{q.reviewStatus}</strong></dd></div>
        <div><dt className="flex items-center gap-2 font-extrabold"><WifiOff className="w-5 h-5" aria-hidden /> Offline</dt><dd data-testid="rice-offline">{q.offline}</dd></div>
      </dl>
    </article>
  );
};

/** The Rice recording on its own, with honest labels about what has and has not been checked. */
export const RiceRecordingSection: React.FC = () => (
  <section aria-labelledby="rice-rec-h" className="space-y-3" data-testid="rice-recording-section">
    <h3 id="rice-rec-h" className="text-xl font-extrabold text-[#183B2B]">Recorded rice advice</h3>
    <RecordedAdvicePlayer source={RICE_RECORDING} title="Play the recording" note={`${recordingLabel()} It plays exactly as recorded. The speaker's language and what it says have not been confirmed yet.`} />
    <p className="text-sm text-[#183B2B]/80" data-testid="rice-recording-facts">Recording: {RICE_RECORDING.technical}. Original file: {RICE_RECORDING.originalFile}.</p>
  </section>
);
