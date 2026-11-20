import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, ChevronDown, ChevronUp} from 'lucide-react';
import {SpeakButton} from '../SpeakButton';
import {COMMON_AGRICULTURAL_PROBLEMS} from '../../data/knowledgeCenter';

const SPLIT = Math.ceil(COMMON_AGRICULTURAL_PROBLEMS.length / 2);

/**
 * The 11 common farming questions, unchanged: same data, same answers, same Listen text, same expand/collapse.
 * Two independent columns on tablet and desktop (so opening an answer never stretches its neighbour); one column in the same order on phones.
 */
export const CommonQuestions: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  const renderItem = (prob: (typeof COMMON_AGRICULTURAL_PROBLEMS)[number]) => {
    const isOpen = openId === prob.id;
    return (
      <div key={prob.id} className="overflow-hidden rounded-2xl border border-[#183B2B]/10 bg-white" data-testid="home-question">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setOpenId(isOpen ? null : prob.id)}
            aria-expanded={isOpen}
            aria-controls={`home-prob-panel-${prob.id}`}
            className="flex min-h-[44px] flex-1 items-center justify-between gap-2 text-left"
          >
            <span className="font-display text-sm font-bold text-[#183B2B] sm:text-base">{prob.question}</span>
            {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-[#16803C]" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[#183B2B]/60" aria-hidden="true" />}
          </button>
          <SpeakButton compact id={`home-prob-${prob.id}`} label={prob.question} text={`${prob.question} ${prob.quickSummary} ${prob.steps.join('. ')} ${prob.safetyDisclaimer}`} />
        </div>
        {isOpen && (
          <div id={`home-prob-panel-${prob.id}`} className="space-y-2.5 border-t border-[#183B2B]/10 bg-[#F3F8F0]/50 px-4 pb-4 pt-1">
            <p className="text-sm font-medium text-[#183B2B]">{prob.quickSummary}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-[#183B2B]/80 sm:text-sm">{prob.steps.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
            <p className="text-xs text-[#183B2B]/65">{prob.safetyDisclaimer}</p>
          </div>
        )}
      </div>
    );
  };
  return (
    <section aria-labelledby="problems-heading" className="mx-auto max-w-7xl space-y-4 px-4 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 id="problems-heading" className="font-display text-2xl font-bold text-[#183B2B]">11 Common Farming Questions in Liberia</h2>
          <p className="mt-1 text-sm text-[#183B2B]/75">Tap any question to read clear practical steps or press Listen to hear it read aloud.</p>
        </div>
        <Link to="/guides?tab=problems" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-[#16803C] hover:underline">
          <span>See All 11 Solutions</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <div className="space-y-3">{COMMON_AGRICULTURAL_PROBLEMS.slice(0, SPLIT).map(renderItem)}</div>
        <div className="space-y-3">{COMMON_AGRICULTURAL_PROBLEMS.slice(SPLIT).map(renderItem)}</div>
      </div>
    </section>
  );
};
