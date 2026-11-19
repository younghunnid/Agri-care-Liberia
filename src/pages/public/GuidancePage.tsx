import React, {useMemo, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {GUIDANCE_CROPS, cropEntry, monthName, plantingStatus} from '../../data/farmGuidance';
import {GuidanceBanner, PlantingGuidanceCard, StorageGuidanceCard} from '../../components/guidance/GuidanceBits';
import {loadProfile} from '../../lib/farmerToday';

type Tab = 'planting' | 'storage';
const field = 'w-full min-h-[52px] rounded-2xl border-2 border-[#183B2B]/25 bg-white px-3 text-base text-[#183B2B]';

/** Planting months and harvest/storage handling for the nine supported crops, for the counties the project supports. Built into the app: works offline. */
export const GuidancePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const profile = useMemo(() => loadProfile(), []);
  const slugs = GUIDANCE_CROPS.map((c) => c.slug);
  const crop = slugs.includes(params.get('crop') ?? '') ? params.get('crop')! : (profile.crops[0] ?? slugs[0]);
  const tab: Tab = params.get('tab') === 'storage' ? 'storage' : 'planting';
  const countyParam = params.get('county') ?? '';
  const [county, setCounty] = useState<string>((LIBERIA_COUNTIES as readonly string[]).includes(countyParam) ? countyParam : profile.county);
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(params); for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k)); setParams(n, {replace: true}); };
  const now = new Date(); const month = now.getMonth() + 1; const entry = cropEntry(crop);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="guidance-page">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Planting and storage guidance</h1>
        <p className="text-base text-[#183B2B]/85">Choose your crop to see the usual planting months and how to handle and store the harvest.</p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 block"><span className="text-base font-bold text-[#183B2B]">Crop</span>
          <select className={field} value={crop} onChange={(e) => set({crop: e.target.value})} data-testid="g-crop">{GUIDANCE_CROPS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
        <label className="space-y-1 block"><span className="text-base font-bold text-[#183B2B]">County (optional)</span>
          <select className={field} value={county} onChange={(e) => { setCounty(e.target.value); set({county: e.target.value}); }} data-testid="g-county"><option value="">Not chosen</option>{LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      <div role="tablist" aria-label="Guidance type" className="grid grid-cols-2 gap-2">
        {([['planting', 'Planting months'], ['storage', 'Harvest and storage']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => set({tab: t})} data-testid={`tab-${t}`} className={`min-h-[52px] rounded-2xl border-2 px-3 text-base font-extrabold ${tab === t ? 'bg-[#16803C] border-[#16803C] text-white' : 'bg-white border-[#183B2B]/25 text-[#183B2B]'}`}>{label}</button>))}
      </div>
      <GuidanceBanner />
      {tab === 'planting' ? <PlantingGuidanceCard slug={crop} county={county} now={now} /> : <StorageGuidanceCard slug={crop} />}
      <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" data-testid="month-glance" aria-labelledby="glance-h">
        <h2 id="glance-h" className="text-lg font-extrabold text-[#183B2B]">{monthName(month)} at a glance (Crops Library months)</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {GUIDANCE_CROPS.map((c) => { const s = plantingStatus(c.slug, month)!; return (
            <li key={c.slug}><button type="button" onClick={() => set({crop: c.slug})} className="w-full min-h-[48px] flex items-center justify-between gap-2 rounded-xl border border-[#183B2B]/15 px-3 text-left text-base text-[#183B2B]"><span className="font-bold">{c.name}</span><span className={`text-sm font-bold ${s.state === 'open' ? 'text-[#0F5C2A]' : 'text-[#183B2B]/70'}`}>{s.state === 'open' ? 'Usual months running' : s.state === 'soon' ? `Starts in ${s.monthsUntilNext} mo` : 'Later'}</span></button></li>); })}
        </ul>
      </section>
      <nav className="flex flex-wrap gap-3" aria-label="Related pages">
        {entry && <Link to={`/crops/${crop}`} className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#16803C] px-4 font-bold text-[#0F5C2A]">Full {entry.name} guide</Link>}
        <Link to="/weather" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">Sample weather</Link>
        <Link to="/experts" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">Ask an expert</Link>
        <Link to="/today" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">My farm today</Link>
      </nav>
    </div>
  );
};
