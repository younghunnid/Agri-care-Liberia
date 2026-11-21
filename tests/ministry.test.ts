import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {AUDIENCE, CAMPAIGN_CROPS, CAMPAIGN_TEMPLATES, DEMO_COUNTIES, DEMO_CROPS, PRODUCTION, SIGNALS, WEATHER_DEMO} from '../src/data/ministryDemo.ts';
import {
  ALL, FSI_LABEL, USSD_MAX_CHARS, achievementPct, assignEscalation, audienceSize, buildEscalations, computeFsi, expectedActualBars, fillTemplate, filterProduction, filterSignals, fsiBand,
  moistureLabel, reviewEscalation, severityOf, simulateDispatch, smsInfo, sortProduction, summarise, templatesFor, ussdScreen, validateCampaignMessage,
} from '../src/lib/ministryAnalytics.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const walk = (d: string): string[] => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// ------------------------------------------------------------------ Food Security Index
test('FSI: 40% availability + 30% weather + 30% crop health, worked examples', () => {
  const r = computeFsi({availability: 70, weather: 65, cropHealth: 68});
  assert.equal(r.raw, 67.9); assert.equal(r.score, 68);
  assert.deepEqual(r.parts.map((p) => [p.key, p.weight, p.input, p.points]), [['availability', 0.4, 70, 28], ['weather', 0.3, 65, 19.5], ['cropHealth', 0.3, 68, 20.4]]);
  assert.equal(r.formula, '0.40 × 70 + 0.30 × 65 + 0.30 × 68 = 67.9 → 68');
  assert.equal(computeFsi({availability: 100, weather: 100, cropHealth: 100}).score, 100);
  assert.equal(computeFsi({availability: 0, weather: 0, cropHealth: 0}).score, 0);
  assert.equal(computeFsi({availability: 100, weather: 0, cropHealth: 0}).score, 40);
  assert.equal(computeFsi({availability: 0, weather: 100, cropHealth: 0}).score, 30);
  assert.equal(computeFsi({availability: 57, weather: 58, cropHealth: 61}).score, 59, '58.5 rounds up');
});
test('FSI: the 12 demo rows reproduce the reference table values (one reference value was inconsistent with its own formula); weights sum to 100%', () => {
  // The teammate's table stored 75 for lofa-rice, but 0.4x78 + 0.3x76 + 0.3x72 = 75.6, which rounds to 76. We always CALCULATE from the inputs, so we show 76.
  const expected: Record<string, number> = {'bong-cassava': 68, 'bong-rice': 71, 'bong-pepper': 61, 'nimba-rice': 65, 'nimba-cassava': 77, 'nimba-pepper': 73, 'lofa-rice': 76, 'lofa-palm': 78, 'margibi-cassava': 68, 'margibi-okra': 76, 'montserrado-pepper': 59, 'montserrado-okra': 72};
  assert.equal(PRODUCTION.length, 12);
  for (const r of PRODUCTION) assert.equal(computeFsi(r).score, expected[r.id], r.id);
  const w = computeFsi(PRODUCTION[0]).parts.reduce((s, p) => s + p.weight, 0);
  assert.ok(Math.abs(w - 1) < 1e-9);
});
test('FSI: invalid inputs are rejected, bands have exact boundaries, label is the required wording', () => {
  for (const bad of [{availability: NaN, weather: 1, cropHealth: 1}, {availability: -1, weather: 1, cropHealth: 1}, {availability: 101, weather: 1, cropHealth: 1}, {availability: '70' as never, weather: 1, cropHealth: 1}, {availability: 1, weather: Infinity, cropHealth: 1}]) assert.throws(() => computeFsi(bad), RangeError);
  assert.deepEqual([59, 59.9, 60, 69, 70, 100].map(fsiBand), ['Critical', 'Critical', 'Caution', 'Caution', 'Secure', 'Secure']);
  assert.equal(FSI_LABEL, 'Illustrative Team 8 Demo Index — Not an official food-security assessment.');
  assert.match(read('src/pages/public/MinistryAnalyticsPage.tsx'), /FSI_LABEL/);
});

