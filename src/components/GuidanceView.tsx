import React from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, MessageCircleQuestion} from 'lucide-react';
import type {SavedGuidance} from '../lib/cropProblem';
import {buildExpertPrefill, expertLink} from '../lib/cropProblem';
import {StatusLabel} from './StatusLabel';
import {SpeakButton} from './SpeakButton';

/** Reads a guidance record. Used for fresh results and for copies saved on the device (identical text either way). */
export const GuidanceView: React.FC<{g: SavedGuidance; children?: React.ReactNode}> = ({g, children}) => {
  const link = expertLink(buildExpertPrefill(g.county, g.symptomLabels, g.causes.map((c) => c.name)));
  const spoken = [g.notice, ...g.causes.map((c) => `${c.name}. ${c.firstResponse.join(' ')}`), ...g.generalGuidance].join(' ');
  return (
    <article className="space-y-4" data-testid="guidance-view">
      <div role="note" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 flex gap-3">
        <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden />
        <p className="text-sm font-semibold leading-relaxed" data-testid="not-a-diagnosis">{g.notice}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusLabel kind="draft" />
        <span className="text-xs text-[#183B2B]/70">{g.review.status === 'reviewed' ? `Reviewed by ${g.review.reviewedBy} on ${g.review.reviewedOn}` : 'No agricultural expert has reviewed this yet.'}</span>
      </div>
      <div className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-1">
        <p className="text-sm font-bold text-[#183B2B]">Cassava in {g.county} County. You told us:</p>
        <ul className="list-disc pl-5 text-sm text-[#183B2B]/85">{g.symptomLabels.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
      <SpeakButton id={`guidance-${g.id}`} label="this advice" text={spoken} />
      {g.causes.length === 0 && <p className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 text-sm">No possible cause matched what you chose. Ask an expert below.</p>}
      {g.causes.map((c, i) => (
        <section key={c.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-3" data-cause={c.id}>
          <h3 className="font-display text-lg font-extrabold text-[#183B2B]">Possible cause {i + 1}: {c.name}</h3>
          <p className="text-sm text-[#183B2B]/85">{c.whyItMayMatch}</p>
          <div><p className="text-sm font-bold">Check to tell:</p><ul className="list-disc pl-5 text-sm text-[#183B2B]/85">{c.checks.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><p className="text-sm font-bold">What you can do first:</p><ul className="list-disc pl-5 text-sm text-[#183B2B]/85">{c.firstResponse.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <p className="text-sm font-semibold text-[#8A4B00]">{c.askExpertWhen}</p>
        </section>
      ))}
      <section className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 space-y-2">
        <h3 className="font-bold text-[#183B2B]">For any problem</h3>
        <ul className="list-disc pl-5 text-sm text-[#183B2B]/85">{g.generalGuidance.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      {children}
      <Link to={link} className="flex items-center justify-center gap-2 min-h-[52px] rounded-2xl bg-[#16803C] hover:bg-[#0F6B30] text-white font-bold px-4 text-base focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]" data-testid="ask-expert-link">
        <MessageCircleQuestion className="w-5 h-5" aria-hidden /> Ask an agricultural expert about this
      </Link>
    </article>
  );
};
