import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {LESSONS, LESSON_REVIEW, PASS_FRACTION, getLesson} from '../src/data/lessons.ts';
import {PROGRESS_KEY, loadProgress, markRead, recordAttempt, resetProgress, sanitizeProgress, scoreQuiz, stateOf, summarise} from '../src/lib/lessonProgress.ts';
import {memoryKv} from '../src/lib/kvStore.ts';
import {SIMULATED_REPLY_NOTICE, SIMULATED_REPLY_SHORT, STEP_LABELS, describeStatus} from '../src/lib/expertStatus.ts';
import {NAV_GROUPS} from '../src/data/navGroups.ts';
import {DEMO_STEPS} from '../src/pages/public/CassavaDemoPage.tsx';

const appSrc = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routes = new Set([...appSrc.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
const words = (t: string) => t.trim().split(/\s+/).length;

// ------------------------------------------------------------ lesson content
test('lessons: exactly the five approved topics, unique ids, review status is Team 8 draft', () => {
  assert.deepEqual(LESSONS.map((l) => l.id), ['cassava-basics', 'rice-basics', 'soil-health', 'safe-pest-prevention', 'harvest-storage']);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, 5);
  assert.equal(LESSON_REVIEW.status, 'team_draft');
  for (const l of LESSONS) {
    assert.equal(l.review.status, 'team_draft', l.id);
    assert.equal(l.review.reviewedBy, null); assert.equal(l.review.reviewedOn, null);
    assert.ok(l.sections.length >= 3 && l.sections.every((s) => s.heading && s.points.length >= 2), l.id);
    assert.ok(l.keyMessage.length > 15 && l.intro.length > 20 && l.minutes >= 3 && l.minutes <= 10, l.id);
  }
  assert.equal(getLesson('nope'), undefined); assert.equal(getLesson(undefined), undefined);
});
test('lessons: three to five well-formed multiple-choice questions each', () => {
  for (const l of LESSONS) {
    assert.ok(l.quiz.length >= 3 && l.quiz.length <= 5, `${l.id} has ${l.quiz.length} questions`);
    const ids = new Set<string>();
    for (const q of l.quiz) {
      assert.ok(!ids.has(q.id)); ids.add(q.id);
      assert.ok(q.options.length >= 3 && q.options.length <= 4, q.id);
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} has duplicate options`);
      assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length, q.id);
      assert.ok(q.explanation.length > 20, `${q.id} needs an explanation`);
    }
    const positions = new Set(l.quiz.map((q) => q.correct));
    assert.ok(positions.size >= 2, `${l.id}: the right answer is always in the same position`);
  }
});
test('lessons: simple English (short sentences)', () => {
  for (const l of LESSONS) {
    for (const s of l.sections) for (const p of s.points) assert.ok(words(p) <= 24, `${l.id}: too long (${words(p)} words): ${p}`);
    for (const q of l.quiz) { assert.ok(words(q.question) <= 20, q.id); assert.ok(words(q.explanation) <= 32, q.id); for (const o of q.options) assert.ok(words(o) <= 14, `${q.id}: ${o}`); }
    assert.ok(words(l.intro) <= 35 && words(l.keyMessage) <= 25, l.id);
  }
});
test('lessons: safety lint, no chemical names, doses, amounts, mixing instructions or treatment/cure claims', () => {
  const texts: string[] = [];
  for (const l of LESSONS) { texts.push(l.title, l.subtitle, l.intro, l.keyMessage); for (const s of l.sections) texts.push(s.heading, ...s.points); for (const q of l.quiz) texts.push(q.question, ...q.options, q.explanation); }
  const doseOrQuantity = /\b\d+(\.\d+)?\s?(ml|mg|g|kg|l|litres?|liters?|tablespoons?|teaspoons?|cups?|grams?|ppm|%)\b/i;
  const products = /\b(cypermethrin|imidacloprid|dimethoate|glyphosate|mancozeb|paraquat|carbaryl|malathion|lambda|chlorpyrifos|permethrin|neem|bleach|kerosene|diesel|urea|npk|ddt|insecticide|fungicide|herbicide)\b/i;
  const claims = /\b(cures?|kills?|guaranteed|proven|100 ?%|always works|will stop|treatment|treats)\b/i;
  const mixing = /\b(mix|mixing|mixture|dilute|dosage|dose|tank|spray(ing)? with)\b/i;
  const allowMix = (t: string) => /extension officer/i.test(t) || ['Mix two products to make it stronger', 'Mix them back in with the good ones'].includes(t);
  for (const t of texts) {
    assert.ok(!doseOrQuantity.test(t), `quantity: ${t}`);
    assert.ok(!products.test(t), `product: ${t}`);
    assert.ok(!claims.test(t), `claim: ${t}`);
    if (mixing.test(t)) assert.ok(allowMix(t), `mixing words without a referral: ${t}`);
  }
  const all = texts.join(' ');
  assert.match(all, /extension officer/i);
  assert.ok(LESSONS.find((l) => l.id === 'safe-pest-prevention')!.sections.some((s) => s.points.some((p) => /does not give chemical amounts/i.test(p))));
});
test('lessons: facts agree with the app\'s own library wording (spot checks)', () => {
  const lib = fs.readFileSync(new URL('../src/data/cropsLibrary.ts', import.meta.url), 'utf8');
  for (const must of ['20–25 cm planting stakes', 'at least 25 cm high', '9 to 12 months', '2–3 days', '21-day-old seedlings at 20 cm × 20 cm']) assert.ok(lib.includes(must), `library no longer says "${must}"`);
  const cassava = getLesson('cassava-basics')!; const rice = getLesson('rice-basics')!;
  const body = (l: typeof cassava) => l.sections.flatMap((s) => s.points).join(' ');
  assert.match(body(cassava), /20 to 25 cm/); assert.match(body(cassava), /at least 25 cm high/); assert.match(body(cassava), /9 to 12 months/); assert.match(body(cassava), /2 to 3 days/);
  assert.match(body(rice), /21-day-old/); assert.match(body(rice), /20 cm apart/); assert.match(body(rice), /3 weeks/); assert.match(body(rice), /7 to 8 weeks/);
});

// ------------------------------------------------------------ scoring
test('scoring: all right passes, all wrong fails, unanswered and invalid answers count as wrong', () => {
  const l = getLesson('rice-basics')!;
  const right = l.quiz.map((q) => q.correct);
  const all = scoreQuiz(l, right);
  assert.equal(all.score, 5); assert.equal(all.percent, 100); assert.ok(all.passed);
  assert.ok(all.results.every((r) => r.correct && r.chosenText === r.correctText));
  const wrong = scoreQuiz(l, l.quiz.map((q) => (q.correct + 1) % q.options.length));
  assert.equal(wrong.score, 0); assert.ok(!wrong.passed);
  const odd = scoreQuiz(l, [null, undefined, -1, 99, 1.5] as never);
  assert.equal(odd.score, 0); assert.ok(odd.results.every((r) => r.chosen === null && r.chosenText === null));
  assert.equal(scoreQuiz(l, []).score, 0);
});
test('scoring: pass mark is 60 percent (3 of 5 passes, 2 of 5 fails; 3 of 4 passes, 2 of 4 fails)', () => {
  assert.equal(PASS_FRACTION, 0.6);
  const five = getLesson('rice-basics')!; const four = getLesson('cassava-basics')!;
  const part = (l: typeof five, n: number) => l.quiz.map((q, i) => (i < n ? q.correct : (q.correct + 1) % q.options.length));
  assert.ok(scoreQuiz(five, part(five, 3)).passed); assert.ok(!scoreQuiz(five, part(five, 2)).passed);
  assert.ok(scoreQuiz(four, part(four, 3)).passed); assert.ok(!scoreQuiz(four, part(four, 2)).passed);
  const r = scoreQuiz(four, part(four, 3));
  assert.deepEqual(r.results.map((x) => x.correct), [true, true, true, false]);
  assert.ok(r.results.every((x) => x.explanation.length > 0), 'every result carries its explanation');
});

// ------------------------------------------------------------ progress persistence
test('progress: saved, read back by a new reader (offline restart), best score kept, attempts counted', async () => {
  const kv = memoryKv();
  const l = getLesson('cassava-basics')!;
  assert.deepEqual(await loadProgress(kv), {});
  await markRead(l.id, new Date('2026-03-01T08:00:00Z'), kv);
  const fail = l.quiz.map((q) => (q.correct + 1) % q.options.length);
  const good = l.quiz.map((q) => q.correct);
  await recordAttempt(l, scoreQuiz(l, fail), fail, new Date('2026-03-01T08:05:00Z'), kv);
  let p = (await loadProgress(kv))[l.id];
  assert.equal(stateOf(p), 'in_progress'); assert.equal(p.bestScore, 0); assert.equal(p.attempts, 1);
  await recordAttempt(l, scoreQuiz(l, good), good, new Date('2026-03-01T08:10:00Z'), kv);
  await recordAttempt(l, scoreQuiz(l, fail), fail, new Date('2026-03-01T08:15:00Z'), kv);
  p = (await loadProgress(kv))[l.id]; // fresh read
  assert.equal(p.bestScore, 4, 'a worse later attempt must not lower the best score'); assert.equal(p.lastScore, 0); assert.equal(p.attempts, 3);
  assert.equal(p.readAt, '2026-03-01T08:00:00.000Z'); assert.equal(stateOf(p), 'completed'); assert.deepEqual(p.lastAnswers, fail);
  await markRead(l.id, new Date('2027-01-01T00:00:00Z'), kv);
  assert.equal((await loadProgress(kv))[l.id].readAt, '2026-03-01T08:00:00.000Z', 'reading again must keep the first read time');
});
test('progress: states and summary across lessons; reset clears everything', async () => {
  const kv = memoryKv();
  assert.deepEqual(summarise({}), {completed: 0, inProgress: 0, total: 5});
  await markRead('rice-basics', new Date(), kv);
  const soil = getLesson('soil-health')!; const good = soil.quiz.map((q) => q.correct);
  await recordAttempt(soil, scoreQuiz(soil, good), good, new Date(), kv);
  const map = await loadProgress(kv);
  assert.deepEqual(summarise(map), {completed: 1, inProgress: 1, total: 5});
  assert.equal(stateOf(map['cassava-basics']), 'not_started');
  assert.deepEqual(await resetProgress(kv), {}); assert.deepEqual(await loadProgress(kv), {});
});
test('progress: unknown lesson ids are ignored on write', async () => {
  const kv = memoryKv();
  await markRead('made-up-lesson', new Date(), kv);
  assert.deepEqual(await loadProgress(kv), {});
});
test('progress: corrupt or hostile stored data is sanitised, never trusted', async () => {
  const kv = memoryKv();
  await kv.set(PROGRESS_KEY, {
    'cassava-basics': {readAt: 'not a date', attempts: -4, bestScore: 999, lastScore: 'x', total: 99, lastAttemptAt: {evil: 1}, lastAnswers: [9, -1, 'a', 1.5, 2]},
    'rice-basics': {readAt: '2026-01-01T00:00:00Z', attempts: 2, bestScore: 5, lastScore: 3, total: 1, lastAnswers: [0, 0, 0, 0, 0]},
    'ghost-lesson': {attempts: 3}, 'soil-health': 'junk', 'harvest-storage': null,
  });
  const map = await loadProgress(kv);
  assert.deepEqual(Object.keys(map).sort(), ['cassava-basics', 'rice-basics']);
  const c = map['cassava-basics'];
  assert.equal(c.readAt, null); assert.equal(c.attempts, 0); assert.equal(c.bestScore, 0); assert.equal(c.total, 0); assert.equal(c.lastAttemptAt, null);
  assert.deepEqual(c.lastAnswers, [null, null, null, null]);
  const r = map['rice-basics'];
  assert.equal(r.total, 5, 'total is taken from the lesson, not from stored data'); assert.equal(r.bestScore, 5); assert.equal(r.lastScore, 3);
  assert.equal(stateOf(c), 'not_started');
  for (const junk of [null, undefined, 5, 'str', [], true]) assert.deepEqual(sanitizeProgress(junk), {});
});
test('progress: a completed state needs a real score, not just attempts', () => {
  const p = {lessonId: 'x', readAt: null, attempts: 3, bestScore: 1, lastScore: 1, total: 5, lastAttemptAt: null, lastAnswers: []};
  assert.equal(stateOf(p), 'in_progress');
  assert.equal(stateOf({...p, bestScore: 3}), 'completed');
  assert.equal(stateOf({...p, attempts: 0, total: 0, bestScore: 0}), 'not_started');
});

// ------------------------------------------------------------ expert support wording
test('expert status wording: three server states mapped to plain words; unknown is safe', () => {
  assert.deepEqual([describeStatus('Submitted').step, describeStatus('Assigned').step, describeStatus('Answered').step], [1, 2, 3]);
  assert.equal(describeStatus('Answered').answered, true); assert.equal(describeStatus('Submitted').answered, false);
  assert.match(describeStatus('Submitted').label, /Waiting for an expert/);
  assert.equal(describeStatus('Closed').step, 1); assert.equal(describeStatus(undefined).step, 1); assert.equal(describeStatus(null).answered, false);
  assert.deepEqual([...STEP_LABELS], ['Sent', 'With an expert', 'Answered']);
});
test('expert replies are always labelled simulated and never claim verification', () => {
  assert.match(SIMULATED_REPLY_NOTICE, /Simulated/); assert.match(SIMULATED_REPLY_NOTICE, /not verified advice from a real agricultural expert/);
  assert.match(SIMULATED_REPLY_NOTICE, /chemicals, doses or treatment/); assert.match(SIMULATED_REPLY_SHORT, /not verified/i);
  const page = fs.readFileSync(new URL('../src/pages/public/ExpertSupportPage.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('SIMULATED_REPLY_NOTICE') && page.includes('Simulated demo reply'), 'page must show the notice');
  assert.ok(!/verified (agricultural )?expert reply/i.test(page));
});
test('expert page keeps the tested offline queue wiring (exactly-once path untouched)', () => {
  const page = fs.readFileSync(new URL('../src/pages/public/ExpertSupportPage.tsx', import.meta.url), 'utf8');
  for (const must of ['saveQuestionDraft(data)', "queueRecord('question', rec.localId)", 'syncSoon()', "requesterKey: getRequesterKey()", "apiFetch('/expert-requests/demo'"]) assert.ok(page.includes(must), `missing ${must}`);
});

// ------------------------------------------------------------ navigation
test('navigation: Learn Farming links to the lessons; lesson routes exist; the demo opens a real lesson', () => {
  const learn = NAV_GROUPS.find((g) => g.id === 'learn')!;
  const item = learn.items.find((i) => i.to === '/learn')!;
  assert.ok(item && item.kinds.includes('working') && item.kinds.includes('draft'));
  assert.ok(routes.has('/learn') && routes.has('/learn/:id'));
  const step10 = DEMO_STEPS.find((s) => s.n === 10)!;
  assert.equal(step10.to, '/learn/cassava-basics'); assert.ok(getLesson(step10.to!.split('/').pop()));
  assert.ok(step10.kinds.includes('draft'));
});
