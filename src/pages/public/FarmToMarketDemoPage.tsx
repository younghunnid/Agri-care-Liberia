import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import type {StatusKind} from '../../lib/statusLabels';

interface Step {n: number; text: string; to: string; kinds: StatusKind[]; note: string}
/** Presenter's script for the farmer-to-market demonstration. Each step says honestly what is real and what is simulated. */
export const FARM_TO_MARKET_STEPS: Step[] = [
  {n: 1, text: 'Open "My farm today": choose a county and the crops you grow', to: '/today', kinds: ['working', 'simulated'], note: 'Your choices are saved on the phone only. The screen shows online/offline, what is waiting to send, and reminders built from SAMPLE weather (not live, not a forecast) and the Crops Library planting months.'},
  {n: 2, text: 'Open the planting months and the harvest and storage guidance for a crop (works offline)', to: '/guidance', kinds: ['draft'], note: 'Demonstration guidance, not reviewed by an agronomist or the Ministry. The regional-data limit is shown on the page.'},
  {n: 3, text: 'Open the app and choose "Check my crop"', to: '/check-my-crop', kinds: ['simulated', 'draft'], note: 'A simple rule on the farmer\'s answers. Not a diagnosis; no photo is analysed.'},
  {n: 4, text: 'Cassava, young leaves patchy or twisted; answer the questions', to: '/check-my-crop', kinds: ['simulated'], note: 'Tick "add my result to the anonymous county counts" to feed the Ministry view.'},
  {n: 5, text: 'Read the colour and the advice card (ADV-2026-001)', to: '/advice-cards/ADV-2026-001', kinds: ['draft'], note: 'Demonstration advice, labelled NOT reviewed by a qualified agronomist.'},
  {n: 6, text: 'Go offline (airplane mode) and open the saved check and the advice card', to: '/check-my-crop', kinds: ['working'], note: 'Both open from the phone; the card says "Saved copy on this phone".'},
  {n: 7, text: 'Still offline: "Sell my harvest" with cassava, 500 kg, a price, county and harvest date', to: '/harvest/sell', kinds: ['working'], note: 'Saved on the phone as "Pending Sync". The reference says the server will issue it.'},
  {n: 8, text: 'Reconnect: the listing is sent by itself and receives its SELL reference', to: '/harvest/sell', kinds: ['working'], note: 'A retry or a lost answer never creates a second listing (same Idempotency-Key).'},
  {n: 9, text: 'Switch role: as a buyer open "Find harvest" and filter by crop and county', to: '/harvest', kinds: ['simulated'], note: 'Listings from invented sellers if the synthetic data is loaded. No payments.'},
  {n: 10, text: 'Offline as a buyer: the saved list opens, labelled with when it was saved', to: '/harvest', kinds: ['working'], note: 'The banner says it may be out of date.'},
  {n: 11, text: 'Back online: ask the seller a question', to: '/harvest', kinds: ['working'], note: 'The seller\'s phone number is shown only if the seller agreed; the buyer\'s only if the buyer agreed.'},
  {n: 12, text: 'As the farmer: read the question and reply', to: '/harvest/sell', kinds: ['working'], note: 'Only the listing\'s owner device (or account) can read and answer it.'},
  {n: 13, text: 'As the buyer: see the reply under "My questions"', to: '/harvest', kinds: ['working'], note: 'Only the buyer\'s own device can read it.'},
  {n: 14, text: 'Open the Ministry & Extension view: harvest and crop-check counts', to: '/ministry-analytics#sec-live', kinds: ['simulated'], note: 'Two separate sets: entries made through the app (shown only once a group has 3 farmers or devices) and invented demonstration statistics. Groups under 3 are combined. Not an official Ministry system.'},
];

