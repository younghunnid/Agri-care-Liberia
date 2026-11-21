import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router';
import {LIBERIA_COUNTIES} from '../server/constants.ts';
import {CROPS_LIBRARY} from '../src/data/cropsLibrary.ts';
import {HARVEST_CROPS} from '../src/data/harvestCrops.ts';
import {SAMPLE_COUNTY_WEATHER} from '../src/data/weatherSoilMinistry.ts';
import {NAV_GROUPS} from '../src/data/navGroups.ts';
import {
  COMMON_STORAGE_CHECKS, GUIDANCE_BANNER, GUIDANCE_CROPS, MONTH_NAMES, PLANTING_PERIODS, REGIONAL_LIMIT, SAMPLE_WEATHER_LABEL, countyGuidance, inPeriod, monthsUntil, plantingStatus, storageGuide,
  type PlantingPeriod,
} from '../src/data/farmGuidance.ts';
import {PROFILE_KEY, buildReminders, emptyProfile, greeting, loadProfile, pendingWork, sanitizeProfile, saveProfile} from '../src/lib/farmerToday.ts';
import {GuidanceBanner, PlantingGuidanceCard, StorageGuidanceCard} from '../src/components/guidance/GuidanceBits.tsx';
import {FARM_TO_MARKET_STEPS} from '../src/pages/public/FarmToMarketDemoPage.tsx';

/** Phase 2A: farmer "Today" screen, planting months, harvest and storage guidance. Pure logic and rendered components: no server, no network. */
const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('src/App.tsx');
const routes = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
const html = (...nodes: React.ReactNode[]) => renderToStaticMarkup(React.createElement(StaticRouter, {location: '/'}, ...nodes));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ------------------------------------------------------------------------------------------------------------------------ 1. planting months
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Months named in a Crops Library window string, ranges expanded ("Oct–Mar" wraps). */
function monthsInText(s: string): Set<number> {
  const out = new Set<number>(); const tok = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
  const range = new RegExp(`${tok}\\s*[–-]\\s*${tok}`, 'g'); const idx = (t: string) => MON.indexOf(t.slice(0, 3).toLowerCase()) + 1;
  for (const m of s.matchAll(range)) { let a = idx(m[1]); const b = idx(m[2]); for (let i = 0; i < 12; i++) { out.add(a); if (a === b) break; a = (a % 12) + 1; } }
  for (const m of s.replace(range, ' ').matchAll(new RegExp(tok, 'g'))) out.add(idx(m[1]));
  return out;
}
test('1. the planting months are a structured copy of the Crops Library text: same months, nothing new, every supported crop covered', () => {
  assert.deepEqual(GUIDANCE_CROPS.map((c) => c.slug).sort(), CROPS_LIBRARY.map((c) => c.slug).sort()); assert.deepEqual(GUIDANCE_CROPS.map((c) => c.slug).sort(), HARVEST_CROPS.map((c) => c.slug).sort(), 'the same nine crops as selling and buying');
  assert.equal(PLANTING_PERIODS.length, CROPS_LIBRARY.length);
  for (const c of CROPS_LIBRARY) {
    const e = PLANTING_PERIODS.find((p) => p.slug === c.slug)!; assert.ok(e, c.slug); assert.ok(e.periods.length >= 1);
    const mine = new Set<number>(); for (const p of e.periods) for (let m = 1; m <= 12; m++) if (inPeriod(p, m)) mine.add(m);
    assert.deepEqual([...mine].sort((a, b) => a - b), [...monthsInText(c.plantingWindow)].sort((a, b) => a - b), `${c.slug}: "${c.plantingWindow}"`);
    assert.equal(new Set(e.periods.map((p) => p.label)).size, e.periods.length, 'distinct labels');
    for (const p of e.periods) assert.ok(p.from >= 1 && p.from <= 12 && p.to >= 1 && p.to <= 12);
  }
  assert.ok(inPeriod({label: 'x', from: 10, to: 3}, 12) && inPeriod({label: 'x', from: 10, to: 3}, 1) && !inPeriod({label: 'x', from: 10, to: 3}, 6), 'wrap over the new year');
});

