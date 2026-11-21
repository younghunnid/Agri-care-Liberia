import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {LIBERIA_COUNTIES} from '../server/constants.ts';
import {isSyntheticPhone} from '../server/demoPolicy.ts';
import {CROPS_LIBRARY} from '../src/data/cropsLibrary.ts';
import {cardSeedBySlug} from '../src/data/adviceCardsSeed.ts';
import {BAND_INFO, TRIAGE_CASES} from '../src/data/triageCases.ts';
import {GUIDANCE_CROPS, MONTH_NAMES, periodText, plantingEntry, plantingSentence, plantingStatus, storageGuide} from '../src/data/farmGuidance.ts';
import {LANGUAGE_OPTIONS} from '../src/lib/i18n.ts';
import {NAV_GROUPS} from '../src/data/navGroups.ts';
import {evaluateTriage} from '../src/lib/triageRules.ts';
import {DEFAULT_TIMEOUT_S, DEMO_CALLER, DEMO_LABEL, MAIN_ITEMS, SCREEN_MAX, newSession, paginate, press, tick, view, type Key, type MarketEnv, type Session, type UssdEnv} from '../src/lib/ussd/engine.ts';
import {FARM_TO_MARKET_STEPS} from '../src/pages/public/FarmToMarketDemoPage.tsx';
import {EMPTY_MARKETPLACE} from '../src/lib/ussd/marketTypes.ts';

/** Phase 2B: the basic-phone (USSD-style) simulator. Pure engine tests (no browser, no network, no database) plus static checks of the screens. */
const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('src/App.tsx'); const routes = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));

const listing = (code: string, slug: string, kg: number, price: number, county: string, status = 'Available') => ({code, cropSlug: slug, quantityKg: kg, pricePerKgLrd: price, county, status});
const SAVED: MarketEnv = {source: 'saved', asOf: '2026-11-19T10:00:00Z', listings: [listing('SELL-2026-000034', 'rice', 900, 150, 'Nimba'), listing('SELL-2026-000035', 'rice', 400, 140, 'Grand Cape Mount'), listing('SELL-2026-000036', 'rice', 50, 99, 'Bong', 'Sold Out'), listing('SELL-2026-000037', 'cassava', 650, 62, 'Bong')]};
const NONE: MarketEnv = {source: 'none', asOf: null, listings: []};
const LIVE: MarketEnv = {...SAVED, source: 'server'};
const env = (over: Partial<UssdEnv> = {}): UssdEnv => ({online: true, market: SAVED, now: new Date(2026, 4, 10, 9), ...over});

/** A tiny driver: starts a session at t=1000 ms and presses keys one second apart. Multi-digit entries are typed digit by digit. */
function run(keys: string[], e: UssdEnv = env(), from: Session = newSession(), t0 = 1000): {s: Session; t: number} {
  let s = from; let t = t0;
  for (const k of keys) for (const ch of (['send', 'back', 'home', 'cancel', 'end', 'del'].includes(k) ? [k] : k.split(''))) { s = press(s, ch as Key, e, t); t += 1000; }
  return {s, t};
}
const go = (keys: string[], e: UssdEnv = env()) => { const r = run(['send', ...keys], e); return {...r, text: view(r.s, e, r.t).text}; };
const pick = (...digits: string[]) => digits.flatMap((d) => [d, 'send']);
/** Reads every page of the text screen the session is on (pressing 1 = Next) and returns the bodies without the headline and navigation lines. */
function readPages(s0: Session, e: UssdEnv, t0: number): {bodies: string[]; head: string[]} {
  let s = s0; let t = t0; const bodies: string[] = []; const head: string[] = [];
  for (let i = 0; i < 30; i++) {
    const lines = view(s, e, t).text.split('\n'); head.push(lines[0]);
    bodies.push(lines.slice(1).filter((l) => l !== '1 Next' && l !== '0 Back  00 Home').join('\n'));
    if (!lines.includes('1 Next')) break; ({s, t} = run(['1', 'send'], e, s, t));
  }
  return {bodies, head};
}
const norm = (x: string) => x.replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------------------------------------ 1. every screen fits
test('1. every reachable screen (and its error variant) fits in 182 characters without cutting anything, in every market state', () => {
  for (const market of [SAVED, NONE, LIVE]) {
    const e = env({market}); const seen = new Map<string, {s: Session; t: number}>(); const queue: {s: Session; t: number}[] = [run(['send'], e)];
    const sig = (s: Session) => { const f = s.frames[s.frames.length - 1]; return `${f.id}|${JSON.stringify(f.p)}|${f.page}`; };
    seen.set(sig(queue[0].s), queue[0]);
    while (queue.length) {
      const cur = queue.shift()!; const v = view(cur.s, e, cur.t);
      assert.ok(v.text.length <= SCREEN_MAX && !v.truncated, `${sig(cur.s)} is ${v.text.length} chars: ${v.text}`);
      const bad = run(['*', 'send'], e, cur.s, cur.t); const bv = view(bad.s, e, bad.t); assert.ok(bv.text.length <= SCREEN_MAX && !bv.truncated, `error variant of ${sig(cur.s)} is ${bv.text.length} chars`); assert.match(bv.text, /Invalid|Not a valid|Type a number/, 'an invalid entry always says so');
      const tries = v.expects === 'number' ? ['650', '62', '0'] : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '99'];
      for (const inp of tries) { const n = run([inp, 'send'], e, cur.s, cur.t); if (n.s.status !== 'active') continue; const k = sig(n.s); if (!seen.has(k)) { seen.set(k, n); queue.push(n); } }
      assert.ok(cur.s.frames.length > 1 || sig(cur.s).startsWith('main|'), 'only the main menu has no way back');
    }
    assert.ok(seen.size > 900, `explored ${seen.size} screens`); // 9 crops x menus, 6 situations x answers, pages, counties
  }
});