// ------------------------------------------------------------------ filters, aggregates, chart data
test('filters: county and crop combine; counts and totals are exact', () => {
  assert.equal(filterProduction(PRODUCTION, {county: 'All', crop: ALL}).length, 12);
  assert.deepEqual(filterProduction(PRODUCTION, {county: 'Bong', crop: ALL}).map((r) => r.id), ['bong-cassava', 'bong-rice', 'bong-pepper']);
  assert.deepEqual(filterProduction(PRODUCTION, {county: 'All', crop: 'Okra'}).map((r) => r.county).sort(), ['Margibi', 'Montserrado']);
  assert.deepEqual(filterProduction(PRODUCTION, {county: 'Lofa', crop: 'Cassava'}), [], 'a county without that crop is empty');
  for (const c of DEMO_COUNTIES) assert.ok(filterProduction(PRODUCTION, {county: c, crop: ALL}).length >= 2, c);
  assert.deepEqual([...DEMO_COUNTIES], ['Bong', 'Nimba', 'Lofa', 'Margibi', 'Montserrado']);
  const all = summarise(PRODUCTION);
  assert.equal(all.expectedMt, PRODUCTION.reduce((s, r) => s + r.expectedMt, 0)); assert.equal(all.actualMt, PRODUCTION.reduce((s, r) => s + r.actualMt, 0)); assert.equal(all.rows, 12);
  const bong = summarise(filterProduction(PRODUCTION, {county: 'Bong', crop: ALL}));
  assert.deepEqual([bong.expectedMt, bong.actualMt, bong.plantedHa], [17040 + 2450 + 840, 11928 + 1862 + 512, 1420 + 980 + 210]);
  assert.equal(bong.achievementPct, Math.round((14302 / 20330) * 1000) / 10);
  assert.deepEqual(summarise([]), {rows: 0, plantedHa: 0, expectedMt: 0, actualMt: 0, achievementPct: 0, meanFsi: null});
  assert.equal(achievementPct({expectedMt: 0, actualMt: 5}), 0);
  assert.equal(DEMO_CROPS.length, 5);
});
test('sorting is stable, works for every key, and does not mutate the input', () => {
  const copy = PRODUCTION.map((r) => r.id);
  for (const k of ['county', 'crop', 'plantedHa', 'expectedMt', 'actualMt', 'achievement', 'fsi'] as const) {
    const up = sortProduction(PRODUCTION, k, true); const down = sortProduction(PRODUCTION, k, false);
    assert.equal(up.length, 12); assert.equal(new Set(up.map((r) => r.id)).size, 12);
    assert.deepEqual(up.map((r) => r.id).reverse().length, down.length);
  }
  assert.equal(sortProduction(PRODUCTION, 'fsi', true)[0].id, 'montserrado-pepper');
  assert.equal(sortProduction(PRODUCTION, 'fsi', false)[0].id, 'lofa-palm');
  assert.deepEqual(PRODUCTION.map((r) => r.id), copy);
});
test('chart data equals the underlying rows exactly (and an empty filter gives an empty chart)', () => {
  const rows = filterProduction(PRODUCTION, {county: 'Nimba', crop: ALL});
  const {bars, max} = expectedActualBars(rows);
  assert.equal(bars.length, rows.length);
  rows.forEach((r, i) => { assert.deepEqual(bars[i], {id: r.id, label: `${r.county} · ${r.crop}`, expected: r.expectedMt, actual: r.actualMt, pct: achievementPct(r)}); });
  assert.equal(max, 13800);
  assert.equal(bars.reduce((s, b) => s + b.actual, 0), summarise(rows).actualMt);
  assert.deepEqual(expectedActualBars([]), {bars: [], max: 0});
  for (const r of PRODUCTION) assert.ok(r.actualMt <= r.expectedMt && r.actualMt > 0, `${r.id} data sanity`);
});

// ------------------------------------------------------------------ weather
test('weather: five counties, both horizons, moisture labels, draft wording, no unverified thresholds as guidance', () => {
  assert.deepEqual(WEATHER_DEMO.map((w) => w.county), [...DEMO_COUNTIES]);
  for (const w of WEATHER_DEMO) {
    for (const f of [w.d3, w.d7]) { assert.ok(f.soilMoisture >= 0 && f.soilMoisture <= 100 && f.rainMm >= 0 && f.tempC > 0); assert.ok(['Open', 'Caution', 'Closed'].includes(f.window)); }
    assert.match(w.draftGuidance, /^Draft:/); assert.match(w.station, /Demo/);
    assert.ok(!/(\d+\s?(ml|mg|%)|pesticide|spray|fungicide)/i.test(w.draftGuidance + w.d3.note + w.d7.note), w.county);
  }
  assert.deepEqual([40, 44.9, 45, 75, 76].map(moistureLabel), ['Dry', 'Dry', 'Adequate', 'Adequate', 'Wet']);
  assert.match(read('src/pages/public/MinistryAnalyticsPage.tsx'), /have not been checked by an agronomist/);
});

