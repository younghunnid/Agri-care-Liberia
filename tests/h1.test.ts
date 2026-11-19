import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CASSAVA_CAUSES, CASSAVA_REVIEW, CASSAVA_SYMPTOMS, GENERAL_GUIDANCE, NONE_OF_THESE_ADVICE, NOT_A_DIAGNOSIS_NOTICE,
} from '../src/data/cassavaProblems.ts';
import {
  EXPERT_CATEGORY, MAX_SAVED, buildExpertPrefill, buildSavedGuidance, deleteSavedGuidance, expertLink, listSavedGuidance, matchCauses, saveGuidance,
} from '../src/lib/cropProblem.ts';
import {
  CALC_KEY, MAX_CALC_SAVED, calculate, deleteCalc, emptyInput, formatMoney, listSavedCalcs, parseHundredths, saveCalc, type CalcInput,
} from '../src/lib/farmCalculator.ts';
import {memoryKv} from '../src/lib/kvStore.ts';
import {NAV_GROUPS} from '../src/data/navGroups.ts';
import {STATUS_KINDS, STATUS_LABELS} from '../src/lib/statusLabels.ts';
import {KNOWLEDGE_CATEGORIES} from '../src/data/knowledgeCenter.ts';
import {validateQuestion} from '../src/lib/offlineDrafts.ts';
import {summariseSavedWork} from '../src/lib/offlineInventory.ts';
import {DEMO_STEPS} from '../src/pages/public/CassavaDemoPage.tsx';