test('2. window status for every crop and month equals an independent brute-force answer (open, opens within two months, or later)', () => {
  for (const e of PLANTING_PERIODS) for (let month = 1; month <= 12; month++) {
    const st = plantingStatus(e.slug, month)!; const openNow = e.periods.filter((p) => inPeriod(p, month));
    let ahead = -1; for (let k = 0; k < 12 && ahead < 0; k++) { const m = ((month - 1 + k) % 12) + 1; if (e.periods.some((p) => inPeriod(p, m))) ahead = k; }
    if (openNow.length) { assert.equal(st.state, 'open', `${e.slug} ${month}`); assert.deepEqual(st.open.map((p) => p.label), openNow.map((p) => p.label)); assert.equal(ahead, 0); }
    else { assert.equal(st.state, ahead <= 2 ? 'soon' : 'later', `${e.slug} ${month}`); assert.equal(st.monthsUntilNext, ahead, `${e.slug} ${month} months until`); assert.ok(st.next); }
  }
  assert.equal(plantingStatus('gold', 5), null);
  assert.equal(monthsUntil({label: 'x', from: 4, to: 6}, 12), 4); assert.equal(monthsUntil({label: 'x', from: 4, to: 6}, 5), 0);
});

test('3. counties: all 15 are supported; six have a bundled SAMPLE note, the rest say honestly that nothing county-specific is verified', () => {
  assert.equal(LIBERIA_COUNTIES.length, 15);
  const withSample = LIBERIA_COUNTIES.filter((c) => countyGuidance(c).hasSample); assert.deepEqual(withSample.sort(), SAMPLE_COUNTY_WEATHER.map((c) => c.county).sort());
  for (const c of LIBERIA_COUNTIES) { const g = countyGuidance(c); assert.ok(g.note.length > 20); if (!g.hasSample) { assert.match(g.note, /not verified/); assert.equal(g.region, null); assert.deepEqual(g.sampleCrops, []); } }
  assert.match(REGIONAL_LIMIT, /not verified/i); assert.match(REGIONAL_LIMIT, /not adjusted for your county/);
});

// ------------------------------------------------------------------------------------------------------------------------ 2. storage guidance
test('4. harvest and storage guidance exists for every crop; library sentences are the Crops Library text and the rest is tagged general good practice', () => {
  for (const c of CROPS_LIBRARY) {
    const g = storageGuide(c.slug)!; assert.ok(g, c.slug);
    assert.deepEqual(g.atHarvest.map((i) => i.text), c.harvestingInfo); assert.deepEqual(g.storage.map((i) => i.text), c.storageGuidance);
    for (const i of [...g.atHarvest, ...g.storage]) assert.equal(i.source, 'library'); for (const i of [...g.handling, ...g.watchFor, g.sellTip]) assert.equal(i.source, 'team');
    assert.ok(g.handling.length >= 2 && g.watchFor.length >= 1 && g.sellTip.text.length > 10, `${c.slug} has practical handling, watch-for and selling advice`);
  }
  assert.equal(storageGuide('gold'), null); assert.ok(COMMON_STORAGE_CHECKS.length >= 4);
});

