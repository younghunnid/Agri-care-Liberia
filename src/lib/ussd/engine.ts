import {LIBERIA_COUNTIES} from '../../../server/constants';
import {cardSeedBySlug} from '../../data/adviceCardsSeed';
import {BAND_INFO, CROP_LABELS, TRIAGE_CASES, caseById, type TriageCrop} from '../../data/triageCases';
import {HARVEST_LIMITS} from '../../data/harvestCrops';
import {GUIDANCE_CROPS, MONTH_NAMES, periodText, plantingEntry, plantingSentence, plantingStatus, storageGuide, cropEntry, type GuidanceItem} from '../../data/farmGuidance';
import {LANGUAGE_OPTIONS} from '../i18n';
import {USSD_MAX_CHARS} from '../ministryAnalytics';
import {evaluateTriage} from '../triageRules';

/**
 * Basic-phone (USSD-style) SIMULATOR. Pure and deterministic: no network, no storage, no clock of its own (time is passed in). It is NOT connected to any mobile
 * network, uses no dial code or short code, sends no SMS and submits nothing. All advice is assembled from content that already exists in the app (Crops Library,
 * Phase 2A guidance, advice cards, crop-check rules) so that it cannot contradict it. Screens are limited to USSD_MAX_CHARS (182) characters.
 */
export const SCREEN_MAX = USSD_MAX_CHARS;
export const DEFAULT_TIMEOUT_S = 90;
/** The pretend caller shown on the phone. Synthetic (+23177000xxxx): never a real farmer's number. */
export const DEMO_CALLER = '+231770009001';
export const DEMO_LABEL = 'Demonstration only — no mobile network connection.';
export const MAIN_TITLE = 'FARM ADVICE (DEMO)';
export const MAIN_ITEMS = ['Crops & planting', 'Pests & disease', 'Harvest & storage', 'Sell & market', 'Expert help', 'Language', 'Help & exit'] as const;
const MAX_INPUT = 8;

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '*' | '#' | 'send' | 'back' | 'home' | 'cancel' | 'del';
export interface Frame {id: string; p: Record<string, string>; page: number}
export type EndReason = 'exit' | 'cancel' | 'timeout';
export interface Session {status: 'idle' | 'active' | 'ended'; endReason: EndReason | null; no: number; frames: Frame[]; input: string; notice: string | null; lastActivity: number}
export interface MarketListing {code: string | null; cropSlug: string; quantityKg: number | null; pricePerKgLrd: number; county: string; status: string}
export interface MarketEnv {source: 'server' | 'saved' | 'none'; asOf: string | null; listings: MarketListing[]}
export interface UssdEnv {online: boolean; market: MarketEnv; now: Date; timeoutSeconds?: number}
export interface Screen {
  text: string; kind: 'CON' | 'IDLE'; expects: 'option' | 'number' | 'none'; truncated: boolean; secondsLeft: number | null;
  appLink: {to: string; label: string} | null; internet: {needed: boolean; state: 'bundled' | 'live' | 'saved' | 'none'}; frameId: string | null;
}

export const newSession = (): Session => ({status: 'idle', endReason: null, no: 0, frames: [], input: '', notice: null, lastActivity: 0});
const MAIN: Frame = {id: 'main', p: {}, page: 0};

