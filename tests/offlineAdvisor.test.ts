import assert from 'node:assert/strict';
import test from 'node:test';
import {getCatalog} from '../src/lib/offlineLibrary.ts';
import {editDistance, searchGuides, stem, type CorpusDoc} from '../src/lib/offlineAdvisor.ts';

const corpus: CorpusDoc[] = getCatalog().map((e) => ({
  id: e.id,
  kind: 'library',
  module: e.module,
  title: e.title,
  subtitle: e.subtitle,
  summary: e.summary,
  units: e.sections.flatMap((s) => s.items.map((text) => ({heading: s.heading, text}))),
  safetyNotice: e.safetyNotice,
  lastUpdated: e.lastUpdated,
  to: `/offline/read/${e.id}`,
  isSample: false,
}));

const top = (q: string) => searchGuides(q, corpus);

test('helpers: stemming and spelling distance', () => {
  assert.equal(stem('chickens'), stem('chicken'));
  assert.equal(stem('diseases'), stem('disease'));
  assert.equal(editDistance('casava', 'cassava'), 1);
  assert.equal(editDistance('tilapea', 'tilapia'), 1);
});

const cases: [string, string, string][] = [
  ['crops', 'How do I plant rice in the swamp?', 'crop:rice'],
  ['crops', 'when should I harvest cassava', 'crop:cassava'],
  ['soil', 'how do I improve poor soil', 'problem:prob-poor-soil'],
  ['pests', 'how do I prevent pests and diseases', 'problem:prob-pests-diseases'],
  ['livestock', 'how do I keep my goats healthy', 'livestock:goats'],
  ['livestock', 'dry bedding for chickens', 'livestock:poultry'],
  ['fish', 'my fish are gasping at the surface of the pond', 'kc:art-7a'],
  ['knowledge', 'how can I get a farm loan', ''],
  ['spelling', 'casava planting', 'crop:cassava'],
  ['spelling', 'tilapea pond water', 'kc:art-7a'],
];

for (const [group, q, expected] of cases) {
  test(`finds guidance (${group}): ${q}`, () => {
    const a = top(q);
    assert.notEqual(a.confidence, 'none', `no result for: ${q}`);
    if (expected) assert.ok(a.sources.some((s) => s.id === expected), `${q} -> ${a.sources.map((s) => s.id).join(', ')}`);
    for (const s of a.sources) {
      assert.ok(s.excerpts.length > 0);
      assert.ok(s.title.length > 0 && s.to.startsWith('/'));
    }
  });
}

test('excerpts are copied word-for-word from the guide (nothing generated)', () => {
  const a = top('how do I plant rice in the swamp');
  const rice = corpus.find((d) => d.id === 'crop:rice')!;
  const allText = new Set([rice.summary, ...rice.units.map((u) => u.text)]);
  for (const ex of a.sources.find((s) => s.id === 'crop:rice')!.excerpts) assert.ok(allText.has(ex.text), ex.text);
});

test('safety notice of the source guide is attached', () => {
  const a = top('how do I plant rice');
  const rice = a.sources.find((s) => s.id === 'crop:rice')!;
  assert.ok(rice.safetyNotice.length > 10);
});

for (const q of ['how do I repair a car engine', 'who won the football match', 'bitcoin trading strategy', 'asdfgh qwerty']) {
  test(`no reliable guidance for: ${q}`, () => {
    const a = top(q);
    assert.equal(a.confidence, 'none');
    assert.equal(a.sources.length, 0);
  });
}

test('empty corpus is reported as empty, not as "no match"', () => {
  assert.equal(searchGuides('rice', []).confidence, 'empty');
});

test('dose, weather and price questions get warnings and never invented numbers', () => {
  assert.ok(top('how much pesticide per liter for cassava pests').notes.some((n) => /doses|medicines/i.test(n)));
  assert.ok(top('will it rain tomorrow').notes.some((n) => /forecast/i.test(n)));
  assert.equal(top('will it rain tomorrow').sources.length === 0 || top('will it rain tomorrow').confidence !== 'good', true);
  assert.ok(top('current market price of rice').notes.some((n) => /prices/i.test(n)));
});

test('deterministic: same question gives identical results', () => {
  assert.deepEqual(top('goat housing and feeding'), top('goat housing and feeding'));
});

test('a one-word question is never reported as a reliable (good) answer', () => {
  assert.notEqual(top('how to get rich').confidence, 'good');
  assert.notEqual(top('loan').confidence, 'good');
});

test('ranking prefers the guide about the animal named in the question', () => {
  assert.equal(top('pigs sick what to do').sources[0].id, 'livestock:pigs');
  assert.equal(top('my cassava leaves are turning yellow').sources[0].id, 'crop:cassava');
});