test('2. text pages never cut a sentence or drop one: the pages read back as exactly the source text', () => {
  const src = ['A short one.', 'Another sentence that is a bit longer than the first one is, still fine.', 'x '.repeat(120).trim() + '.', 'Last one.'];
  for (const budget of [40, 60, 100, 131]) { const pages = paginate(src, budget); assert.ok(pages.every((p) => p.length <= budget), `budget ${budget}`); assert.equal(norm(pages.join(' ')), norm(src.join(' '))); }
});

// ------------------------------------------------------------------------------------------------------------------------ 2. navigation
test('3. numbered menus: the main menu preserves all original functions and adds the interactive marketplace', () => {
  assert.deepEqual([...MAIN_ITEMS], ['Crops & planting', 'Pests & disease', 'Buy & Sell Produce', 'Harvest & storage', 'Expert help', 'Language', 'Help & exit', 'Sell & market']);
  const main = go([]).text; assert.equal(main, ['FARM ADVICE (DEMO)', ...MAIN_ITEMS.map((m, i) => `${i + 1} ${m}`)].join('\n'));
  const lands: [string, RegExp][] = [['1', /^Crops & planting: crop\?/], ['2', /^Pests & disease/], ['3', /^Buy & Sell Produce/], ['4', /^Harvest & storage: crop\?/], ['5', /^Expert help \(demo\)/], ['6', /^Language/], ['7', /^Help & exit/], ['8', /^Sell & market/]];
  for (const [d, re] of lands) assert.match(go(pick(d)).text, re, `option ${d}`);
  const rice = go(pick('1', '1')).text; assert.match(rice, /^\[DEMO\] Rice planting\n1 Planting months\n2 How to plant\n3 Soil & water\n4 Care of the crop/);
});