// ------------------------------------------------------------------ disease signals
test('signals: severity rule, filters, escalation queue transitions; no diagnosis, no confidence, no treatment text', () => {
  assert.deepEqual([[1, 'Crop'], [2, 'Crop'], [4, 'Crop'], [5, 'Crop'], [2, 'Livestock'], [3, 'Livestock'], [1, 'Livestock']].map(([n, c]) => severityOf({reports7d: n as number, category: c as 'Crop' | 'Livestock'})), ['Low', 'Caution', 'Caution', 'High', 'Caution', 'High', 'Low']);
  assert.equal(filterSignals(SIGNALS, 'All').length, 6);
  assert.deepEqual(filterSignals(SIGNALS, 'Margibi').map((s) => s.id), ['SIG-004', 'SIG-006']);
  assert.deepEqual(filterSignals(SIGNALS, 'Montserrado').map((s) => severityOf(s)), ['Caution']);
  const q = buildEscalations(SIGNALS);
  assert.deepEqual(q.map((e) => [e.county, e.status, e.assignee]), [['Bong', 'Pending', null], ['Nimba', 'Pending', null], ['Lofa', 'Pending', null]]);
  assert.match(q[2].reason, /veterinary/i);
  const a = assignEscalation(q, q[0].id);
  assert.equal(a[0].status, 'Assigned'); assert.equal(a[0].assignee, 'Extension officer (demo)'); assert.equal(assignEscalation(q, q[2].id)[2].assignee, 'Veterinary officer (demo)');
  assert.equal(reviewEscalation(q, q[0].id)[0].status, 'Pending', 'cannot review before assigning');
  assert.equal(reviewEscalation(a, a[0].id)[0].status, 'Reviewed');
  assert.equal(assignEscalation(a, a[0].id)[0].assignee, 'Extension officer (demo)', 'assigning twice changes nothing');
  assert.equal(q[0].status, 'Pending', 'inputs are not mutated');
  const text = JSON.stringify(SIGNALS) + read('src/data/ministryDemo.ts') + read('src/pages/public/MinistryAnalyticsPage.tsx');
  assert.ok(!/confidence\s*[:=]?\s*\d|\d+\s*%\s*(sim\.|conf)|\bconf\.|Cassava Mosaic Disease|Brown Streak|Rice Blast|Newcastle|\bPPR\b/i.test(text), 'no named confirmed disease or numeric confidence score');
  assert.ok(!/(fungicide|apply recommended|vaccinat|isolate, vaccin)/i.test(text), 'no copied treatment advice');
});

