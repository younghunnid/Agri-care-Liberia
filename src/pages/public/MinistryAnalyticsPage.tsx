import {LiveInsightsPanel} from '../../components/ministry/LiveInsightsPanel';
import React, {useEffect, useMemo, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, CloudRain, Droplets, MessageSquareText, ShieldCheck, Smartphone, Thermometer} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {useSyncState} from '../../lib/syncEngine';
import {StatusLabel} from '../../components/StatusLabel';
import {ExpectedActualChart} from '../../components/ministry/ExpectedActualChart';
import {
  AUDIENCE, CAMPAIGN_CROPS, CAMPAIGN_TEMPLATES, DEMO_COUNTIES, DEMO_CROPS, DEMO_DATASET_LABEL, OVERVIEW_SYNTHETIC, PRODUCTION, SIGNALS, WEATHER_DEMO, type DemoCounty,
} from '../../data/ministryDemo';
import {
  ALL, FSI_LABEL, FSI_WEIGHTS, USSD_NOTICE, USSD_MAX_CHARS, achievementPct, assignEscalation, audienceSize, buildEscalations, computeFsi, expectedActualBars, fillTemplate, filterProduction, filterSignals,
  fsiBand, moistureLabel, reviewEscalation, severityOf, simulateDispatch, smsInfo, sortProduction, summarise, templatesFor, ussdScreen, validateCampaignMessage,
  type Escalation, type SimulatedDispatch, type SortKey,
} from '../../lib/ministryAnalytics';

const nf = new Intl.NumberFormat('en-US');
const sel = 'mt-1 w-full min-h-[48px] rounded-xl border border-[#183B2B]/30 bg-white px-3 text-base';
const card = 'rounded-2xl bg-white border border-[#183B2B]/12 p-4';

