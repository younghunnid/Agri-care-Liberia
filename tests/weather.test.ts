import assert from 'node:assert/strict';
import http from 'node:http';
import test, {after, before} from 'node:test';
import type {AddressInfo} from 'node:net';
import {createWeatherService, parseOpenMeteo, WeatherInputError, WeatherUnavailableError, resetWeatherServiceForTests} from '../server/weather.ts';
import {LIBERIA_COUNTIES} from '../server/constants.ts';
import {DEFAULT_LOCATION_ID, findLocation, LIBERIA_BOUNDS, validCoordinates, WEATHER_LOCATIONS} from '../src/lib/weather/locations.ts';
import {weatherCondition} from '../src/lib/weather/codes.ts';
import {weatherReminders} from '../src/lib/weather/advice.ts';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';

const DATES = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
const payload = (over: Record<string, unknown[]> = {}, current: Record<string, unknown> = {}) => ({
  timezone: 'Africa/Monrovia',
  current: {time: '2026-11-21T13:00', temperature_2m: 29.4, relative_humidity_2m: 78, precipitation: 0.2, weather_code: 3, wind_speed_10m: 9.5, ...current},
  daily: {time: DATES, weather_code: [3, 61, 63, 2, 1, 80, 95], temperature_2m_max: [31, 29, 28, 30, 32, 29, 27], temperature_2m_min: [22, 22, 21, 22, 23, 22, 21], precipitation_sum: [0.2, 6.5, 18, 0, 0, 12, 30], precipitation_probability_max: [20, 70, 90, 10, 5, 60, 95], wind_speed_10m_max: [14, 20, 24, 12, 10, 18, 38], ...over},
});
const ok = (body: unknown) => async () => new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});

test('locations: every county has a place, ids are unique and every position is inside Liberia', () => {
  for (const c of LIBERIA_COUNTIES) assert.ok(WEATHER_LOCATIONS.some((l) => l.county === c), `${c} has a place`);
  assert.equal(new Set(WEATHER_LOCATIONS.map((l) => l.id)).size, WEATHER_LOCATIONS.length); assert.ok(findLocation(DEFAULT_LOCATION_ID));
  for (const l of WEATHER_LOCATIONS) assert.ok(validCoordinates(l.lat, l.lon), l.id);
  assert.equal(validCoordinates(LIBERIA_BOUNDS.maxLat + 1, -9), false); assert.equal(validCoordinates(6, -20), false); assert.equal(validCoordinates(Number.NaN, -9), false); assert.equal(validCoordinates('6' as never, -9), false);
  assert.equal(findLocation('../etc/passwd'), undefined); assert.equal(findLocation(undefined), undefined);
});

test('parsing: a good provider answer becomes a report with plain-language conditions; anything unexpected is an error, never filled in', () => {
  const place = {id: 'gbarnga', name: 'Gbarnga', county: 'Bong', lat: 6.998, lon: -9.472, kind: 'town' as const};
  const r = parseOpenMeteo(payload(), place, Date.parse('2026-11-21T13:05:00Z'));
  assert.equal(r.daily.length, 7); assert.equal(r.current.condition, 'Overcast'); assert.equal(r.daily[1].condition, 'Light rain'); assert.equal(r.daily[6].rainChancePct, 95);
  assert.equal(r.fetchedAt, '2026-11-21T13:05:00.000Z'); assert.equal(r.stale, false); assert.equal(r.source.name, 'Open-Meteo'); assert.equal(r.source.attribution, 'Weather data by Open-Meteo.com');
  assert.equal(parseOpenMeteo(payload({precipitation_probability_max: [null, null, null, null, null, null, null]}), place, 0).daily[0].rainChancePct, null, 'a missing rain chance stays unknown');
  for (const bad of [null, {}, {current: {}, daily: {}}, payload({temperature_2m_max: [1, 2]}), payload({temperature_2m_max: [31, 'x', 28, 30, 32, 29, 27]}), payload({}, {temperature_2m: Number.NaN}), payload({}, {weather_code: undefined}), {...payload(), daily: {...payload().daily, time: ['soon', 'later', 'x']}}]) assert.throws(() => parseOpenMeteo(bad, place, 0), WeatherUnavailableError);
  assert.equal(weatherCondition(61), 'Light rain'); assert.equal(weatherCondition(4242), 'Weather code 4242', 'an unknown code is reported as unknown, not guessed');
});

