import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Save, Trash2, WifiOff, Wifi} from 'lucide-react';
import {
  EXPENSE_FIELDS, EXPENSE_LABELS, calculate, deleteCalc, emptyInput, formatMoney, listSavedCalcs, saveCalc,
  type CalcInput, type Currency, type CurrencyResult, type SavedCalc,
} from '../../lib/farmCalculator';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';

const UNITS = ['bags', 'kg', 'bunches', 'baskets', 'pieces'];

const Result: React.FC<{r: CurrencyResult}> = ({r}) => {
  const tone = r.outcome === 'profit' ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : r.outcome === 'loss' ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-300 bg-slate-50 text-slate-800';
  const word = r.outcome === 'profit' ? 'Estimated profit' : r.outcome === 'loss' ? 'Estimated loss' : 'Break-even (no profit, no loss)';
  return (
    <div className={`rounded-2xl border-2 p-4 space-y-1 ${tone}`} data-testid={`result-${r.currency}`} role="status">
      <p className="text-sm font-bold">{r.currency === 'LRD' ? 'Liberian dollars (LRD)' : 'US dollars (USD), counted separately'}</p>
      <p className="text-sm">Total expenses: <strong data-testid={`exp-${r.currency}`}>{formatMoney(r.expenseCents, r.currency)}</strong></p>
      <p className="text-sm">Estimated revenue: <strong data-testid={`rev-${r.currency}`}>{formatMoney(r.revenueCents, r.currency)}</strong></p>
      <p className="text-lg font-extrabold">{word}: <span data-testid={`profit-${r.currency}`}>{formatMoney(r.profitCents < 0n ? -r.profitCents : r.profitCents, r.currency)}</span></p>
    </div>
  );
};

