/** Isolated production-build browser checks. Run with API_BASE_URL unset. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium, type BrowserContext, type Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {CookieJar, req} from './harness/http.ts';
import {getDb} from '../server/db.ts';
import {speechSegments} from '../src/lib/ussd/screenVoice.ts';
import {choosePhone as choose, readPhonePages as review, enterParticipantMenu, phoneText as screen} from './ussdBrowserHelpers.ts';
assert.ok(!process.env.API_BASE_URL, 'browser enrollment QA requires its own disposable backend');
const backend = await startBackend();
const browser = await chromium.launch({executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const errors: string[] = []; const passed: string[] = [];
const contexts: BrowserContext[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log('PASS ' + name); };
async function profile(speech = true, pauseScale = 0.02) {
  const c = await browser.newContext({viewport: {width: 375, height: 812}, serviceWorkers: 'allow'}); contexts.push(c); c.setDefaultTimeout(15000);
  // Literal browser script avoids TypeScript runner helper functions leaking into the page.
  await c.addInitScript({content: `
    window.__spoken = [];
    window.__rates = [];
    window.__pitches = [];
    window.__volumes = [];
    window.__spokenAt = [];
    window.__agriVoicePauseScale = ${pauseScale};
    window.__speechCancels = 0;
    class Utterance { constructor(text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable: true, value: Utterance});
    Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: ${speech ? "{getVoices: () => [], cancel: () => { window.__speechCancels++; }, speak: (u) => { window.__rates.push(u.rate); window.__pitches.push(u.pitch); window.__volumes.push(u.volume); window.__spokenAt.push(Date.now()); window.__spoken.push(u.text); if(u.onstart)u.onstart(); if(u.onend)u.onend(); }}" : "undefined"}});
  `});
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  return c;
}
const stage = async (p: Page, value: string) => p.getByTestId('ussd-screen').filter({has: screen(p)}).and(p.locator(`[data-frame="${value}"]`)).waitFor();
const count = () => (getDb().prepare('SELECT count(*) n FROM participant_registrations').get() as {n: number}).n;
const segmentsOf = async (p: Page) => speechSegments(await screen(p).innerText()).map((x) => x.text);
const automaticallyRead = async (p: Page) => {
  const expected = await segmentsOf(p);
  await p.waitForFunction((want) => { const spoken = (window as any).__spoken as string[]; return spoken.slice(-want.length).join('|') === want.join('|'); }, expected);
  assert.equal(await p.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'true');
  assert.ok((await p.evaluate(() => (window as any).__rates as number[])).every((r) => r === 0.75), 'every utterance is spoken at the default rate 0.75');
};
try {
  const context = await profile(); const page = await context.newPage();
  await page.goto(backend.baseUrl + '/ussd-demo'); await page.getByTestId('ussd-phone').waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  await check('complete dial, voice welcome, synthetic enrollment, explicit consent and original menu', async () => {
    await choose(page, '440'); assert.match(await screen(page).innerText(), /Type the proposed code/);
    await page.locator('h1').click(); await page.keyboard.type('*440#'); await page.keyboard.press('Enter'); await stage(page, 'enroll.welcome');
    await choose(page, '1'); await stage(page, 'enroll.category');
    await automaticallyRead(page);
    await choose(page, '1'); await automaticallyRead(page); await choose(page, '2'); await automaticallyRead(page);
    assert.equal(count(), 0);
    while (/\n1 Next\n/.test(await screen(page).innerText())) { await choose(page, '1'); await automaticallyRead(page); }
    assert.match(await screen(page).innerText(), /Agree & register/); assert.equal(count(), 0);
    await choose(page, '1'); await stage(page, 'main'); await automaticallyRead(page); assert.equal(count(), 1);
    // Welcome's 1 enables voice; main-menu 1 still opens Crops & planting.
    await choose(page, '1'); await stage(page, 'plant.crop'); await automaticallyRead(page);
    await choose(page, '#'); assert.match(await screen(page).innerText(), /Invalid choice/); await automaticallyRead(page);
    await page.getByTestId('key-home').click(); await stage(page, 'main'); await automaticallyRead(page);
    assert.match(await screen(page).innerText(), /8 Sell & market/);
    const spoken = await page.evaluate(() => (window as any).__spoken as string[]);
    const allSpoken = spoken.join(' ').toLowerCase(); assert.ok(allSpoken.includes('press one for farmer') && allSpoken.includes('press two for buyer'), 'menu numbers are read as instructions: ' + allSpoken.slice(0, 300));
    assert.ok(allSpoken.includes('star, four four zero, hash') || !allSpoken.includes('*440'), 'the dial code is never spoken as symbols');
  });
  await check('repeat, pointer long-press mute, short 0 Back, physical 0 and keyboard long-press', async () => {
    await choose(page, '1');
    const input = await page.getByTestId('ussd-input').innerText();
    const box = await page.getByTestId('key-0').boundingBox(); assert.ok(box);
    const cancellations = await page.evaluate(() => (window as any).__speechCancels);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1650);
    assert.equal(await page.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false', 'mute takes effect while the key is still held');
    assert.ok(await page.evaluate(() => (window as any).__speechCancels) > cancellations, 'mute immediately cancels speech');
    await page.mouse.up();
    assert.equal(await page.getByTestId('ussd-input').innerText(), input); assert.equal(await page.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false');
    await choose(page, '0'); await stage(page, 'main');
    const mutedCount = await page.evaluate(() => (window as any).__spoken.length);
    await choose(page, '8'); await page.getByTestId('key-home').click();
    assert.equal(await page.evaluate(() => (window as any).__spoken.length), mutedCount, 'subsequent screens stay silent while muted');
    const before = await page.evaluate(() => (window as any).__spoken.length); const pieces = (await segmentsOf(page)).length;
    await page.getByTestId('ussd-voice-repeat').click(); await page.waitForFunction(([b, n]) => (window as any).__spoken.length === b + n, [before, pieces]);
    await page.getByTestId('ussd-voice-toggle').click();
    await page.locator('h1').click(); await page.keyboard.down('0'); await page.waitForTimeout(1650); await page.keyboard.up('0');
    assert.equal(await page.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false');
    assert.match(await page.getByTestId('ussd-input').innerText(), /^>\s*_?$/);
    await page.getByTestId('key-0').focus(); await page.keyboard.press('0');
    assert.match(await page.getByTestId('ussd-input').innerText(), /0/); await page.keyboard.press('Backspace');
    await page.evaluate(() => { window.speechSynthesis.speak = () => {}; });
    await page.getByTestId('ussd-voice-repeat').click();
    await page.getByTestId('ussd-voice-notice').filter({hasText: 'did not start'}).waitFor();
  });
  await check('returning participant skips duplicate registration and retains offline advice access', async () => {
    await page.reload(); await enterParticipantMenu(page); assert.equal(count(), 1);
    const safeCache = await page.evaluate(() => { const c = localStorage.getItem('agri_ussd_participant_v1') || ''; return !c.includes(localStorage.getItem('agri_requester_key_v1')!); }); assert.equal(safeCache, true);
    await context.setOffline(true); await page.reload(); await enterParticipantMenu(page); await choose(page, '8'); assert.match(await screen(page).innerText(), /Sell & market/);
    await context.setOffline(false);
  });
  await check('first-time offline enrollment is never falsely accepted; reconnection retries safely', async () => {
    const c = await profile(); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor();
    await c.setOffline(true); await p.waitForFunction(() => !navigator.onLine);
    await choose(p, '*440#'); await choose(p, '2'); await stage(p, 'enroll.category');
    await choose(p, '2'); await choose(p, '2'); await review(p); await choose(p, '1');
    await screen(p).filter({hasText: 'Offline. Registration was not sent.'}).waitFor(); assert.equal(count(), 1);
    await c.setOffline(false); await p.waitForFunction(() => navigator.onLine); await choose(p, '1'); await stage(p, 'main'); assert.equal(count(), 2);
  });
  await check('decline consent keeps public advice available and voice fallback is visible', async () => {
    const c = await profile(false); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd-demo');
    await choose(p, '*440#'); await choose(p, '1'); await stage(p, 'enroll.category');
    await p.getByTestId('ussd-voice-notice').filter({hasText: 'unavailable'}).waitFor();
    await choose(p, '3'); await choose(p, '2'); await review(p); await choose(p, '2'); await stage(p, 'main');
    assert.equal(count(), 2); assert.match(await p.getByTestId('ussd-identity').innerText(), /Public advice only/);
    await choose(p, '8'); assert.match(await screen(p).innerText(), /Sell & market/);
    await p.goto(backend.baseUrl + '/ministry'); await p.getByTestId('registry-locked').waitFor();
  });
  await check('320, 360, 375 and 412px layouts retain readable enrollment and voice controls', async () => {
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({width, height: 812}); await page.goto(backend.baseUrl + '/ussd-demo'); await page.getByTestId('ussd-phone').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.getByTestId('ussd-voice-repeat').focus(); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'ussd-voice-repeat');
      await page.screenshot({path: path.join(os.tmpdir(), `agricare-440-${width}.png`), fullPage: true});
    }
  });
  await check('Ministry registry panel requires admin and separates synthetic from suppressed real totals', async () => {
    const phone = '+231770009876', password = 'PrivateRegistry!49xyz';
    await backend.fixtures.createUser({displayName: 'Synthetic Registry Admin', phone, password, roles: ['admin']});
    const jar = new CookieJar(); jar.set('agri_device', await backend.fixtures.trustDevice(phone));
    assert.equal((await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier: phone, password}})).status, 200);
    assert.equal((await req(jar, '/api/v1/participants/enroll', {method: 'POST', headers: {'X-Requester-Key': crypto.randomBytes(32).toString('hex')}, body: {category: 'Other', county: 'Bong', consent: true, consentVersion: 'ussd-demo-v1'}})).status, 200);
    const c = await profile(); await c.addCookies([...jar.cookies].map(([name, value]) => ({name, value, url: backend.baseUrl})));
    const p = await c.newPage(); await p.goto(backend.baseUrl + '/ministry');
    await p.getByTestId('participant-registry').getByText('Synthetic demo participants', {exact: true}).waitFor();
    assert.match(await p.getByTestId('participant-registry').innerText(), /Real participants/);
    assert.match(await p.getByTestId('participant-registry').innerText(), /Suppressed/);
    for (const width of [320, 360, 375, 412]) {
      await p.setViewportSize({width, height: 812});
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Ministry overflow at ${width}`);
      await p.screenshot({path: path.join(os.tmpdir(), `agricare-440-ministry-${width}.png`), fullPage: true});
    }
  });
  await check('voice speed settings (slow 0.60, normal 0.75, fast 1.0), remembered on the device; pitch and volume natural', async () => {
    const c = await profile(true, 0.02); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor();
    assert.equal(await p.getByTestId('ussd-speed-normal').getAttribute('aria-pressed'), 'true', 'Normal is the default');
    await choose(p, '*440#'); await choose(p, '1'); await stage(p, 'enroll.category'); await automaticallyRead(p);
    const rates = async () => p.evaluate(() => (window as any).__rates as number[]);
    for (const [id, rate] of [['slow', 0.6], ['fast', 1], ['normal', 0.75]] as const) {
      await p.getByTestId(`ussd-speed-${id}`).click(); assert.equal(await p.getByTestId(`ussd-speed-${id}`).getAttribute('aria-pressed'), 'true');
      const n = (await segmentsOf(p)).length; await p.waitForFunction(([r, count]) => ((window as any).__rates as number[]).slice(-count).every((x) => x === r) && ((window as any).__rates as number[]).length >= count, [rate, n]);
      assert.equal((await rates()).at(-1), rate, `${id} speaks at ${rate}`);
    }
    assert.ok((await p.evaluate(() => (window as any).__pitches as number[])).every((x) => x === 1), 'pitch stays natural (1.0)'); assert.ok((await p.evaluate(() => (window as any).__volumes as number[])).every((x) => x === 1), 'volume stays 1.0');
    await p.getByTestId('ussd-speed-slow').click();
    await p.reload(); await p.getByTestId('ussd-phone').waitFor();
    assert.equal(await p.getByTestId('ussd-speed-slow').getAttribute('aria-pressed'), 'true', 'the selected speed is remembered after a reload');
    assert.equal(await p.evaluate(() => localStorage.getItem('agri_ussd_voice_speed_v1')), 'slow');
    await choose(p, '*440#'); await choose(p, '1'); await stage(p, 'enroll.category'); await p.waitForFunction(() => ((window as any).__rates as number[]).length > 0 && ((window as any).__rates as number[]).every((x) => x === 0.6));
  });
  await check('real pauses: 1.5 s after the heading, 1 s between numbered options; Press-one wording; *440# read as words', async () => {
    const c = await profile(true, 1); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor();
    await choose(p, '*440#'); await choose(p, '1'); await stage(p, 'enroll.category');
    const want = await segmentsOf(p); assert.ok(want.length >= 6, want.join('|'));
    await p.waitForFunction((w) => { const sp = (window as any).__spoken as string[]; return sp.slice(-w.length).join('|') === w.join('|'); }, want, {timeout: 40000});
    const spoken = await p.evaluate(() => (window as any).__spoken as string[]); const at = await p.evaluate(() => (window as any).__spokenAt as number[]);
    const first = spoken.length - want.length; assert.deepEqual(spoken.slice(first), want);
    const gaps = want.slice(1).map((_, i) => at[first + i + 1] - at[first + i]);
    assert.ok(gaps[0] >= 1400 && gaps[0] < 2300, `heading pause about 1.5 s, was ${gaps[0]}`);
    const optionIdx = want.map((t, i) => (/^Press \w+ for /.test(t) ? i : -1)).filter((i) => i >= 0 && i < want.length - 1);
    assert.ok(optionIdx.length >= 3); for (const i of optionIdx) assert.ok(gaps[i] >= 900 && gaps[i] < 1700, `option pause about 1 s, was ${gaps[i]} after "${want[i]}"`);
    assert.match(want.join(' '), /Press one for farmer\./);
    const dial = speechSegments('Dial *440#, then Send.').map((x) => x.text).join(' '); assert.match(dial, /Star, four four zero, hash/); assert.ok(!/\*|#/.test(dial));
  });
  await check('mute cancels pending speech and pauses at once; navigating never overlaps readings', async () => {
    const c = await profile(true, 1); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor();
    await choose(p, '*440#'); await choose(p, '1'); await stage(p, 'enroll.category');
    await p.waitForFunction(() => ((window as any).__spoken as string[]).length >= 2);
    const box = await p.getByTestId('key-0').boundingBox(); assert.ok(box); const cancels = await p.evaluate(() => (window as any).__speechCancels);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(1650); await p.mouse.up();
    assert.equal(await p.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false'); assert.ok(await p.evaluate(() => (window as any).__speechCancels) > cancels);
    const frozen = await p.evaluate(() => (window as any).__spoken.length); await p.waitForTimeout(3500);
    assert.equal(await p.evaluate(() => (window as any).__spoken.length), frozen, 'no pending piece is spoken after muting: the queue and the pauses were cancelled');
    // overlap: switch voice on again and move quickly between menus; only the LAST screen is read to the end
    await p.getByTestId('ussd-voice-toggle').click(); await choose(p, '1'); await choose(p, '1'); await choose(p, '1');
    await p.waitForTimeout(100); await choose(p, '0'); await p.waitForTimeout(100); await choose(p, '2');
    const want = await segmentsOf(p); await p.waitForFunction((w) => { const s = (window as any).__spoken as string[]; return s.slice(-w.length).join('|') === w.join('|'); }, want, {timeout: 40000});
    const len = await p.evaluate(() => (window as any).__spoken.length); await p.waitForTimeout(2500);
    assert.equal(await p.evaluate(() => (window as any).__spoken.length), len, 'nothing from an earlier screen is spoken after the last screen finished');
    const spoken = await p.evaluate(() => (window as any).__spoken as string[]); const start = spoken.length - want.length;
    assert.deepEqual(spoken.slice(start), want, 'the last screen was read in order and complete, with no interleaved pieces');
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({base: backend.baseUrl, browser: await browser.version(), evidence: 'Headless Chrome, mobile viewport and network emulation. Speech calls are instrumented; this does not establish audible playback on a real device.', passed}, null, 2));
} finally { await browser.close(); await backend.stop(); }
