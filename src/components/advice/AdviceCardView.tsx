import React from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, BadgeCheck, FileText} from 'lucide-react';
import {SpeakButton} from '../SpeakButton';
import {SOURCE_LABELS, type CardFullView, type CardLevelView, type CardSource} from '../../lib/adviceCardsClient';

/** Verification badge: green ONLY for a genuinely reviewed version (named reviewer, organisation, date); amber and explicit for everything else. */
export const VerificationBadge: React.FC<{v: CardLevelView}> = ({v}) => (
  <p
    data-testid="verification-badge"
    data-level={v.level}
    data-reviewed={v.reviewed ? 'true' : 'false'}
    className={`inline-flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-bold leading-snug ${v.reviewed ? 'bg-[#DDEFE0] border-[#16803C]/50 text-[#0F5C2A]' : 'bg-[#FFF1C2] border-[#4A2F00]/25 text-[#4A2F00]'}`}
  >
    {v.reviewed ? <BadgeCheck className="w-5 h-5 shrink-0" aria-hidden /> : <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />}
    <span>{v.badge}</span>
  </p>
);

export const AdviceCardView: React.FC<{card: CardFullView; source: CardSource; savedAt?: string; showHistory?: boolean; headingLevel?: 1 | 2}> = ({card, source, savedAt, showHistory = true, headingLevel = 2}) => {
  const spoken = `${card.title}. ${card.summary} ${card.steps.map((s, i) => `Step ${i + 1}. ${s}`).join(' ')} ${card.askWhen} ${card.verification.reviewed ? '' : 'This advice has not been reviewed by a qualified agronomist.'}`;
  return (
    <article className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-6 space-y-4" data-testid="advice-card" aria-labelledby={`card-${card.code}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#183B2B]/80">
        <span className="inline-flex items-center gap-1 font-mono font-bold text-base text-[#183B2B] bg-[#F3F8F0] rounded-lg px-2 py-0.5" data-testid="advice-code"><FileText className="w-4 h-4" aria-hidden />{card.code}</span>
        <span data-testid="advice-version">Version {card.version}</span>
      </div>
      <VerificationBadge v={card.verification} />
      {React.createElement(`h${headingLevel}`, {id: `card-${card.code}`, className: 'font-display text-2xl font-extrabold text-[#183B2B] leading-tight'}, card.title)}
      <p className="text-base text-[#183B2B]/90 leading-relaxed">{card.summary}</p>
      <SpeakButton id={`card-speak-${card.code}`} label="Listen to this advice" text={spoken} />
      <section aria-label="Safe first steps" className="space-y-2">
        <h3 className="text-lg font-extrabold text-[#183B2B]">Safe first steps</h3>
        <ol className="list-decimal pl-6 space-y-2 text-base text-[#183B2B] leading-relaxed">{card.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>
      <section className="rounded-2xl bg-[#F3F8F0] p-4" aria-label="When to ask an officer">
        <h3 className="text-lg font-extrabold text-[#183B2B]">When to ask an officer</h3>
        <p className="text-base text-[#183B2B] mt-1">{card.askWhen}</p>
        <Link to="/experts" className="inline-flex items-center min-h-[44px] mt-2 font-bold text-[#0F5C2A] underline">Ask an expert</Link>
      </section>
      <p className="text-sm text-[#183B2B]/75">{card.verification.text}</p>
      <p className="text-sm text-[#183B2B]/75"><strong>Source:</strong> {card.sourceNote}</p>
      <p className="text-sm text-[#183B2B]/75" data-testid="advice-source">{SOURCE_LABELS[source]}{savedAt ? ` (saved ${new Date(savedAt).toLocaleString()})` : ''}</p>
      {showHistory && card.versions && card.versions.length > 0 && (
        <details className="rounded-2xl border border-[#183B2B]/10 p-3">
          <summary className="min-h-[44px] flex items-center cursor-pointer font-bold text-[#183B2B]">Version history ({card.versions.length})</summary>
          <ul className="mt-2 space-y-2 text-sm text-[#183B2B]" data-testid="advice-history">
            {card.versions.map((v) => (
              <li key={v.version} className="border-t border-[#183B2B]/10 pt-2">
                <strong>Version {v.version}</strong>{v.createdAt ? `, ${v.createdAt.slice(0, 10)}` : ''}: {v.changeNote || 'No note'} <span className="block text-[#183B2B]/70">{v.verification.badge}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
};