test('4. invalid input: wrong numbers, empty Send, letters-like symbols and too many digits are refused with a message and change nothing', () => {
  const base = go(pick('1', '1')); const before = view(base.s, env(), base.t).text;
  for (const bad of [['9'], ['5'], ['99'], ['12'], ['*'], ['#'], ['0', '0', '0']] as string[][]) { const r = run([...bad, 'send'], env(), base.s, base.t); const v = view(r.s, env(), r.t); const k = bad.join(''); if (k === '000') continue; assert.match(v.text, /^Invalid choice\. Try again\.\n/, `entry ${k}`); assert.equal(v.text.split('\n').slice(1).join('\n'), before, 'the same menu stays on screen'); assert.equal(r.s.frames.length, base.s.frames.length); assert.equal(r.s.input, '', 'the entry line is cleared'); }
  assert.match(view(run(['send'], env(), base.s, base.t).s, env(), 1).text, /^Type a number, then press Send\./, 'empty Send');
  const many = run(['1', '2', '3'], env(), base.s, base.t); assert.match(view(many.s, env(), many.t).text, /^Too many digits/); assert.equal(many.s.input, '12');
  // main menu: 0 and 00 are not offered
  assert.match(go(['0', 'send']).text, /^Invalid choice/); assert.equal(go(['0', '0', 'send']).s.frames.length, 1);
  // number screens: not a number, zero, too large, fractions
  const sell = (kg: string) => go([...pick('7', '4', '2'), kg, 'send']); assert.match(sell('650').text, /^DEMO sell: price/);
  for (const bad of ['*', '#', '99999999']) assert.match(sell(bad).text, /^(Not a valid number of kg\.|Too many digits|Invalid choice)/, `kg ${bad}`);
  assert.match(sell('0').text, /^\[DEMO\] Cassava|^DEMO sell: which crop\?/, 'typed 0 is Back (the screen shows "0 Back"), never a zero quantity');
  assert.match(sell('1000001').text, /^Too many digits|^Not a valid number/); assert.match(sell('1000000').text, /^DEMO sell: price/);
  const price = (p: string) => go([...pick('7', '4', '2', '650'), p, 'send']); assert.match(price('62').text, /^DEMO sell: county\?/); assert.match(price('0').text, /^DEMO sell: quantity/, 'typed 0 goes Back one screen'); assert.match(price('*').text, /^Not a valid price/);
});

test('5. Back, Home and Cancel: keys and typed 0 / 00 behave the same; Home from anywhere; Back walks one screen; Cancel ends the session', () => {
  const deep = go(pick('4', '1', '2'), env());           // storage > rice > handling
  assert.match(deep.text, /^Rice: handling \[General\]/);
  const viaKey = run(['back'], env(), deep.s, deep.t).s; const viaTyped = run(['0', 'send'], env(), deep.s, deep.t).s;
  assert.deepEqual(viaKey.frames, viaTyped.frames); assert.match(view(viaKey, env(), 9).text, /^\[DEMO\] Rice harvest\n1 At harvest/);
  const h1 = run(['home'], env(), deep.s, deep.t).s; const h2 = run(['0', '0', 'send'], env(), deep.s, deep.t).s; assert.deepEqual(h1.frames, h2.frames); assert.equal(h1.frames.length, 1); assert.equal(h1.status, 'active');
  const home = run(['home'], env(), h1, 2000).s; assert.equal(home.frames.length, 1, 'Home at the main menu stays there'); assert.match(view(run(['back'], env(), h1, 2000).s, env(), 5).text, /^You are at the main menu\./);
  const pages = go(pick('1', '1', '1')); const p1 = view(pages.s, env(), pages.t).text; assert.match(p1, /1\/3/); const p2 = run(pick('1'), env(), pages.s, pages.t); assert.match(view(p2.s, env(), p2.t).text, /2\/3/);
  assert.equal(view(run(['back'], env(), p2.s, p2.t).s, env(), 0).text, p1, 'Back from page 2 returns to page 1');
  const c = run(['cancel'], env(), deep.s, deep.t).s; assert.equal(c.status, 'ended'); assert.equal(c.endReason, 'cancel'); assert.match(view(c, env(), 9999).text, /^Session cancelled\. Press Send to start again\./);
  const typed = run(['9', 'del', '1', '2', 'del', 'del'], env(), h1, 5000).s; assert.equal(typed.input, '', 'Delete removes digits one by one');
});

