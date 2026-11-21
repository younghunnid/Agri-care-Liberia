import assert from 'node:assert/strict';
import test from 'node:test';
import {newSession, press, view, MAIN_ITEMS, SCREEN_MAX, type Key, type UssdEnv} from '../src/lib/ussd/engine.ts';
import {ussdWeatherLines, type UssdWeather} from '../src/lib/weather/ussd.ts';
import {speechSegments} from '../src/lib/ussd/screenVoice.ts';

const day = (date: string, condition: string, tMaxC: number, tMinC: number, rainMm: number, rainChancePct: number | null) => ({date, condition, tMaxC, tMinC, rainMm, rainChancePct});
const DAYS = [day('2026-11-21', 'Light rain', 30, 22, 6.4, 70), day('2026-11-22', 'Heavy rain showers', 28, 21, 22, 90), day('2026-11-23', 'Partly cloudy', 31, 22, 0, null)];
const W = (over: Partial<UssdWeather> = {}): UssdWeather => ({state: 'live', place: 'Gbarnga', fetchedAt: '2026-11-21T13:55:00Z', nowC: 29.4, nowCondition: 'Overcast', days: DAYS, ...over});
const env = (weather?: UssdWeather): UssdEnv => ({online: true, now: new Date('2026-11-21T14:00:00Z'), market: {source: 'none', asOf: null, listings: []}, weather});
const open = (e: UssdEnv, ...keys: string[]) => { let s = press(newSession(), 'send', e, 1); let t = 2; for (const k of keys) { s = press(s, k as Key, e, t++); s = press(s, 'send', e, t++); } return view(s, e, t); };

test('the weather option is appended as 9: the original eight keep their numbers and still open', () => {
  assert.deepEqual([...MAIN_ITEMS], ['Crops & planting', 'Pests & disease', 'Buy & Sell Produce', 'Harvest & storage', 'Expert help', 'Language', 'Help & exit', 'Sell & market', 'Weather']);
  const main = open(env(W())); assert.equal(main.text, ['FARM ADVICE (DEMO)', ...MAIN_ITEMS.map((m, i) => `${i + 1} ${m}`)].join('\n')); assert.ok(main.text.length <= SCREEN_MAX);
  const lands: [string, RegExp][] = [['1', /^Crops & planting/], ['2', /^Pests & disease/], ['3', /^Buy & Sell Produce/], ['4', /^Harvest & storage/], ['5', /^Expert help/], ['6', /^Language/], ['7', /^Help & exit/], ['8', /^Sell & market/], ['9', /^Weather: Gbarnga/]];
  for (const [d, re] of lands) assert.match(open(env(W()), d).text, re, `option ${d}`);
});

test('weather screens say exactly what they are: live, last copy, saved (old), nothing; every screen fits 182 characters and numbers are never invented', () => {
  const live = open(env(W()), '9').text; assert.match(live, /^Weather: Gbarnga/); assert.match(live, /LIVE forecast/); assert.match(live, /Now 29C, Overcast/); assert.match(live, /Today: Light rain, 22-30C, rain 6mm, 70%/);
  const saved = open(env(W({state: 'saved', fetchedAt: '2026-11-21T08:00:00Z'})), '9').text; assert.match(saved, /SAVED copy from 6 hours ago\. May be old, not live/); assert.ok(!/LIVE forecast/.test(saved)); assert.ok(!/Now \d/.test(saved), 'no "now" reading from a saved copy');
  const down = open(env(W({state: 'provider-down', fetchedAt: '2026-11-21T10:00:00Z'})), '9').text; assert.match(down, /NOT LIVE/); assert.match(down, /4 hours ago/);
  for (const w of [W({state: 'none', fetchedAt: null, days: [], nowC: null}), W({state: 'loading'}), undefined]) { const t = open(env(w as UssdWeather | undefined), '9').text; assert.ok(!/\d+C\b|\d+mm/.test(t), `no numbers when there is no forecast: ${t}`); }
  assert.match(open(env(W({state: 'none', fetchedAt: null, days: []})), '9').text, /No forecast on this phone yet/);
  for (const w of [W(), W({state: 'saved'}), W({state: 'provider-down'}), W({state: 'none', days: [], fetchedAt: null}), W({state: 'loading'}), W({place: 'Grand Cape Mount'})]) { let s = press(press(press(newSession(), 'send', env(w), 1), '9', env(w), 2), 'send', env(w), 3); for (let i = 0; i < 4; i++) { const v = view(s, env(w), 5); assert.ok(!v.truncated && v.text.length <= SCREEN_MAX, v.text); assert.ok(!/undefined|NaN|null/.test(v.text)); if (!/\n1 Next\n/.test(v.text)) break; s = press(press(s, '1', env(w), 6), 'send', env(w), 7); } }
  const b = open(env(W()), '9', '0'); assert.match(b.text, /^FARM ADVICE/, 'Back returns to the main menu'); assert.match(open(env(W()), '9', '00').text, /^FARM ADVICE/);
});

test('weather lines are short and cautious, and the voice reads them with the usual menu wording', () => {
  const lines = ussdWeatherLines(W(), Date.parse('2026-11-21T14:00:00Z')); assert.ok(lines.every((l) => l.length <= 70)); assert.match(lines.at(-1)!, /can be wrong/); assert.match(lines.at(-1)!, /Open-Meteo/);
  const spoken = speechSegments(open(env(W()), '9').text).map((s) => s.text).join(' '); assert.match(spoken, /Weather: Gbarnga/); assert.match(spoken, /Press zero to go back/);
  assert.ok(!/guarantee|will rain|approved/i.test(lines.join(' ')));
});