test('service: exact provider request, 30-minute cache shared by everyone, one call for concurrent requests', async () => {
  const calls: URL[] = []; let clock = Date.parse('2026-11-21T13:00:00Z');
  const svc = createWeatherService({fetchImpl: (async (u: URL) => { calls.push(new URL(String(u))); await new Promise((r) => setTimeout(r, 15)); return ok(payload())(); }) as unknown as typeof fetch, now: () => clock});
  const [a, b] = await Promise.all([svc.get({locationId: 'gbarnga'}), svc.get({locationId: 'gbarnga'})]);
  assert.equal(calls.length, 1, 'concurrent requests share one provider call'); assert.deepEqual(a, b);
  const q = calls[0].searchParams; assert.equal(calls[0].origin + calls[0].pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(q.get('latitude'), '6.998'); assert.equal(q.get('longitude'), '-9.472'); assert.equal(q.get('forecast_days'), '7'); assert.equal(q.get('timezone'), 'Africa/Monrovia'); assert.equal(q.get('wind_speed_unit'), 'kmh');
  assert.equal(q.get('current'), 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m'); assert.equal(q.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max');
  clock += 29 * 60_000; await svc.get({locationId: 'gbarnga'}); assert.equal(calls.length, 1, 'still fresh after 29 minutes');
  clock += 2 * 60_000; await svc.get({locationId: 'gbarnga'}); assert.equal(calls.length, 2, 'refreshed after 30 minutes');
  await svc.get({locationId: 'monrovia'}); assert.equal(calls.length, 3, 'another place is another request');
});

test('service: device positions are rounded, outside-Liberia and unknown places are refused before any provider call', async () => {
  const calls: URL[] = []; const svc = createWeatherService({fetchImpl: (async (u: URL) => { calls.push(new URL(String(u))); return ok(payload())(); }) as unknown as typeof fetch});
  const r = await svc.get({lat: 6.99876543, lon: -9.47234567}); assert.equal(calls[0].searchParams.get('latitude'), '7'); assert.equal(calls[0].searchParams.get('longitude'), '-9.47');
  assert.equal(r.location.kind, 'device'); assert.equal(r.location.county, null); assert.match(r.location.name, /approximate/);
  for (const bad of [{lat: 51.5, lon: -0.12}, {lat: 6.3, lon: 100}, {lat: Number.NaN, lon: -9}, {locationId: 'london'}, {locationId: ''}, {locationId: 'monrovia; rm -rf /'}]) await assert.rejects(() => svc.get(bad as never), WeatherInputError);
  assert.equal(calls.length, 1, 'nothing invalid reached the provider');
});

test('service: when the provider fails a recent copy is returned as STALE with its real time; otherwise an error. Nothing is invented', async () => {
  let clock = Date.parse('2026-11-21T13:00:00Z'); let mode: 'ok' | 'down' | '500' | 'html' | 'hang' = 'ok';
  const fetchImpl = (async (_u: URL, init?: RequestInit) => {
    if (mode === 'ok') return ok(payload())(); if (mode === '500') return new Response('x', {status: 500}); if (mode === 'html') return new Response('<html>', {status: 200});
    if (mode === 'hang') return new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    throw new Error('network down');
  }) as unknown as typeof fetch;
  const svc = createWeatherService({fetchImpl, now: () => clock, timeoutMs: 80});
  for (const m of ['down', '500', 'html', 'hang'] as const) { mode = m; await assert.rejects(() => svc.get({locationId: 'harper'}), WeatherUnavailableError, `${m} with no copy is an error`); }
  mode = 'ok'; const good = await svc.get({locationId: 'harper'}); assert.equal(good.stale, false); const fetchedAt = good.fetchedAt;
  clock += 40 * 60_000; for (const m of ['down', '500', 'html', 'hang'] as const) { mode = m; const s = await svc.get({locationId: 'harper'}); assert.equal(s.stale, true, m); assert.equal(s.fetchedAt, fetchedAt, 'the stale copy keeps its ORIGINAL time'); assert.deepEqual(s.daily, good.daily); }
  clock += 12 * 3_600_000; mode = 'down'; await assert.rejects(() => svc.get({locationId: 'harper'}), WeatherUnavailableError, 'a copy older than 12 hours is not served');
  mode = 'ok'; assert.equal((await svc.get({locationId: 'harper'})).stale, false, 'recovery: live again');
});

test('reminders are cautious general suggestions from the forecast, never guarantees or expert instructions', () => {
  const day = (date: string, o: Partial<{rainMm: number; rainChancePct: number | null; windMaxKmh: number; tMaxC: number; weatherCode: number}> = {}) => ({date, weatherCode: 3, condition: 'x', tMaxC: 30, tMinC: 22, rainMm: 0, rainChancePct: 10, windMaxKmh: 10, ...o});
  const heavy = weatherReminders({daily: [day('2026-11-21'), day('2026-11-22', {rainMm: 32, rainChancePct: 90}), day('2026-11-23'), day('2026-11-24'), day('2026-11-25')]});
  assert.equal(heavy[0].id, 'heavy-rain'); assert.match(heavy[0].detail, /forecast/); assert.match(heavy[0].detail, /drain/); assert.match(heavy[0].detail, /Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/);
  assert.deepEqual(weatherReminders({daily: [day('2026-11-21'), day('2026-11-22'), day('2026-11-23'), day('2026-11-24')]}).map((r) => r.id), ['dry-spell']);
  const mixed = weatherReminders({daily: [day('2026-11-21', {windMaxKmh: 40}), day('2026-11-22', {tMaxC: 36}), day('2026-11-23', {weatherCode: 95, rainMm: 6, rainChancePct: 60}), day('2026-11-24', {rainMm: 6, rainChancePct: 60}), day('2026-11-25', {rainMm: 6, rainChancePct: 60})]}).map((r) => r.id);
  for (const id of ['wind', 'heat', 'storm', 'wet-spell']) assert.ok(mixed.includes(id), id);
  assert.deepEqual(weatherReminders({daily: []}), [], 'no data, no reminders');
  const all = JSON.stringify([...heavy, ...weatherReminders({daily: [day('2026-11-21', {windMaxKmh: 40, tMaxC: 36, weatherCode: 96})]})]);
  assert.ok(!/guarantee|will definitely|certain|approved by|Ministry|verified agronomist|you must/i.test(all), 'no certainty or approval claims');
});

// ------------------------------------------------------------------------------------------------------------ the HTTP API, with a local stand-in for the provider
let backend: Backend; let stub: http.Server; let hits = 0; let stubMode: 'ok' | 'down' = 'ok'; const seen: http.IncomingHttpHeaders[] = []; const seenUrls: string[] = [];
before(async () => {
  stub = http.createServer((rq, rs) => { hits++; seen.push(rq.headers); seenUrls.push(rq.url ?? ''); if (stubMode === 'down') { rs.writeHead(503); rs.end('down'); return; } rs.writeHead(200, {'content-type': 'application/json'}); rs.end(JSON.stringify(payload())); });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r)); process.env.WEATHER_API_BASE = `http://127.0.0.1:${(stub.address() as AddressInfo).port}/v1/forecast`; resetWeatherServiceForTests();
  backend = await startBackend();
});
after(async () => { await backend?.stop(); stub?.close(); delete process.env.WEATHER_API_BASE; resetWeatherServiceForTests(); });