const SourceBadge: React.FC<{kind: 'synthetic' | 'live' | 'device' | 'derived'}> = ({kind}) => {
  const m = {
    synthetic: ['bg-sky-50 text-sky-900 border-sky-300', 'Synthetic demo'],
    live: ['bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/40', 'Live: this prototype'],
    device: ['bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/40', 'Live: this device'],
    derived: ['bg-sky-50 text-sky-900 border-sky-300', 'Derived from synthetic data'],
  }[kind];
  return <span data-source={kind} className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${m[0]}`}>{m[1]}</span>;
};

const BAND_STYLE = {Secure: 'bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/50', Caution: 'bg-amber-50 text-amber-900 border-amber-400', Critical: 'bg-red-50 text-red-900 border-red-400'} as const;
const SEV_STYLE = {High: 'bg-red-50 text-red-900 border-red-400', Caution: 'bg-amber-50 text-amber-900 border-amber-400', Low: 'bg-slate-100 text-slate-800 border-slate-300'} as const;
const WIN_STYLE = {Open: 'bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/50', Caution: 'bg-amber-50 text-amber-900 border-amber-400', Closed: 'bg-red-50 text-red-900 border-red-400'} as const;
/** Text + icon + colour, never colour alone. */
const Pill: React.FC<{cls: string; icon?: React.ReactNode; children: React.ReactNode; testid?: string}> = ({cls, icon, children, testid}) => (
  <span data-testid={testid} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>{icon}{children}</span>
);

export const MinistryAnalyticsPage: React.FC<{embedded?: boolean; view?: string}> = ({embedded = false, view = 'overview'}) => {
  const sections: Record<string,string[]> = {overview:['overview'],'food-security':['production','fsi','weather'],'crop-monitoring':['disease'],extension:['disease','campaigns'],'data-quality':['privacy']};
  const show = (id:string) => !embedded || (sections[view] ?? []).includes(id);
  const [params,setParams] = useSearchParams();
  const sampleParam=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set(key,value);return next;},{replace:true});
  const {isOnline} = useApp();
  const sync = useSyncState();
  const requestedCounty=params.get('sampleCounty')??'All';
  const county:DemoCounty|'All'=(DEMO_COUNTIES as readonly string[]).includes(requestedCounty)?requestedCounty as DemoCounty:'All';
  const setCounty=(v:DemoCounty|'All')=>sampleParam('sampleCounty',v);
  const crop=DEMO_CROPS.includes(params.get('sampleCrop')??'')?params.get('sampleCrop')!:ALL;
  const setCrop=(v:string)=>sampleParam('sampleCrop',v);
  const [sortKey, setSortKey] = useState<SortKey>('fsi');
  const [asc, setAsc] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(PRODUCTION[0].id);
  const [horizon, setHorizon] = useState<'3' | '7'>('3');
  const [escalations, setEscalations] = useState<Escalation[]>(() => buildEscalations(SIGNALS));
  const [liveRequests, setLiveRequests] = useState<number | null>(null);

  // Campaign simulator
  const [cCounty, setCCounty] = useState<DemoCounty | 'All'>('Bong');
  const [cCrop, setCCrop] = useState<(typeof CAMPAIGN_CROPS)[number]>('Cassava');
  const [templateId, setTemplateId] = useState('cassava-leaves');
  const [text, setText] = useState(() => fillTemplate(CAMPAIGN_TEMPLATES[0], 'Bong'));
  const [log, setLog] = useState<SimulatedDispatch[]>([]);
  const [lastRun, setLastRun] = useState<SimulatedDispatch | null>(null);
  const [mode, setMode] = useState<'sms' | 'ussd'>('sms');
  const [ussdPath, setUssdPath] = useState('');

  // The only live numbers: this device's offline queue (above) and, if reachable, the prototype's own simulated expert-request count.
  useEffect(() => {
    if (!isOnline) return;
    apiFetch<{demoAndExperimentalData?: {simulatedExpertRequests?: number}}>('/prototype/management-summary')
      .then((r) => setLiveRequests(typeof r.demoAndExperimentalData?.simulatedExpertRequests === 'number' ? r.demoAndExperimentalData.simulatedExpertRequests : null))
      .catch(() => setLiveRequests(null));
  }, [isOnline]);

  const rows = useMemo(() => sortProduction(filterProduction(PRODUCTION, {county, crop}), sortKey, asc), [county, crop, sortKey, asc]);
  const sum = useMemo(() => summarise(rows), [rows]);
  const chart = useMemo(() => expectedActualBars(rows), [rows]);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const fsi = selected ? computeFsi(selected) : null;
  const signals = useMemo(() => filterSignals(SIGNALS, county), [county]);
  const highSignals = SIGNALS.filter((s) => severityOf(s) === 'High').length;
  const weatherRows = WEATHER_DEMO.filter((w) => county === 'All' || w.county === county);
  const queue = escalations.filter((e) => county === 'All' || e.county === county);

  const sortBy = (k: SortKey) => { if (k === sortKey) setAsc((a) => !a); else { setSortKey(k); setAsc(k === 'county' || k === 'crop' || k === 'fsi'); } };
  const th = (k: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sortKey === k ? (asc ? 'ascending' : 'descending') : 'none'} className={`py-2 px-2 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => sortBy(k)} className="min-h-[44px] min-w-[44px] inline-flex items-center gap-1 font-bold text-[#183B2B] focus:outline-none focus:ring-2 focus:ring-[#16803C] rounded" data-sort={k}>
        {label}{sortKey === k && (asc ? <ArrowUp className="w-4 h-4" aria-hidden /> : <ArrowDown className="w-4 h-4" aria-hidden />)}
      </button>
    </th>
  );

  // ---- campaign helpers
  const applyTemplate = (id: string, forCounty: DemoCounty | 'All' = cCounty) => {
    setTemplateId(id);
    const t = CAMPAIGN_TEMPLATES.find((x) => x.id === id);
    if (t) setText(fillTemplate(t, forCounty === 'All' ? 'your county' as DemoCounty : forCounty));
  };
  const info = smsInfo(text);
  const problems = validateCampaignMessage(text);
  const audience = audienceSize(cCounty, cCrop);
  const ussdCtx = {county: (cCounty === 'All' ? 'Bong' : cCounty) as DemoCounty, advice: text};
  const screen = ussdScreen(ussdPath, ussdCtx);
  const dispatch = () => {
    if (problems.length) return;
    const r = simulateDispatch({county: cCounty, crop: cCrop, text, audience, sequence: log.length + 1});
    setLog((l) => [r, ...l]); setLastRun(r);
  };

  const key = (k: string) => setUssdPath((p) => {
    if (k === '#') return '0';
    if (k === '0') return p.includes('*') ? p.split('*')[0] : '';
    return p ? `${p}*${k}` : k;
  });

  return (
    <div className={embedded ? "min-w-0 space-y-5" : "max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8"} data-testid="ministry-analytics-page">
      {!embedded && (<>
      <header className="space-y-3">
        <div className="flex flex-wrap gap-2"><StatusLabel kind="simulated" text="Demonstration dashboard" /><StatusLabel kind="working" text="Runs offline" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Ministry &amp; Extension View (Demo)</h1>
        <div role="note" data-testid="demo-banner" className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 text-sky-950 space-y-1">
          <p className="font-bold">{DEMO_DATASET_LABEL}</p>
          <p className="text-sm">This page is a Team 8 hackathon demonstration for judges. It is <strong>not</strong> a Ministry product, is <strong>not endorsed</strong> by any Ministry or government body, uses no farmer records, and sends <strong>no real SMS or USSD</strong>. Numbers marked "Live" come from this prototype only.</p>
        </div>
        <nav aria-label="Dashboard sections" className="flex flex-wrap gap-2">
          {[['overview', 'Overview'], ['production', 'County production'], ['fsi', 'Food security index'], ['weather', 'Weather and planting'], ['disease', 'Disease signals'], ['campaigns', 'SMS and USSD simulator'], ['privacy', 'Privacy and access']].map(([id, label]) => (
            <a key={id} href={`#sec-${id}`} className="min-h-[44px] inline-flex items-center rounded-xl border border-[#16803C]/40 bg-white px-3 text-sm font-bold text-[#0F5C2A] hover:bg-[#DDEFE0]">{label}</a>
          ))}
        </nav>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl" role="group" aria-label="Filters for the production, weather and disease views">
          <label className="block text-sm font-bold text-[#183B2B]">County
            <select data-testid="filter-county" value={county} onChange={(e) => { setCounty(e.target.value as DemoCounty | 'All'); }} className={sel}><option value="All">All five demo counties</option>{DEMO_COUNTIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block text-sm font-bold text-[#183B2B]">Crop (production table and chart)
            <select data-testid="filter-crop" value={crop} onChange={(e) => setCrop(e.target.value)} className={sel}><option value={ALL}>All crops</option>{DEMO_CROPS.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
      </header>
      </>)}


      {embedded && ['food-security','crop-monitoring','extension'].includes(view) && <fieldset className="rounded-2xl border border-[#183B2B]/10 bg-white p-4"><legend className="px-2 text-sm font-bold">Illustrative Ministry dataset A</legend><p className="mb-3 text-sm text-[#52665B]">These sample filters affect only the illustrative sections below, not published aggregates. No historical reporting periods are available.</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Sample county<select data-testid="filter-county" value={county} onChange={e=>setCounty(e.target.value as DemoCounty|'All')} className={sel}><option value="All">All five demo counties</option>{DEMO_COUNTIES.map(c=><option key={c}>{c}</option>)}</select></label>{view==='food-security'&&<label className="text-sm font-bold">Sample crop (production and index)<select data-testid="filter-crop" value={crop} onChange={e=>setCrop(e.target.value)} className={sel}><option value={ALL}>All crops</option>{DEMO_CROPS.map(c=><option key={c}>{c}</option>)}</select></label>}</div></fieldset>}

      {/* ============================ A. OVERVIEW */}
      {show('overview') && (
      <section id="sec-overview" aria-labelledby="h-overview" className="space-y-3 scroll-mt-20">
        <h2 id="h-overview" className="font-display text-2xl font-extrabold text-[#183B2B]">Illustrative sample overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="kpis">
          {[
            ['Registered farmers', nf.format(OVERVIEW_SYNTHETIC.registeredFarmers), 'synthetic', 'Counts only. No names or phone numbers are shown anywhere on this page.'],
            ['Active farmers (30 days)', nf.format(OVERVIEW_SYNTHETIC.activeFarmers30d), 'synthetic', 'Invented for the demonstration.'],
            ['Crop reports (30 days)', nf.format(OVERVIEW_SYNTHETIC.cropReports30d), 'synthetic', 'Invented for the demonstration.'],
            ['Expert requests (30 days)', nf.format(OVERVIEW_SYNTHETIC.expertRequests30d), 'synthetic', liveRequests !== null ? `This prototype's own server currently holds ${liveRequests} simulated expert requests.` : 'Open this page online to also see the prototype\'s own simulated request count.'],
            ['Disease warning signals', `${highSignals} high`, 'derived', `Of ${SIGNALS.length} synthetic county signals. A signal is a count of reports, not a diagnosis.`],
          ].map(([label, value, src, note]) => (
            <div key={label} className={card} data-kpi={label}>
              <p className="text-sm font-bold text-[#183B2B]/80">{label}</p>
              <p className="font-display text-3xl font-extrabold text-[#183B2B]">{value}</p>
              <p className="mt-1"><SourceBadge kind={src as 'synthetic' | 'derived'} /></p>
              <p className="mt-1 text-xs text-[#183B2B]/75">{note}</p>
            </div>
          ))}
          <div className={card} data-kpi="Offline synchronisation">
            <p className="text-sm font-bold text-[#183B2B]/80">Offline synchronisation (this device)</p>
            <p className="font-display text-3xl font-extrabold text-[#183B2B]" data-testid="sync-queued">{sync.queued} waiting{sync.failed ? `, ${sync.failed} failed` : ''}</p>
            <p className="mt-1"><SourceBadge kind="device" /></p>
            <p className="mt-1 text-xs text-[#183B2B]/75">Questions and listings saved on this phone and not yet sent. Last successful sync: {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : 'none yet'}.</p>
          </div>
        </div>
      </section>
      )}


      {/* ============================ B. COUNTY PRODUCTION */}
      {!embedded && <LiveInsightsPanel />}

      {show('production') && (
      <section id="sec-production" aria-labelledby="h-production" className="space-y-3 scroll-mt-20">
        <h2 id="h-production" className="font-display text-2xl font-extrabold text-[#183B2B]">County production <SourceBadge kind="synthetic" /></h2>
        <p className="text-sm text-[#183B2B]/80" data-testid="prod-summary">Showing <strong>{sum.rows}</strong> of {PRODUCTION.length} rows · planted {nf.format(sum.plantedHa)} ha · expected {nf.format(sum.expectedMt)} MT · actual {nf.format(sum.actualMt)} MT · actual is <strong>{sum.achievementPct}%</strong> of expected{sum.meanFsi !== null ? ` · mean demo index ${sum.meanFsi}` : ''}.</p>
        <div className="overflow-x-auto rounded-2xl border border-[#183B2B]/12 bg-white" tabIndex={0} role="region" aria-label="Production table (scrolls sideways on small screens)">
          <table className="w-full text-sm" data-testid="prod-table">
            <caption className="sr-only">Synthetic production by county and crop. Select a row to see its illustrative food security index.</caption>
            <thead className="bg-[#F3F8F0]"><tr>{th('county', 'County')}{th('crop', 'Crop')}{th('plantedHa', 'Planted (ha)', true)}{th('expectedMt', 'Expected (MT)', true)}{th('actualMt', 'Actual (MT)', true)}{th('achievement', 'Actual vs expected', true)}{th('fsi', 'Demo index', true)}</tr></thead>
            <tbody className="divide-y divide-[#183B2B]/10">
              {rows.map((r) => {
                const f = computeFsi(r).score; const band = fsiBand(f);
                return (
                  <tr key={r.id} data-row={r.id} aria-selected={selected?.id === r.id} className={selected?.id === r.id ? 'bg-[#DDEFE0]' : ''}>
                    <th scope="row" className="py-2 px-2 text-left font-bold"><button type="button" onClick={() => setSelectedId(r.id)} className="min-h-[44px] min-w-[44px] text-left underline text-[#0F5C2A]" aria-label={`Show index details for ${r.county} ${r.crop}`}>{r.county}</button></th>
                    <td className="py-2 px-2">{r.crop}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{nf.format(r.plantedHa)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{nf.format(r.expectedMt)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{nf.format(r.actualMt)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{achievementPct(r)}%</td>
                    <td className="py-2 px-2 text-right"><Pill cls={BAND_STYLE[band]}>{f} · {band}</Pill></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} data-testid="prod-empty" className="py-6 px-3 text-center text-[#183B2B]/80">No rows match these filters. Change the county or crop.</td></tr>}
            </tbody>
          </table>
        </div>
        <ExpectedActualChart bars={chart.bars} max={chart.max} title={`Expected versus actual harvest (MT): ${county === 'All' ? 'all counties' : county}, ${crop === ALL ? 'all crops' : crop}`} />
      </section>
      )}


      {/* ============================ C. FOOD SECURITY INDEX */}
      {show('fsi') && (
      <section id="sec-fsi" aria-labelledby="h-fsi" className="space-y-3 scroll-mt-20">
        <h2 id="h-fsi" className="font-display text-2xl font-extrabold text-[#183B2B]">Food security index (illustrative)</h2>
        <p data-testid="fsi-label" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-950">{FSI_LABEL}</p>
        {fsi && selected ? (
          <div className={`${card} space-y-3`} data-testid="fsi-panel" data-fsi={fsi.score}>
            <p className="text-lg font-extrabold text-[#183B2B]">{selected.county} · {selected.crop}: <span data-testid="fsi-score">{fsi.score}</span> / 100 <Pill cls={BAND_STYLE[fsiBand(fsi.score)]}>{fsiBand(fsi.score)}</Pill></p>
            <p className="text-sm text-[#183B2B]/85">Formula: <strong>{Math.round(FSI_WEIGHTS.availability * 100)}% availability + {Math.round(FSI_WEIGHTS.weather * 100)}% weather + {Math.round(FSI_WEIGHTS.cropHealth * 100)}% crop health</strong>. Each input is a 0 to 100 demo value.</p>
            <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="fsi-table">
              <caption className="sr-only">How the illustrative index for the selected row is calculated</caption>
              <thead className="bg-[#F3F8F0]"><tr><th scope="col" className="py-2 px-2 text-left">Input</th><th scope="col" className="py-2 px-2 text-right">Value (0 to 100)</th><th scope="col" className="py-2 px-2 text-right">Weight</th><th scope="col" className="py-2 px-2 text-right">Points</th></tr></thead>
              <tbody className="divide-y divide-[#183B2B]/10">
                {fsi.parts.map((p) => (
                  <tr key={p.key}><th scope="row" className="py-2 px-2 text-left font-bold">{p.label}</th><td className="py-2 px-2 text-right tabular-nums">{p.input}</td><td className="py-2 px-2 text-right tabular-nums">{Math.round(p.weight * 100)}%</td><td className="py-2 px-2 text-right tabular-nums">{p.points.toFixed(2)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" colSpan={3} className="py-2 px-2 text-left">Total (rounded)</th><td className="py-2 px-2 text-right font-extrabold tabular-nums">{fsi.raw.toFixed(1)} → {fsi.score}</td></tr></tfoot>
            </table></div>
            <p className="text-xs text-[#183B2B]/75" data-testid="fsi-formula">{fsi.formula}</p>
            <div className="space-y-1" aria-hidden>{fsi.parts.map((p) => <div key={p.key} className="h-2 rounded bg-slate-200"><div className="h-2 rounded bg-[#16803C]" style={{width: `${p.input}%`}} /></div>)}</div>
            <p className="text-xs text-[#183B2B]/75">Bands for this demo only: 70 and above Secure, 60 to 69 Caution, below 60 Critical. They are not an official classification.</p>
          </div>
        ) : <p className={card}>Select a row in the production table to see its index.</p>}
      </section>
      )}


      {/* ============================ D. WEATHER */}
      {show('weather') && (
      <section id="sec-weather" aria-labelledby="h-weather" className="space-y-3 scroll-mt-20">
        <h2 id="h-weather" className="font-display text-2xl font-extrabold text-[#183B2B]">Weather and planting <StatusLabel kind="simulated" text="Not a live forecast" /></h2>
        <p className="text-sm text-[#183B2B]/80">Demonstration numbers for five counties. Planting windows and wording are <strong>draft</strong> rules written by the team. They have not been checked by an agronomist or a meteorological service. Always confirm with an agricultural extension officer.</p>
        <div role="group" aria-label="Forecast horizon" className="flex gap-2">
          {(['3', '7'] as const).map((h) => <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h} data-horizon={h} className={`min-h-[48px] px-5 rounded-xl border-2 text-base font-bold ${horizon === h ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : 'border-[#183B2B]/25 bg-white text-[#183B2B]'}`}>{h}-day view</button>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="weather-grid">
          {weatherRows.map((w) => {
            const f = horizon === '3' ? w.d3 : w.d7;
            return (
              <article key={w.county} className={`${card} space-y-2`} data-weather={w.county} data-horizon-shown={horizon}>
                <h3 className="font-display text-lg font-extrabold text-[#183B2B]">{w.county}</h3>
                <p className="text-xs text-[#183B2B]/75">{w.station} · synthetic</p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#183B2B]"><span className="inline-flex items-center gap-1"><Thermometer className="w-4 h-4" aria-hidden /> {f.tempC}°C</span><span className="inline-flex items-center gap-1"><CloudRain className="w-4 h-4" aria-hidden /> {f.rainMm} mm rain</span></p>
                <p className="text-sm text-[#183B2B]"><span className="inline-flex items-center gap-1"><Droplets className="w-4 h-4" aria-hidden /> Soil moisture <strong data-testid="moisture">{f.soilMoisture}%</strong> ({moistureLabel(f.soilMoisture)})</span></p>
                <div role="img" aria-label={`Soil moisture ${f.soilMoisture} percent, ${moistureLabel(f.soilMoisture)}`} className="h-2 rounded bg-slate-200"><div className="h-2 rounded bg-sky-600" style={{width: `${f.soilMoisture}%`}} /></div>
                <p><Pill cls={WIN_STYLE[f.window]}>Planting window (draft): {f.window}</Pill></p>
                <p className="text-sm text-[#183B2B]/90">{f.note}</p>
                <p className="text-sm font-semibold text-[#183B2B]">{w.draftGuidance}</p>
                <p><StatusLabel kind="draft" /></p>
              </article>
            );
          })}
        </div>
      </section>
      )}


      {/* ============================ E. DISEASE SIGNALS */}
      {show('disease') && (
      <section id="sec-disease" aria-labelledby="h-disease" className="space-y-3 scroll-mt-20">
        <h2 id="h-disease" className="font-display text-2xl font-extrabold text-[#183B2B]">Disease and illness signals <SourceBadge kind="synthetic" /></h2>
        <p role="note" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-950">These are counts of what farmers reported, grouped by county. They are <strong>not diagnoses</strong>. No confirmed disease is named here, no AI confidence score is shown, and nothing has been verified by an expert. A person (extension or veterinary officer) must review each signal.</p>
        <div className="overflow-x-auto rounded-2xl border border-[#183B2B]/12 bg-white" tabIndex={0} role="region" aria-label="Signals table (scrolls sideways on small screens)">
          <table className="w-full text-sm" data-testid="signal-table">
            <caption className="sr-only">Aggregated synthetic farmer reports by county in the last 7 days, with a severity indicator</caption>
            <thead className="bg-[#F3F8F0]"><tr>{['County', 'Type', 'What was reported', 'Reports (7 days)', 'Severity'].map((h, i) => <th key={h} scope="col" className={`py-2 px-2 ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#183B2B]/10">
              {signals.map((s) => { const sev = severityOf(s); return (
                <tr key={s.id} data-signal={s.id}><th scope="row" className="py-2 px-2 text-left font-bold">{s.county}</th><td className="py-2 px-2">{s.category}</td><td className="py-2 px-2">{s.concern}</td><td className="py-2 px-2 text-right tabular-nums">{s.reports7d}</td>
                  <td className="py-2 px-2"><Pill cls={SEV_STYLE[sev]} testid="severity" icon={sev === 'High' ? <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> : undefined}>{sev}</Pill></td></tr>
              ); })}
              {signals.length === 0 && <tr><td colSpan={5} data-testid="signal-empty" className="py-6 px-3 text-center text-[#183B2B]/80">No signals for this county.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#183B2B]/75">Severity rule used for this demo only: 5 or more reports in 7 days is High; a cluster of 3 or more livestock reports is also High; 2 to 4 is Caution; 1 is Low. The rule only decides what a person should look at first.</p>
        <h3 className="font-display text-xl font-extrabold text-[#183B2B]">Expert escalation queue</h3>
        <ul className="space-y-2" data-testid="escalation-queue">
          {queue.map((e) => (
            <li key={e.id} data-esc={e.id} data-status={e.status} className={`${card} space-y-2`}>
              <p className="text-sm font-bold text-[#183B2B]">{e.id} · {e.county}: {e.subject}</p>
              <p className="text-sm text-[#183B2B]/85">{e.reason}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm"><Pill cls={e.status === 'Pending' ? 'bg-amber-50 text-amber-900 border-amber-400' : e.status === 'Assigned' ? 'bg-sky-50 text-sky-900 border-sky-300' : 'bg-[#DDEFE0] text-[#0F5C2A] border-[#16803C]/50'}>{e.status}</Pill>{e.assignee && <span>Assigned to {e.assignee}</span>}</p>
              <div className="flex flex-wrap gap-2">
                {e.status === 'Pending' && <button type="button" onClick={() => setEscalations((l) => assignEscalation(l, e.id))} data-testid="assign" className="min-h-[48px] px-4 rounded-xl bg-[#16803C] text-white font-bold text-sm">Assign to an officer (demo)</button>}
                {e.status === 'Assigned' && <button type="button" onClick={() => setEscalations((l) => reviewEscalation(l, e.id))} data-testid="review" className="min-h-[48px] px-4 rounded-xl border-2 border-[#16803C] text-[#0F5C2A] font-bold text-sm">Mark reviewed (demo)</button>}
              </div>
            </li>
          ))}
          {queue.length === 0 && <li data-testid="queue-empty" className={card}>No escalations for this county.</li>}
        </ul>
        <p className="text-xs text-[#183B2B]/75">Assigning only changes this page. No officer is notified and no record is stored.</p>
      </section>
      )}


      {/* ============================ F. SIMULATED SMS AND USSD */}
      {show('campaigns') && (
      <section id="sec-campaigns" aria-labelledby="h-campaigns" className="space-y-3 scroll-mt-20">
        <h2 id="h-campaigns" className="font-display text-2xl font-extrabold text-[#183B2B]">Simulated SMS and USSD campaigns</h2>
        <p data-testid="sim-banner" className="rounded-xl border-2 border-sky-300 bg-sky-50 p-3 text-sm font-bold text-sky-950">SIMULATION ONLY. Nothing on this page sends a real SMS or opens a USSD session, and no telecom network is connected. Sign-in codes are never part of campaigns: they are handled only by the separate sign-in service.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${card} space-y-3`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-[#183B2B]">Target county
                <select data-testid="camp-county" value={cCounty} onChange={(e) => { const v = e.target.value as DemoCounty | 'All'; setCCounty(v); applyTemplate(templateId, v); }} className={sel}><option value="All">All five demo counties</option>{DEMO_COUNTIES.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="block text-sm font-bold text-[#183B2B]">Crop or animals
                <select data-testid="camp-crop" value={cCrop} onChange={(e) => { const v = e.target.value as (typeof CAMPAIGN_CROPS)[number]; setCCrop(v); const t = templatesFor(v)[0]; if (t) applyTemplate(t.id); }} className={sel}>{CAMPAIGN_CROPS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
            </div>
            <label className="block text-sm font-bold text-[#183B2B]">Approved demo template (Team 8 draft)
              <select data-testid="camp-template" value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={sel}>{templatesFor(cCrop).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </label>
            <div>
              <label htmlFor="camp-text" className="block text-sm font-bold text-[#183B2B]">Message</label>
              <textarea id="camp-text" data-testid="camp-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="camp-count camp-problems" className="mt-1 w-full rounded-xl border border-[#183B2B]/30 bg-white p-3 text-base" />
              <p id="camp-count" data-testid="camp-count" aria-live="polite" className={`text-sm font-semibold ${info.remaining < 0 || info.segments > 1 ? 'text-amber-900' : 'text-[#183B2B]/80'}`}>{info.units} characters ({info.encoding}) · {info.segments} SMS {info.segments === 1 ? 'segment' : 'segments'} · {info.remaining} left in this {info.segments === 1 ? 'segment' : 'set'}</p>
            </div>
            <ul id="camp-problems" data-testid="camp-problems" className={problems.length ? 'space-y-1 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900' : 'sr-only'} role={problems.length ? 'alert' : undefined}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            <p className="text-sm text-[#183B2B]" data-testid="camp-audience">Simulated audience: <strong>{nf.format(audience)}</strong> opted-in demo subscribers <SourceBadge kind="synthetic" /></p>
            <button type="button" onClick={dispatch} disabled={problems.length > 0} data-testid="camp-dispatch" className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white text-lg font-extrabold">Simulate campaign dispatch</button>
            {lastRun && <p role="status" data-testid="camp-result" className="rounded-xl bg-[#DDEFE0] p-3 text-sm font-semibold text-[#0F5C2A]">{lastRun.id} · SIMULATED. No message was sent. Pretend result: {nf.format(lastRun.delivered)} of {nf.format(lastRun.audience)} delivered ({lastRun.deliveryRatePct}%), {nf.format(lastRun.failed)} not delivered.</p>}
          </div>

          <div className={`${card} space-y-3`}>
            <div role="group" aria-label="Preview type" className="flex gap-2">
              {(['sms', 'ussd'] as const).map((m) => <button key={m} type="button" onClick={() => { setMode(m); setUssdPath(''); }} aria-pressed={mode === m} data-mode={m} className={`min-h-[48px] px-5 rounded-xl border-2 text-base font-bold ${mode === m ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : 'border-[#183B2B]/25 bg-white text-[#183B2B]'}`}>{m === 'sms' ? 'Basic-phone SMS' : 'USSD-style menu'}</button>)}
            </div>
            <div className="mx-auto w-full max-w-[320px] rounded-[36px] bg-[#183B2B] p-4 border-4 border-[#0e241a] space-y-3" data-testid="phone-preview">
              <p className="text-center text-xs font-bold text-[#F5B942]">DEMO PREVIEW · nothing is sent</p>
              {mode === 'sms' ? (
                <div className="rounded-2xl bg-[#DDEFE0] p-3 min-h-[160px] text-[#183B2B] text-sm space-y-2" data-testid="sms-preview">
                  <p className="font-mono text-xs font-bold">FROM: Agricare (demo)</p>
                  <p className="font-mono whitespace-pre-wrap break-words">{text || '(empty message)'}</p>
                  <p className="font-mono text-xs">{info.units} chars · {info.segments} segment{info.segments === 1 ? '' : 's'}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-[#DDEFE0] p-3 min-h-[160px] text-[#183B2B] text-sm" data-testid="ussd-preview">
                    <p className="font-mono whitespace-pre-wrap break-words" data-kind={screen.kind}>{screen.kind} {screen.text}</p>
                    <p className="mt-2 font-mono text-xs">{screen.text.length}/{USSD_MAX_CHARS} chars · {screen.kind === 'CON' ? 'menu open' : 'session ended'}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="Demo keypad">
                    {['1', '2', '3', '0'].map((k) => <button key={k} type="button" onClick={() => key(k)} data-key={k} className="min-h-[48px] rounded-xl bg-white/10 hover:bg-white/20 text-white text-lg font-bold">{k}</button>)}
                  </div>
                  <button type="button" onClick={() => setUssdPath('')} className="w-full min-h-[44px] rounded-xl bg-white/10 text-white text-sm font-bold">Restart the demo menu</button>
                </>
              )}
            </div>
            {mode === 'ussd' && <p data-testid="ussd-notice" className="text-xs font-semibold text-[#183B2B]">{USSD_NOTICE}</p>}
          </div>
        </div>
        <h3 className="font-display text-xl font-extrabold text-[#183B2B]">Simulated dispatch log</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#183B2B]/12 bg-white" tabIndex={0} role="region" aria-label="Simulated dispatch log (scrolls sideways on small screens)">
          <table className="w-full text-sm" data-testid="dispatch-log">
            <caption className="sr-only">Simulated campaign dispatches made on this page during this visit</caption>
            <thead className="bg-[#F3F8F0]"><tr>{['Run', 'County', 'Crop', 'Message start', 'Audience', 'Delivered', 'Status'].map((h) => <th key={h} scope="col" className="py-2 px-2 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#183B2B]/10">
              {log.map((r) => <tr key={r.id} data-run={r.id}><th scope="row" className="py-2 px-2 text-left">{r.id}</th><td className="py-2 px-2">{r.county}</td><td className="py-2 px-2">{r.crop}</td><td className="py-2 px-2">{r.excerpt}</td><td className="py-2 px-2 tabular-nums">{nf.format(r.audience)}</td><td className="py-2 px-2 tabular-nums">{nf.format(r.delivered)} ({r.deliveryRatePct}%)</td><td className="py-2 px-2"><Pill cls="bg-sky-50 text-sky-900 border-sky-300">SIMULATED</Pill></td></tr>)}
              {log.length === 0 && <tr><td colSpan={7} data-testid="log-empty" className="py-5 px-3 text-center text-[#183B2B]/80">No simulated dispatches yet. The log is kept only while this page is open.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      )}


      {/* ============================ G. PRIVACY AND ACCESS */}
      {show('privacy') && (
      <section id="sec-privacy" aria-labelledby="h-privacy" className="space-y-3 scroll-mt-20">
        <h2 id="h-privacy" className="font-display text-2xl font-extrabold text-[#183B2B] flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-[#16803C]" aria-hidden /> Privacy and access</h2>
        <ul className={`${card} list-disc pl-8 space-y-2 text-base text-[#183B2B]/90`} data-testid="privacy-list">
          <li><strong>Separate from farmer views.</strong> {embedded ? 'This workspace shows permitted published aggregates and prototype summary counts only. No individual farmer, expert or marketplace record is fetched.' : 'This page has its own address and reads none of the farmer, expert or marketplace records.'}</li>
          <li><strong>No personal data.</strong> Only aggregate counts. There are no names, phone numbers or individual reports anywhere on this page, and there is no export of data from these local campaign simulations.</li>
          <li><strong>No Ministry login exists yet.</strong> {embedded ? 'There is no Ministry permission in this prototype. Public app-entered views use the existing aggregate suppression and rounding rules. This workspace grants no access to protected records. Future privileged reports or actions require server authorization and an audit trail.' : 'Because there is no Ministry role in this prototype, the page is kept synthetic and isolated. It does not pretend to have production access control. Before any real data is connected, the server must enforce a Ministry role, return only aggregates, and write security-sensitive actions to the audit log.'}</li>
          <li><strong>Campaigns are simulated.</strong> Nothing is sent, so nothing is audited. A real campaign feature would need consent records, sender approval and an audit trail.</li>
          <li><strong>Not an official source.</strong> Nothing here is a Ministry statistic, assessment or endorsement.</li>
        </ul>
        <p className="text-sm"><Link to="/demo" className="font-bold underline text-[#0F5C2A] inline-flex items-center min-h-[44px]">Back to Demo Mode</Link> · <Link to="/ministry/food-security" className="font-bold underline text-[#0F5C2A] inline-flex items-center min-h-[44px]">Existing food security demo view</Link></p>
      </section>
      )}

    </div>
  );
};