export const FarmToMarketDemoPage: React.FC = () => {
  const {user} = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const isAdmin = Boolean(user?.roles?.includes('admin'));
  const [confirmReset, setConfirmReset] = useState(false);
  const load = async (reset: boolean) => {
    setConfirmReset(false);
    try {
      const r = await apiFetch<{listings: number; checks: number; added: {listings: number; checks: number}}>('/admin/demo/market-data', {method: 'POST', body: JSON.stringify(reset ? {reset: true} : {})});
      setMsg(reset ? `Synthetic data reset: ${r.listings} listings and ${r.checks} crop checks are back to their starting state. Real entries were not touched.` : r.added.listings + r.added.checks === 0 ? `Nothing to add: all ${r.listings} synthetic listings and ${r.checks} synthetic crop checks are already there. Nothing was changed.` : `Added ${r.added.listings} missing synthetic listings and ${r.added.checks} crop checks. Nothing that already existed was changed.`);
    } catch (e) { setMsg(`Could not load: ${(e as Error).message}`); }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="farm-to-market-demo">
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2"><StatusLabel kind="simulated" text="Demonstration" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Farmer-to-market demonstration</h1>
        <p className="text-base text-[#183B2B]/85">Fourteen steps from the farmer's home screen and a sick-looking crop to a buyer's question and the aggregated Ministry view. Everything uses synthetic data; there are no payments, no real SMS or USSD and no AI.</p>
      </header>
      <section className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2" aria-labelledby="prep-h">
        <h2 id="prep-h" className="text-xl font-extrabold text-[#183B2B]">Before you start</h2>
        <ul className="list-disc pl-6 space-y-1 text-base text-[#183B2B]">
          <li>Use the demonstration site with synthetic accounts and numbers only (+23177000xxxx). Please do not enter real personal information.</li>
          <li>For a fuller Ministry view the operator loads the synthetic background data (start the server with <code>ENABLE_DEMO_MARKET_DATA=1</code>, or sign in as an administrator and press the button below). Restarting never erases the questions, replies or status changes made while presenting; only the separate, confirmed reset does.</li>
          <li>Use two browsers or two profiles to play the farmer and the buyer: each keeps its own private device key.</li>
        </ul>
        {isAdmin && <div className="space-y-2"><div className="flex flex-wrap gap-3"><button type="button" onClick={() => void load(false)} className="min-h-[48px] rounded-xl bg-[#183B2B] text-white font-bold px-4" data-testid="load-demo-data">Add missing synthetic data</button>{!confirmReset ? <button type="button" onClick={() => setConfirmReset(true)} className="min-h-[48px] rounded-xl border-2 border-[#183B2B]/40 text-[#183B2B] font-bold px-4" data-testid="reset-demo-data">Reset synthetic data...</button> : <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-2" data-testid="reset-confirm"><span className="text-sm font-bold text-amber-950">This deletes the synthetic listings, their questions and replies, and starts them again. Real entries stay.</span><button type="button" onClick={() => void load(true)} className="min-h-[44px] rounded-xl bg-amber-700 text-white font-bold px-4" data-testid="reset-demo-confirm">Yes, reset</button><button type="button" onClick={() => setConfirmReset(false)} className="min-h-[44px] rounded-xl border-2 border-[#183B2B]/30 px-4 font-bold">Cancel</button></span>}</div>{msg && <p role="status" className="text-base font-bold text-[#0F5C2A]">{msg}</p>}</div>}
      </section>
      <ol className="space-y-3">
        {FARM_TO_MARKET_STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2" data-testid="demo-step">
            <p className="text-lg font-extrabold text-[#183B2B]">{s.n}. {s.text}</p>
            <div className="flex flex-wrap gap-2">{s.kinds.map((k) => <StatusLabel key={k} kind={k} />)}</div>
            <p className="text-sm text-[#183B2B]/85">{s.note}</p>
            <Link to={s.to} className="inline-flex items-center min-h-[44px] font-bold text-[#0F5C2A] underline">Open this screen</Link>
          </li>))}
      </ol>
    </div>
  );
};