test('API: places list, forecast by place and by position, shared cache, validation, provider outage', async () => {
  const jar = new CookieJar();
  const list = await req(jar, '/api/v1/weather/locations'); assert.equal(list.status, 200); assert.equal(list.data.locations.length, WEATHER_LOCATIONS.length); assert.ok(list.data.locations.every((l: Record<string, unknown>) => !('lat' in l)));
  const a = await req(jar, '/api/v1/weather?location=gbarnga'); assert.equal(a.status, 200); assert.equal(a.data.report.location.name, 'Gbarnga'); assert.equal(a.data.report.daily.length, 7); assert.equal(a.data.report.stale, false); assert.match(a.data.report.source.attribution, /Open-Meteo/);
  const before = hits; const b = await req(new CookieJar(), '/api/v1/weather?location=gbarnga'); assert.equal(b.status, 200); assert.equal(hits, before, 'a second visitor is served from the cache'); assert.equal(b.data.report.fetchedAt, a.data.report.fetchedAt);
  const dev = await req(jar, '/api/v1/weather?lat=7.0123&lon=-9.4789'); assert.equal(dev.status, 200); assert.equal(dev.data.report.location.kind, 'device'); assert.ok(seenUrls.at(-1)!.includes('latitude=7.01') && seenUrls.at(-1)!.includes('longitude=-9.48'), 'the provider only ever sees rounded coordinates');
  for (const h of seen) { assert.ok(!h.cookie && !h['x-forwarded-for'] && !h.authorization, 'nothing about the visitor reaches the provider'); assert.match(String(h['user-agent']), /AgricareLiberia/); }
  const bad = ['/api/v1/weather', '/api/v1/weather?location=nowhere', '/api/v1/weather?lat=51.5&lon=-0.12', '/api/v1/weather?lat=abc&lon=1', '/api/v1/weather?location=monrovia&lat=6&lon=-10', '/api/v1/weather?location=monrovia&units=imperial', '/api/v1/weather?lat=6.3'];
  for (const p of bad) { const r = await req(jar, p); assert.equal(r.status, 400, p); assert.equal(r.data.error.code, 'INVALID_LOCATION'); }
  const n = hits; await req(jar, '/api/v1/weather?location=nowhere'); assert.equal(hits, n, 'invalid requests never reach the provider');
  stubMode = 'down'; const fresh = await req(jar, '/api/v1/weather?location=kakata'); assert.equal(fresh.status, 503); assert.equal(fresh.data.error.code, 'WEATHER_UNAVAILABLE'); assert.ok(!JSON.stringify(fresh.data).match(/temperature|rain/i), 'an outage returns an error, no invented numbers');
  const cached = await req(jar, '/api/v1/weather?location=gbarnga'); assert.equal(cached.status, 200, 'a cached place still answers (fresh within 30 minutes)'); stubMode = 'ok';
});