// ------------------------------------------------------------------------------------------------------------------------------------ text fitting
const NAV = '0 Back  00 Home';
interface Built {
  head: string | null; lines: string[]; foot: string[]; kind: 'CON'; expects: 'option' | 'number' | 'none'; maxInput: number;
  link?: {to: string; label: string}; internet?: 'market'; handle: (input: string) => Tr;
}
type Tr = {push: Frame} | {error: string} | {end: EndReason};
const err = (m = 'Invalid choice. Try again.'): Tr => ({error: m});
const shortDate = (iso: string | null): string => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}` : 'earlier'; };

/** Splits `sentences` into pages of at most `budget` characters. Whole sentences are kept together where they fit; a longer sentence is cut at word boundaries. Nothing is added or dropped. */
export function paginate(sentences: string[], budget: number): string[] {
  const pages: string[] = []; let cur = '';
  const push = () => { if (cur) pages.push(cur); cur = ''; };
  for (const s of sentences) {
    const words = s.split(' '); let chunk = '';
    const flushChunk = () => { if (!chunk) return; if (cur && cur.length + 1 + chunk.length <= budget) cur += `\n${chunk}`; else { push(); cur = chunk; } chunk = ''; };
    if (s.length <= budget) { chunk = s; flushChunk(); continue; }
    push();
    for (const w of words) { if (chunk && chunk.length + 1 + w.length > budget) { flushChunk(); push(); } chunk = chunk ? `${chunk} ${w}` : w; }
    flushChunk();
  }
  push(); return pages.length ? pages : [''];
}
/** How many menu items fit on one page of a list (numbered 1..n on each page). */
function packCounts(labels: string[], budget: number): number[] {
  const out: number[] = []; let n = 0; let used = 0;
  for (const l of labels) { const w = l.length + 3; if (n > 0 && (used + w > budget || n >= 9)) { out.push(n); n = 0; used = 0; } n++; used += w; }
  if (n) out.push(n); return out;
}

function textBuilt(frame: Frame, title: string, sentences: string[], opts: {link?: Built['link']; extraFoot?: string} = {}): Built {
  // leave room for the longest notice ("Invalid choice. Try again.", 26 + 1 characters) even when the headline is dropped to make space for it
  const budget = Math.min(SCREEN_MAX - (title.length + 5) - 1 - 22 - 1, SCREEN_MAX - 27 - 22 - 2);
  const pages = paginate(sentences, budget); const total = pages.length; const page = Math.min(frame.page, total - 1); const more = page < total - 1;
  return {
    head: `${title}${total > 1 ? ` ${page + 1}/${total}` : ''}`, lines: [pages[page]], foot: [...(more ? ['1 Next'] : []), NAV], kind: 'CON', expects: 'option', maxInput: 2, link: opts.link,
    handle: (i) => (i === '1' && more ? {push: {...frame, page: page + 1}} : err()),
  };
}

function menuBuilt(frame: Frame, head: string, items: {label: string; to: Frame}[], opts: {nav?: boolean; link?: Built['link']} = {}): Built {
  const nav = opts.nav !== false; const foot0 = nav ? [NAV] : [];
  const budget = SCREEN_MAX - head.length - 1 - (nav ? NAV.length + 1 : 0) - 9 - 1;
  const counts = packCounts(items.map((i) => i.label), budget); const starts = counts.reduce<number[]>((a, c) => [...a, (a[a.length - 1] ?? 0) + c], [0]);
  const page = Math.min(frame.page, counts.length - 1); const slice = items.slice(starts[page], starts[page] + counts[page]); const more = page < counts.length - 1;
  return {
    head, lines: slice.map((it, k) => `${k + 1} ${it.label}`), foot: [...(more ? ['99 More'] : []), ...foot0], kind: 'CON', expects: 'option', maxInput: 2, link: opts.link,
    handle: (i) => { if (i === '99' && more) return {push: {...frame, page: page + 1}}; const k = /^[1-9]$/.test(i) ? Number(i) - 1 : -1; return k >= 0 && k < slice.length ? {push: slice[k].to} : err(); },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ content (all from existing data)
const cName = (slug: string): string => GUIDANCE_CROPS.find((c) => c.slug === slug)?.name ?? slug;
const F = (id: string, p: Record<string, string> = {}): Frame => ({id, p, page: 0});
const src = (xs: GuidanceItem[]): string[] => xs.map((x) => x.text);
const guideLink = (slug: string, tab: 'planting' | 'storage') => ({to: `/guidance?crop=${slug}&tab=${tab}`, label: tab === 'planting' ? 'Planting guidance in the app' : 'Storage guidance in the app'});

function monthsSentences(slug: string, now: Date): string[] {
  const e = plantingEntry(slug)!; const st = plantingStatus(slug, now.getMonth() + 1)!;
  return ['Usual months (Crops Library):', ...e.periods.map((p) => `${p.label}: ${periodText(p)}.`), ...(e.unspecified ? [e.unspecified] : []), `${MONTH_NAMES[now.getMonth()]}: ${plantingSentence(st)}`, 'Calendar guide only. Not reviewed by an agronomist. Ask an extension officer.'];
}
function triageSentences(caseId: string, answerIds: string[]): string[] | null {
  const c = caseById(caseId); if (!c) return null;
  const map: Record<string, string> = {}; c.questions.forEach((q, i) => { map[q.id] = answerIds[i]; });
  const r = evaluateTriage(c.id, map); if (!r.ok) return null;
  const card = cardSeedBySlug(r.cardSlug);
  return [BAND_INFO[r.band].label, r.headline, ...r.actions, ...(card ? [`Advice card ${card.code}: ${card.title}.`, ...card.steps, card.askWhen] : []), 'Simulated check: not a diagnosis. Stays on this demo phone; nothing was sent. Demo advice, not reviewed by an agronomist.'];
}
const kgOk = (s: string): number | null => { const n = /^\d{1,8}$/.test(s) ? Number(s) : NaN; return Number.isInteger(n) && n >= HARVEST_LIMITS.minKg && n <= HARVEST_LIMITS.maxKg ? n : null; };
const priceOk = (s: string): number | null => { const n = /^\d{1,8}$/.test(s) ? Number(s) : NaN; return Number.isInteger(n) && n >= 1 && n <= 50_000_000 ? n : null; };
const cropMenu = (frame: Frame, head: string, to: (slug: string) => Frame): Built => menuBuilt(frame, head, GUIDANCE_CROPS.map((c) => ({label: c.name, to: to(c.slug)})));

function build(frame: Frame, env: UssdEnv): Built {
  const p = frame.p; const slug = p.slug ?? ''; const name = cName(slug); const crop = cropEntry(slug);
  switch (frame.id) {
    case 'main': return menuBuilt(frame, MAIN_TITLE, [F('plant.crop'), F('pest.menu'), F('store.crop'), F('market.menu'), F('expert.menu'), F('lang.menu'), F('help.menu')].map((to, i) => ({label: MAIN_ITEMS[i], to})), {nav: false});
    // ---- crops and planting
    case 'plant.crop': return cropMenu(frame, 'Crops & planting: crop?', (s) => F('plant.menu', {slug: s}));
    case 'plant.menu': return menuBuilt(frame, `[DEMO] ${name} planting`, [['Planting months', 'plant.months'], ['How to plant', 'plant.how'], ['Soil & water', 'plant.soil'], ['Care of the crop', 'plant.care']].map(([label, id]) => ({label, to: F(id, {slug})})));
    case 'plant.months': return textBuilt(frame, `[DEMO] ${name} months`, monthsSentences(slug, env.now), {link: guideLink(slug, 'planting')});
    case 'plant.how': return textBuilt(frame, `[DEMO] ${name}: how to plant`, crop!.plantingInfo, {link: guideLink(slug, 'planting')});
    case 'plant.soil': return textBuilt(frame, `[DEMO] ${name}: soil, water`, [...crop!.soilRequirements, ...crop!.waterManagement], {link: guideLink(slug, 'planting')});
    case 'plant.care': return textBuilt(frame, `[DEMO] ${name}: care`, crop!.cropMaintenance, {link: guideLink(slug, 'planting')});
    // ---- pests and disease
    case 'pest.menu': return menuBuilt(frame, 'Pests & disease', [{label: 'Common problems by crop', to: F('pest.crop')}, {label: 'Symptom check (simulated)', to: F('tri.crop')}]);
    case 'pest.crop': return cropMenu(frame, 'Pests: which crop?', (s) => F('pest.text', {slug: s}));
    case 'pest.text': return textBuilt(frame, `[DEMO] ${name}: pests`, [...crop!.commonPestsDiseases, 'Not a diagnosis. If you cannot explain a problem, use 5 Expert help from the main menu.'], {link: {to: `/crops/${slug}`, label: 'Full crop guide in the app'}});
    case 'tri.crop': return menuBuilt(frame, 'Symptom check: which?', (Object.keys(CROP_LABELS) as TriageCrop[]).map((c) => ({label: CROP_LABELS[c], to: F('tri.case', {crop: c})})), {link: {to: '/check-my-crop', label: 'Check my crop in the app'}});
    case 'tri.case': return menuBuilt(frame, 'What do you see?', TRIAGE_CASES.filter((c) => c.crop === p.crop).map((c) => ({label: c.title, to: F('tri.q', {case: c.id, a: ''})})), {link: {to: '/check-my-crop', label: 'Check my crop in the app'}});
    case 'tri.q': {
      const c = caseById(p.case)!; const answers = p.a ? p.a.split(',') : []; const q = c.questions[answers.length];
      const lines = [q.text, ...(q.hint ? [q.hint] : []), ...q.options.map((o, i) => `${i + 1} ${o.label}`)];
      return {head: `Q${answers.length + 1}/${c.questions.length}`, lines, foot: [NAV], kind: 'CON', expects: 'option', maxInput: 2, link: {to: '/check-my-crop', label: 'Check my crop in the app'},
        handle: (i) => { const k = /^[1-9]$/.test(i) ? Number(i) - 1 : -1; if (k < 0 || k >= q.options.length) return err(); const a = [...answers, q.options[k].id]; return {push: a.length === c.questions.length ? F('tri.res', {case: c.id, a: a.join(',')}) : {...F('tri.q', {case: c.id, a: a.join(',')})}}; }};
    }
    case 'tri.res': return textBuilt(frame, 'Check result', triageSentences(p.case, p.a.split(','))!, {link: {to: '/check-my-crop', label: 'Check my crop in the app'}});
    // ---- harvest and storage
    case 'store.crop': return cropMenu(frame, 'Harvest & storage: crop?', (s) => F('store.menu', {slug: s}));
    case 'store.menu': return menuBuilt(frame, `[DEMO] ${name} harvest`, [['At harvest', 'store.harvest'], ['Handling', 'store.handling'], ['Storing it', 'store.storing'], ['Watch for', 'store.watch'], ['Before you sell', 'store.sell']].map(([label, id]) => ({label, to: F(id, {slug})})));
    case 'store.harvest': return textBuilt(frame, `${name}: at harvest [Library]`, src(storageGuide(slug)!.atHarvest), {link: guideLink(slug, 'storage')});
    case 'store.handling': return textBuilt(frame, `${name}: handling [General]`, src(storageGuide(slug)!.handling), {link: guideLink(slug, 'storage')});
    case 'store.storing': return textBuilt(frame, `${name}: storing [Library]`, src(storageGuide(slug)!.storage), {link: guideLink(slug, 'storage')});
    case 'store.watch': return textBuilt(frame, `${name}: watch for [General]`, src(storageGuide(slug)!.watchFor), {link: guideLink(slug, 'storage')});
    case 'store.sell': return textBuilt(frame, `${name}: before selling [General]`, [storageGuide(slug)!.sellTip.text], {link: guideLink(slug, 'storage')});
    // ---- selling and market information
    case 'market.menu': return menuBuilt(frame, 'Sell & market', [{label: 'Harvest for sale (net)', to: F('market.crop')}, {label: 'Try selling (demo only)', to: F('sell.crop')}]);
    case 'market.crop': return cropMenu(frame, 'For sale: which crop?', (s) => F('market.list', {slug: s}));
    case 'market.list': {
      const m = env.market; const link = {to: '/harvest', label: 'Find harvest in the app'};
      if (m.source === 'none') return {head: `${name} for sale`, lines: ['No list on this phone.', 'It needs internet once to download.'], foot: [NAV], kind: 'CON', expects: 'option', maxInput: 2, link, internet: 'market', handle: () => err()};
      const rows = m.listings.filter((l) => l.cropSlug === slug && l.status !== 'Sold Out').map((l) => `${l.code ?? 'No ref'} ${l.quantityKg ?? '?'}kg L$${l.pricePerKgLrd} ${l.county}`);
      const head = m.source === 'saved' ? `${name} (saved ${shortDate(m.asOf)}, may be old)` : `${name} for sale (live)`;
      if (!rows.length) return {head, lines: ['No listings for this crop in the list.'], foot: [NAV], kind: 'CON', expects: 'option', maxInput: 2, link, internet: 'market', handle: () => err()};
      const budget = SCREEN_MAX - head.length - 1 - 8 - 1 - NAV.length - 1 - 1; const counts = packCounts(rows.map((r) => r.slice(1)), budget);
      const starts = counts.reduce<number[]>((a, c) => [...a, (a[a.length - 1] ?? 0) + c], [0]); const page = Math.min(frame.page, counts.length - 1); const more = page < counts.length - 1;
      return {head: `${head}${counts.length > 1 ? ` ${page + 1}/${counts.length}` : ''}`, lines: rows.slice(starts[page], starts[page] + counts[page]), foot: [...(more ? ['1 Next'] : []), NAV], kind: 'CON', expects: 'option', maxInput: 2, link, internet: 'market',
        handle: (i) => (i === '1' && more ? {push: {...frame, page: page + 1}} : err())};
    }
    case 'sell.crop': return cropMenu(frame, 'DEMO sell: which crop?', (s) => F('sell.kg', {slug: s}));
    case 'sell.kg': return {head: 'DEMO sell: quantity', lines: [`Kilograms of ${name}?`, `Whole number, ${HARVEST_LIMITS.minKg} to ${HARVEST_LIMITS.maxKg.toLocaleString('en-US')}.`, 'Type it, then press Send.'], foot: ['0 Back'], kind: 'CON', expects: 'number', maxInput: 7, link: {to: '/harvest/sell', label: 'Sell my harvest in the app'},
      handle: (i) => { const kg = kgOk(i); return kg === null ? err('Not a valid number of kg.') : {push: F('sell.price', {slug, kg: String(kg)})}; }};
    case 'sell.price': return {head: 'DEMO sell: price', lines: [`Price in L$ for 1 kg of ${name}?`, 'Whole number. Type it, then press Send.'], foot: ['0 Back'], kind: 'CON', expects: 'number', maxInput: 8, link: {to: '/harvest/sell', label: 'Sell my harvest in the app'},
      handle: (i) => { const pr = priceOk(i); return pr === null ? err('Not a valid price.') : {push: F('sell.county', {...p, price: String(pr)})}; }};
    case 'sell.county': return menuBuilt(frame, 'DEMO sell: county?', LIBERIA_COUNTIES.map((c) => ({label: c, to: F('sell.done', {...p, county: c})})), {link: {to: '/harvest/sell', label: 'Sell my harvest in the app'}});
    case 'sell.done': return textBuilt(frame, 'DEMO ONLY', ['NOTHING WAS SENT or saved.', `${p.kg} kg ${name}, L$${p.price}/kg, ${p.county}.`, 'No listing was made. Use Sell my harvest in the app.'], {link: {to: '/harvest/sell', label: 'Sell my harvest in the app'}});
    // ---- expert assistance (demonstration of a possible future workflow)
    case 'expert.menu': return menuBuilt(frame, 'Expert help (demo)', [{label: 'How it works', to: F('expert.how')}, {label: 'Try a question (demo)', to: F('expert.topic')}]);
    case 'expert.how': return textBuilt(frame, 'Expert help', ['In the app you send a question with a photo to an extension officer. It works offline too and is sent when you are online.', 'Expert replies in this demonstration are simulated.', 'Nothing can be sent from this phone simulator. A real USSD or SMS service would need a telecom partner.'], {link: {to: '/experts', label: 'Expert support in the app'}});
    case 'expert.topic': return cropMenu(frame, 'DEMO: question about?', (s) => F('expert.done', {slug: s}));
    case 'expert.done': return textBuilt(frame, 'DEMO ONLY', ['NOTHING was sent. No number was saved.', `A question about ${name} would start here.`, 'Use Expert support in the app.'], {link: {to: '/experts', label: 'Expert support in the app'}});
    // ---- language
    case 'lang.menu': return menuBuilt(frame, 'Language', LANGUAGE_OPTIONS.map((l) => ({label: `${l.name}${l.code === 'en' ? ' (now)' : ' - planned'}`, to: F('lang.pick', {code: l.code})})));
    case 'lang.pick': { const l = LANGUAGE_OPTIONS.find((x) => x.code === p.code)!; return textBuilt(frame, 'Language', [l.code === 'en' ? 'English is selected. This demo has English menus only.' : `${l.name} is planned, not available on this phone menu. No translation or recorded audio exists yet. Staying in English.`]); }
    // ---- help and exit
    case 'help.menu': { const m = menuBuilt(frame, 'Help & exit', [{label: 'How to use', to: F('help.use')}, {label: 'About this demo', to: F('help.about')}, {label: 'Exit', to: F('help.exit')}]); return {...m, handle: (i) => (i === '3' ? {end: 'exit'} : m.handle(i))}; }
    case 'help.use': return textBuilt(frame, 'How to use', ['Type the number of your choice, then press Send.', '0 = Back. 00 = Home. Cancel ends the session.', `After ${env.timeoutSeconds ?? DEFAULT_TIMEOUT_S} seconds with no key the session ends. Press Send to start again.`]);
    case 'help.about': return textBuilt(frame, 'About this demo', ['DEMONSTRATION ONLY. Not connected to any mobile network. No SMS is sent and no USSD code exists.', 'Advice is demonstration content from the Crops Library and the app guidance, not reviewed by an agronomist or the Ministry.']);
    default: return menuBuilt(MAIN, MAIN_TITLE, [], {nav: false});
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------ session
export function tick(s: Session, nowMs: number, timeoutS: number = DEFAULT_TIMEOUT_S): Session {
  return s.status === 'active' && nowMs - s.lastActivity >= timeoutS * 1000 ? {...s, status: 'ended', endReason: 'timeout', frames: [], input: '', notice: null} : s;
}
const start = (s: Session, nowMs: number): Session => ({status: 'active', endReason: null, no: s.no + 1, frames: [MAIN], input: '', notice: null, lastActivity: nowMs});
const end = (s: Session, reason: EndReason): Session => ({...s, status: 'ended', endReason: reason, frames: [], input: '', notice: null});

export function press(s0: Session, key: Key, env: UssdEnv, nowMs: number): Session {
  const timeoutS = env.timeoutSeconds ?? DEFAULT_TIMEOUT_S; let s = tick(s0, nowMs, timeoutS);
  if (s.status !== 'active') {
    // idle or ended: a keypress only edits the (empty) entry line; Send starts a completely new session
    if (key === 'send') return s.input === '' ? start(s, nowMs) : {...s, input: '', notice: 'There is no dial code in this demo. Press Send to start.'};
    if (key === 'del') return {...s, input: s.input.slice(0, -1), notice: null};
    if (/^[0-9*#]$/.test(key)) return {...s, input: (s.input + key).slice(0, MAX_INPUT), notice: null};
    return s;
  }
  s = {...s, lastActivity: nowMs};
  const frame = s.frames[s.frames.length - 1]; const built = build(frame, env);
  if (key === 'cancel') return end(s, 'cancel');
  if (key === 'home') return {...s, frames: [MAIN], input: '', notice: null};
  if (key === 'back') return s.frames.length > 1 ? {...s, frames: s.frames.slice(0, -1), input: '', notice: null} : {...s, input: '', notice: 'You are at the main menu.'};
  if (key === 'del') return {...s, input: s.input.slice(0, -1), notice: null};
  if (key !== 'send') { const limit = Math.max(built.maxInput, 0); return s.input.length >= limit ? {...s, notice: limit ? 'Too many digits. Press Send or Delete.' : null} : {...s, input: s.input + key, notice: null}; }
  const input = s.input;
  if (input === '') return {...s, notice: 'Type a number, then press Send.'};
  if (input === '0') return s.frames.length > 1 ? {...s, frames: s.frames.slice(0, -1), input: '', notice: null} : {...s, input: '', notice: 'Invalid choice. Try again.'};
  if (input === '00') return {...s, frames: [MAIN], input: '', notice: null};
  const tr = built.handle(input);
  if ('error' in tr) return {...s, input: '', notice: tr.error};
  if ('end' in tr) return end(s, tr.end);
  return {...s, frames: [...s.frames, tr.push], input: '', notice: null};
}

const ENDED: Record<EndReason, string> = {exit: 'Session ended. Thank you. (Demonstration)\nPress Send to start again.', cancel: 'Session cancelled. Press Send to start again.', timeout: 'Session timed out after no key was pressed. Press Send to start again.'};
export function view(s0: Session, env: UssdEnv, nowMs: number): Screen {
  const timeoutS = env.timeoutSeconds ?? DEFAULT_TIMEOUT_S; const s = tick(s0, nowMs, timeoutS);
  const base = {truncated: false, secondsLeft: null as number | null, appLink: null, internet: {needed: false, state: 'bundled' as const}, frameId: null as string | null, expects: 'none' as const};
  if (s.status === 'idle') return {...base, kind: 'IDLE', text: `${MAIN_TITLE}\nNo network. Demonstration only.\n${s.notice ? `${s.notice}\n` : ''}Press Send to start a demo session.`.slice(0, SCREEN_MAX)};
  if (s.status === 'ended') return {...base, kind: 'IDLE', text: `${s.notice ? `${s.notice}\n` : ''}${ENDED[s.endReason ?? 'exit']}`.slice(0, SCREEN_MAX)};
  const frame = s.frames[s.frames.length - 1]; const b = build(frame, env);
  const body = [...(b.head ? [b.head] : []), ...b.lines, ...b.foot];
  let lines = s.notice ? [s.notice, ...body] : body; let text = lines.join('\n');
  if (text.length > SCREEN_MAX && s.notice && b.head) { lines = [s.notice, ...b.lines, ...b.foot]; text = lines.join('\n'); }
  let truncated = false; if (text.length > SCREEN_MAX) { text = `${text.slice(0, SCREEN_MAX - 1)}…`; truncated = true; }
  const m = env.market.source;
  return {text, kind: b.kind, expects: b.expects, truncated, secondsLeft: Math.min(timeoutS, Math.max(0, Math.ceil(timeoutS - (nowMs - s.lastActivity) / 1000))), appLink: b.link ?? null, frameId: frame.id,
    internet: b.internet ? {needed: true, state: m === 'server' ? 'live' : m === 'saved' ? 'saved' : 'none'} : {needed: false, state: 'bundled'}};
}
