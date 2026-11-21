import React, {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, CheckCircle2, CloudRain, CloudUpload, Loader2, MessageSquare, ScanSearch, Sprout, Store, UserCheck, WifiOff, Wifi, BookOpen, Warehouse} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {useApp} from '../../context/AppContext';
import {SpeakButton} from '../../components/SpeakButton';
import {StatusLabel} from '../../components/StatusLabel';
import {GuidanceBanner} from '../../components/guidance/GuidanceBits';
import {LiveWeatherPanel} from '../../components/weather/LiveWeatherPanel';
import {GUIDANCE_CROPS, SAMPLE_WEATHER_LABEL, countyGuidance} from '../../data/farmGuidance';
import {getListingRecords, getQuestionRecords, getSyncVersion, subscribeSync} from '../../lib/offlineDrafts';
import {syncNow, useSyncState} from '../../lib/syncEngine';
import {triageStore, triageSync} from '../../lib/triageApp';
import {buildReminders, emptyProfile, greeting, loadProfile, monthLabel, pendingWork, saveProfile, type FarmProfile, type Pending} from '../../lib/farmerToday';
import type {SavedAssessment} from '../../lib/triageStore';

const ACTIONS: {to: string; label: string; hint: string; Icon: React.ComponentType<{className?: string}>; testid: string; tone: string}[] = [
  {to: '/check-my-crop', label: 'Check my crop', hint: 'Questions, a colour, advice', Icon: ScanSearch, testid: 'qa-check', tone: 'bg-[#16803C] text-white border-[#16803C]'},
  {to: '/advisor', label: 'Agricultural advice', hint: 'Ask by text or voice', Icon: BookOpen, testid: 'qa-advice', tone: 'bg-white text-[#183B2B] border-[#16803C]/40'},
  {to: '/harvest/sell', label: 'Sell my harvest', hint: 'Save offline, send later', Icon: Sprout, testid: 'qa-sell', tone: 'bg-white text-[#183B2B] border-[#16803C]/40'},
  {to: '/harvest', label: 'Find buyers', hint: 'See what buyers can find', Icon: Store, testid: 'qa-buyers', tone: 'bg-white text-[#183B2B] border-[#16803C]/40'},
  {to: '/experts', label: 'Expert support', hint: 'Send a question and photo', Icon: MessageSquare, testid: 'qa-expert', tone: 'bg-white text-[#183B2B] border-[#16803C]/40'},
];
const field = 'w-full min-h-[52px] rounded-2xl border-2 border-[#183B2B]/25 bg-white px-3 text-base text-[#183B2B]';