const appSrc = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routes = new Set([...appSrc.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
const input = (over: Partial<CalcInput> = {}): CalcInput => ({...emptyInput(), ...over});

// ------------------------------------------------------------ calculator
test('calculator: the worked example (expenses L$5,000, revenue L$8,000 -> profit L$3,000)', () => {
  const i = input({quantity: '8', price: {LRD: '1000', USD: ''}});
  i.expenses.LRD = {seed: '1000', fertilizer: '500', labour: '2500', transport: '500', other: '500'};
  const r = calculate(i);
  assert.ok(r.ok);
  assert.equal(formatMoney(r.lrd.expenseCents, 'LRD'), 'L$5,000');
  assert.equal(formatMoney(r.lrd.revenueCents, 'LRD'), 'L$8,000');
  assert.equal(formatMoney(r.lrd.profitCents, 'LRD'), 'L$3,000');
  assert.equal(r.lrd.outcome, 'profit');
});
test('calculator: loss, break-even and negative formatting', () => {
  const loss = input({quantity: '1', price: {LRD: '100', USD: ''}}); loss.expenses.LRD.seed = '350';
  const r = calculate(loss);
  assert.equal(r.lrd.outcome, 'loss'); assert.equal(formatMoney(r.lrd.profitCents, 'LRD'), '-L$250');
  const even = input({quantity: '2', price: {LRD: '50', USD: ''}}); even.expenses.LRD.other = '100';
  assert.equal(calculate(even).lrd.outcome, 'break-even');
});
test('calculator: exact decimal arithmetic (no floating point drift)', () => {
  const i = input({quantity: '3', price: {LRD: '0.10', USD: ''}});
  assert.equal(calculate(i).lrd.revenueCents, 30n);
  const j = input({quantity: '0.1', price: {LRD: '0.2', USD: ''}}); // 0.1 * 0.2 = 0.02
  assert.equal(calculate(j).lrd.revenueCents, 2n);
  const k = input({}); k.expenses.LRD = {seed: '0.1', fertilizer: '0.2', labour: '', transport: '', other: ''};
  assert.equal(calculate(k).lrd.expenseCents, 30n);
});
test('calculator: LRD and USD are never converted, summed or mixed', () => {
  const i = input({quantity: '10', price: {LRD: '200', USD: '2'}});
  i.expenses.LRD.seed = '1000'; i.expenses.USD.seed = '5';
  const both = calculate(i);
  assert.equal(formatMoney(both.lrd.profitCents, 'LRD'), 'L$1,000');
  assert.equal(formatMoney(both.usd.profitCents, 'USD'), 'US$15');
  const lrdOnly = input({quantity: '10', price: {LRD: '200', USD: ''}}); lrdOnly.expenses.LRD.seed = '1000';
  assert.deepEqual(calculate(lrdOnly).lrd, both.lrd, 'USD entries changed the LRD result');
  assert.equal(calculate(lrdOnly).usd.entered, false);
  const usdOnly = input({}); usdOnly.expenses.USD.seed = '5';
  assert.equal(calculate(usdOnly).lrd.entered, false);
});
test('calculator: invalid input is rejected with a message, never silently accepted', () => {
  for (const bad of ['abc', '-5', '1e5', '5,00,0x', '12.345', '1 000', '99999999999999999999', '2000000000']) {
    const i = input(); i.expenses.LRD.seed = bad;
    const r = calculate(i);
    assert.equal(r.ok, false, `accepted "${bad}"`); assert.ok(r.errors['LRD.seed'], bad);
  }
  const noQty = input({price: {LRD: '100', USD: ''}});
  assert.ok(calculate(noQty).errors['LRD.price']);
  assert.ok(calculate(input()).errors.form, 'empty form should ask for input');
  assert.equal(typeof parseHundredths('5,000', 1e9), 'bigint');
  assert.equal(parseHundredths('  ', 1e9), null);
});
test('calculator: a stored value of a huge magnitude cannot overflow (BigInt)', () => {
  const i = input({quantity: '1000000', price: {LRD: '1000000000', USD: ''}});
  assert.equal(calculate(i).lrd.revenueCents, 100_000_000_000_000_000n); // 1,000,000 x 1,000,000,000 = 1e15 dollars = 1e17 cents
});
test('calculator: local saving round trip, ordering, delete, cap and untrusted stored data', async () => {
  const kv = memoryKv();
  const a = input({quantity: '4', price: {LRD: '10', USD: ''}});
  await saveCalc('First', a, new Date('2026-01-01T00:00:00Z'), kv);
  const two = await saveCalc('  Second  ', a, new Date('2026-01-02T00:00:00Z'), kv);
  assert.deepEqual(two.map((x) => x.name), ['Second', 'First']);
  assert.deepEqual((await listSavedCalcs(kv))[1].input, a);
  assert.equal((await deleteCalc(two[0].id, kv)).length, 1);
  for (let n = 0; n < MAX_CALC_SAVED + 5; n++) await saveCalc(`n${n}`, a, new Date(2026, 0, 3 + n), kv);
  assert.equal((await listSavedCalcs(kv)).length, MAX_CALC_SAVED);
  await kv.set(CALC_KEY, [{id: 'x', name: 5, input: {expenses: {LRD: {seed: {evil: 1}}}, quantity: 7}}, null, 'junk']);
  const cleaned = await listSavedCalcs(kv);
  assert.equal(cleaned.length, 1); assert.equal(cleaned[0].input.expenses.LRD.seed, ''); assert.equal(cleaned[0].input.quantity, '');
  assert.equal(await saveCalc('', a, new Date(), memoryKv()).then((l) => l[0].name), 'My farm calculation');
});

// ------------------------------------------------------------ crop problems
test('crop problems: yellow patchy curled leaves -> mosaic listed first, never empty for a valid sign', () => {
  const m = matchCauses(['yellow-patchy-curled']);
  assert.equal(m[0].cause.id, 'mosaic');
  assert.ok(m.length >= 2);
  for (const s of CASSAVA_SYMPTOMS) assert.ok(matchCauses([s.id]).length > 0, `no possible cause for "${s.id}"`);
});
test('crop problems: more matching signs rank higher; unknown ids ignored; nothing chosen -> nothing listed', () => {
  const m = matchCauses(['yellow-patchy-curled', 'tiny-white-insects']);
  assert.equal(m[0].matched, 2);
  assert.deepEqual(matchCauses(['not-a-sign']), []);
  assert.deepEqual(matchCauses([]), []);
  assert.equal(buildSavedGuidance('Bong', []), null);
  assert.deepEqual(matchCauses(['yellow-patchy-curled', 'not-a-sign']).map((x) => x.cause.id), matchCauses(['yellow-patchy-curled']).map((x) => x.cause.id));
});
test('crop problems: content is Team 8 DRAFT, never claims review without a named reviewer and date', () => {
  assert.equal(CASSAVA_REVIEW.status, 'team_draft');
  assert.equal(CASSAVA_REVIEW.reviewedBy, null);
  assert.equal(CASSAVA_REVIEW.reviewedOn, null);
  const g = buildSavedGuidance('Bong', ['yellow-patchy-curled'])!;
  assert.equal(g.review.status, 'team_draft');
  assert.equal(g.notice, NOT_A_DIAGNOSIS_NOTICE);
  assert.match(NOT_A_DIAGNOSIS_NOTICE, /NOT a confirmed diagnosis/);
});
test('crop problems: safety lint - no doses, quantities of chemicals, product names, mixing or diagnosis claims', () => {
  const texts: string[] = [NOT_A_DIAGNOSIS_NOTICE, NONE_OF_THESE_ADVICE, ...GENERAL_GUIDANCE];
  for (const s of CASSAVA_SYMPTOMS) texts.push(s.label, s.hint);
  for (const c of CASSAVA_CAUSES) texts.push(c.name, c.whyItMayMatch, c.askExpertWhen, ...c.checks, ...c.firstResponse);
  const banned: [RegExp, string][] = [
    [/\b\d+(\.\d+)?\s?(ml|mg|g|kg|l|litres?|liters?|tablespoons?|teaspoons?|cups?|grams?|ppm|%)\b/i, 'dose or quantity'],
    [/\b(cypermethrin|imidacloprid|dimethoate|glyphosate|mancozeb|paraquat|carbaryl|malathion|lambda|chlorpyrifos|permethrin|neem|bleach|kerosene|diesel)\b/i, 'product or hazardous substance'],
    [/\b(mix|mixture|mixing|tank|dilute|dosage|dose|spray(ing)? with)\b/i, 'mixing or dosing'],
    [/\b(you have|is definitely|certainly|confirmed (as|to be)|diagnosed|it is cassava)\b/i, 'definitive claim'],
  ];
  for (const t of texts) {
    for (const [re, why] of banned) {
      // the notice and the general advice are allowed to SAY "do not mix or spray chemicals" and "NOT a confirmed diagnosis"
      const allowed = t === NOT_A_DIAGNOSIS_NOTICE || GENERAL_GUIDANCE.includes(t);
      if (allowed) continue;
      assert.ok(!re.test(t), `${why}: "${t}"`);
    }
  }
  assert.ok(GENERAL_GUIDANCE.some((t) => /do not mix or spray chemicals/i.test(t)));
  assert.ok(!/ml\b|\bkg\b/.test(GENERAL_GUIDANCE.join(' ')));
});
test('crop problems: every cause has checks, a first response and an expert referral; ids unique; symptoms referenced exist', () => {
  const ids = new Set<string>();
  for (const c of CASSAVA_CAUSES) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(c.checks.length >= 2 && c.firstResponse.length >= 2 && c.askExpertWhen.length > 10 && c.whyItMayMatch.length > 20, c.id);
    for (const m of c.matches) assert.ok(CASSAVA_SYMPTOMS.some((s) => s.id === m), `${c.id} references unknown symptom ${m}`);
    assert.ok(/^(Cassava|Whitefly|Mealybug|Natural|Waterlogging|Leaf)/.test(c.name));
  }
});
test('crop problems: offline save and retrieve (new reader on the same store), newest first, dedupe, cap, delete', async () => {
  const kv = memoryKv();
  const a = buildSavedGuidance('Bong', ['yellow-patchy-curled'], new Date('2026-02-01T08:00:00Z'), 'a')!;
  const b = buildSavedGuidance('Nimba', ['wilting-wet-field', 'roots-soft-smelly'], new Date('2026-02-02T08:00:00Z'), 'b')!;
  await saveGuidance(a, kv); await saveGuidance(b, kv);
  const back = await listSavedGuidance(kv); // a fresh read, as after an app restart with no network
  assert.deepEqual(back.map((x) => x.id), ['b', 'a']);
  assert.deepEqual(back[1], a, 'saved copy differs from the original');
  assert.ok(back[1].causes[0].firstResponse.length > 0 && back[1].notice === NOT_A_DIAGNOSIS_NOTICE, 'saved copy must carry the full text and the notice');
  await saveGuidance({...a, savedAt: '2026-03-01T00:00:00Z'}, kv);
  assert.equal((await listSavedGuidance(kv)).length, 2, 'same id must replace, not duplicate');
  for (let n = 0; n < MAX_SAVED + 5; n++) await saveGuidance(buildSavedGuidance('Bong', ['yellow-lower-leaves'], new Date(2026, 3, 1 + n), `x${n}`)!, kv);
  assert.equal((await listSavedGuidance(kv)).length, MAX_SAVED);
  assert.equal((await deleteSavedGuidance('x3', kv)).some((x) => x.id === 'x3'), false);
  await kv.set('h1.cropProblem.saved', [{id: 1}, null, {id: 'ok', causes: []}]);
  assert.equal((await listSavedGuidance(kv)).length, 1, 'corrupt rows must be ignored');
});
test('crop problems: the Ask-an-Expert prefill is valid for the existing form and claims no diagnosis', () => {
  const g = buildSavedGuidance('Bong', ['yellow-patchy-curled'])!;
  const p = buildExpertPrefill('Bong', g.symptomLabels, g.causes.map((c) => c.name));
  assert.ok(KNOWLEDGE_CATEGORIES.some((c) => c.name === EXPERT_CATEGORY), 'category must exist in the existing form');
  assert.equal(validateQuestion({farmerName: 'x', category: p.category, county: p.county, title: p.title, description: p.desc, photoDataUrl: '', voiceNoteDataUrl: '', voiceNoteSummary: ''}), null);
  assert.match(p.desc, /POSSIBLE causes \(not confirmed\)/);
  assert.ok(!/diagnos/i.test(p.desc));
  const url = new URL('http://x' + expertLink(p));
  assert.equal(url.pathname, '/experts');
  assert.equal(url.searchParams.get('title'), p.title); assert.equal(url.searchParams.get('county'), 'Bong'); assert.equal(url.searchParams.get('desc'), p.desc);
  assert.ok(buildExpertPrefill('Lofa', [], []).desc.length >= 10);
});

// ------------------------------------------------------------ navigation, labels, demo
test('navigation: four groups with the approved names; every link is a real route; future items are not links', () => {
  assert.deepEqual(NAV_GROUPS.map((g) => g.title), ['Get Advice', 'Ask an Expert', 'Learn Farming', 'Farm Tools']);
  for (const g of NAV_GROUPS) for (const it of g.items) {
    assert.ok(it.kinds.length > 0, `${it.label} has no status label`);
    if (it.kinds.includes('future')) assert.equal(it.to, undefined, `${it.label} is future but links somewhere`);
    else { assert.ok(it.to, `${it.label} has no link`); assert.ok(routes.has(it.to!.split('?')[0]), `${it.to} is not a route in App.tsx`); }
  }
  assert.ok(routes.has('/advice/crop-problems') && routes.has('/tools/calculator') && routes.has('/demo/cassava'));
});
test('labels: the four kinds exist with distinct, plain wording; simulated and draft say so', () => {
  assert.deepEqual([...STATUS_KINDS].sort(), ['draft', 'future', 'simulated', 'working']);
  assert.equal(new Set(STATUS_KINDS.map((k) => STATUS_LABELS[k].short)).size, 4);
  assert.match(STATUS_LABELS.draft.long, /NOT yet reviewed/);
  assert.match(STATUS_LABELS.simulated.long, /not live and not real/);
});
test('demo: eleven steps, links are routes, the expert reply is labelled simulated, draft advice is labelled draft', () => {
  assert.equal(DEMO_STEPS.length, 11);
  assert.deepEqual(DEMO_STEPS.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const s of DEMO_STEPS) if (s.to) assert.ok(routes.has(s.to.split('?')[0]), `${s.to} is not a route`);
  assert.ok(DEMO_STEPS[8].kinds.includes('simulated'));
  assert.ok(DEMO_STEPS[3].kinds.includes('draft'));
});

// ------------------------------------------------------------ H1.1: offline-downloads inventory
test('inventory: saved crop advice and calculations are counted, sized and dated; empty is zero', async () => {
  const kv = memoryKv();
  const empty = summariseSavedWork([], []);
  assert.deepEqual([empty.advice.items.length, empty.advice.bytes, empty.advice.newestSavedAt, empty.calculations.bytes], [0, 0, null, 0]);
  const a = buildSavedGuidance('Bong', ['yellow-patchy-curled'], new Date('2026-02-01T08:00:00Z'), 'a')!;
  const b = buildSavedGuidance('Nimba', ['yellow-lower-leaves'], new Date('2026-02-03T08:00:00Z'), 'b')!;
  await saveGuidance(a, kv); await saveGuidance(b, kv);
  await saveCalc('Cassava', input({quantity: '2', price: {LRD: '10', USD: ''}}), new Date('2026-02-02T00:00:00Z'), kv);
  const sum = summariseSavedWork(await listSavedGuidance(kv), await listSavedCalcs(kv));
  assert.equal(sum.advice.items.length, 2);
  assert.equal(sum.advice.newestSavedAt, '2026-02-03T08:00:00.000Z');
  assert.equal(sum.advice.bytes, Buffer.byteLength(JSON.stringify(sum.advice.items)));
  assert.equal(sum.calculations.items.length, 1);
  assert.ok(sum.calculations.bytes > 0);
  await deleteSavedGuidance('a', kv);
  assert.equal(summariseSavedWork(await listSavedGuidance(kv), []).advice.items.length, 1, 'removal must be reflected in the inventory');
});