test('5. content safety: no doses, products, yields, prices, exact dates, official approval or live-forecast claims in anything the new screens say', () => {
  const strings: string[] = [GUIDANCE_BANNER, REGIONAL_LIMIT, SAMPLE_WEATHER_LABEL, ...COMMON_STORAGE_CHECKS];
  for (const c of CROPS_LIBRARY) { const g = storageGuide(c.slug)!; for (const i of [...g.handling, ...g.watchFor, g.sellTip]) strings.push(i.text); }
  for (const e of PLANTING_PERIODS) if (e.unspecified) strings.push(e.unspecified);
  for (const c of LIBERIA_COUNTIES) strings.push(countyGuidance(c).note);
  for (let m = 0; m < 12; m++) for (const county of LIBERIA_COUNTIES) for (const r of buildReminders({now: new Date(2026, m, 15), county, crops: GUIDANCE_CROPS.map((c) => c.slug)})) strings.push(r.title, r.detail, r.tag);
  assert.ok(strings.length > 500);
  const teamAndOurs = strings.join('\n');
  for (const [re, why] of [[/\b\d+(\.\d+)?\s*(kg|g|ml|l|litres?|liters?|tons?|tonnes?)\b/i, 'a dose or quantity'], [/\bper (acre|hectare|ha)\b/i, 'a rate'], [/\b(urea|npk|glyphosate|mancozeb|cypermethrin|pesticide|insecticide|fungicide|herbicide)\b/i, 'a product'], [/\b(L\$|LRD|USD|\$)\s?\d/i, 'a price'], [/\byield(s)? (of|will|is)\b/i, 'a yield claim'],
    [/\b(approved by|endorsed by|certified|guarantee[sd]?|proven|official(ly)? (recommend|approv))/i, 'an official or certainty claim'], [/\bwill (grow|yield|rain|be (dry|wet))\b/i, 'a prediction']] as [RegExp, string][]) assert.ok(!re.test(teamAndOurs), `contains ${why}: ${re}`);
  for (const m of teamAndOurs.matchAll(/forecast/gi)) { const before = teamAndOurs.slice(Math.max(0, m.index! - 40), m.index!); assert.match(before, /not (a |live )?(live )?$|Not (a )?$|Not live\. Not a $/i, `"forecast" only appears negated: ...${before}`); }
  assert.match(GUIDANCE_BANNER, /NOT been reviewed by the Ministry of Agriculture or by an agronomist/); assert.match(GUIDANCE_BANNER, /extension officer/); assert.match(SAMPLE_WEATHER_LABEL, /Not live/); assert.match(SAMPLE_WEATHER_LABEL, /Not a forecast/);
});

// ------------------------------------------------------------------------------------------------------------------------ 3. reminders, profile, pending work
const d = (y: number, m: number, day = 15, h = 9) => new Date(y, m - 1, day, h);
test('6. reminders follow the calendar and the county sample: planting months, sample weather, damp-storage check; always labelled', () => {
  const r = buildReminders({now: d(2026, 5), county: 'Bong', crops: ['rice', 'cassava', 'tomatoes']});
  assert.deepEqual(r.filter((x) => x.kind === 'planting').map((x) => x.id), ['plant-rice', 'plant-cassava'], 'tomatoes: dry-season beds are not near in May'); assert.ok(r.every((x) => x.tag === 'Demonstration guidance' || x.tag === 'Sample weather, not live'));
  const w = r.find((x) => x.kind === 'weather')!; assert.match(w.detail, /SAMPLE weather\. Not live\. Not a forecast/); assert.equal(w.tag, 'Sample weather, not live');
  assert.equal(r.find((x) => x.id === 'storage-damp'), undefined, 'Bong is not humid enough in the sample');
  const wet = buildReminders({now: d(2026, 8), county: 'Grand Bassa', crops: ['rice', 'groundnuts', 'cassava']}); const dmp = wet.find((x) => x.id === 'storage-damp')!;
  assert.ok(dmp && dmp.tone === 'watch'); assert.match(dmp.detail, /rice, groundnuts/); assert.ok(!/cassava/.test(dmp.detail), 'only grain and nuts are named'); assert.match(dmp.to, /^\/guidance\?crop=rice&tab=storage$/);
  const soon = buildReminders({now: d(2026, 2), county: '', crops: ['rice']}); assert.equal(soon[0].id, 'soon-rice'); assert.match(soon[0].title, /start in 2 months/); assert.equal(buildReminders({now: d(2026, 3), county: '', crops: ['rice']})[0].title.includes('one month'), true);
  assert.equal(buildReminders({now: d(2026, 6), county: '', crops: []}).length, 0, 'nothing chosen: no reminders');
  assert.deepEqual(buildReminders({now: d(2026, 1, 10), county: '', crops: ['rice']}), [], 'rice is far from January: nothing to say');
  const none = buildReminders({now: d(2026, 5), county: 'Bomi', crops: []}); assert.equal(none.length, 1); assert.equal(none[0].id, 'weather-none'); assert.match(none[0].detail, /not verified/);
  const a = buildReminders({now: d(2026, 5), county: 'Lofa', crops: ['maize', 'rice']}); assert.deepEqual(a, buildReminders({now: d(2026, 5), county: 'Lofa', crops: ['maize', 'rice']}), 'deterministic');
  assert.deepEqual(buildReminders({now: d(2026, 5), county: 'Atlantis', crops: ['gold', 'rice']}).map((x) => x.id), ['plant-rice'], 'unknown county and crops are ignored');
  for (const x of a) { assert.ok(x.to.startsWith('/')); assert.ok(routes.has(x.to.split('?')[0]), x.to); }
  assert.equal(greeting(d(2026, 5, 1, 8)), 'Good morning'); assert.equal(greeting(d(2026, 5, 1, 13)), 'Good afternoon'); assert.equal(greeting(d(2026, 5, 1, 20)), 'Good evening');
});