/** The farmer's home screen: five big actions, what is waiting to send, live weather, sample weather and planting reminders for the county and crops they chose. Works offline. */
export const FarmerTodayPage: React.FC = () => {
  const {isOnline} = useApp();
  const sync = useSyncState();
  useSyncExternalStore(subscribeSync, getSyncVersion, getSyncVersion);
  const [profile, setProfile] = useState<FarmProfile>(() => loadProfile());
  const [saved, setSaved] = useState<boolean>(true);
  const [checks, setChecks] = useState<SavedAssessment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const refreshChecks = useCallback(() => { void triageStore.list().then(setChecks).catch(() => setChecks([])); }, []);
  useEffect(() => { refreshChecks(); }, [refreshChecks, isOnline, sync.queued, sync.failed, sync.lastSyncAt, sync.syncing]);

  const update = (p: FarmProfile) => { setProfile(p); setSaved(saveProfile(p)); };
  const toggleCrop = (slug: string) => update({...profile, crops: profile.crops.includes(slug) ? profile.crops.filter((c) => c !== slug) : [...profile.crops, slug]});
  const pending: Pending = pendingWork({listings: getListingRecords(), questions: getQuestionRecords(), checks});
  const reminders = useMemo(() => buildReminders({now, county: profile.county, crops: profile.crops}), [now, profile.county, profile.crops]);
  const cg = profile.county ? countyGuidance(profile.county) : null;
  const busy = sync.syncing;
  const runSync = async () => { setMsg(null); const r = await syncNow({manual: true}); await triageSync.sync({manual: true}).catch(() => undefined); refreshChecks(); setMsg(r.message); };
  const reading = `${greeting(now)}. ${isOnline ? 'You are online.' : 'You are offline. Everything on this page still works.'} ${pending.total ? `${pending.total} saved items are waiting to be sent.` : 'Nothing is waiting to be sent.'} ${reminders.map((r) => `${r.title}. ${r.detail}`).join(' ')}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-5" data-testid="farmer-today">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div><h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B] leading-tight">{greeting(now)}</h1><p className="text-sm sm:text-base text-[#183B2B]/80" data-testid="today-date">{monthLabel(now)}</p></div>
          <SpeakButton id="today-summary" label="Read this page" text={reading} compact />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Connection and saved items">
          <span className={`inline-flex items-center gap-2 min-h-[44px] rounded-full border-2 px-4 text-base font-extrabold ${isOnline ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : 'border-amber-500 bg-amber-50 text-amber-950'}`} data-testid="conn-status" data-online={isOnline ? 'yes' : 'no'}>{isOnline ? <Wifi className="w-5 h-5" aria-hidden /> : <WifiOff className="w-5 h-5" aria-hidden />}{isOnline ? 'Online' : 'Offline'}</span>
          <a href="#waiting" className={`inline-flex items-center gap-2 min-h-[44px] rounded-full border-2 px-4 text-base font-extrabold ${pending.total ? 'border-amber-500 bg-amber-50 text-amber-950' : 'border-[#183B2B]/20 bg-white text-[#183B2B]'}`} data-testid="pending-pill">{pending.total ? <CloudUpload className="w-5 h-5" aria-hidden /> : <CheckCircle2 className="w-5 h-5" aria-hidden />}{pending.total ? `${pending.total} waiting to send` : 'Nothing waiting'}</a>
        </div>
        {!isOnline && <p role="status" className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-3 text-base font-bold text-amber-950" data-testid="offline-notice">You are offline. Everything on this page still works. Anything you save stays on this phone and is sent when you are back online.</p>}
      </header>

      <nav aria-label="What would you like to do?" className="grid grid-cols-2 gap-2.5 sm:gap-3" data-testid="quick-actions">
        {ACTIONS.map((a, i) => (
          <Link key={a.to} to={a.to} data-testid={a.testid} className={`rounded-3xl border-2 p-3 sm:p-4 min-h-[112px] flex flex-col justify-between gap-1.5 shadow-sm ${a.tone} ${i === ACTIONS.length - 1 ? 'col-span-2' : ''}`}>
            <a.Icon className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden /><span><span className="block text-lg font-extrabold leading-snug">{a.label}</span><span className="hidden sm:block text-sm opacity-90">{a.hint}</span></span>
          </Link>))}
      </nav>

      <Link to="/ussd-demo" data-testid="go-ussd" className="min-h-[56px] flex items-center justify-between gap-3 rounded-2xl border-2 border-[#183B2B]/25 bg-white px-4 text-base font-extrabold text-[#183B2B]"><span>Basic phone demo (numbered menus)<span className="block text-sm font-semibold text-[#183B2B]/75">Demonstration only. No mobile network.</span></span><span aria-hidden>→</span></Link>

      <LiveWeatherPanel compact />

      <section className="rounded-2xl bg-white border-2 border-[#183B2B]/15 p-4 space-y-3" aria-labelledby="farm-h" data-testid="my-farm">
        <h2 id="farm-h" className="font-display text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><UserCheck className="w-6 h-6 text-[#16803C]" aria-hidden /> My farm</h2>
        <label className="space-y-1 block"><span className="text-base font-bold text-[#183B2B]">My county</span>
          <select className={field} value={profile.county} onChange={(e) => update({...profile, county: e.target.value})} data-testid="farm-county"><option value="">Choose your county</option>{LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <fieldset className="space-y-2"><legend className="text-base font-bold text-[#183B2B]">The crops I grow</legend>
          <div className="flex flex-wrap gap-2">{GUIDANCE_CROPS.map((c) => { const on = profile.crops.includes(c.slug); return (
            <button key={c.slug} type="button" aria-pressed={on} onClick={() => toggleCrop(c.slug)} data-testid={`crop-${c.slug}`} className={`min-h-[48px] rounded-full border-2 px-4 text-base font-bold ${on ? 'bg-[#16803C] border-[#16803C] text-white' : 'bg-white border-[#183B2B]/30 text-[#183B2B]'}`}>{on ? '✓ ' : ''}{c.name}</button>); })}</div></fieldset>
        <p className="text-sm text-[#183B2B]/80">{saved ? 'Saved on this phone only. Nothing is sent anywhere.' : 'This phone could not save your choices. They will be lost when you close the page.'}</p>
        {(profile.county || profile.crops.length > 0) && <button type="button" onClick={() => update(emptyProfile())} className="min-h-[44px] rounded-xl border-2 border-[#183B2B]/25 px-4 text-base font-bold text-[#183B2B]" data-testid="farm-clear">Clear my choices</button>}
      </section>

      <section className="space-y-3" aria-labelledby="rem-h" data-testid="reminders">
        <h2 id="rem-h" className="font-display text-xl font-extrabold text-[#183B2B]">Reminders for today</h2>
        {!profile.county && profile.crops.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-[#183B2B]/30 bg-white p-4 text-base text-[#183B2B]" data-testid="reminders-empty-setup">Choose your county and the crops you grow above. We will then show planting and weather reminders for them.</p>
        ) : reminders.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-[#183B2B]/30 bg-white p-4 text-base text-[#183B2B]" data-testid="reminders-empty">Nothing to remind you of this month for the crops you chose: their usual planting months are not near. You can still read the <Link className="font-bold underline text-[#0F5C2A]" to="/guidance">planting and storage guidance</Link>.</p>
        ) : (
          <ul className="space-y-3">{reminders.map((r) => (
            <li key={r.id} data-testid="reminder" data-kind={r.kind} className={`rounded-2xl border-2 p-4 space-y-1.5 ${r.tone === 'watch' ? 'border-amber-400 bg-amber-50' : 'border-[#16803C]/30 bg-white'}`}>
              <p className="text-lg font-extrabold text-[#183B2B]">{r.title}</p><p className="text-base text-[#183B2B]">{r.detail}</p>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950" data-testid="reminder-tag">{r.tag}</span><Link to={r.to} className="inline-flex items-center min-h-[44px] font-bold underline text-[#0F5C2A]">Read more</Link></div>
            </li>))}</ul>)}
        {cg?.sample && (
          <div className="rounded-2xl bg-[#F3F8F0] border border-[#183B2B]/15 p-4 space-y-1" data-testid="sample-weather">
            <p className="flex items-center gap-2 text-base font-extrabold text-[#183B2B]"><CloudRain className="w-5 h-5 text-[#16803C]" aria-hidden /> {profile.county}: sample weather</p>
            <p className="text-sm font-bold text-amber-950">{SAMPLE_WEATHER_LABEL}</p>
            <p className="text-base text-[#183B2B]">{cg.sample.conditionSummary}. {cg.sample.tempMinC} to {cg.sample.tempMaxC} °C, humidity {cg.sample.humidityPct}%, {cg.sample.rainfallMm7d} mm in a sample week.</p>
            <Link to="/weather" className="inline-flex items-center min-h-[44px] font-bold underline text-[#0F5C2A]">More sample weather</Link>
          </div>)}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to={`/guidance?tab=planting${profile.crops[0] ? `&crop=${profile.crops[0]}` : ''}${profile.county ? `&county=${encodeURIComponent(profile.county)}` : ''}`} className="min-h-[56px] flex items-center justify-center gap-2 rounded-2xl border-2 border-[#16803C] px-4 text-base font-extrabold text-[#0F5C2A]" data-testid="go-planting"><Sprout className="w-5 h-5" aria-hidden /> Planting months</Link>
          <Link to={`/guidance?tab=storage${profile.crops[0] ? `&crop=${profile.crops[0]}` : ''}`} className="min-h-[56px] flex items-center justify-center gap-2 rounded-2xl border-2 border-[#16803C] px-4 text-base font-extrabold text-[#0F5C2A]" data-testid="go-storage"><Warehouse className="w-5 h-5" aria-hidden /> Harvest and storage</Link>
        </div>
      </section>

      <section id="waiting" className="rounded-2xl bg-white border-2 border-[#183B2B]/15 p-4 space-y-3 scroll-mt-24" aria-labelledby="wait-h" data-testid="waiting">
        <h2 id="wait-h" className="font-display text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><CloudUpload className="w-6 h-6 text-[#16803C]" aria-hidden /> Saved on this phone</h2>
        {pending.total === 0 ? <p className="text-base text-[#183B2B]" data-testid="waiting-empty">Nothing is waiting to be sent. When you save a harvest listing, a question or a shared crop check without internet, it will appear here.</p> : (
          <ul className="text-base text-[#183B2B] space-y-1" data-testid="waiting-list">
            {pending.listings > 0 && <li>{pending.listings} harvest listing{pending.listings === 1 ? '' : 's'}</li>}
            {pending.questions > 0 && <li>{pending.questions} question{pending.questions === 1 ? '' : 's'} for an expert</li>}
            {pending.checks > 0 && <li>{pending.checks} shared crop check{pending.checks === 1 ? '' : 's'}</li>}
            {pending.failed > 0 && <li className="font-bold text-red-900 flex items-center gap-2"><AlertTriangle className="w-5 h-5" aria-hidden /> {pending.failed} need attention. They are safe and will be tried again.</li>}
          </ul>)}
        <button type="button" onClick={() => void runSync()} disabled={busy || !isOnline} className="w-full min-h-[56px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold disabled:opacity-50 inline-flex items-center justify-center gap-2" data-testid="sync-now">{busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <CloudUpload className="w-5 h-5" aria-hidden />}{busy ? 'Sending…' : 'Send now'}</button>
        {!isOnline && <p className="text-sm text-amber-950">You are offline, so sending waits until you are back online.</p>}
        {(msg || sync.lastRunMessage) && !busy && <p role="status" className="text-sm font-semibold text-[#183B2B]">{msg ?? sync.lastRunMessage}</p>}
      </section>

      <GuidanceBanner />
      <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="what-h" data-testid="what-works">
        <h2 id="what-h" className="text-lg font-extrabold text-[#183B2B]">What is real in this demonstration</h2>
        <ul className="space-y-2 text-base text-[#183B2B]">
          <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /> Saving and sending your harvest listings, questions and checks, with or without internet.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /> Live weather forecast from Open-Meteo when you are online (the last copy is kept, and labelled old, when you are offline).</li>
          <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="simulated" /> County weather samples, expert replies, buyers and crop-check results.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="draft" /> Planting and storage guidance: not reviewed by an agronomist.</li>
          <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="future" /> SMS and a real USSD service, payments, official data.</li>
        </ul>
      </section>
    </div>
  );
};
