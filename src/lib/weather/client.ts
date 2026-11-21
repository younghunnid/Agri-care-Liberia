import {cacheGet, cacheSet, type CachedSnapshot} from '../dataCache';
import {DEFAULT_LOCATION_ID, findLocation, validCoordinates, roundCoordinate} from './locations';
import type {WeatherReport} from './types';

/**
 * Browser side of the live forecast. The device never talks to the provider: it asks OUR server, keeps the last good answer (IndexedDB, with the real
 * time it was retrieved) and says exactly what it is showing:
 *   live          fetched from the server just now, provider answered
 *   provider-down the server could not reach the provider and sent its last good copy (kept its original time): NOT live
 *   saved         this phone's own saved copy (offline, or the server could not be reached): NOT live, shown with its age
 *   none          nothing to show: no network and no saved copy, or an error. No numbers are made up.
 */
export type WeatherSelection = {kind: 'town'; id: string} | {kind: 'device'; lat: number; lon: number};
export type WeatherStatus = 'live' | 'provider-down' | 'saved' | 'none';
export interface WeatherLoad {status: WeatherStatus; report: WeatherReport | null; /** When this phone saved it (ISO). */ savedAt: string | null; error: string | null}
const PREF = 'agri_weather_location_v1';
export const cacheKeyFor = (s: WeatherSelection): string => (s.kind === 'town' ? `liveweather:${s.id}` : 'liveweather:device');
export const queryFor = (s: WeatherSelection): string => (s.kind === 'town' ? `location=${encodeURIComponent(s.id)}` : `lat=${roundCoordinate(s.lat, 1)}&lon=${roundCoordinate(s.lon, 1)}`);

export function loadSelection(): WeatherSelection {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (raw?.kind === 'town' && findLocation(raw.id)) return {kind: 'town', id: raw.id};
    if (raw?.kind === 'device' && validCoordinates(raw.lat, raw.lon)) return {kind: 'device', lat: raw.lat, lon: raw.lon};
  } catch { /* storage unavailable or unreadable: use the default */ }
  return {kind: 'town', id: DEFAULT_LOCATION_ID};
}
export function saveSelection(s: WeatherSelection): void { try { localStorage.setItem(PREF, JSON.stringify(s)); } catch { /* preference only */ } }

export interface WeatherDeps {fetchImpl?: typeof fetch; get?: (key: string) => Promise<CachedSnapshot<WeatherReport> | null>; set?: (key: string, r: WeatherReport) => Promise<unknown>; timeoutMs?: number}
export async function loadWeather(sel: WeatherSelection, online: boolean, deps: WeatherDeps = {}): Promise<WeatherLoad> {
  const key = cacheKeyFor(sel);
  const readSaved = deps.get ?? ((k: string) => cacheGet<WeatherReport>(k)); const write = deps.set ?? ((k: string, r: WeatherReport) => cacheSet(k, r));
  const saved = await readSaved(key).catch(() => null);
  const fromSaved = (error: string | null): WeatherLoad => (saved ? {status: 'saved', report: saved.data, savedAt: saved.fetchedAt, error} : {status: 'none', report: null, savedAt: null, error: error ?? 'No saved forecast on this phone.'});
  if (!online) return fromSaved(null);
  try {
    const res = await (deps.fetchImpl ?? fetch)(`/api/v1/weather?${queryFor(sel)}`, {signal: AbortSignal.timeout(deps.timeoutMs ?? 10000), cache: 'no-store'});
    const body = (await res.json().catch(() => null)) as {report?: WeatherReport; error?: {message?: string}} | null;
    if (!res.ok || !body?.report) return fromSaved(body?.error?.message ?? 'The weather could not be loaded just now.');
    await write(key, body.report).catch(() => undefined); // saved only AFTER a successful answer: a failure never overwrites a good copy
    return {status: body.report.stale ? 'provider-down' : 'live', report: body.report, savedAt: null, error: null};
  } catch { return fromSaved('The weather could not be loaded just now.'); }
}

/** Days that have already passed are not forecasts: a saved copy shows only today and later (the date is the place's local date, Liberia = UTC). */
export function upcomingDays(report: WeatherReport, now = new Date()): WeatherReport['daily'] {
  const today = now.toISOString().slice(0, 10);
  return report.daily.filter((d) => d.date >= today);
}
/** Age of the information in minutes (since the provider data was retrieved), or null if unreadable. */
export function ageMinutes(iso: string | null | undefined, now = Date.now()): number | null { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60_000)) : null; }
/** Reminders are only given for a forecast that is live or recent (under 6 hours): never from an old copy. */
export const REMINDER_MAX_AGE_MIN = 6 * 60;
