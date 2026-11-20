import React from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {UssdPhone} from '../../components/ussd/UssdPhone';
import {StatusLabel} from '../../components/StatusLabel';
import {DEFAULT_TIMEOUT_S, DEMO_LABEL, MAIN_ITEMS} from '../../lib/ussd/engine';
import {USSD_NOTICE} from '../../lib/ministryAnalytics';

/** Public page: a basic-phone (USSD-style) SIMULATOR. No network, no dial code, no SMS, nothing is submitted. */
export const UssdDemoPage: React.FC = () => {
  const [params] = useSearchParams();
  const t = Number(params.get('timeout')); const timeout = Number.isInteger(t) && t >= 5 && t <= 300 ? t : DEFAULT_TIMEOUT_S;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="ussd-demo-page">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Basic phone demonstration</h1>
        <p className="text-base text-[#183B2B]/85">How a farmer with a basic phone could get advice by choosing numbers from a menu. Try it: press <strong>Send</strong> to start, then type a number and press Send.</p>
        <p role="note" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-base font-extrabold text-amber-950" data-testid="ussd-demo-label">{DEMO_LABEL}</p>
        <p className="text-sm text-[#183B2B]/80" data-testid="ussd-notice">{USSD_NOTICE}</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <UssdPhone timeoutSeconds={timeout} />
        <div className="space-y-4">
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="menu-h" data-testid="ussd-menu-tree">
            <h2 id="menu-h" className="text-xl font-extrabold text-[#183B2B]">The main menu</h2>
            <ol className="list-decimal pl-6 text-base text-[#183B2B] space-y-0.5">{MAIN_ITEMS.map((m) => <li key={m}>{m}</li>)}</ol>
            <p className="text-sm text-[#183B2B]/80">On every screen: <strong>0</strong> = Back, <strong>00</strong> = Home. The Back, Home and Cancel keys do the same. After {timeout} seconds with no key the session ends; press Send to start again.</p>
          </section>
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="real-h" data-testid="ussd-status">
            <h2 id="real-h" className="text-xl font-extrabold text-[#183B2B]">What is real here</h2>
            <ul className="space-y-2 text-base text-[#183B2B]">
              <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /> The menus and the advice, built into the app. They work without internet.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="simulated" /> The phone itself. There is no mobile network, no USSD code and no SMS.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="draft" /> The advice is demonstration content, not reviewed by an agronomist or the Ministry.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="simulated" text="Needs internet" /> "Harvest for sale" shows the live list online and the saved copy offline.</li>
              <li className="flex flex-wrap items-center gap-2"><StatusLabel kind="future" /> Sending a real question or a listing from a basic phone, other languages, a telecom partner.</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-2" aria-labelledby="kb-h" data-testid="ussd-keyboard">
            <h2 id="kb-h" className="text-xl font-extrabold text-[#183B2B]">Keyboard</h2>
            <p className="text-base text-[#183B2B]">Type digits to enter a choice, <kbd className="rounded border px-1">Enter</kbd> to Send, <kbd className="rounded border px-1">Backspace</kbd> to delete a digit, <kbd className="rounded border px-1">Esc</kbd> to Cancel. The keys can also be tapped.</p>
          </section>
          <nav className="flex flex-wrap gap-3" aria-label="Related pages">
            <Link to="/today" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">My farm today</Link>
            <Link to="/guidance" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">Planting and storage guidance</Link>
            <Link to="/demo/farm-to-market" className="inline-flex items-center min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 px-4 font-bold text-[#183B2B]">Presenter walkthrough</Link>
          </nav>
        </div>
      </div>
    </div>
  );
};
