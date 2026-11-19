import {idbKv, type KvStore} from './kvStore';

/**
 * Educational farm calculator. Money is handled in whole minor units (cents) with BigInt for the quantity × price step, so
 * results are exact. LRD and USD are two independent calculations: nothing is ever converted or added across currencies.
 */
export type Currency = 'LRD' | 'USD';
export const EXPENSE_FIELDS = ['seed', 'fertilizer', 'labour', 'transport', 'other'] as const;
export type ExpenseField = (typeof EXPENSE_FIELDS)[number];

export const EXPENSE_LABELS: Record<ExpenseField, string> = {
  seed: 'Seed / cuttings', fertilizer: 'Fertilizer / compost', labour: 'Labour', transport: 'Transport', other: 'Other costs',
};

export interface CalcInput {
  /** Raw text from the form, per currency. Empty string = not entered. */
  expenses: Record<Currency, Record<ExpenseField, string>>;
  quantity: string;
  unit: string;
  price: Record<Currency, string>;
}

export interface CurrencyResult {
  currency: Currency;
  entered: boolean;
  expenseCents: bigint;
  revenueCents: bigint;
  profitCents: bigint;
  outcome: 'profit' | 'loss' | 'break-even';
}

export interface CalcResult {
  ok: boolean;
  errors: Record<string, string>;
  lrd: CurrencyResult;
  usd: CurrencyResult;
}

export const MAX_MONEY = 1_000_000_000; // per field
export const MAX_QUANTITY = 1_000_000;

export function emptyInput(): CalcInput {
  const blank = () => Object.fromEntries(EXPENSE_FIELDS.map((f) => [f, ''])) as Record<ExpenseField, string>;
  return {expenses: {LRD: blank(), USD: blank()}, quantity: '', unit: 'bags', price: {LRD: '', USD: ''}};
}

/** Parses "5,000" / "5000.50". Returns null if empty, {error} if invalid, else the value in hundredths. */
export function parseHundredths(raw: string, max: number): bigint | null | {error: string} {
  const t = raw.trim().replace(/,/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return {error: 'Enter a number like 5000 or 5000.50 (no letters, no minus).'};
  const [whole, frac = ''] = t.split('.');
  if (whole.length > 12) return {error: 'That number is too large.'};
  const v = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
  if (v > BigInt(max) * 100n) return {error: `Please keep this under ${max.toLocaleString('en-US')}.`};
  return v;
}

function one(cur: Currency, input: CalcInput, qty: bigint | null, errors: Record<string, string>): CurrencyResult {
  let expense = 0n;
  let entered = false;
  for (const f of EXPENSE_FIELDS) {
    const p = parseHundredths(input.expenses[cur][f], MAX_MONEY);
    if (p === null) continue;
    if (typeof p === 'object') { errors[`${cur}.${f}`] = p.error; continue; }
    expense += p; entered = true;
  }
  let revenue = 0n;
  const pr = parseHundredths(input.price[cur], MAX_MONEY);
  if (pr !== null) {
    if (typeof pr === 'object') errors[`${cur}.price`] = pr.error;
    else {
      entered = true;
      if (qty === null) errors[`${cur}.price`] = 'Enter how much you harvested to work out revenue.';
      else revenue = (qty * pr + 50n) / 100n; // qty and price are both in hundredths: round to nearest cent
    }
  }
  const profit = revenue - expense;
  return {currency: cur, entered, expenseCents: expense, revenueCents: revenue, profitCents: profit, outcome: profit > 0n ? 'profit' : profit < 0n ? 'loss' : 'break-even'};
}

export function calculate(input: CalcInput): CalcResult {
  const errors: Record<string, string> = {};
  const q = parseHundredths(input.quantity, MAX_QUANTITY);
  let qty: bigint | null = null;
  if (q !== null) { if (typeof q === 'object') errors.quantity = q.error; else qty = q; }
  const lrd = one('LRD', input, qty, errors);
  const usd = one('USD', input, qty, errors);
  if (!lrd.entered && !usd.entered && Object.keys(errors).length === 0) errors.form = 'Enter at least one cost or a selling price.';
  return {ok: Object.keys(errors).length === 0, errors, lrd, usd};
}

/** "L$5,000" or "L$5,000.50"; negatives as "-L$3,000". Display only. */
export function formatMoney(cents: bigint, cur: Currency): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = abs % 100n;
  const body = frac === 0n ? whole : `${whole}.${frac.toString().padStart(2, '0')}`;
  return `${neg ? '-' : ''}${cur === 'LRD' ? 'L$' : 'US$'}${body}`;
}

// ------------------------------------------------------------------ local saving

export interface SavedCalc {
  id: string;
  name: string;
  savedAt: string;
  input: CalcInput;
}
export const CALC_KEY = 'h1.calculator.saved';
export const MAX_CALC_SAVED = 30;

/** Rebuilds an input from untrusted stored data: only strings survive, anything missing becomes empty. */
export function sanitizeInput(raw: unknown): CalcInput {
  const base = emptyInput();
  const r = (raw ?? {}) as Partial<CalcInput>;
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 20) : '');
  for (const c of ['LRD', 'USD'] as const) {
    for (const f of EXPENSE_FIELDS) base.expenses[c][f] = str(r.expenses?.[c]?.[f]);
    base.price[c] = str(r.price?.[c]);
  }
  base.quantity = str(r.quantity);
  base.unit = typeof r.unit === 'string' && r.unit.length <= 20 ? r.unit : 'bags';
  return base;
}

export async function listSavedCalcs(kv: KvStore = idbKv): Promise<SavedCalc[]> {
  const rows = await kv.get<SavedCalc[]>(CALC_KEY);
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r.id === 'string').map((r) => ({id: r.id, name: String(r.name ?? 'My farm calculation').slice(0, 60), savedAt: String(r.savedAt ?? ''), input: sanitizeInput(r.input)}));
}

export async function saveCalc(name: string, input: CalcInput, now: Date = new Date(), kv: KvStore = idbKv): Promise<SavedCalc[]> {
  const entry: SavedCalc = {id: `calc-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim().slice(0, 60) || 'My farm calculation', savedAt: now.toISOString(), input};
  const next = [entry, ...(await listSavedCalcs(kv))].slice(0, MAX_CALC_SAVED);
  await kv.set(CALC_KEY, next);
  return next;
}

export async function deleteCalc(id: string, kv: KvStore = idbKv): Promise<SavedCalc[]> {
  const next = (await listSavedCalcs(kv)).filter((r) => r.id !== id);
  await kv.set(CALC_KEY, next);
  return next;
}
