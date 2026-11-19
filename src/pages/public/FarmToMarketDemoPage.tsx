import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import type {StatusKind} from '../../lib/statusLabels';

interface Step {n: number; text: string; to: string; kinds: StatusKind[]; note: string}
/** Presenter's script for the farmer-to-market demonstration. Each step says honestly what is real and what is simulated. */
export const FARM_TO_MARKET_STEPS: Step[] = [
  {n: 1, text: 'Open the app and choose "Check my crop"', to: '/check-my-crop', kinds: ['simulated', 'draft'], note: 'A simple rule on the farmer\'s answers. Not a diagnosis; no photo is analysed.'},
  {n: 2, text: 'Cassava, young leaves patchy or twisted; answer the questions', to: '/check-my-crop', kinds: ['simulated'], note: 'Tick "add my result to the anonymous county counts" to feed the Ministry view.'},
  {n: 3, text: 'Read the colour and the advice card (ADV-2026-001)', to: '/advice-cards/ADV-2026-001', kinds: ['draft'], note: 'Demonstration advice, labelled NOT reviewed by a qualified agronomist.'},
  {n: 4, text: 'Go offline (airplane mode) and open the saved check and the advice card', to: '/check-my-crop', kinds: ['working'], note: 'Both open from the phone; the card says "Saved copy on this phone".'},
  {n: 5, text: 'Still offline: "Sell my harvest" with cassava, 500 kg, a price, county and harvest date', to: '/harvest/sell', kinds: ['working'], note: 'Saved on the phone as "Pending Sync". The reference says the server will issue it.'},
  {n: 6, text: 'Reconnect: the listing is sent by itself and receives its SELL reference', to: '/harvest/sell', kinds: ['working'], note: 'A retry or a lost answer never creates a second listing (same Idempotency-Key).'},
  {n: 7, text: 'Switch role: as a buyer open "Find harvest" and filter by crop and county', to: '/harvest', kinds: ['simulated'], note: 'Listings from invented sellers if the synthetic data is loaded. No payments.'},
  {n: 8, text: 'Offline as a buyer: the saved list opens, labelled with when it was saved', to: '/harvest', kinds: ['working'], note: 'The banner says it may be out of date.'},
  {n: 9, text: 'Back online: ask the seller a question', to: '/harvest', kinds: ['working'], note: 'The seller\'s phone number is shown only if the seller agreed; the buyer\'s only if the buyer agreed.'},
  {n: 10, text: 'As the farmer: read the question and reply', to: '/harvest/sell', kinds: ['working'], note: 'Only the listing\'s owner device (or account) can read and answer it.'},
  {n: 11, text: 'As the buyer: see the reply under "My questions"', to: '/harvest', kinds: ['working'], note: 'Only the buyer\'s own device can read it.'},
  {n: 12, text: 'Open the Ministry & Extension view: harvest and crop-check counts', to: '/ministry-analytics#sec-live', kinds: ['simulated'], note: 'Counts only. Groups under 3 are combined. Labelled as not an official Ministry system.'},
];

export const FarmToMarketDemoPage: React.FC = () => {
  const {user} = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const isAdmin = Boolean(user?.roles?.includes('admin'));
  const load = async () => {
    try { const r = await apiFetch<{listings: number; checks: number}>('/admin/demo/market-data', {method: 'POST', body: JSON.stringify({})}); setMsg(`Loaded ${r.listings} synthetic listings and ${r.checks} synthetic crop checks.`); }
    catch (e) { setMsg(`Could not load: ${(e as Error).message}`); }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="farm-to-market-demo">
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2"><StatusLabel kind="simulated" text="Demonstration" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Farmer-to-market demonstration</h1>
        <p className="text-base text-[#183B2B]/85">Twelve steps from a sick-looking crop to a buyer's question and the aggregated Ministry view. Everything uses synthetic data; there are no payments, no real SMS or USSD and no AI.</p>
      </header>
      <section className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2" aria-labelledby="prep-h">
        <h2 id="prep-h" className="text-xl font-extrabold text-[#183B2B]">Before you start</h2>
        <ul className="list-disc pl-6 space-y-1 text-base text-[#183B2B]">
          <li>Use the demonstration site with synthetic accounts and numbers only (+23177000xxxx). Please do not enter real personal information.</li>
          <li>For a fuller Ministry view the operator loads the synthetic background data (start the server with <code>ENABLE_DEMO_MARKET_DATA=1</code>, or sign in as an administrator and press the button below).</li>
          <li>Use two browsers or two profiles to play the farmer and the buyer: each keeps its own private device key.</li>
        </ul>
        {isAdmin && <div className="space-y-2"><button type="button" onClick={() => void load()} className="min-h-[48px] rounded-xl bg-[#183B2B] text-white font-bold px-4" data-testid="load-demo-data">Load synthetic market data</button>{msg && <p role="status" className="text-base font-bold text-[#0F5C2A]">{msg}</p>}</div>}
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
