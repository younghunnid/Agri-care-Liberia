import {findLocation, roundCoordinate, validCoordinates, WEATHER_LOCATIONS} from '../src/lib/weather/locations.ts';
import {weatherCondition} from '../src/lib/weather/codes.ts';
import {OPEN_METEO, type WeatherDay, type WeatherReport} from '../src/lib/weather/types.ts';

/**
 * Live forecast service (provider: Open-Meteo, https://open-meteo.com/, data under CC BY 4.0; the free API is for NON-COMMERCIAL use, see docs/WEATHER_AND_RECORDED_ADVICE.md).
 *
 *  - Only a place from our list or validated Liberian coordinates reaches the provider (never a free-form URL or text).
 *  - One request per place per 30 minutes (shared by every visitor), so we stay far below the provider's per-IP limits.
 *  - 6 second timeout; the provider's answer is checked field by field. Anything unexpected is an error, never "filled in".
 *  - If the provider fails, a copy up to 12 hours old is returned and marked `stale: true` (with its REAL fetch time). With no copy: an error. Nothing is invented.
 */
export class WeatherInputError extends Error {}
export class WeatherUnavailableError extends Error {}
export interface WeatherServiceOptions {fetchImpl?: typeof fetch; now?: () => number; baseUrl?: string; freshMs?: number; staleMs?: number; timeoutMs?: number}
export type WeatherQuery = {locationId: string} | {lat: number; lon: number};

const DEFAULT_BASE = 'https://api.open-meteo.com/v1/forecast';
const CURRENT = 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max';
const num = (v: unknown, name: string): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new WeatherUnavailableError(`unexpected provider value for ${name}`); return v; };
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseOpenMeteo(json: unknown, place: WeatherReport['location'], fetchedAtMs: number): WeatherReport {
  const j = json as {timezone?: unknown; current?: Record<string, unknown>; daily?: Record<string, unknown[]>} | null;
  if (!j || typeof j !== 'object' || !j.current || !j.daily) throw new WeatherUnavailableError('unexpected provider answer');
  const c = j.current; const d = j.daily;
  const time = d.time; if (!Array.isArray(time) || time.length < 3 || !time.every((t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t))) throw new WeatherUnavailableError('unexpected daily dates');
  const col = (k: string): unknown[] => { const a = d[k]; if (!Array.isArray(a) || a.length !== time.length) throw new WeatherUnavailableError(`unexpected daily column ${k}`); return a; };
  const code = col('weather_code'); const tmax = col('temperature_2m_max'); const tmin = col('temperature_2m_min'); const rain = col('precipitation_sum'); const chance = col('precipitation_probability_max'); const wind = col('wind_speed_10m_max');
  const daily: WeatherDay[] = time.map((date, i) => ({date: date as string, weatherCode: num(code[i], 'weather_code'), condition: weatherCondition(num(code[i], 'weather_code')), tMaxC: num(tmax[i], 'temperature_2m_max'), tMinC: num(tmin[i], 'temperature_2m_min'), rainMm: num(rain[i], 'precipitation_sum'), rainChancePct: numOrNull(chance[i]), windMaxKmh: num(wind[i], 'wind_speed_10m_max')}));
  const wc = num(c.weather_code, 'current weather_code');
  return {
    location: place, source: {...OPEN_METEO}, fetchedAt: new Date(fetchedAtMs).toISOString(), stale: false,
    timezone: typeof j.timezone === 'string' ? j.timezone : 'Africa/Monrovia',
    current: {time: typeof c.time === 'string' ? c.time : new Date(fetchedAtMs).toISOString(), temperatureC: num(c.temperature_2m, 'temperature_2m'), humidityPct: num(c.relative_humidity_2m, 'relative_humidity_2m'), windKmh: num(c.wind_speed_10m, 'wind_speed_10m'), precipitationMm: num(c.precipitation, 'precipitation'), weatherCode: wc, condition: weatherCondition(wc)},
    daily,
  };
}

