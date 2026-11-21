import assert from 'node:assert/strict';
import test from 'node:test';
import {newSession, press, view, type Key, type Session, type UssdEnv} from '../src/lib/ussd/engine.ts';
import {EMPTY_MARKETPLACE} from '../src/lib/ussd/marketTypes.ts';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const row = {id: 7, code: null as string | null, cropSlug: 'cassava', quantityKg: 120, pricePerKgLrd: 40, county: 'Bong', town: 'Demo Town A', status: 'available'};
const env: UssdEnv = {online: true, now: new Date(NOW), market: {source: 'server', asOf: '2026-11-21T10:00:00Z', listings: []},
  marketplace: {...EMPTY_MARKETPLACE, allowed: true, reason: '', source: 'server', asOf: '2026-11-21T10:00:00Z', listings: [row]}};
const enter = (s: Session, input: string) => { let x = s; for (const d of input) x = press(x, d as Key, env, NOW); return press(x, 'send', env, NOW); };

test('a harvest listing with no server reference never shows the word "null" or "undefined" on any Buy & Sell screen', () => {
  const start = press(newSession(), 'send', env, NOW); const seen = new Set<string>(); const queue: Session[] = [enter(start, '3')]; let confirms = 0, screens = 0;
  while (queue.length && screens < 4000) {
    const s = queue.shift()!; const v = view(s, env, NOW); const key = JSON.stringify(s.frames.at(-1)); if (seen.has(key)) continue; seen.add(key); screens++;
    assert.ok(!/\bnull\b|undefined|NaN/.test(v.text), `bad text: ${v.text}`);
    if (/To listing/.test(v.text)) { confirms++; assert.match(v.text, /To listing without a server reference\./); }  // page 1 of the paginated confirmation
    if (v.expects !== 'option' || s.frames.length > 9) continue;
    for (const d of '123456789') { const n = enter(s, d); if (n.status === 'active' && !n.pending && n !== s) queue.push(n); }
  }
  assert.ok(confirms > 0, 'the inquiry confirmation screen was reached for the listing without a reference');
});
