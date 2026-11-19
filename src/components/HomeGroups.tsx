import React from 'react';
import {Link} from 'react-router-dom';
import {BookOpen, Calculator, MessageCircleQuestion, Sprout} from 'lucide-react';
import {NAV_GROUPS, type NavGroup} from '../data/navGroups';
import {StatusLabel} from './StatusLabel';

const ICON: Record<NavGroup['id'], React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>> = {
  advice: Sprout, expert: MessageCircleQuestion, learn: BookOpen, tools: Calculator,
};

/** Four large, simple groups for farmers. Future items are shown but are not links, so nothing leads to a dead page. */
export const HomeGroups: React.FC = () => (
  <section aria-labelledby="home-groups-heading" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4" data-testid="home-groups">
    <div className="space-y-1">
      <h2 id="home-groups-heading" className="font-display text-2xl font-extrabold text-[#183B2B]">What do you need today?</h2>
      <p className="text-sm text-[#183B2B]/75">Tap a button. Each one shows if it is working, a demonstration, or coming later.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {NAV_GROUPS.map((g) => {
        const Icon = ICON[g.id];
        return (
          <div key={g.id} className="rounded-3xl bg-white border border-[#183B2B]/12 p-4 space-y-3" data-group={g.id}>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-[#DDEFE0] text-[#16803C] flex items-center justify-center"><Icon className="w-6 h-6" aria-hidden /></span>
              <div>
                <h3 className="font-display text-lg font-extrabold text-[#183B2B] leading-tight">{g.title}</h3>
                <p className="text-xs text-[#183B2B]/70">{g.blurb}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {g.items.map((it) => {
                const body = (
                  <>
                    <span className="block text-base font-bold leading-snug">{it.label}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">{it.kinds.map((k) => <StatusLabel key={k} kind={k} />)}</span>
                    {it.note && <span className="mt-1 block text-xs text-[#183B2B]/70">{it.note}</span>}
                  </>
                );
                return (
                  <li key={it.label}>
                    {it.to ? (
                      <Link to={it.to} className="block min-h-[48px] rounded-2xl border border-[#16803C]/35 bg-[#F3F8F0] hover:bg-[#DDEFE0] px-3 py-2.5 text-[#183B2B] focus:outline-none focus:ring-2 focus:ring-[#16803C]">{body}</Link>
                    ) : (
                      <div aria-disabled="true" className="min-h-[48px] rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-600">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  </section>
);