export function createWeatherService(opts: WeatherServiceOptions = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch; const now = opts.now ?? Date.now; const base = opts.baseUrl ?? DEFAULT_BASE;
  const freshMs = opts.freshMs ?? 30 * 60_000; const staleMs = opts.staleMs ?? 12 * 3_600_000; const timeoutMs = opts.timeoutMs ?? 6000;
  const cache = new Map<string, {at: number; report: WeatherReport}>(); const inFlight = new Map<string, Promise<WeatherReport>>();
  const MAX = 200;

  function resolve(q: WeatherQuery): {key: string; place: WeatherReport['location']} {
    if ('locationId' in q) { const l = findLocation(q.locationId); if (!l) throw new WeatherInputError('Choose a place from the list.'); return {key: `l:${l.id}`, place: {id: l.id, name: l.name, county: l.county, lat: l.lat, lon: l.lon, kind: 'town'}}; }
    if (!validCoordinates(q.lat, q.lon)) throw new WeatherInputError('That position is outside Liberia.');
    const lat = roundCoordinate(q.lat), lon = roundCoordinate(q.lon);
    return {key: `c:${lat},${lon}`, place: {id: null, name: 'Your device location (approximate)', county: null, lat, lon, kind: 'device'}};
  }
  async function fromProvider(place: WeatherReport['location']): Promise<WeatherReport> {
    const url = new URL(base); url.searchParams.set('latitude', String(place.lat)); url.searchParams.set('longitude', String(place.lon));
    url.searchParams.set('current', CURRENT); url.searchParams.set('daily', DAILY); url.searchParams.set('timezone', 'Africa/Monrovia'); url.searchParams.set('forecast_days', '7'); url.searchParams.set('wind_speed_unit', 'kmh');
    let res: Response;
    try { res = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs), headers: {'User-Agent': 'AgricareLiberia/1.0 (agricultural advice; non-commercial)', Accept: 'application/json'}, redirect: 'error'}); }
    catch { throw new WeatherUnavailableError('provider unreachable or too slow'); }
    if (!res.ok) throw new WeatherUnavailableError(`provider answered ${res.status}`);
    let json: unknown; try { json = await res.json(); } catch { throw new WeatherUnavailableError('provider answer was not JSON'); }
    return parseOpenMeteo(json, place, now());
  }
  async function get(q: WeatherQuery): Promise<WeatherReport> {
    const {key, place} = resolve(q); const hit = cache.get(key); const t = now();
    if (hit && t - hit.at < freshMs) return hit.report;
    const pending = inFlight.get(key); if (pending) return pending;
    const job = (async () => {
      try {
        const report = await fromProvider(place);
        if (cache.size >= MAX) { const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (oldest) cache.delete(oldest[0]); }
        cache.set(key, {at: now(), report}); return report;
      } catch (e) {
        if (hit && t - hit.at < staleMs) return {...hit.report, stale: true};
        throw e;
      } finally { inFlight.delete(key); }
    })();
    inFlight.set(key, job); return job;
  }
  return {get, clear: () => { cache.clear(); inFlight.clear(); }, size: () => cache.size};
}
export const locationsForApi = () => WEATHER_LOCATIONS.map((l) => ({id: l.id, name: l.name, county: l.county}));
let shared: ReturnType<typeof createWeatherService> | null = null;
/** The server's shared service. WEATHER_API_BASE exists for tests and must be https outside development/test. */
export function weatherService() {
  if (shared) return shared;
  const override = process.env.WEATHER_API_BASE; const prod = process.env.NODE_ENV === 'production' && process.env.APP_ENV !== 'test';
  if (override && prod && !/^https:\/\//.test(override)) throw new Error('WEATHER_API_BASE must be https in production');
  return (shared = createWeatherService({baseUrl: override || undefined}));
}
export function resetWeatherServiceForTests(): void { shared = null; }