test('7. the saved farm profile keeps only known counties and crops, survives damaged or blocked storage, and never throws', () => {
  const mem = new Map<string, string>(); const st = {getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v)};
  assert.deepEqual(loadProfile(st), emptyProfile()); assert.equal(saveProfile({county: 'Bong', crops: ['rice', 'rice', 'gold', 'cassava']}, st), true);
  assert.deepEqual(loadProfile(st), {county: 'Bong', crops: ['rice', 'cassava']}); assert.ok(mem.has(PROFILE_KEY));
  mem.set(PROFILE_KEY, '{not json'); assert.deepEqual(loadProfile(st), emptyProfile());
  mem.set(PROFILE_KEY, JSON.stringify({county: '<script>', crops: 'rice'})); assert.deepEqual(loadProfile(st), emptyProfile());
  mem.set(PROFILE_KEY, JSON.stringify({county: 'Nimba', crops: ['maize', 7, null, 'okra']})); assert.deepEqual(loadProfile(st), {county: 'Nimba', crops: ['maize', 'okra']});
  const blocked = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }}; assert.deepEqual(loadProfile(blocked), emptyProfile()); assert.equal(saveProfile({county: 'Bong', crops: []}, blocked), false); assert.equal(saveProfile({county: 'Bong', crops: []}, null), false);
  assert.deepEqual(sanitizeProfile(null), emptyProfile()); assert.deepEqual(sanitizeProfile(42), emptyProfile());
});

test('8. pending work counts what is waiting or failed on the phone (listings, questions, SHARED crop checks); drafts and unshared checks are not "sending"', () => {
  const check = (share: boolean, status: string) => ({share, sync: {status, attempts: 0, nextAttemptAt: 0}}) as never;
  const p = pendingWork({listings: [{status: 'pending'}, {status: 'failed'}, {status: 'draft'}, {status: 'published'}], questions: [{status: 'pending'}, {status: 'published'}], checks: [check(true, 'pending'), check(true, 'failed'), check(false, 'local'), check(true, 'synced'), check(false, 'pending')]});
  assert.deepEqual(p, {listings: 2, questions: 1, checks: 2, failed: 2, total: 5});
  assert.deepEqual(pendingWork({listings: [], questions: [], checks: []}), {listings: 0, questions: 0, checks: 0, failed: 0, total: 0});
});

