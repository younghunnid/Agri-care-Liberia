/** Weather, Rice advice and recording, and the USSD weather option, in a real browser on a production build. Disposable backend; the weather provider is a local stand-in. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {pathToFileURL} from 'node:url';
import type {BrowserContext, Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {resetWeatherServiceForTests} from '../server/weather.ts';
import {choosePhone as choose, phoneText as screen} from './ussdBrowserHelpers.ts';
assert.ok(!process.env.API_BASE_URL, 'requires its own disposable backend');
const modulePath = process.env.QA_PLAYWRIGHT_MODULE; const driver = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const engineName = process.env.QA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const only = process.env.QA_ONLY ?? ''; // e.g. "rice" to run only the Rice/audio checks (used for the WebKit runner)
const DATES = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map((_, i) => new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10));
const upstream = {timezone: 'Africa/Monrovia', current: {time: new Date().toISOString(), temperature_2m: 29.4, relative_humidity_2m: 78, precipitation: 0.2, weather_code: 3, wind_speed_10m: 9.5},
  daily: {time: DATES, weather_code: [3, 61, 63, 2, 1, 80, 95], temperature_2m_max: [31, 29, 28, 30, 32, 29, 27], temperature_2m_min: [22, 22, 21, 22, 23, 22, 21], precipitation_sum: [0.2, 6.5, 30, 0, 0, 12, 30], precipitation_probability_max: [20, 70, 90, 10, 5, 60, 95], wind_speed_10m_max: [14, 20, 24, 12, 10, 18, 38]}};
const requests: string[] = []; let provider: 'ok' | 'down' = 'ok';
const stub = http.createServer((rq, rs) => { requests.push(rq.url ?? ''); if (provider === 'down') { rs.writeHead(503); rs.end('down'); return; } rs.writeHead(200, {'content-type': 'application/json'}); rs.end(JSON.stringify(upstream)); });
await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r)); process.env.WEATHER_API_BASE = `http://127.0.0.1:${(stub.address() as AddressInfo).port}/v1/forecast`; resetWeatherServiceForTests();
const backend = await startBackend();
const browser = await driver[engineName].launch({headless: true, ...(engineName === 'chromium' ? {executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})});
const errors: string[] = []; const passed: string[] = []; const contexts: BrowserContext[] = [];
const run = (name: string) => !only || name.toLowerCase().includes(only.toLowerCase());
const check = async (name: string, f: () => Promise<void>) => { if (!run(name)) return; await f(); passed.push(name); console.log('PASS ' + name); };
async function ctx(opts: Record<string, unknown> = {}, width = 375) {
  const c = await browser.newContext({viewport: {width, height: 812}, serviceWorkers: 'allow', ...opts}); contexts.push(c); c.setDefaultTimeout(25000);
  await c.addInitScript({content: `window.__spoken=[];window.__rates=[];window.__agriVoicePauseScale=0.02;class U{constructor(t){this.text=t}}Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:()=>{},speak:(u)=>{window.__rates.push(u.rate);window.__spoken.push(u.text);if(u.onstart)u.onstart();if(u.onend)u.onend();}}});`});
  c.on('page', (p: Page) => p.on('pageerror', (e) => errors.push(e.message))); return c;
}
const ready = async (p: Page) => { await p.evaluate(async () => { await navigator.serviceWorker.ready; }); await p.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated'); };
const noSideways = async (p: Page, label: string) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scrolling`);
try {
  await check('weather: Farmer Today shows the live forecast with place, source, time and a clear label; choosing another town asks for that town only; the choice is remembered', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/today'); const w = p.getByTestId('live-weather'); await w.waitFor();
    await p.getByTestId('lw-status').filter({hasText: 'Live forecast'}).waitFor(); assert.equal(await p.getByTestId('lw-status').getAttribute('data-status'), 'live');
    const t = await w.innerText(); assert.match(t, /Monrovia, Montserrado County/); assert.match(t, /29°C/); assert.match(t, /Overcast/); assert.match(t, /Humidity 78%/); assert.match(t, /Wind 10 km\/h|Wind 9 km\/h/); assert.match(t, /Chance of rain: 20%/); assert.match(t, /Rain: 0.2 mm expected/);
    assert.match(t, /Weather data by Open-Meteo\.com/); assert.match(t, /Retrieved from the provider:/); assert.ok(await p.getByTestId('lw-day').count() >= 3, 'coming days are listed');
    assert.equal(await p.locator('[data-testid=live-weather] a[href="https://open-meteo.com/"]').count(), 1);
    await p.getByTestId('lw-county').selectOption('Bong'); await p.getByTestId('lw-place').filter({hasText: 'Gbarnga, Bong County'}).waitFor(); assert.ok(requests.some((u) => u.includes('latitude=6.998') && u.includes('longitude=-9.472')), 'the provider was asked for Gbarnga');
    await p.reload(); await p.getByTestId('lw-place').filter({hasText: 'Gbarnga'}).waitFor(); await noSideways(p, 'today');
  });
  await check('weather: device location only on request and with permission; refused, denied or outside-Liberia positions are explained and nothing is shared', async () => {
    const c = await ctx({geolocation: {latitude: 6.9876, longitude: -9.4712}, permissions: ['geolocation']}); const p = await c.newPage(); await p.goto(backend.baseUrl + '/weather');
    await p.getByTestId('lw-status').waitFor(); assert.equal(await p.evaluate(() => (window as any).__geoAsked ?? false), false);
    const before = requests.length; await p.getByTestId('lw-geo').click(); await p.getByTestId('lw-place').filter({hasText: 'Your device location (approximate)'}).waitFor();
    assert.ok(requests.slice(before).some((u) => /latitude=7&/.test(u) && u.includes('longitude=-9.5&')), 'only a rounded position reached the provider: ' + requests.slice(before).join(' '));
    const denied = await ctx(); const d = await denied.newPage(); await d.goto(backend.baseUrl + '/weather'); await d.getByTestId('lw-status').waitFor(); await d.addInitScript(() => undefined);
    await d.evaluate(() => { (navigator.geolocation as any).getCurrentPosition = (_ok: unknown, bad: (e: {code: number}) => void) => bad({code: 1}); }); await d.getByTestId('lw-geo').click(); assert.match(await d.getByTestId('lw-geo-note').innerText(), /not allowed, so nothing was shared/);
    const far = await ctx(); const f = await far.newPage(); await f.goto(backend.baseUrl + '/weather'); await f.getByTestId('lw-status').waitFor(); await f.evaluate(() => { (navigator.geolocation as any).getCurrentPosition = (ok: (p: unknown) => void) => ok({coords: {latitude: 51.5, longitude: -0.12}}); });
    const n = requests.length; await f.getByTestId('lw-geo').click(); assert.match(await f.getByTestId('lw-geo-note').innerText(), /outside Liberia/); assert.equal(requests.length, n, 'nothing was requested');
  });
  await check('weather: offline shows the SAVED forecast labelled not live, with its age; an outage with nothing saved shows no numbers at all', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/weather'); await p.getByTestId('lw-status').filter({hasText: 'Live forecast'}).waitFor(); await ready(p);
    await c.setOffline(true); await p.reload(); await p.getByTestId('lw-status').filter({hasText: 'Offline: saved forecast'}).waitFor();
    assert.equal(await p.getByTestId('lw-status').getAttribute('data-status'), 'saved'); const t = await p.getByTestId('live-weather').innerText();
    assert.match(t, /not live weather/i); assert.ok(!/Live forecast/.test(t), 'a saved forecast is never called live'); assert.match(t, /retrieved/i); assert.match(t, /Weather data by Open-Meteo\.com/); assert.equal(await p.getByTestId('lw-refresh').isDisabled(), true);
    await c.setOffline(false);
    provider = 'down'; const fresh = await ctx(); await fresh.addInitScript(() => { try { localStorage.setItem('agri_weather_location_v1', JSON.stringify({kind: 'town', id: 'harper'})); } catch { /* opaque origin */ } }); const q = await fresh.newPage(); await q.goto(backend.baseUrl + '/weather'); await q.getByTestId('lw-none').waitFor(); const none = await q.getByTestId('live-weather').innerText();
    assert.match(none, /No weather numbers are shown/); assert.ok(!/\d+°C|Humidity|Chance of rain/.test(none), 'no weather values are invented'); provider = 'ok';
  });
  await check('rice: Knowledge & Guides, Rice shows the exact question and answer, source and review status, offline note, and the Vai recording (Listen in Vai)', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/guides'); await p.getByTestId('cq-rice').click(); const card = p.getByTestId('rice-advice-card'); await card.waitFor();
    assert.equal(await p.getByTestId('rice-crop').innerText(), 'Rice'); assert.equal(await p.getByTestId('rice-question').innerText(), 'My rice leaves are turning yellow. What could be the problem?');
    assert.equal(await p.getByTestId('rice-answer').innerText(), 'Yellow leaves may be caused by pests, diseases, lack of nutrients, or too much water. Check the plants carefully and contact an agricultural extension officer for proper advice.');
    assert.match(await p.getByTestId('rice-review').innerText(), /^Not reviewed/); assert.match(await p.getByTestId('rice-source').innerText(), /project team/); assert.match(await p.getByTestId('rice-offline').innerText(), /without internet/);
    assert.equal(await p.getByTestId('recorded-advice').count(), 1); assert.equal(await p.getByTestId('rice-no-audio-here').count(), 0); await p.getByTestId('recording-play').filter({hasText: /^Listen in Vai$/}).waitFor(); assert.match(await p.getByTestId('recording-note').innerText(), /Vai.*Not yet reviewed by an agricultural expert/);
    assert.ok(!/approved by|Ministry of Agriculture approved/i.test(await card.innerText())); await noSideways(p, 'guides');
  });
  await check('rice: the recording plays only after Play, pauses, resumes, replays; nothing autoplays; button reads Listen in Vai', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/crops/rice'); const rec = p.getByTestId('recorded-advice'); await rec.waitFor();
    const note = await p.getByTestId('recording-note').innerText(); assert.match(note, /Vai/); assert.match(note, /not reviewed by an agricultural expert|Not yet reviewed/i);
    await p.getByTestId('recording-play').filter({hasText: /^Listen in Vai$/}).waitFor(); await p.waitForTimeout(1500);
    const idle = await p.evaluate(() => { const a = document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement; return {paused: a.paused, t: a.currentTime}; }); assert.deepEqual(idle, {paused: true, t: 0}, 'nothing plays before a tap');
    await p.getByTestId('recording-play').click(); await p.waitForFunction(() => { const a = document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement; return !a.paused && a.currentTime > 0.8; }, undefined, {timeout: 20000});
    await p.waitForFunction(() => document.querySelector('[data-testid=recorded-advice]')?.getAttribute('data-state') === 'playing'); await p.getByTestId('recording-play').filter({hasText: 'Pause'}).waitFor();
    await p.getByTestId('recording-play').click(); await p.waitForFunction(() => (document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement).paused); await p.waitForFunction(() => document.querySelector('[data-testid=recorded-advice]')?.getAttribute('data-state') === 'paused');
    const at = await p.evaluate(() => (document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement).currentTime); assert.ok(at > 0.8);
    await p.getByTestId('recording-play').click(); await p.waitForFunction((t: number) => (document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement).currentTime > t + 0.5, at);
    await p.getByTestId('recording-replay').click(); await p.waitForFunction(() => { const a = document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement; return !a.paused && a.currentTime < 3; }); assert.match(await p.getByTestId('recording-time').innerText(), /\/ 2:10 · 1\.0 MB|\/ 2:10 · 1\.1 MB/);
    const dur = await p.evaluate(() => (document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement).duration); assert.ok(Math.abs(dur - 130.18) < 1, `the file plays as ${dur}s`);
    assert.equal(await p.evaluate(() => (window as any).__spoken.length), 0, 'the recording is not replaced by generated speech');
    await p.evaluate(() => { const a = document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement; a.currentTime = a.duration - 0.3; }); await p.waitForFunction(() => document.querySelector('[data-testid=recorded-advice]')?.getAttribute('data-state') === 'ended', undefined, {timeout: 20000});
    await p.getByTestId('recording-play').filter({hasText: 'Play again'}).waitFor(); await noSideways(p, 'rice page');
  });
  await check('rice: the recording and the advice open and play offline after one online visit', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/crops/rice'); await p.getByTestId('recorded-advice').waitFor(); await ready(p);
    await p.waitForFunction(async () => !!(await caches.match('/audio/rice/rice-recorded-advice.m4a')), undefined, {timeout: 60000});
    await c.setOffline(true); await p.reload(); await p.getByTestId('rice-advice-card').waitFor(); await p.getByTestId('recording-offline').filter({hasText: 'Saved on this phone'}).waitFor();
    assert.match(await p.getByTestId('rice-answer').innerText(), /Yellow leaves may be caused/);
    await p.getByTestId('recording-play').click(); await p.waitForFunction(() => { const a = document.querySelector('[data-testid=recording-audio]') as HTMLAudioElement; return !a.paused && a.currentTime > 0.8; }, undefined, {timeout: 20000}); await c.setOffline(false);
  });
  await check('ussd: option 9 Weather shows the forecast (live, then SAVED when offline); options 1-8 still open; the voice reads it', async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-phone').waitFor(); await ready(p);
    await choose(p, '*440#'); await choose(p, '1'); await p.waitForFunction(() => document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame === 'enroll.category');
    await choose(p, '1'); await choose(p, '1'); let t = await screen(p).innerText(); for (let i = 0; i < 30 && /\n1 Next\n/.test(t); i++) { await choose(p, '1'); t = await screen(p).innerText(); } await choose(p, '1');
    await p.getByTestId('ussd-screen').filter({has: screen(p).filter({hasText: 'FARM ADVICE'})}).waitFor(); assert.match(await screen(p).innerText(), /9 Weather/);
    for (const o of ['1', '2', '3', '4', '5', '6', '7', '8']) { await choose(p, o); const s = await screen(p).innerText(); assert.ok(s.length > 5 && !/Invalid choice/.test(s), `option ${o}`); await p.getByTestId('key-home').click(); await p.getByTestId('ussd-screen').filter({has: screen(p).filter({hasText: 'FARM ADVICE'})}).waitFor(); }
    await choose(p, '9'); const live = await screen(p).innerText(); assert.match(live, /^Weather: /); assert.match(live, /LIVE forecast/); assert.match(live, /Today: /);
    await p.waitForFunction(() => (window as any).__spoken.some((s: string) => /LIVE forecast/.test(s)));
    await p.getByTestId('key-home').click(); await p.waitForFunction(() => document.querySelector('[data-testid=ussd-text]')?.textContent?.includes('FARM ADVICE'));
    await c.setOffline(true); await p.reload(); await p.getByTestId('ussd-phone').waitFor();
    await choose(p, '*440#'); await choose(p, '2'); await p.waitForFunction(() => /^(main|enroll\.)/.test(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''));
    const frame = await p.getByTestId('ussd-screen').getAttribute('data-frame'); if (frame !== 'main') { await p.getByTestId('ussd-public-advice').click(); }
    await p.getByTestId('ussd-screen').filter({has: screen(p).filter({hasText: 'FARM ADVICE'})}).waitFor(); await choose(p, '9');
    const saved = await screen(p).innerText(); assert.match(saved, /SAVED copy from/); assert.match(saved, /not live/); assert.ok(!/LIVE forecast/.test(saved), saved); await c.setOffline(false);
  });
  await check('layout: weather and rice pages fit 320 and 375 px', async () => {
    for (const w of [320, 375]) { const c = await ctx({}, w); const p = await c.newPage(); for (const route of ['/today', '/weather', '/crops/rice', '/guides']) { await p.goto(backend.baseUrl + route); await p.waitForTimeout(1200); await noSideways(p, `${route} at ${w}`); } }
  });
  assert.deepEqual(errors, [], 'no uncaught page errors: ' + JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({engine: engineName, browser: 'automation with synthetic data; speech instrumented; no physical device', passed}, null, 2));
} catch (error) { console.error('Weather/Rice browser QA failed:', error); process.exitCode = 1; }
finally { for (const c of contexts) await c.close().catch(() => undefined); await browser.close().catch(() => undefined); await backend.stop(); stub.close(); delete process.env.WEATHER_API_BASE; }
