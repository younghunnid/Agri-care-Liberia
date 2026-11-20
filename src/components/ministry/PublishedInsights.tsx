import React, {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Download, RefreshCw} from 'lucide-react';
import type {Aggregates, InsightsLoad} from '../../lib/insightsClient';
import {CHECK_COLUMNS, HARVEST_COLUMNS, publishedCsv, publishedRows, selectPublishedRows, type PublishedDimension, type PublishedKind, type PublishedRow, type PublishedSource} from '../../lib/ministryWorkspace';
import {AccessibleBarChart, dashboardField, MetricCard, PanelState, PublishedDataTable, SectionCard, SourceBadge} from '../workspace/DashboardBits';

const when=(s?:string)=>s?new Date(s).toLocaleString():'Unavailable';
export interface PublishedInsightsProps {result:InsightsLoad;busy:boolean;error:string|null;online:boolean;reload:()=>void;view:string}
export function PublishedInsights({result,busy,error,online,reload,view}:PublishedInsightsProps){
 const [params,setParams]=useSearchParams();const data=result.data;
 const source:PublishedSource=params.get('source')==='synthetic'?'synthetic':'real';
 const kind:PublishedKind=params.get('measure')==='checks'||(!params.has('measure')&&view==='crop-monitoring')?'checks':'harvest';
 const dimension:PublishedDimension=params.get('dimension')==='crop'&&view!=='counties'?'crop':'county';
 const group=params.get('group')??'',search=params.get('q')??'';
 const patch=(values:Record<string,string>)=>{const n=new URLSearchParams(params);for(const [k,v]of Object.entries(values))v?n.set(k,v):n.delete(k);setParams(n,{replace:true});};
 const [metric,setMetric]=useState('');
 const columns=kind==='harvest'?HARVEST_COLUMNS:CHECK_COLUMNS;
 const metricKey=columns.slice(1).some(c=>c[0]===metric)?metric:kind==='harvest'?'totalKg':'checks';
 const metricLabel=columns.find(c=>c[0]===metricKey)![1];
 const published=data?publishedRows(data,source,kind,dimension):null;
 const rows=published?selectPublishedRows(published.rows,group,search):[];
 const selected=rows.length===1&&!rows[0].other&&!!group?rows[0]:null;
 const dataset=source==='real'?'App-entered contributions':'Seeded synthetic aggregates';
 const reset=()=>patch({source:'',measure:'',dimension:'',group:'',q:''});
 useEffect(()=>{setMetric('');},[kind]);
 const exportCsv=()=>{if(!data||!published||!rows.length)return;const text=publishedCsv(rows,kind,{source:dataset,dimension,asOf:published.asOf,scope:`${group||'All published groups'}; search: ${search||'none'}`,privacy:data.privacy.note});const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='agri-published-aggregates.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="space-y-4 scroll-mt-4" id="sec-live" aria-label="Published agricultural aggregates" data-testid="published-insights">
   <SectionCard title="Published agricultural activity" description="Published groups only · not national production or official statistics." actions={<button type="button" onClick={reload} disabled={busy||!online} className="agri-button-secondary" aria-label="Refresh published aggregates"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`} aria-hidden />{busy?'Refreshing…':'Refresh'}</button>}>
    <div className="flex flex-wrap gap-2"><SourceBadge>{dataset}</SourceBadge><SourceBadge>{result.source==='saved'?'Saved information · not live':result.source==='server'?'Retrieved from this prototype':'No snapshot loaded'}</SourceBadge></div>
    <p className="mt-3 text-sm text-[#52665B]">{published?.note??'App-entered and synthetic records are never combined.'}</p>
    <p className="mt-2 text-xs text-[#52665B]" data-testid="published-asof">Published as of {when(published?.asOf)} · Saved on this device {when(result.savedAt)}{data?.refresh?` · Batched refresh after ${data.refresh.minChange} record changes`:''}</p>
    <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Published aggregate filters">
     <label className="text-sm font-semibold">Data source<select className={dashboardField} value={source} onChange={e=>patch({source:e.target.value,group:''})} data-testid="published-source"><option value="real">App-entered contributions</option><option value="synthetic">Seeded synthetic aggregates</option></select></label>
     <label className="text-sm font-semibold">Activity<select className={dashboardField} value={kind} onChange={e=>patch({measure:e.target.value,group:''})} data-testid="published-measure"><option value="harvest">Harvest offered for sale</option><option value="checks">Simulated crop checks</option></select></label>
     <label className="text-sm font-semibold">Published dimension<select className={dashboardField} value={dimension} disabled={view==='counties'} onChange={e=>patch({dimension:e.target.value,group:''})} data-testid="published-dimension"><option value="county">County</option><option value="crop">Crop</option></select></label>
    </div>
    <details className="mt-3"><summary className="min-h-[44px] cursor-pointer text-sm font-bold">Search and filter published rows</summary><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
     <label className="text-sm font-semibold">County<select className={dashboardField} disabled={dimension!=='county'||!published} value={dimension==='county'?group:''} onChange={e=>patch({group:e.target.value})} data-testid="published-county"><option value="">All published county groups</option>{dimension==='county'&&published?.rows.filter(r=>!r.other).map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
     <label className="text-sm font-semibold">Crop<select className={dashboardField} disabled={dimension!=='crop'||!published} value={dimension==='crop'?group:''} onChange={e=>patch({group:e.target.value})} data-testid="published-crop"><option value="">All published crop groups</option>{dimension==='crop'&&published?.rows.filter(r=>!r.other).map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
     <label className="text-sm font-semibold">Reporting period<select disabled className={dashboardField} aria-describedby="aggregate-filter-scope"><option>Published snapshot only</option></select></label>
     <label className="text-sm font-semibold sm:col-span-2">Search published groups<input className={dashboardField} type="search" value={search} placeholder="County or crop in this table" onChange={e=>patch({q:e.target.value})} data-testid="published-search" /></label>
     <button type="button" onClick={reset} className="agri-button-secondary self-end">Reset filters</button>
    </div></details>
    <p id="aggregate-filter-scope" className="mt-3 text-xs leading-relaxed text-[#52665B]">Filters select visible published rows only. County and crop are separate dimensions; joint county-by-crop and historical filters are unavailable. Other groups are not recomputed. No hidden record is exposed.</p>
   </SectionCard>
   {busy&&!data?<PanelState kind="loading" title="Loading published snapshot">No statistics are shown until the source has responded.</PanelState>:!data?<PanelState kind={online?'error':'offline'} title={online?'Published information could not load':'No saved aggregate snapshot on this device'} onRetry={online?reload:undefined}>Connect and refresh to retrieve the permitted aggregates. You can still use <Link to="/guidance" className="underline">bundled agricultural guidance</Link>.</PanelState>:<>
    {error&&<PanelState kind="error" title="Refresh did not succeed" onRetry={online?reload:undefined}>{error} The previous snapshot has been retained.</PanelState>}
    {!online&&<PanelState kind="offline" title="Offline · saved information only">Availability and asking prices may have changed. Reconnect and refresh before making decisions.</PanelState>}
    {view!==''&&<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="published-kpis">
      <MetricCard label="Published named groups" value={published?.insufficient?'Suppressed':published?.rows.filter(r=>!r.other).length} source={dataset} note="Published groups only. This is not a total of farmers, crops or counties nationwide." />
      <MetricCard label={selected?(kind==='harvest'?'Listings in selected group':'Checks in selected group'):'View coverage'} value={selected?selected[kind==='harvest'?'listings':'checks']:published?.insufficient?'Suppressed':'Published only'} source={dataset} note="Choose one named published group. No total is inferred across groups." />
      <MetricCard label={selected?(kind==='harvest'?'Offered kg in selected group':'Contributors in selected group'):'Selection'} value={selected?selected[kind==='harvest'?'totalKg':'devices']?.toLocaleString():group?'No match':dimension==='county'?'County groups':'Crop groups'} source={dataset} note={kind==='harvest'?'Rounded to the published precision. Offered stock is not sold volume.':'Published contributor count for this group only; not unique across other groups.'} />
      <MetricCard label="Snapshot status" value={result.source==='saved'?'Saved':'Retrieved'} source={result.source==='saved'?'Not live':'This prototype'} note={`Published ${when(published?.asOf)}. A timestamp is not a reporting-period history.`} />
    </div>}
    {published?.insufficient?<PanelState kind="suppressed" title="Not enough published data to show this safely">A group needs at least {data.privacy.minGroup} records and {data.privacy.minGroup} distinct contributors. Smaller groups follow the existing Other/suppression rules. Missing information is not zero.</PanelState>:<>
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
       <SectionCard title={kind==='harvest'?'Harvest offered by published group':'Simulated crop checks by published group'} description={`${dataset} · ${dimension} dimension`} actions={<label className="text-sm font-semibold">Chart value<select className={dashboardField} value={metricKey} onChange={e=>setMetric(e.target.value)}>{columns.slice(1).map(c=><option value={c[0]} key={c[0]}>{c[1]}</option>)}</select></label>}><AccessibleBarChart title={metricLabel} rows={rows.filter(r=>typeof r[metricKey as keyof PublishedRow]==='number'&&Number.isFinite(r[metricKey as keyof PublishedRow])).map(r=>({label:r.label,value:r[metricKey as keyof PublishedRow] as number}))} unit={metricKey==='totalKg'?'kg':metricKey==='averagePriceLrdPerKg'?'L$/kg':''} /></SectionCard>
       <SectionCard title="Read this view correctly"><ul className="space-y-3 text-sm leading-relaxed text-[#40554A]"><li>Only values already published by the existing privacy service are used.</li><li>{kind==='harvest'?'Prices are rounded asking prices, not completed sales. County averages may include different crops.':'Green, yellow and red are symptom-guided simulation bands, not diagnoses.'}</li><li>App-entered and invented records remain separate.</li><li><Link to="/ministry/data-quality" className="font-bold text-[#0F5C2A] underline">Sources and privacy rules</Link></li></ul></SectionCard>
      </div>
      <SectionCard title="Published data table" description="Sort any column. Search and selections apply to these rows and the chart; no private records are loaded." actions={view==='reports'?<div className="flex flex-wrap gap-2"><button type="button" className="agri-button-secondary" disabled={!rows.length} onClick={exportCsv}><Download className="h-4 w-4" aria-hidden />Export filtered published rows</button><button type="button" className="agri-button-secondary" onClick={()=>window.print()}>Print report</button></div>:undefined}>
       <PublishedDataTable caption={`${dataset}: ${kind} by ${dimension}`} rows={rows} columns={columns.map(([key,label])=>({key,label,numeric:key!=='label',value:(r:PublishedRow)=>r[key as keyof PublishedRow] as number|string ?? 'Unavailable'}))} />
      </SectionCard>
    </>}
    <details className="rounded-xl border border-[#183B2B]/10 bg-white p-4 text-sm"><summary className="cursor-pointer font-bold">Publication and suppression rules</summary><p className="mt-3 leading-relaxed">{data.privacy.note}</p></details>
   </>}
 </section>;
}