// ------------------------------------------------------------------------------------------------------------------------ 4. rendered components
test('9. the guidance components render the labels, the limits and both kinds of source; the planting sentence follows the date', () => {
  const may = text(html(React.createElement(GuidanceBanner, {showRegional: true}), React.createElement(PlantingGuidanceCard, {slug: 'rice', county: 'Bong', now: new Date(2026, 4, 10)})));
  assert.match(may, /Demonstration guidance/); assert.match(may, /works without internet/); assert.match(may, /NOT been reviewed by the Ministry of Agriculture or by an agronomist/); assert.match(may, /Regional data is not verified/);
  assert.match(may, /May: The usual planting months are running now \(Upland: April to June; Swamp: May to August\)/); assert.match(may, /Bong · Central Upland & Swamp/); assert.match(may, /bundled sample profile for this county \(not live, not a forecast\)/); assert.match(may, /does not know this year's rains/);
  const nov = text(html(React.createElement(PlantingGuidanceCard, {slug: 'rice', now: new Date(2026, 10, 10)}))); assert.match(nov, /November: The usual months start in|further away/); assert.ok(!/running now/.test(nov)); assert.match(nov, /November: The usual months are further away\. The next ones are April to June \(Upland\)/);
  const bomi = text(html(React.createElement(PlantingGuidanceCard, {slug: 'maize', county: 'Bomi', now: new Date(2026, 4, 10)}))); assert.match(bomi, /No county sample is bundled for Bomi/); assert.match(bomi, /No verified county information/);
  const st = html(React.createElement(StorageGuidanceCard, {slug: 'groundnuts'})); const t = text(st);
  assert.match(t, /Harvest and storage: Groundnuts/); assert.match(t, /From the Crops Library/); assert.match(t, /General good practice \(demonstration\)/); assert.match(t, /aflatoxin/); assert.match(t, /Never eat, sell or feed them to animals/); assert.match(t, /Not reviewed by the Ministry of Agriculture or an agronomist/);
  assert.equal((st.match(/data-source="library"/g) ?? []).length, 2); assert.ok((st.match(/data-source="team"/g) ?? []).length >= 3); assert.match(st, /href="\/experts"/);
  assert.equal(html(React.createElement(PlantingGuidanceCard, {slug: 'gold'})), ''); assert.equal(html(React.createElement(StorageGuidanceCard, {slug: 'gold'})), '');
  for (const c of GUIDANCE_CROPS) for (let m = 0; m < 12; m++) { const h = html(React.createElement(PlantingGuidanceCard, {slug: c.slug, county: 'Nimba', now: new Date(2026, m, 15)})); assert.ok(h.includes('data-testid="planting-card"') && h.includes(MONTH_NAMES[m])); }
});

// ------------------------------------------------------------------------------------------------------------------------ 5. screens, routes, offline
test('10. routes, navigation and the farmer screen: five real quick actions, empty states, offline and sample labels, big touch targets', () => {
  assert.ok(routes.has('/today') && routes.has('/guidance'));
  const page = read('src/pages/public/FarmerTodayPage.tsx');
  const actions = [...page.matchAll(/\{to: '([^']+)', label: '([^']+)'/g)].map((m) => [m[1], m[2]]); assert.deepEqual(actions, [['/check-my-crop', 'Check my crop'], ['/advisor', 'Agricultural advice'], ['/harvest/sell', 'Sell my harvest'], ['/harvest', 'Find buyers'], ['/experts', 'Expert support']]);
  for (const [to] of actions) assert.ok(routes.has(to), to);
  for (const must of ['data-testid="conn-status"', 'data-testid="pending-pill"', 'data-testid="offline-notice"', 'You are offline. Everything on this page still works', 'data-testid="reminders-empty-setup"', 'data-testid="reminders-empty"', 'data-testid="waiting-empty"', 'Choose your county and the crops you grow', 'data-testid="sample-weather"', 'SAMPLE_WEATHER_LABEL', 'Saved on this phone only', 'aria-pressed', 'GuidanceBanner', 'StatusLabel kind="future"', 'StatusLabel kind="draft"', 'StatusLabel kind="simulated"', 'StatusLabel kind="working"'])
    assert.ok(page.includes(must), `FarmerTodayPage lacks ${must}`);
  for (const f of ['src/pages/public/FarmerTodayPage.tsx', 'src/pages/public/GuidancePage.tsx', 'src/components/guidance/GuidanceBits.tsx']) { const src = read(f); for (const m of src.matchAll(/min-h-\[(\d+)px\]/g)) assert.ok(Number(m[1]) >= 44, `${f}: ${m[0]} is a touch target under 44 px`); assert.ok(!/text-(xs|\[1[01]px\])/.test(src.replace(/text-xs font-bold/g, '')), `${f}: no tiny body text`); }
  const quick = page.slice(page.indexOf('<nav aria-label="What would you like to do?"'), page.indexOf('data-testid="my-farm"')); assert.match(quick, /min-h-\[112px\]/); assert.match(quick, /grid-cols-2/); assert.ok(page.indexOf('data-testid="quick-actions"') < page.indexOf('data-testid="my-farm"') && page.indexOf('data-testid="quick-actions"') < page.indexOf('data-testid="reminders"'), 'the five actions come before the set-up and reminders');
  const gp = read('src/pages/public/GuidancePage.tsx'); const iSel = gp.indexOf('data-testid="g-crop"'); const iTab = gp.indexOf('role="tablist"'); const iBan = gp.indexOf('<GuidanceBanner />'); const iCard = gp.indexOf('<PlantingGuidanceCard');
  assert.ok(iSel > 0 && iSel < iTab && iTab < iBan && iBan < iCard, 'on a phone the crop choice comes first, and the demonstration label sits directly above the guidance it labels');
  const adv = NAV_GROUPS.find((g) => g.id === 'advice')!.items; assert.ok(adv.some((i) => i.to === '/guidance' && i.kinds.includes('draft')) && adv.some((i) => i.to === '/guidance?tab=storage' && i.kinds.includes('draft')));
  assert.ok(NAV_GROUPS.find((g) => g.id === 'tools')!.items.some((i) => i.to === '/today'));
  assert.match(read('src/components/Layout.tsx'), /<Link\b[^>]*to="\/today"[^>]*data-testid="tab-today"[^>]*>[\s\S]*?<span>Today<\/span>/); assert.match(read('src/pages/public/HomePage.tsx'), /to="\/today"[\s\S]{0,120}data-testid="home-today"/);
  const crops = read('src/pages/public/CropsLibraryPage.tsx'); assert.ok(crops.includes('<PlantingGuidanceCard slug={selectedCrop.slug} />') && crops.includes('<StorageGuidanceCard slug={selectedCrop.slug} />') && crops.includes('<GuidanceBanner />'), 'integrated into the existing crop guide');
});

test('11. offline: guidance is bundled (no network call in the data, logic or guidance screens); the farmer screen reuses the existing sync engines; the service worker precaches the app', () => {
  for (const f of ['src/data/farmGuidance.ts', 'src/lib/farmerToday.ts', 'src/components/guidance/GuidanceBits.tsx', 'src/pages/public/GuidancePage.tsx']) { const src = read(f); assert.ok(!/\bfetch\(|apiFetch|XMLHttpRequest|navigator\.sendBeacon|https?:\/\/(?!www\.w3\.org)/.test(src), `${f} makes no network call and has no link out`); }
  const page = read('src/pages/public/FarmerTodayPage.tsx');
  assert.ok(page.includes("syncNow({manual: true})") && page.includes('triageSync.sync({manual: true})') && page.includes('useSyncState()') && page.includes('pendingWork(') && page.includes('getListingRecords()') && page.includes('triageStore.list()'), 'one button runs both existing engines; counts come from the existing stores');
  assert.ok(!/apiFetch|fetch\(/.test(page), 'the screen itself calls no API');
  assert.ok(!/localStorage\.|sessionStorage/.test(page), 'the profile goes through loadProfile/saveProfile only');
  const vite = read('vite.config.ts'); assert.match(vite, /globPatterns: \['\*\*\/\*\.\{js,css,html/); assert.match(vite, /navigateFallback: '\/index\.html'/);
  // Guidance itself remains bundled and independent of the later enrollment registry.
  assert.ok(!read('src/data/farmGuidance.ts').includes('participant_registrations'), 'guidance does not depend on registry migrations');
});

test('12. the demonstration walkthrough starts at the farmer screen, includes the planting and storage guidance, and labels working, simulated, draft and future honestly', () => {
  assert.equal(FARM_TO_MARKET_STEPS.length, 16, 'Phase 2B added two basic-phone steps after the Phase 2A steps'); assert.deepEqual(FARM_TO_MARKET_STEPS.map((s) => s.n), Array.from({length: 16}, (_x, i) => i + 1));
  assert.equal(FARM_TO_MARKET_STEPS[0].to, '/today'); assert.ok(FARM_TO_MARKET_STEPS[0].kinds.includes('working') && FARM_TO_MARKET_STEPS[0].kinds.includes('simulated')); assert.match(FARM_TO_MARKET_STEPS[0].note, /SAMPLE weather \(not live, not a forecast\)/);
  assert.equal(FARM_TO_MARKET_STEPS[1].to, '/guidance'); assert.deepEqual(FARM_TO_MARKET_STEPS[1].kinds, ['draft']); assert.match(FARM_TO_MARKET_STEPS[1].note, /not reviewed by an agronomist or the Ministry/);
  for (const s of FARM_TO_MARKET_STEPS) assert.ok(routes.has(s.to.split('#')[0].split('?')[0]) || /^\/advice-cards\/ADV/.test(s.to), `${s.to} is a route`);
  const demo = read('src/pages/public/FarmToMarketDemoPage.tsx'); assert.match(demo, /Sixteen steps/); assert.ok(!/Twelve steps|Fourteen steps/.test(demo));
  assert.ok(read('src/pages/public/FarmerTodayPage.tsx').includes('StatusLabel kind="future"'), 'future features are named as future');
});