// ------------------------------------------------------------------------------------------------------------------------ 3. sessions
test('6. a session is a state machine: idle, active, ended; it times out, can be cancelled or exited, and every restart is completely fresh', () => {
  const e = env(); let s = newSession(); assert.equal(s.status, 'idle'); assert.match(view(s, e, 0).text, /^FARM ADVICE \(DEMO\)\nNo network\. Demonstration only\.\nPress Send to start a demo session\./);
  assert.equal(press(s, '1', e, 10).status, 'idle', 'digits do nothing before a session starts'); assert.match(view(run(['1', '2', 'send'], e, s, 10).s, e, 99).text, /There is no dial code in this demo/);
  s = press(s, 'send', e, 1000); assert.equal(s.status, 'active'); assert.equal(s.no, 1);
  // deep in a menu with a typed entry, then silence
  s = run(pick('4', '1').concat(['2']), e, s, 2000).s; assert.equal(s.input, '2');
  const last = s.lastActivity; assert.equal(tick(s, last + 89_999).status, 'active'); const timed = tick(s, last + 90_000); assert.equal(timed.status, 'ended'); assert.equal(timed.endReason, 'timeout'); assert.equal(timed.frames.length, 0); assert.equal(timed.input, '');
  assert.match(view(s, e, last + 90_000).text, /^Session timed out after no key was pressed\. Press Send to start again\./);
  assert.equal(view(s, e, last + 30_000).secondsLeft, 60, 'the countdown'); assert.equal(view(s, e, last + 89_001).secondsLeft, 1); assert.equal(view(s, e, last - 700).secondsLeft, 90, 'never above the timeout even if the screen clock is a moment behind the key press');
  // any key after the timeout never continues the old session: it edits the idle entry line, and Send starts a new one
  const afterKey = press(s, '5', e, last + 100_000); assert.equal(afterKey.status, 'ended'); assert.equal(afterKey.frames.length, 0);
  const fresh = press(newSession().status === 'idle' ? {...s} : s, 'send', e, last + 100_000); assert.equal(fresh.status, 'active'); assert.equal(fresh.no, 2); assert.equal(fresh.frames.length, 1); assert.equal(fresh.frames[0].id, 'main'); assert.equal(fresh.input, ''); assert.equal(fresh.notice, null);
  assert.equal(afterKey.input, '5', 'digits typed after a timeout only fill the idle entry line'); const noStart = press(afterKey, 'send', e, last + 101_000); assert.equal(noStart.status, 'ended', 'Send with something typed is not a start'); assert.match(view(noStart, e, last + 101_000).text, /There is no dial code in this demo/);
  assert.equal(timed.input, '', 'a timeout wipes anything that was typed');
  // every key press extends the session
  let live = press(newSession(), 'send', e, 0); for (let t = 60_000; t <= 600_000; t += 60_000) live = press(live, 'del', e, t); assert.equal(live.status, 'active');
  // cancel and exit also end it, and restarting forgets the path
  const exit = run(['send', ...pick('7', '3')], e); assert.equal(exit.s.status, 'ended'); assert.equal(exit.s.endReason, 'exit'); assert.match(view(exit.s, e, exit.t).text, /^Session ended\. Thank you\. \(Demonstration\)\nPress Send to start again\./);
  const again = run(['send'], e, exit.s, exit.t + 1000); assert.equal(again.s.frames.length, 1); assert.equal(again.s.no, exit.s.no + 1);
  // a custom timeout (for presenters) is honoured
  const short = env({timeoutSeconds: 5}); const sh = run(['send'], short); assert.equal(tick(sh.s, sh.s.lastActivity + 5000, 5).status, 'ended'); { const r = go(pick('7', '1'), short); assert.match(readPages(r.s, short, r.t).bodies.join(' '), /After 5 seconds with no key/); }
  assert.equal(DEFAULT_TIMEOUT_S, 90);
});

// ------------------------------------------------------------------------------------------------------------------------ 4. content equals existing content
test('7. planting, pests and storage screens read back as exactly the existing guidance (Crops Library and Phase 2A), for every crop', () => {
  const e = env();
  GUIDANCE_CROPS.forEach((c, ci) => {
    const lib = CROPS_LIBRARY.find((x) => x.slug === c.slug)!; const k = String(ci + 1);
    const section = (menu: string, label: string, sentences: string[]) => { const r = go(pick('1', k, menu), e); const {bodies} = readPages(r.s, e, r.t); assert.equal(norm(bodies.join(' ')), norm(sentences.join(' ')), `${c.slug} ${label}`); };
    section('2', 'how to plant', lib.plantingInfo); section('3', 'soil and water', [...lib.soilRequirements, ...lib.waterManagement]); section('4', 'care', lib.cropMaintenance);
    const pest = go(pick('2', '1', k), e); assert.equal(norm(readPages(pest.s, e, pest.t).bodies.join(' ')), norm([...lib.commonPestsDiseases, 'Not a diagnosis. If you cannot explain a problem, use 5 Expert help from the main menu.'].join(' ')), `${c.slug} pests`);
    const g = storageGuide(c.slug)!; const st = (m: string, items: {text: string}[], tag: string) => { const r = go(pick('4', k, m), e); const {bodies, head} = readPages(r.s, e, r.t); assert.equal(norm(bodies.join(' ')), norm(items.map((i) => i.text).join(' ')), `${c.slug} storage ${m}`); assert.ok(head[0].includes(`[${tag}]`), `${c.slug}: the source tag [${tag}] is on the screen`); };
    st('1', g.atHarvest, 'Library'); st('2', g.handling, 'General'); st('3', g.storage, 'Library'); st('4', g.watchFor, 'General'); st('5', [g.sellTip], 'General');
    // months: the same structured months and the same sentence as the planting card, for every month of the year
    for (let m = 0; m < 12; m++) {
      const em = env({now: new Date(2026, m, 15)}); const r = go(pick('1', k, '1'), em); const {bodies} = readPages(r.s, em, r.t); const entry = plantingEntry(c.slug)!; const st2 = plantingStatus(c.slug, m + 1)!;
      assert.equal(norm(bodies.join(' ')), norm(['Usual months (Crops Library):', ...entry.periods.map((p) => `${p.label}: ${periodText(p)}.`), ...(entry.unspecified ? [entry.unspecified] : []), `${MONTH_NAMES[m]}: ${plantingSentence(st2)}`, 'Calendar guide only. Not reviewed by an agronomist. Ask an extension officer.'].join(' ')), `${c.slug} ${MONTH_NAMES[m]}`);
    }
  });
});

