import {dbDelete, dbGet, dbPut} from './offlineDb';
import type {CountyWeatherSample} from '../data/weatherSoilMinistry';

/**
 * Saved copies of information the app has really retrieved (IndexedDB store `apiCache`), each with
 * the exact time it was retrieved, so the interface can say "Saved Information - Not Live".
 *
 * Privacy / security rules enforced here:
 *  - Only an explicit allow-list of PUBLIC, aggregate keys can be saved. Admin, account, expert,
 *    question or any other private endpoint can never enter this cache (cacheSet throws).
 *  - A failed refresh never touches what is already saved (writes happen only after success).
 *  - Nothing here invents data: it stores exactly what a successful request returned.
 */

export type SnapshotSource = 'server';

export interface CachedSnapshot<T> {
  key: string;
  source: SnapshotSource;
  data: T;
  /** ISO time the data was successfully retrieved by this device. */
  fetchedAt: string;
  /** When the provider says it was produced (optional). */
  issuedAt?: string;
  /** When a forecast stops being valid (optional). */
  validUntil?: string;
}

export const MINISTRY_SUMMARY_KEY = 'ministry:summary';
export const weatherKey = (county: string): string => `weather:${county}`;

const ALLOWED_KEY = /^(ministry:summary|weather:[A-Za-z ]{2,40})$/;

export function isCacheableKey(key: string): boolean {
  return ALLOWED_KEY.test(key);
}

export class CacheKeyError extends Error {}

export async function cacheSet<T>(key: string, data: T, opts: {issuedAt?: string; validUntil?: string} = {}): Promise<CachedSnapshot<T>> {
  if (!isCacheableKey(key)) throw new CacheKeyError(`"${key}" may not be saved offline.`);
  const snap: CachedSnapshot<T> = {key, source: 'server', data, fetchedAt: new Date().toISOString(), ...opts};
  await dbPut('apiCache', snap);
  return snap;
}

export async function cacheGet<T>(key: string): Promise<CachedSnapshot<T> | null> {
  if (!isCacheableKey(key)) return null;
  try {
    return (await dbGet<CachedSnapshot<T>>('apiCache', key)) ?? null;
  } catch {
    return null;
  }
}

export async function cacheDelete(key: string): Promise<void> {
  await dbDelete('apiCache', key);
}

// ---------------------------------------------------------------- freshness

export type Freshness = 'fresh' | 'stale' | 'expired';

const HOUR = 3_600_000;
/** A saved forecast older than this is "stale"; older than FORECAST_EXPIRES it is "expired". */
export const FORECAST_STALE_AFTER_MS = 3 * HOUR;
export const FORECAST_EXPIRES_AFTER_MS = 6 * HOUR;
export const SUMMARY_STALE_AFTER_MS = 24 * HOUR;

/**
 * Forecast freshness. If the provider gave a validity end, that decides "expired". Otherwise the
 * age since retrieval does. An unreadable date is treated as expired (never as current).
 */
export function forecastFreshness(snap: Pick<CachedSnapshot<unknown>, 'fetchedAt' | 'validUntil'>, now = Date.now()): Freshness {
  const fetched = Date.parse(snap.fetchedAt);
  if (!Number.isFinite(fetched)) return 'expired';
  if (snap.validUntil) {
    const until = Date.parse(snap.validUntil);
    if (!Number.isFinite(until) || now > until) return 'expired';
  } else if (now - fetched > FORECAST_EXPIRES_AFTER_MS) {
    return 'expired';
  }
  return now - fetched > FORECAST_STALE_AFTER_MS ? 'stale' : 'fresh';
}

export function summaryFreshness(snap: Pick<CachedSnapshot<unknown>, 'fetchedAt'>, now = Date.now()): Freshness {
  const fetched = Date.parse(snap.fetchedAt);
  if (!Number.isFinite(fetched)) return 'stale';
  return now - fetched > SUMMARY_STALE_AFTER_MS ? 'stale' : 'fresh';
}

export function formatExact(iso: string | undefined | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString(undefined, {dateStyle: 'full', timeStyle: 'medium'});
}

export function formatAge(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

// ---------------------------------------------------------------- weather

/**
 * A weather profile retrieved from a real weather service. NO such service is connected in this
 * prototype, so nothing calls saveWeatherSnapshot yet: the Weather page shows its bundled SAMPLE
 * profiles. This is the ready, tested path for when a provider is added: it saves what the provider
 * returned together with the retrieval time, and the page then applies the stale/expired rules.
 */
export interface LiveWeatherData {
  provider: string;
  profile: CountyWeatherSample;
}

export function saveWeatherSnapshot(county: string, data: LiveWeatherData, opts: {issuedAt?: string; validUntil?: string} = {}) {
  return cacheSet<LiveWeatherData>(weatherKey(county), data, opts);
}

export function loadWeatherSnapshot(county: string) {
  return cacheGet<LiveWeatherData>(weatherKey(county));
}