// ------------------------------------------------------------------ SMS counting and message safety
test('SMS counting: GSM-7 160/153, extension characters count twice, UCS-2 70/67', () => {
  assert.deepEqual(smsInfo(''), {encoding: 'GSM-7', units: 0, segments: 1, perSegment: 160, remaining: 160});
  assert.equal(smsInfo('a'.repeat(160)).segments, 1); assert.equal(smsInfo('a'.repeat(160)).remaining, 0);
  const two = smsInfo('a'.repeat(161)); assert.deepEqual([two.segments, two.perSegment, two.remaining], [2, 153, 145]);
  assert.equal(smsInfo('a'.repeat(306)).segments, 2); assert.equal(smsInfo('a'.repeat(307)).segments, 3);
  assert.equal(smsInfo('€'.repeat(80)).units, 160); assert.equal(smsInfo('{'.repeat(81)).segments, 2);
  const u = smsInfo('Kpɛɛ'.repeat(18)); assert.equal(u.encoding, 'UCS-2'); assert.equal(u.units, 72); assert.equal(u.segments, 2); assert.equal(u.perSegment, 67);
  assert.equal(smsInfo('ɛ'.repeat(70)).segments, 1);
});
test('campaign messages: every approved template (every county) is safe; unsafe content is refused', () => {
  for (const t of CAMPAIGN_TEMPLATES) for (const c of DEMO_COUNTIES) {
    const msg = fillTemplate(t, c);
    assert.deepEqual(validateCampaignMessage(msg), [], `${t.id} / ${c}`);
    assert.ok(smsInfo(msg).segments <= 2 && msg.startsWith('Agricare demo:'));
    assert.ok(!msg.includes('{county}'));
  }
  const bad: [string, RegExp][] = [
    ['Your verification code is 123456 please use it today', /login or verification codes/],
    ['Enter OTP now to continue with your farm advice', /login or verification codes/],
    ['Dial *384# for cassava advice in your county today', /USSD short code/],
    ['Dial *123*4# for farm advice in your county today', /USSD short code/],
    ['Read more at https://example.org about your cassava', /web links/],
    ['Call +231 770 000 123 for your cassava advice today', /phone numbers/],
    ['Call 0770000123 for your cassava advice today please', /phone numbers/],
    ['Mix 50 ml per litre on the cassava leaves this week', /doses or amounts/],
    ['Use a pesticide on your cassava leaves this week now', /chemical or spray/],
    ['This treatment cures cassava mosaic for every farmer', /cure claims/],
    ['Vaccinate your goats this week against the illness now', /cure claims/],
    ['Ministry of Agriculture alert: check your cassava leaves', /Ministry, government or official/],
    ['MoA-KPAA alert: check your cassava leaves this week', /Ministry, government or official/],
    ['Too short', /too short/],
    ['a'.repeat(400), /too long/],
  ];
  for (const [m, re] of bad) assert.ok(validateCampaignMessage(m).some((p) => re.test(p)), `not refused: ${m}`);
  assert.deepEqual(validateCampaignMessage('Agricare demo: Keep harvested rice dry on raised mats in Bong.'), []);
});
test('campaigns are separate from sign-in codes: no shared code or imports, and codes in messages are blocked', () => {
  for (const f of ['src/lib/ministryAnalytics.ts', 'src/data/ministryDemo.ts', 'src/pages/public/MinistryAnalyticsPage.tsx', 'src/components/ministry/ExpectedActualChart.tsx']) {
    const src = read(f);
    assert.ok(!/from ['"][^'"]*(server\/|otp|authSecurity|SecurityBits|DemoSmsInbox|verification)/i.test(src), `${f} imports auth code`);
    assert.ok(!/auth\/(login|verify|resend|forgot|demo-inbox)|dev\/simulated-sms/.test(src), `${f} calls an auth endpoint`);
  }
  assert.ok(validateCampaignMessage('Agricare demo: your code is 482913, keep it private always').length > 0);
});

// ------------------------------------------------------------------ dispatch simulation and USSD preview
test('audience and simulated dispatch: deterministic, consistent, never random', () => {
  assert.equal(audienceSize('Bong', 'Cassava'), 2340);
  assert.equal(audienceSize('All', 'Goats'), 420 + 530 + 940 + 280 + 210);
  for (const c of DEMO_COUNTIES) for (const k of CAMPAIGN_CROPS) assert.ok(AUDIENCE[c][k] > 0);
  const input = {county: 'Bong' as const, crop: 'Cassava', text: 'Agricare demo: Cassava leaves yellow or curled in Bong? Use clean cuttings and ask your extension officer.', audience: 2340, sequence: 1};
  const a = simulateDispatch(input); const b = simulateDispatch({...input});
  assert.deepEqual(a, b);
  assert.equal(a.status, 'SIMULATED'); assert.equal(a.id, 'SIM-0001'); assert.equal(a.delivered + a.failed, a.audience);
  assert.ok(a.deliveryRatePct >= 95.4 && a.deliveryRatePct <= 99.1, String(a.deliveryRatePct));
  assert.equal(simulateDispatch({...input, text: input.text + ' Thank you.'}).audience, 2340);
  for (const n of [0, 1, 7, 2340, 99999]) { const r = simulateDispatch({...input, audience: n}); assert.equal(r.delivered + r.failed, n); assert.ok(r.delivered <= n && r.failed >= 0); }
  assert.equal(simulateDispatch({...input, audience: 0}).deliveryRatePct, 0);
});
test('USSD-style preview: our own menu, every screen within the limit, never claims a short code', () => {
  const ctx = {county: 'Bong' as const, advice: CAMPAIGN_TEMPLATES[0].text.replace('{county}', 'Bong')};
  for (const c of DEMO_COUNTIES) for (const p of ['', '1', '2', '3', '3*1', '3*2', '0', 'zzz']) {
    const s = ussdScreen(p, {...ctx, county: c});
    assert.ok(s.text.length <= USSD_MAX_CHARS, `${c} ${p}: ${s.text.length}`); assert.ok(['CON', 'END'].includes(s.kind));
  }
  assert.equal(ussdScreen('', ctx).kind, 'CON'); assert.equal(ussdScreen('1', ctx).kind, 'END'); assert.equal(ussdScreen('zzz', ctx).valid, false);
  assert.match(ussdScreen('3*1', ctx).text, /no report was sent/);
  const files = [...walk('src'), 'docs/TEAMMATE_DASHBOARD_INTEGRATION.md'].filter((f) => /\.(ts|tsx)$/.test(f) && fs.existsSync(f));
  for (const f of files) assert.ok(!/\*384#/.test(fs.readFileSync(f, 'utf8')), `${f} mentions the teammate's short code`);
  assert.match(read('src/lib/ministryAnalytics.ts'), /No USSD short code has been assigned, registered or activated/);
});

// ------------------------------------------------------------------ privacy and isolation
test('privacy: no personal data in the dataset; nothing is sent, stored or exported by the dashboard code', () => {
  const data = read('src/data/ministryDemo.ts');
  assert.ok(!/\+?231[\s\d-]{6,}/.test(data) && !/@[a-z0-9-]+\.[a-z]{2,}/i.test(data) && !/(?<!\d)0?7\d{8}(?!\d)/.test(data), 'phone numbers or emails in the dataset');
  assert.ok(!/(display_?name|farmer_?name|phone|email|password)\s*:/i.test(data), 'personal-data field names');
  for (const f of ['src/lib/ministryAnalytics.ts', 'src/data/ministryDemo.ts', 'src/components/ministry/ExpectedActualChart.tsx']) {
    assert.ok(!/(fetch\(|apiFetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|WebSocket|navigator\.)/.test(read(f)), `${f} touches the network or storage`);
  }
  const page = read('src/pages/public/MinistryAnalyticsPage.tsx');
  assert.deepEqual([...page.matchAll(/apiFetch[<(]/g)].length, 1, 'exactly one network call');
  assert.match(page, /apiFetch<[^>]*>\('\/prototype\/management-summary'\)/, 'it reads only the public aggregate counts');
  assert.ok(!/(localStorage|sessionStorage|indexedDB|Blob\(|createObjectURL|download=|\.csv|text\/csv|sendBeacon|XMLHttpRequest|method:\s*'(POST|PUT|PATCH|DELETE)')/i.test(page), 'no storage, export or write request in the page');
  assert.ok(!/KPAA|MoA|Ministry of Agriculture|\bendorse(d|ment)? by\b/.test(page.replace(/not endorsed|not a Ministry|No Ministry login|Not an official|any Ministry or government/gi, '')), 'no official branding or endorsement claim');
  assert.match(page, /not<\/strong> a Ministry product/); assert.match(page, /not endorsed<\/strong>/);
  assert.match(page, /no export of data/); assert.match(page, /No Ministry login exists yet/);
  assert.match(page, /SIMULATION ONLY/); assert.match(page, /Nothing on this page sends a real SMS/);
});
test('routing: reachable from Demo Mode and the existing Ministry page; existing routes remain', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="\/ministry-analytics"/);
  for (const keep of ['/ministry"', '/demo"', '/learn"', '/advice/crop-problems"', '/tools/calculator"', '/verify"', '/account/security"', '/experts"']) assert.ok(app.includes(`path="${keep}`) || app.includes(`path="${keep.slice(0, -1)}"`), keep);
  assert.match(read('src/pages/public/DemoModePage.tsx'), /to="\/ministry-analytics"/);
  assert.match(read('src/pages/public/MinistryDashboardPage.tsx'), /to="\/ministry-analytics"/);
});
