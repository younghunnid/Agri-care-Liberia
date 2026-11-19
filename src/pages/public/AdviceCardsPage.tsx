import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Search, Wifi, WifiOff} from 'lucide-react';
import {apiFetch, ApiRequestError} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import {VerificationBadge} from '../../components/advice/AdviceCardView';
import {ADVICE_CARD_SEED} from '../../data/adviceCardsSeed';
import {adviceClient} from '../../lib/triageApp';
import {SOURCE_LABELS, bundledSummary, type CardLevelView, type CardSource, type CardSummaryView} from '../../lib/adviceCardsClient';
import {CROP_LABELS, type TriageCrop} from '../../data/triageCases';

type Check = {kind: 'server'; code: string; title: string; version: number; verification: CardLevelView} | {kind: 'local'; code: string; title: string; version: number; verification: CardLevelView} | {kind: 'none'};

/** Advice cards: the list, and a "Check this code" box. Works offline from the saved or bundled copies. */
export const AdviceCardsPage: React.FC = () => {
  const {isOnline} = useApp();
  const [cards, setCards] = useState<CardSummaryView[]>(ADVICE_CARD_SEED.map(bundledSummary));
  const [source, setSource] = useState<CardSource>('bundled');
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void adviceClient.listCards().then((r) => {
      if (!live) return;
      setCards(r.data); setSource(r.source);
      if (r.source === 'server') void adviceClient.prefetchAll(r.data); // keep full copies for offline reading
    });
    return () => { live = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setCheck(null);
    try {
      const r = await apiFetch<{found: boolean; code: string; title: string; version: number; verification: CardLevelView}>(`/advice/verify/${encodeURIComponent(c)}`);
      setCheck({kind: 'server', code: r.code, title: r.title, version: r.version, verification: r.verification});
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) setCheck({kind: 'none'});
      else {
        // Offline (or the server is not reachable): look in the copies on this phone and say so.
        const local = cards.find((x) => x.code === c);
        setCheck(local ? {kind: 'local', code: local.code, title: local.title, version: local.version, verification: local.verification} : {kind: 'none'});
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="advice-cards-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="draft" /><StatusLabel kind="simulated" text="Demonstration content" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Advice cards</h1>
        <p className="text-base text-[#183B2B]/80">Short, numbered advice with a version and a reference code. Every card here is a demonstration written by the project team: <strong>none has been reviewed by a qualified agronomist or veterinary officer</strong>.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`}>
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}
          {isOnline ? 'Online' : 'Offline: saved copies open'}
        </p>
        <p className="text-sm text-[#183B2B]/75" data-testid="advice-list-source">{SOURCE_LABELS[source]}</p>
      </header>

      <section aria-labelledby="verify-h" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 space-y-3">
        <h2 id="verify-h" className="text-xl font-extrabold text-[#183B2B]">Check a code</h2>
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="advice-code-input" className="sr-only">Advice card reference code</label>
          <input id="advice-code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ADV-2026-001" autoCapitalize="characters" inputMode="text"
            className="flex-1 min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-[#16803C]" data-testid="advice-code-input" />
          <button type="submit" disabled={busy} className="min-h-[48px] rounded-xl bg-[#16803C] text-white font-bold px-5 inline-flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">
            <Search className="w-5 h-5" aria-hidden /> Check
          </button>
        </form>
        <div aria-live="polite" data-testid="advice-check-result">
          {check?.kind === 'none' && <p className="text-base font-bold text-[#183B2B]">No advice card has this code. Check the letters and numbers on the card.</p>}
          {check && check.kind !== 'none' && (
            <div className="space-y-2">
              <p className="text-base text-[#183B2B]"><strong className="font-mono">{check.code}</strong>, version {check.version}: {check.title}</p>
              <VerificationBadge v={check.verification} />
              <p className="text-sm text-[#183B2B]/75">{check.kind === 'server' ? 'Confirmed with the server.' : 'Checked on this phone only (you are offline). Connect to confirm with the server.'}</p>
            </div>
          )}
        </div>
      </section>

      {(['cassava', 'rice', 'poultry'] as TriageCrop[]).map((crop) => (
        <section key={crop} aria-labelledby={`crop-${crop}`} className="space-y-3">
          <h2 id={`crop-${crop}`} className="text-xl font-extrabold text-[#183B2B]">{CROP_LABELS[crop]}</h2>
          <ul className="space-y-3">
            {cards.filter((c) => c.crop === crop).map((c) => (
              <li key={c.code}>
                <Link to={`/advice-cards/${c.code}`} className="block rounded-2xl bg-white border border-[#183B2B]/10 p-4 min-h-[56px] focus:outline-none focus:ring-2 focus:ring-[#16803C]" data-testid="advice-list-item">
                  <span className="font-mono text-sm font-bold text-[#183B2B]/80">{c.code} · version {c.version}</span>
                  <span className="block text-lg font-extrabold text-[#183B2B] mt-0.5">{c.title}</span>
                  <span className="block mt-2"><VerificationBadge v={c.verification} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm"><Link to="/check-my-crop" className="font-bold text-[#0F5C2A] underline min-h-[44px] inline-flex items-center">Check my crop (simulated)</Link></p>
    </div>
  );
};
