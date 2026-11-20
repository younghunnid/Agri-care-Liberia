import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Link, Navigate, useLocation} from 'react-router-dom';
import {BarChart3, BookOpen, ClipboardCheck, FileText, Globe, Landmark, Layers, MessageSquare, Sprout, Wifi, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import {createInsightsClient, type InsightsLoad} from '../../lib/insightsClient';
import {MINISTRY_VIEWS, ministryDestination, publishedRows} from '../../lib/ministryWorkspace';
import {WorkspaceScaffold} from '../../components/workspace/WorkspaceScaffold';
import {MetricCard, PanelState, SectionCard, SourceBadge} from '../../components/workspace/DashboardBits';
import {PublishedInsights} from '../../components/ministry/PublishedInsights';
import {MinistryAnalyticsPage} from './MinistryAnalyticsPage';
import {MinistryDashboardPage} from './MinistryDashboardPage';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../../lib/i18n';

const icons=[Landmark,Layers,Sprout,BarChart3,MessageSquare,Globe,FileText,ClipboardCheck];
export function MinistryWorkspacePage(){
 const location=useLocation();const {isOnline,user,language,setLanguage,lowBandwidth,toggleLowBandwidth,listenMode,toggleListenMode}=useApp();
 const redirect=ministryDestination(location.pathname,location.hash,location.search);
 const slug=location.pathname.replace(/^\/ministry\/?/,'').replace(/\/$/,'');
 const active=MINISTRY_VIEWS.find(v=>v.slug===slug);
 const [result,setResult]=useState<InsightsLoad>({data:null,source:'none'});const [busy,setBusy]=useState(true);const [error,setError]=useState<string|null>(null);
 const request=useRef(0);
 const reload=useCallback(async()=>{
  const id=++request.current;setBusy(true);setError(null);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const client=createInsightsClient({get:async<T,>(path:string):Promise<T>=>{if(!isOnline)throw new TypeError('Offline');return apiFetch<T>(path,{signal:controller.signal});}});
   const loaded=await client.load();if(id!==request.current)return;
   setResult(previous=>loaded.data?loaded:previous.data?{...previous,source:'saved'}:loaded);
   if(isOnline&&loaded.source!=='server')setError('The latest published information could not be retrieved.');
  }catch{if(id===request.current){setResult(previous=>previous.data?{...previous,source:'saved'}:previous);setError('Published information or local storage could not be read.');}}
  finally{clearTimeout(timer);if(id===request.current)setBusy(false);}
 },[isOnline]);
 useEffect(()=>{void reload();return()=>{request.current++;};},[reload]);
 useEffect(()=>{if(!location.hash)return;const id=decodeURIComponent(location.hash.slice(1));const timer=setTimeout(()=>document.getElementById(id)?.scrollIntoView({block:'start'}),100);return()=>clearTimeout(timer);},[location.pathname,location.hash,busy]);
 if(redirect)return <Navigate to={redirect} replace />;
 const chosenSource=new URLSearchParams(location.search).get('source')==='synthetic'?'synthetic':'real';
 const coverage=(dimension:'county'|'crop')=>{if(!result.data)return null;const r=publishedRows(result.data,chosenSource,'harvest',dimension);return r.insufficient?'Suppressed':r.rows.filter(x=>!x.other).length;};
 const sourceLabel=chosenSource==='synthetic'?'Seeded synthetic aggregates':'App-entered contributions';
 const title=active?.label??'View unavailable';const view=active?.slug??'unknown';
 const account=user?.roles.includes('admin')?'/admin':user?.roles.includes('expert')?'/expert':'/farmer';
 return <WorkspaceScaffold title={title==='Harvest & Marketplace'?'Harvest & Marketplace Analytics':title} subtitle="Agricultural management and analytics · Team 8 demonstration" navItems={MINISTRY_VIEWS.map((v,i)=>({to:'/ministry'+(v.slug?'/'+v.slug:''),label:v.label,end:true,icon:icons[i]}))} actions={<>
  <span className="inline-flex min-h-[44px] items-center gap-2 text-xs font-semibold">{isOnline?<Wifi className="h-4 w-4 text-[#16803C]" aria-hidden />:<WifiOff className="h-4 w-4" aria-hidden />}{isOnline?'Server reachable':'Offline'}</span>
  <label className="sr-only" htmlFor="workspace-language">Language</label><select id="workspace-language" className="min-h-[44px] max-w-[130px] rounded-xl border border-[#183B2B]/20 px-2 text-sm" value={language} onChange={e=>setLanguage(e.target.value as LanguageCode)}>{LANGUAGE_OPTIONS.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select>
  <button type="button" aria-pressed={lowBandwidth} onClick={toggleLowBandwidth} className="agri-button-secondary text-sm">Low data</button><button type="button" aria-pressed={listenMode} onClick={toggleListenMode} className="agri-button-secondary text-sm">Listen mode</button>
  <Link to={user?account:'/login'} className="agri-button-secondary">{user?'My workspace':'Sign in'}</Link>
 </>}>
  <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-[#EDF5EF] px-4 py-3 text-sm" role="note"><p><strong>Demonstration workspace.</strong> Not an official Ministry system or endorsed statistics. No farmer-level records are shown.</p><Link to="/ministry/data-quality" className="min-h-[44px] shrink-0 font-bold text-[#0F5C2A] underline">About these data</Link></div>
  {!active&&<PanelState kind="unavailable" title="This Ministry view does not exist"><Link to="/ministry" className="underline">Return to Overview</Link></PanelState>}
  {view===''&&<>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard label="Published county groups" value={coverage('county')} loading={busy&&!result.data} source={sourceLabel} note="Named harvest groups only. Not a national county or farmer total." />
    <MetricCard label="Minimum publication group" value={result.data?.privacy.minGroup??null} loading={busy&&!result.data} source="Existing privacy rule" note="Both record count and distinct contributors must meet the rule." />
    <MetricCard label="Published crop groups" value={coverage('crop')} loading={busy&&!result.data} source={sourceLabel} note="A separate harvest marginal. Contributors can overlap between groups." />
    <MetricCard label="Reporting availability" value="Snapshot" source="No historical series" note="County and crop are separate published dimensions. No cross-filter is inferred." />
   </div>
  </>}
  {['','harvest','crop-monitoring','counties','reports'].includes(view)&&<PublishedInsights result={result} busy={busy} error={error} online={isOnline} reload={()=>void reload()} view={view} />}
  {view==='food-security'&&<SectionCard title="Illustrative food security" description="These production and index examples come from Ministry dataset A. They are synthetic, have no dated reporting period and do not describe actual national production."><SourceBadge>Illustrative Ministry dataset A · not official</SourceBadge></SectionCard>}
  {view==='extension'&&<SectionCard title="Extension planning practice" description="Review synthetic concern signals and preview campaign templates. Assignments and message delivery below are local simulations; no telecom service is connected."><Link to="/expert" className="agri-button-secondary">Existing expert workspace (sign in)</Link></SectionCard>}
  <details open={view!==''} className={view===''?'rounded-2xl border border-[#183B2B]/10 bg-white p-4':(['food-security','crop-monitoring','extension','data-quality'].includes(view)?'contents':'hidden')}>
   <summary className={view===''?'min-h-[44px] cursor-pointer font-bold':'hidden'}>Explore illustrative overview KPIs · dataset A</summary>
   {view===''&&<p className="mb-4 text-sm text-[#52665B]">Invented farmer/report counts are retained as examples, separate from published app activity. Device sync counts apply only to this browser.</p>}
   <MinistryAnalyticsPage embedded view={view===''?'overview':view} />
  </details>
  {view==='food-security'&&<details className="rounded-2xl border border-[#183B2B]/10 bg-white p-4" data-testid="legacy-food-dataset"><summary className="min-h-[44px] cursor-pointer font-bold">Legacy food-security charts · separate illustrative dataset B</summary><p className="mb-4 text-sm text-[#52665B]">This is a different existing sample dataset. Its farmer counts, trends and crop shares are not combined with dataset A or app-entered activity. Its county selector applies to its sample summaries/table; other charts show their full sample context.</p><MinistryDashboardPage embedded /></details>}
  {view==='reports'&&<PanelState kind="unavailable" title="Historical reports are not connected">Reports contain only the currently published snapshot and selected source. CSV/print includes the same permitted fields; no raw farmer or expert records are exported.</PanelState>}
  {view==='data-quality'&&<>
   <SectionCard title="Sources and interpretation"><dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2"><div><dt className="font-bold">App-entered contributions</dt><dd className="mt-1">Records entered through this prototype, including synthetic accounts during demonstrations. Not official statistics.</dd></div><div><dt className="font-bold">Seeded synthetic aggregates</dt><dd className="mt-1">Invented demonstration records. Published separately and never added to app-entered figures.</dd></div><div><dt className="font-bold">Illustrative datasets A and B</dt><dd className="mt-1">Existing independent sample fixtures. Their totals, index inputs and weather are illustrative, not measured production or live weather.</dd></div><div><dt className="font-bold">This device</dt><dd className="mt-1">Local saved work and queue state belong to this browser. They are not Ministry-wide activity.</dd></div></dl></SectionCard>
   <SectionCard title="Publication safeguards"><p className="text-sm leading-relaxed">{result.data?.privacy.note??'Groups require at least 3 records from 3 distinct contributors. Small groups are combined or suppressed by the existing server rules. Kilograms are rounded to 50 and prices to L$ 5. Publication is batched; no names, phone numbers, villages, reference codes or photos are included.'}</p><p className="mt-3 text-sm">Unavailable and suppressed values are not zero. Contributor counts can overlap across groups and cannot be summed into a national farmer count. No county-by-crop, historical series or raw-data drill-down is supported.</p></SectionCard>
   <SectionCard title="Access and offline availability"><p className="text-sm leading-relaxed">These public views contain aggregate demonstrations only. There is no Ministry login role. Existing farmer, expert and administrator workspaces keep their existing permissions. After online preparation, saved snapshots and bundled illustrations can be read offline; cached information can be cleared by the browser and may be outdated.</p><Link to="/downloads" className="agri-button-secondary mt-3"><BookOpen className="h-4 w-4" aria-hidden /> Existing offline downloads</Link></SectionCard>
  </>}
 </WorkspaceScaffold>;
}