test('8. the symptom check gives the same colour, advice card and steps as the app, for every situation and all 162 answer combinations', () => {
  const e = env(); let combos = 0;
  const crops = ['cassava', 'rice', 'poultry'];
  for (const [ci, crop] of crops.entries()) for (const [si, c] of TRIAGE_CASES.filter((x) => x.crop === crop).entries()) {
    const sizes = c.questions.map((q) => q.options.length); const total = sizes.reduce((a, b) => a * b, 1);
    for (let n = 0; n < total; n++) {
      let rest = n; const idx = sizes.map((sz) => { const i = rest % sz; rest = Math.floor(rest / sz); return i; }); const answers: Record<string, string> = {}; c.questions.forEach((q, i) => { answers[q.id] = q.options[idx[i]].id; });
      const r = go([...pick('2', '2', String(ci + 1), String(si + 1)), ...idx.flatMap((i) => [String(i + 1), 'send'])], e); const ev = evaluateTriage(c.id, answers); assert.ok(ev.ok); if (!ev.ok) continue;
      const {bodies, head} = readPages(r.s, e, r.t); const all = norm(bodies.join(' ')); const card = cardSeedBySlug(ev.cardSlug)!;
      assert.ok(head[0].startsWith('Check result'));
      const expected = norm([BAND_INFO[ev.band].label, ev.headline, ...ev.actions, `Advice card ${card.code}: ${card.title}.`, ...card.steps, card.askWhen, 'Simulated check: not a diagnosis. Stays on this demo phone; nothing was sent. Demo advice, not reviewed by an agronomist.'].join(' '));
      assert.equal(all, expected, `${c.id} ${JSON.stringify(answers)}`); combos++;
    }
  }
  assert.equal(combos, 162);
  // the question screens carry the app's own questions and answers
  const q1 = go(pick('2', '2', '1', '1'), e).text; assert.ok(q1.startsWith('Q1/3\nHow many cassava plants show this?\n1 Only a few')); assert.match(q1, /0 Back  00 Home$/);
});

