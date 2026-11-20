import React, {lazy, Suspense} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {UssdPhone} from '../../components/ussd/UssdPhone';
import {StatusLabel} from '../../components/StatusLabel';
import {DEFAULT_TIMEOUT_S, DEMO_LABEL, MAIN_ITEMS} from '../../lib/ussd/engine';
import {USSD_NOTICE} from '../../lib/ministryAnalytics';
const DemoQr = lazy(() => import('../../components/ussd/DemoQr').then((m) => ({default: m.DemoQr})));

/** Public browser simulator. Telecom is simulated; explicitly confirmed marketplace actions use the existing app. */
export const UssdDemoPage: React.FC = () => {
  const [params] = useSearchParams();
  const t = Number(params.get('timeout')); const timeout = Number.isInteger(t) && t >= 5 && t <= 300 ? t : DEFAULT_TIMEOUT_S;
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 py-3 sm:py-6 space-y-4" data-testid="ussd-demo-page">
      <header className="space-y-2 px-1">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B]">Basic phone demonstration</h1>
        <p role="note" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base font-bold text-amber-950" data-testid="ussd-demo-label">{DEMO_LABEL}</p>
        <p className="text-base">Press <strong>Call / Send</strong>, choose a number, then Send. Menu <strong>3</strong> opens Buy &amp; Sell Produce.</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <UssdPhone timeoutSeconds={timeout} />
        <div className="space-y-4 px-1">
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="menu-h" data-testid="ussd-menu-tree">
            <h2 id="menu-h" className="text-xl font-extrabold">The main menu</h2>
            <ol className="list-decimal pl-6 text-base space-y-1">{MAIN_ITEMS.map((m) => <li key={m}>{m}</li>)}</ol>
            <p className="text-base">On every screen: <strong>0</strong> = Back, <strong>00</strong> = Home. End or Cancel closes the session. After {timeout} seconds with no key it ends; press Send to restart.</p>
            <p className="text-sm">8 Sell & market keeps both original Phase 2B options together: the read-only public harvest list and no-submit selling practice. The Help shortcuts remain available too.</p>
          </section>
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-3" aria-labelledby="real-h" data-testid="ussd-status">
            <h2 id="real-h" className="text-xl font-extrabold">What happens when you confirm</h2>
            <p className="text-base">The phone and telecom session are simulated. When enabled on a protected demonstration server, the marketplace saves actual synthetic records through the same browser APIs as Sell my harvest and Find harvest.</p>
            <ul className="space-y-3 text-base">
              <li><StatusLabel kind="working" /> Bundled agricultural guidance works offline after the app is cached.</li>
              <li><StatusLabel kind="simulated" /> Produce, names and town choices are labelled synthetic. No phone numbers are collected here.</li>
              <li><StatusLabel kind="working" /> A final numbered confirmation authorizes a listing to enter the existing offline queue. Pending is not synced; the server issues the SELL reference.</li>
              <li><StatusLabel kind="working" /> Inquiries need internet and your existing browser key/account. They are never queued offline. A question is not a purchase, order or payment.</li>
              <li><StatusLabel kind="draft" /> Advice awaits qualified agricultural review.</li>
              <li><StatusLabel kind="future" /> Real USSD/SMS, other languages and payments are not implemented. English menus only.</li>
            </ul>
            <p className="text-sm font-semibold">End, Home and Cancel do not undo an action you already confirmed. My Listings uses demo drafts saved on this browser; reply to buyer questions in the existing harvest workspace.</p>
            <p className="text-sm" data-testid="ussd-notice">{USSD_NOTICE}</p>
          </section>
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="kb-h" data-testid="ussd-keyboard">
            <h2 id="kb-h" className="text-xl font-extrabold">Keyboard</h2>
            <p className="text-base">Digits enter a choice, Enter sends, Backspace deletes and Escape cancels. A focused button keeps its normal Enter/Space action. Tab reaches every key.</p>
          </section>
          <Suspense fallback={<p role="status">Opening the presentation QR section…</p>}><DemoQr /></Suspense>
          <nav className="flex flex-wrap gap-3" aria-label="Related pages"><Link to="/today" className="agri-button-secondary">My farm today</Link><Link to="/guidance" className="agri-button-secondary">Planting and storage guidance</Link><Link to="/demo/farm-to-market" className="agri-button-secondary">Presenter walkthrough</Link></nav>
        </div>
      </div>
    </div>
  );
};
