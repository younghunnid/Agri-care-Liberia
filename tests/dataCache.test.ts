import assert from 'node:assert/strict';
import test from 'node:test';
import {forecastFreshness, formatAge, isCacheableKey, summaryFreshness} from '../src/lib/dataCache.ts';

const T0 = Date.parse('2026-11-18T10:00:00Z');
const iso = (offsetHours: number) => new Date(T0 + offsetHours * 3_600_000).toISOString();

test('only public aggregate keys may be cached', () => {
  assert.ok(isCacheableKey('ministry:summary'));
  assert.ok(isCacheableKey('weather:Bong'));
  assert.ok(isCacheableKey('weather:Grand Bassa'));
  for (const bad of ['admin:overview', '/admin/users', 'auth:me', 'farmer:questions', 'weather:', 'ministry:summary/../admin', 'session', 'expert:questions:5']) {
    assert.equal(isCacheableKey(bad), false, bad);
  }
});

test('forecast freshness without validUntil: fresh, stale after 3h, expired after 6h', () => {
  const fetched = {fetchedAt: iso(0)};
  assert.equal(forecastFreshness(fetched, T0 + 3_600_000), 'fresh');
  assert.equal(forecastFreshness(fetched, T0 + 4 * 3_600_000), 'stale');
  assert.equal(forecastFreshness(fetched, T0 + 7 * 3_600_000), 'expired');
});

test('forecast validUntil decides expiry even if recently fetched', () => {
  assert.equal(forecastFreshness({fetchedAt: iso(0), validUntil: iso(2)}, T0 + 3 * 3_600_000), 'expired');
  assert.equal(forecastFreshness({fetchedAt: iso(0), validUntil: iso(12)}, T0 + 1 * 3_600_000), 'fresh');
});

test('unreadable dates are never treated as current', () => {
  assert.equal(forecastFreshness({fetchedAt: 'garbage'}, T0), 'expired');
  assert.equal(forecastFreshness({fetchedAt: iso(0), validUntil: 'garbage'}, T0), 'expired');
  assert.equal(summaryFreshness({fetchedAt: 'garbage'}, T0), 'stale');
});

test('summary becomes stale after 24h', () => {
  assert.equal(summaryFreshness({fetchedAt: iso(0)}, T0 + 23 * 3_600_000), 'fresh');
  assert.equal(summaryFreshness({fetchedAt: iso(0)}, T0 + 25 * 3_600_000), 'stale');
});

test('age wording', () => {
  assert.equal(formatAge(iso(0), T0 + 5 * 60_000), '5 minutes ago');
  assert.equal(formatAge(iso(0), T0 + 5 * 3_600_000), '5 hours ago');
  assert.equal(formatAge(iso(0), T0 + 72 * 3_600_000), '3 days ago');
});
