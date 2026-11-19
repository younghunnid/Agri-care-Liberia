import React from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays, Info, Warehouse, WifiOff} from 'lucide-react';
import {StatusLabel} from '../StatusLabel';
import {
  COMMON_STORAGE_CHECKS, GUIDANCE_BANNER, OFFLINE_NOTE, PROVENANCE_LABEL, REGIONAL_LIMIT, countyGuidance, cropEntry, monthName, periodText, plantingEntry, plantingStatus, storageGuide,
  type GuidanceItem, type Provenance,
} from '../../data/farmGuidance';

/** The standing label for every screen that shows this guidance: demonstration, unreviewed, works offline. */
export const GuidanceBanner: React.FC<{className?: string; showRegional?: boolean}> = ({className = '', showRegional = false}) => (
  <div role="note" className={`rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 space-y-2 ${className}`} data-testid="guidance-banner">
    <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="draft" text="Demonstration guidance" /><span className="inline-flex items-center gap-1 text-sm font-semibold text-[#183B2B]"><WifiOff className="w-4 h-4" aria-hidden /> {OFFLINE_NOTE}</span></div>
    <p className="text-base font-bold text-amber-950">{GUIDANCE_BANNER}</p>
    {showRegional && <p className="text-base text-amber-950" data-testid="regional-limit">{REGIONAL_LIMIT}</p>}
  </div>
);

const SourceTag: React.FC<{source: Provenance}> = ({source}) => (
  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${source === 'library' ? 'border-[#16803C]/40 bg-[#DDEFE0] text-[#0F5C2A]' : 'border-amber-300 bg-amber-50 text-amber-900'}`} data-source={source}>{PROVENANCE_LABEL[source]}</span>
);

const Bullets: React.FC<{items: GuidanceItem[]}> = ({items}) => (
  <ul className="list-disc pl-5 space-y-1.5 text-base text-[#183B2B] leading-relaxed">{items.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
);

/** Planting months for one crop against today's calendar month, copied from the Crops Library, with the county sample note and the limits. */
export const PlantingGuidanceCard: React.FC<{slug: string; county?: string; now?: Date; className?: string}> = ({slug, county = '', now, className = ''}) => {
  const entry = plantingEntry(slug); const crop = cropEntry(slug); if (!entry || !crop) return null;
  const d = now ?? new Date(); const month = d.getMonth() + 1; const st = plantingStatus(slug, month)!; const cg = county ? countyGuidance(county) : null;
  const sentence = st.state === 'open' ? `The usual planting months are running now (${st.open.map((p) => `${p.label}: ${periodText(p)}`).join('; ')}).`
    : st.state === 'soon' ? `The usual months start in ${st.monthsUntilNext === 1 ? 'one month' : `${st.monthsUntilNext} months`} (${st.next!.label}: ${periodText(st.next!)}).`
    : `The usual months are further away. The next ones are ${periodText(st.next!)} (${st.next!.label}).`;
  return (
    <section className={`rounded-2xl bg-white border border-[#183B2B]/15 p-4 sm:p-5 space-y-3 ${className}`} data-testid="planting-card" data-state={st.state} aria-labelledby={`pl-${slug}`}>
      <h2 id={`pl-${slug}`} className="font-display text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><CalendarDays className="w-6 h-6 text-[#16803C]" aria-hidden /> Planting months: {crop.name}</h2>
      <p className="text-base font-bold text-[#183B2B]" data-testid="planting-sentence">{monthName(month)}: {sentence}</p>
      <ul className="space-y-1 text-base text-[#183B2B]">{entry.periods.map((p) => <li key={p.label}><strong>{p.label}:</strong> {periodText(p)}</li>)}</ul>
      {entry.unspecified && <p className="text-base text-[#183B2B]/85">{entry.unspecified}</p>}
      <p className="text-sm text-[#183B2B]/80">Source: the Crops Library text "{crop.plantingWindow}". This is a calendar guide only. It does not know this year's rains.</p>
      {cg && <div className="rounded-xl bg-[#F3F8F0] p-3 space-y-1" data-testid="county-note"><p className="text-base font-bold text-[#183B2B]">{county}{cg.region ? ` · ${cg.region}` : ''}</p><p className="text-base text-[#183B2B]">{cg.note}</p><p className="text-sm text-[#183B2B]/80">{cg.hasSample ? 'From the bundled sample profile for this county (not live, not a forecast).' : 'No verified county information.'}</p></div>}
      <p className="flex items-start gap-2 text-sm text-amber-950"><Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {REGIONAL_LIMIT}</p>
    </section>
  );
};

/** Harvest, handling and storage for one crop. Library sentences and general-practice sentences are kept apart and labelled. */
export const StorageGuidanceCard: React.FC<{slug: string; className?: string}> = ({slug, className = ''}) => {
  const g = storageGuide(slug); if (!g) return null;
  const Section: React.FC<{title: string; items: GuidanceItem[]; source: Provenance; id: string}> = ({title, items, source, id}) => (items.length ? <div className="space-y-1.5" data-testid={`storage-${id}`}><h3 className="text-lg font-extrabold text-[#183B2B]">{title}</h3><SourceTag source={source} /><Bullets items={items} /></div> : null);
  return (
    <section className={`rounded-2xl bg-white border border-[#183B2B]/15 p-4 sm:p-5 space-y-4 ${className}`} data-testid="storage-card" aria-labelledby={`st-${slug}`}>
      <h2 id={`st-${slug}`} className="font-display text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><Warehouse className="w-6 h-6 text-[#16803C]" aria-hidden /> Harvest and storage: {g.name}</h2>
      <Section id="harvest" title="At harvest" items={g.atHarvest} source="library" />
      <Section id="handling" title="Handling" items={g.handling} source="team" />
      <Section id="storage" title="Storing it" items={g.storage} source="library" />
      <Section id="watch" title="Watch for" items={g.watchFor} source="team" />
      <div className="space-y-1.5" data-testid="storage-sell"><h3 className="text-lg font-extrabold text-[#183B2B]">Before you sell</h3><SourceTag source="team" /><p className="text-base text-[#183B2B]">{g.sellTip.text}</p></div>
      <details className="rounded-xl bg-[#F3F8F0] p-3"><summary className="min-h-[44px] flex items-center cursor-pointer text-base font-bold text-[#183B2B]">Checks for every crop</summary><Bullets items={COMMON_STORAGE_CHECKS.map((text) => ({text, source: 'team' as const}))} /></details>
      <p className="text-sm text-[#183B2B]/80">Demonstration guidance. Not reviewed by the Ministry of Agriculture or an agronomist. For a spoilage problem you cannot explain, ask an extension officer.</p>
      <Link to="/experts" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#16803C] px-4 font-bold text-[#0F5C2A]" data-testid="storage-expert">Ask an extension officer</Link>
    </section>
  );
};
