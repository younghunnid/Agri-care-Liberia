import React, {useCallback, useEffect, useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {insightsClient} from '../../lib/triageApp';
import type {CheckRow, HarvestRow, InsightsLoad, Table} from '../../lib/insightsClient';
import {useApp} from '../../context/AppContext';

const th = 'py-2 px-2 text-left font-bold text-[#183B2B]';
const td = 'py-2 px-2 text-[#183B2B]';
const when = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : '');

function HarvestTable({title, t, first}: {title: string; t: Table<HarvestRow>; first: string}) {
  return (
    <div className="space-y-2 min-w-0" data-testid={`tbl-${title}`}>
      <h3 className="text-lg font-extrabold text-[#183B2B]">{title}</h3>
      {t.insufficient ? <p className="text-base text-[#183B2B]/85">Not enough data to show this safely (fewer than 3 records or farmers).</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col" className={th}>{first}</th><th scope="col" className={th}>Listings</th><th scope="col" className={th}>Farmers</th><th scope="col" className={th}>Total kg</th><th scope="col" className={th}>Average L$ per kg</th></tr></thead>
          <tbody>
            {t.rows.map((r) => <tr key={r.key} className="border-t border-[#183B2B]/10" data-testid="agg-row"><th scope="row" className={`${td} text-left font-bold`}>{r.label}</th><td className={td}>{r.listings}</td><td className={td}>{r.farmers}</td><td className={td}>{r.totalKg.toLocaleString('en-US')}</td><td className={td}>{r.averagePriceLrdPerKg}</td></tr>)}
            {t.other && <tr className="border-t border-[#183B2B]/10 bg-[#F3F8F0]" data-testid="agg-other"><th scope="row" className={`${td} text-left font-bold`}>{t.other.label} ({t.other.groupsCombined} groups)</th><td className={td}>{t.other.listings}</td><td className={td}>{t.other.farmers}</td><td className={td}>{t.other.totalKg.toLocaleString('en-US')}</td><td className={td}>{t.other.averagePriceLrdPerKg}</td></tr>}
          </tbody></table></div>)}
    </div>
  );
}
function CheckTable({title, t, first}: {title: string; t: Table<CheckRow>; first: string}) {
  return (
    <div className="space-y-2 min-w-0" data-testid={`tbl-${title}`}>
      <h3 className="text-lg font-extrabold text-[#183B2B]">{title}</h3>
      {t.insufficient ? <p className="text-base text-[#183B2B]/85">Not enough data to show this safely (fewer than 3 checks or devices).</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col" className={th}>{first}</th><th scope="col" className={th}>Checks</th><th scope="col" className={th}>Devices</th><th scope="col" className={th}>Green</th><th scope="col" className={th}>Yellow</th><th scope="col" className={th}>Red</th></tr></thead>
          <tbody>
            {t.rows.map((r) => <tr key={r.key} className="border-t border-[#183B2B]/10" data-testid="agg-row"><th scope="row" className={`${td} text-left font-bold`}>{r.label}</th><td className={td}>{r.checks}</td><td className={td}>{r.devices}</td><td className={td}>{r.green}</td><td className={td}>{r.yellow}</td><td className={td}>{r.red}</td></tr>)}
            {t.other && <tr className="border-t border-[#183B2B]/10 bg-[#F3F8F0]" data-testid="agg-other"><th scope="row" className={`${td} text-left font-bold`}>{t.other.label} ({t.other.groupsCombined} groups)</th><td className={td}>{t.other.checks}</td><td className={td}>{t.other.devices}</td><td className={td}>{t.other.green}</td><td className={td}>{t.other.yellow}</td><td className={td}>{t.other.red}</td></tr>}
          </tbody></table></div>)}
    </div>
  );
}

/** Live (but privacy-protected) numbers from this demonstration database: harvest listings and simulated crop checks. Counts and totals only; small groups are combined. */
export const LiveInsightsPanel: React.FC = () => {
  const {isOnline} = useApp();
  const [r, setR] = useState<InsightsLoad>({data: null, source: 'none'});
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => { setBusy(true); setR(await insightsClient.load()); setBusy(false); }, []);
  useEffect(() => { void load(); }, [load, isOnline]);
  const d = r.data;
  return (
    <section id="sec-live" aria-labelledby="h-live" className="space-y-3 scroll-mt-20" data-testid="live-insights">
      <h2 id="h-live" className="font-display text-2xl font-extrabold text-[#183B2B]">Harvest and crop checks (privacy-protected)</h2>
      <p role="note" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-950" data-testid="live-label">{d?.label ?? 'SIMULATED DEMONSTRATION. This is not an official Ministry system and these are not official statistics.'}</p>
      <p className="text-sm text-[#183B2B]/85" data-testid="live-privacy">{d?.privacy.note ?? 'A group is shown only when it has at least 3 records from at least 3 different farmers or devices. Smaller groups are combined into one "Other" row.'}</p>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-bold text-[#183B2B]" data-testid="live-source" data-source={r.source}>
          {r.source === 'server' ? `Live from this demonstration database. Computed ${when(d?.generatedAt)}.` : r.source === 'saved' ? `Saved copy from ${when(r.savedAt)} (you are offline or the server is not reachable). It may be out of date.` : busy ? 'Loading...' : 'No data yet. Connect to the internet once to load it.'}
          {d?.containsSyntheticRecords ? ' Includes synthetic demonstration records.' : ''}
        </p>
        <button type="button" onClick={() => void load()} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border-2 border-[#183B2B]/25 px-3" aria-label="Refresh the numbers"><RefreshCw className="w-5 h-5" aria-hidden /></button>
      </div>
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rounded-2xl bg-white border border-[#183B2B]/10 p-4 min-w-0">
          <HarvestTable title="Harvest listings by county" t={d.harvest.byCounty} first="County" />
          <HarvestTable title="Harvest listings by crop" t={d.harvest.byCrop} first="Crop" />
          <CheckTable title="Crop checks by crop" t={d.cropChecks.byCrop} first="Crop" />
          <CheckTable title="Crop checks by county" t={d.cropChecks.byCounty} first="County" />
        </div>)}
      <p className="text-sm text-[#183B2B]/75">Crop checks are simulated and symptom-guided (not diagnoses). Listings show kilograms and prices only. No names, phone numbers, villages, reference codes or photos are included.</p>
    </section>
  );
};