// ------------------------------------------------------------------------------------------------------------------------ 5. offline and internet
test('9. offline: bundled advice is identical online and offline; the one internet feature (harvest for sale) says what it is showing; no private field is ever shown', () => {
  const online = env({online: true, market: LIVE}); const offline = env({online: false, market: NONE});
  const paths = [pick('1', '1', '1'), pick('1', '2', '2', '3'), pick('2', '1', '5'), pick('4', '9', '3'), pick('5', '1'), pick('6', '5'), pick('7', '2')];
  for (const p of paths) assert.equal(go(p, online).text, go(p, offline).text, `bundled screen ${p.join('')} is the same offline`);
  for (const p of paths) assert.equal(view(go(p, offline).s, offline, 1).internet.needed, false);
  const none = go(pick('7', '5', '1'), offline); assert.equal(none.text, 'Rice for sale\nNo list on this phone.\nIt needs internet once to download.\n0 Back  00 Home'); const nv = view(none.s, offline, none.t); assert.deepEqual(nv.internet, {needed: true, state: 'none'});
  const saved = go(pick('7', '5', '1'), env({online: false, market: SAVED})); assert.match(saved.text, /^Rice \(saved 19 Nov, may be old\)\nSELL-2026-000034 900kg L\$150 Nimba\nSELL-2026-000035 400kg L\$140 Grand Cape Mount\n0 Back/); assert.ok(!saved.text.includes('SELL-2026-000036'), 'sold out is hidden'); assert.ok(!saved.text.includes('SELL-2026-000037'), 'only the chosen crop'); assert.deepEqual(view(saved.s, env({market: SAVED}), saved.t).internet, {needed: true, state: 'saved'});
  const live = go(pick('7', '5', '1'), env({market: LIVE})); assert.match(live.text, /^Rice for sale \(live\)\n/); assert.deepEqual(view(live.s, env({market: LIVE}), live.t).internet, {needed: true, state: 'live'});
  assert.match(go(pick('7', '5', '4'), env({market: SAVED})).text, /^Pepper \(saved 19 Nov, may be old\)\nNo listings for this crop in the list\./);
  for (const t of [saved.text, live.text]) assert.ok(!/phone|\+231|seller|farmer name|Synthetic/i.test(t.replace('Demonstration', '')), 'no seller names or numbers');
  const src = read('src/lib/ussd/engine.ts'); assert.ok(!/\bfetch\(|apiFetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|navigator\./.test(src), 'the engine touches no network or storage');
  assert.ok(!/Date\.now\(|new Date\(\)/.test(src), 'the engine has no clock of its own');
});

test('10. original selling practice and expert help remain no-submit examples: NOTHING WAS SENT is on their first confirmation screen', () => {
  const sell = go([...pick('7', '4', '2', '650', '62', '4')]); const first = sell.text; assert.match(first, /^DEMO ONLY\nNOTHING WAS SENT or saved\.\n650 kg Cassava, L\$62\/kg, Grand Bassa\.\nNo listing was made\. Use Sell my harvest in the app\./); assert.ok(!first.includes('1 Next'), 'a single screen: the warning cannot be missed');
  assert.equal(view(sell.s, env(), sell.t).appLink?.to, '/harvest/sell');
  const ex = go(pick('5', '2', '2')); assert.match(ex.text, /^DEMO ONLY\nNOTHING was sent\. No number was saved\.\nA question about Cassava would start here\.\nUse Expert support in the app\./); assert.ok(!ex.text.includes('1 Next')); assert.equal(view(ex.s, env(), ex.t).appLink?.to, '/experts');
  const how = go(pick('5', '1')); const pages = readPages(how.s, env(), how.t).bodies.join(' '); assert.match(pages, /simulated/); assert.match(pages, /Expert questions cannot be sent from this simulator/); assert.match(pages, /telecom partner/);
  for (const f of ['src/components/ussd/UssdPhone.tsx', 'src/pages/public/UssdDemoPage.tsx', 'src/lib/ussd/engine.ts']) { const s = read(f); assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'|sendBeacon|XMLHttpRequest|localStorage|sessionStorage/.test(s), `${f} cannot submit or store anything`); assert.ok(!/apiFetch|\bfetch\(/.test(s), `${f} calls no API`); }
  assert.ok(read('src/lib/ussd/marketApp.ts').includes('harvestClient.load()'), 'the adapter reuses the existing harvest snapshot client');
  for (const bad of [['4', '2', '2', '0', 'x'], ['4', '2', '2', '650', '0']]) void bad;
  assert.equal(go([...pick('7', '4', '2'), '650', 'send', '0', 'send']).s.input, '');
});

// ------------------------------------------------------------------------------------------------------------------------ 6. languages, identity, honesty
test('11. language: English only; the other Liberian languages are listed as planned, with no translation and no audio', () => {
  const menu = go(pick('6')).text; const lines = menu.split('\n');
  assert.deepEqual(lines.slice(1, 1 + LANGUAGE_OPTIONS.length), LANGUAGE_OPTIONS.map((l, i) => `${i + 1} ${l.name}${l.code === 'en' ? ' (now)' : ' - planned'}`));
  assert.ok(LANGUAGE_OPTIONS.filter((l) => l.code !== 'en').length >= 3);
  assert.equal(go(pick('6', '1')).text, 'Language\nEnglish is selected. This demo has English menus only.\n0 Back  00 Home');
  LANGUAGE_OPTIONS.forEach((l, i) => { if (l.code === 'en') return; assert.equal(go(pick('6', String(i + 1))).text, `Language\n${l.name} is planned, not available on this phone menu. No translation or recorded audio exists yet. Staying in English.\n0 Back  00 Home`); });
  const after = go([...pick('6', '2'), 'home', ...pick('1')]).text; assert.match(after, /^Crops & planting: crop\?/, 'the menus stay English');
});

test('12. synthetic identity, no short code, no operator names, the required label, help and about texts', () => {
  assert.equal(DEMO_LABEL, 'Demonstration only — no mobile network connection.'); assert.ok(isSyntheticPhone(DEMO_CALLER), 'the pretend caller is a synthetic number (+23177000xxxx)'); assert.match(DEMO_CALLER, /^\+23177000\d{4}$/);
  const sources = ['src/lib/ussd/engine.ts', 'src/components/ussd/UssdPhone.tsx', 'src/pages/public/UssdDemoPage.tsx'].map(read).join('\n');
  assert.ok(!/\*\d{1,5}(\*\d+)*#/.test(sources), 'no USSD short code appears anywhere (none exists)'); assert.ok(!/\b(MTN|Orange|Lonestar|Cellcom|Novafone)\b/i.test(sources), 'no operator is named');
  assert.ok(!/type="(tel|text)"|<input|<textarea/.test(read('src/components/ussd/UssdPhone.tsx') + read('src/pages/public/UssdDemoPage.tsx')), 'no field that could collect a phone number');
  const about = readPages(go(pick('7', '2')).s, env(), 9); assert.match(about.bodies.join(' '), /DEMONSTRATION ONLY\. Not connected to any mobile network\. No SMS is sent and no USSD code exists\./); assert.match(about.bodies.join(' '), /not reviewed by an agronomist or the Ministry/);
  assert.match(go(pick('7', '1')).text, /Type the number of your choice, then press Send\./);
  const page = read('src/pages/public/UssdDemoPage.tsx'); assert.ok(page.includes('{DEMO_LABEL}') && page.includes('USSD_NOTICE') && page.includes('data-testid="ussd-demo-label"'));
  assert.match(read('src/lib/ministryAnalytics.ts'), /No USSD short code has been assigned, registered or activated/);
});

// ------------------------------------------------------------------------------------------------------------------------ 7. screen, keyboard, accessibility, links
test('13. the phone screen: keypad, function keys, labels, focus, keyboard, touch targets and contrast are all in place', () => {
  const ui = read('src/components/ussd/UssdPhone.tsx'); const page = read('src/pages/public/UssdDemoPage.tsx');
  for (const id of ['key-send', 'key-cancel', 'key-back', 'key-home', 'key-del']) assert.ok(ui.includes(`data-testid="${id}"`), id);
  assert.ok(ui.includes("const DIGITS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']") && ui.includes('aria-label={`Digit ${SPOKEN[d] ?? d}`}') && ui.includes("'*': 'Star', '#': 'Hash'"));
  for (const label of ['aria-label="Send"', 'aria-label="Cancel and end the session"', 'aria-label="Back one screen"', 'aria-label="Home, the main menu"', 'aria-label="Delete the last digit"', 'aria-label="Phone screen"', 'aria-label="Number keypad"', 'aria-label="Phone function keys"']) assert.ok(ui.includes(label), label);
  assert.ok(ui.includes('aria-live="polite"') && ui.includes('role="region"'), 'screen changes are announced politely'); assert.ok(ui.includes('focus-visible:ring-4'), 'a clear focus ring on every key');
  assert.ok(/\/\^\[0-9\*#\]\$\/\.test\(e\.key\)/.test(ui) && ui.includes("e.key === 'Enter'") && ui.includes("e.key === 'Backspace'") && ui.includes("e.key === 'Escape'"), 'digits, Enter, Backspace and Escape'); assert.ok(ui.includes("tag !== 'BUTTON'"), 'Enter on a focused button keeps its own action');
  assert.ok(ui.includes("tag === 'INPUT'") && ui.includes('removeEventListener'), 'the listener ignores form fields and is removed on leaving');
  for (const m of (ui + page).matchAll(/min-h-\[(\d+)px\]/g)) assert.ok(Number(m[1]) >= 44, `touch target ${m[0]}`); assert.ok(ui.includes('min-h-[56px]') && ui.includes('min-h-[52px]'), 'big keys');
  assert.ok(ui.includes('max-w-[440px]') && ui.includes('w-full') && /grid-cols-3/.test(ui), 'fits 320 px (the phone is at most 440 px and shrinks)');
  assert.ok(ui.includes('bg-[#CFEAA8]') && ui.includes('text-[#0A1A0E]'), 'dark text on a light LCD green'); const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05); assert.ok(ratio('#CFEAA8', '#0A1A0E') >= 7, 'screen contrast is at least 7:1'); assert.ok(ratio('#E8EDF3', '#10161D') >= 7); assert.ok(ui.includes('bg-[#16803C] text-white'), 'Send uses the brand green'); assert.ok(ratio('#16803C', '#FFFFFF') >= 4.5, 'Send: normal-size text meets AA contrast'); assert.ok(ratio('#B91C1C', '#FFFFFF') >= 4.5);
  assert.ok(!/text-xs/.test(ui.replace('className="text-xs" data-testid="ussd-timer"', '')), 'no tiny text apart from the timer, which is also hidden from screen readers'); assert.ok(ui.includes('aria-hidden className="text-xs" data-testid="ussd-timer"'));
  assert.ok(page.includes("t >= 5 && t <= 300") && page.includes('DEFAULT_TIMEOUT_S'), 'a presenter can shorten the timeout with ?timeout=');
  assert.ok(ui.includes('Inquiries need internet') && ui.includes('Built into the app: works without internet.'), 'which screens need the internet is stated');
});

test('14. routes, navigation, the Farmer Today link and the presenter walkthrough', () => {
  assert.ok(routes.has('/ussd-demo')); assert.ok(NAV_GROUPS.find((g) => g.id === 'tools')!.items.some((i) => i.to === '/ussd-demo' && i.kinds.includes('simulated')));
  const today = read('src/pages/public/FarmerTodayPage.tsx'); assert.ok(today.includes('to="/ussd-demo"') && today.includes('data-testid="go-ussd"') && today.includes('Demonstration only. No mobile network.'));
  assert.equal(FARM_TO_MARKET_STEPS.length, 16); const s3 = FARM_TO_MARKET_STEPS[2]; const s4 = FARM_TO_MARKET_STEPS[3];
  assert.equal(s3.to, '/ussd-demo'); assert.ok(s3.kinds.includes('simulated') && s3.kinds.includes('draft')); assert.match(s3.note, /works offline/); assert.match(s3.note, /proposed code is for this browser only/);
  assert.equal(s4.to, '/ussd-demo'); assert.ok(s4.kinds.includes('simulated') && s4.kinds.includes('future')); assert.match(s4.note, /require explicit confirmation/); assert.match(s4.note, /no translation or recording exists/);
  assert.deepEqual(FARM_TO_MARKET_STEPS.map((s) => s.n), Array.from({length: 16}, (_x, i) => i + 1)); for (const s of FARM_TO_MARKET_STEPS) assert.ok(routes.has(s.to.split('#')[0].split('?')[0]) || /^\/advice-cards\/ADV/.test(s.to), s.to);
  assert.ok(!read('src/lib/ussd/engine.ts').includes('/participants/enroll'), 'the original advice engine remains independent of the additive enrollment registry'); assert.ok(!fs.existsSync(path.join(root, 'server/routes/ussd.ts')), 'and no server route: the simulator is client-side only');
  for (const county of LIBERIA_COUNTIES) assert.ok(go([...pick('7', '4', '2', '650', '62')]).text.length > 0, county);
});


test('15. original Sell & market is preserved as a named submenu; both old Help aliases behave identically', () => {
  assert.equal(go(pick('8')).text, 'Sell & market\n1 Harvest for sale (net)\n2 Try selling (demo only)\n0 Back  00 Home');
  assert.equal(go(pick('8', '1', '1')).text, go(pick('7', '5', '1')).text);
  const original = go(pick('8', '2', '2', '650', '62', '4'), env({marketplace: {...EMPTY_MARKETPLACE, allowed: true}}));
  assert.equal(original.text, go(pick('7', '4', '2', '650', '62', '4')).text);
  assert.match(original.text, /NOTHING WAS SENT or saved/); assert.equal(original.s.pending, null);
  assert.equal(go(pick('8', '1', '1'), env({online: false, market: SAVED})).text, go(pick('7', '5', '1'), env({online: false, market: SAVED})).text);
});