/** H1: simple, offline cost / revenue / profit calculator. LRD is primary; USD is optional and never converted or added to LRD. */
export const FarmCalculatorPage: React.FC = () => {
  const {isOnline} = useApp();
  const [input, setInput] = useState<CalcInput>(emptyInput());
  const [showUsd, setShowUsd] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<SavedCalc[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const out = useMemo(() => calculate(input), [input]);
  const refresh = useCallback(async () => { try { setSaved(await listSavedCalcs()); } catch { setSaved([]); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const setExp = (c: Currency, f: (typeof EXPENSE_FIELDS)[number], v: string) => setInput((p) => ({...p, expenses: {...p.expenses, [c]: {...p.expenses[c], [f]: v}}}));
  const setPrice = (c: Currency, v: string) => setInput((p) => ({...p, price: {...p.price, [c]: v}}));

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, err?: string, prefix?: string) => (
    <div key={id}>
      <label htmlFor={id} className="block text-sm font-bold text-[#183B2B]">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        {prefix && <span className="text-base font-bold text-[#183B2B]/70 w-10">{prefix}</span>}
        <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" aria-invalid={Boolean(err)} aria-describedby={err ? `${id}-err` : undefined}
          className={`w-full min-h-[52px] rounded-xl border px-3 text-lg ${err ? 'border-red-500' : 'border-[#183B2B]/30'} bg-white`} />
      </div>
      {err && <p id={`${id}-err`} className="text-sm text-red-700 mt-1">{err}</p>}
    </div>
  );

  const hasResult = out.lrd.entered || out.usd.entered;
  const doSave = async () => {
    if (!hasResult || !out.ok) { setNote('Fix the numbers above before saving.'); return; }
    try { setSaved(await saveCalc(name, input)); setNote('Saved on this device. It works without internet.'); }
    catch { setNote('This device could not save it (storage full or blocked).'); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="calculator-page">
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2"><StatusLabel kind="working" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Farm cost and profit calculator</h1>
        <p className="text-base text-[#183B2B]/80">Add what you spent and what you sell. It shows if you may make a profit or a loss. This is a simple learning tool, not an accounting system.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`}>
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}{isOnline ? 'Online' : 'Offline: the calculator still works'}
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="exp-h">
        <h2 id="exp-h" className="text-xl font-extrabold text-[#183B2B]">1. What did you spend? (L$)</h2>
        {EXPENSE_FIELDS.map((f) => field(`lrd-${f}`, EXPENSE_LABELS[f], input.expenses.LRD[f], (v) => setExp('LRD', f, v), out.errors[`LRD.${f}`], 'L$'))}
      </section>

      <section className="space-y-3" aria-labelledby="rev-h">
        <h2 id="rev-h" className="text-xl font-extrabold text-[#183B2B]">2. What will you sell?</h2>
        <div className="grid grid-cols-2 gap-3">
          {field('qty', 'How much harvest?', input.quantity, (v) => setInput((p) => ({...p, quantity: v})), out.errors.quantity)}
          <div><label htmlFor="unit" className="block text-sm font-bold text-[#183B2B]">Unit</label>
            <select id="unit" value={input.unit} onChange={(e) => setInput((p) => ({...p, unit: e.target.value}))} className="mt-1 w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 bg-white px-3 text-lg">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        {field('price-lrd', `Selling price for one ${input.unit.replace(/s$/, '')} (L$)`, input.price.LRD, (v) => setPrice('LRD', v), out.errors['LRD.price'], 'L$')}
      </section>

      <section className="space-y-3 rounded-2xl border border-[#183B2B]/15 bg-white p-4">
        <label className="flex items-center gap-3 min-h-[48px] cursor-pointer">
          <input type="checkbox" checked={showUsd} onChange={(e) => setShowUsd(e.target.checked)} className="w-6 h-6 accent-[#16803C]" data-testid="usd-toggle" />
          <span className="text-base font-bold text-[#183B2B]">I also have costs or prices in US dollars (optional)</span>
        </label>
        {showUsd && (
          <div className="space-y-3">
            <p className="text-sm text-[#183B2B]/75">US dollars are counted on their own. We never change dollars into L$ and never add the two together.</p>
            {EXPENSE_FIELDS.map((f) => field(`usd-${f}`, `${EXPENSE_LABELS[f]} (US$)`, input.expenses.USD[f], (v) => setExp('USD', f, v), out.errors[`USD.${f}`], 'US$'))}
            {field('price-usd', `Selling price for one ${input.unit.replace(/s$/, '')} (US$)`, input.price.USD, (v) => setPrice('USD', v), out.errors['USD.price'], 'US$')}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="res-h" aria-live="polite">
        <h2 id="res-h" className="text-xl font-extrabold text-[#183B2B]">3. Your estimate</h2>
        {out.errors.form && !hasResult && <p className="text-sm text-[#183B2B]/70">{out.errors.form}</p>}
        {out.lrd.entered && <Result r={out.lrd} />}
        {showUsd && out.usd.entered && <Result r={out.usd} />}
        <p className="text-xs text-[#183B2B]/65">Estimate only. Real prices and costs change. Your numbers stay on this phone.</p>
      </section>

      <section className="space-y-3 border-t border-[#183B2B]/15 pt-5" aria-labelledby="save-h">
        <h2 id="save-h" className="text-xl font-extrabold text-[#183B2B]">Save on this device</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, for example: Cassava 2026" aria-label="Name for this calculation" className="w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 bg-white px-3 text-base" />
        <button type="button" onClick={() => void doSave()} data-testid="save-calc" className="w-full min-h-[52px] rounded-2xl bg-[#16803C] text-white text-base font-extrabold flex items-center justify-center gap-2"><Save className="w-5 h-5" aria-hidden /> Save</button>
        {note && <p role="status" data-testid="calc-note" className="text-sm font-semibold text-[#0F5C2A]">{note}</p>}
        {saved.length > 0 && (
          <ul className="space-y-2" data-testid="calc-saved-list">
            {saved.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-3 flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setInput(s.input); setShowUsd(Object.values(s.input.expenses.USD).some(Boolean) || Boolean(s.input.price.USD)); setName(s.name); }} className="text-left flex-1 min-h-[48px]" data-testid="load-calc">
                  <span className="block text-sm font-bold text-[#183B2B]">{s.name}</span><span className="block text-xs text-[#183B2B]/65">{new Date(s.savedAt).toLocaleString()}</span>
                </button>
                <button type="button" aria-label={`Delete ${s.name}`} onClick={async () => setSaved(await deleteCalc(s.id))} className="min-w-[48px] min-h-[48px] text-red-700 flex items-center justify-center"><Trash2 className="w-5 h-5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
