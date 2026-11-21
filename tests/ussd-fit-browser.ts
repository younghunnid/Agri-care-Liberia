/** /ussd must fit the visible phone viewport: no page scroll, no clipped controls. Simulated viewports in Chromium, NOT a physical iPhone. */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import type {BrowserContext, Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {choosePhone as choose, phoneText as screen} from './ussdBrowserHelpers.ts';
assert.ok(!process.env.API_BASE_URL, 'requires its own disposable backend');
const backend = await startBackend();
const modulePath = process.env.QA_PLAYWRIGHT_MODULE; const driver = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright'); const engine = process.env.QA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser = await driver[engine].launch({headless: true, ...(engine === 'chromium' ? {executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})});
const errors: string[] = []; const contexts: BrowserContext[] = []; const report: Record<string, unknown>[] = [];
// [label, width, height] — "toolbar" sizes are the same phone with Safari's visible bars taking height away.
const SIZES: [string, number, number][] = [['320x568 (SE 1st gen)', 320, 568], ['320x460 (SE with toolbars)', 320, 460], ['375x667 (SE 2/3, 8)', 375, 667], ['375x553 (SE with toolbars)', 375, 553], ['390x844 (13/14)', 390, 844], ['390x664 (14 with toolbars)', 390, 664], ['393x852 (15/16)', 393, 852], ['393x670 (15 with toolbars)', 393, 670], ['430x932 (Pro Max)', 430, 932], ['430x740 (Pro Max with toolbars)', 430, 740], ['844x390 (landscape)', 844, 390], ['667x375 (SE landscape)', 667, 375]];
const KEYS = ['key-1', 'key-2', 'key-3', 'key-4', 'key-5', 'key-6', 'key-7', 'key-8', 'key-9', 'key-star', 'key-0', 'key-hash', 'key-send', 'key-end', 'key-back', 'key-home', 'key-cancel', 'ussd-voice-toggle', 'ussd-voice-repeat', 'ussd-speed-slow', 'ussd-speed-normal', 'ussd-speed-fast', 'ussd-back-to-site', 'key-del', 'ussd-more'];
async function open(w: number, h: number) {
  const c = await browser.newContext({viewport: {width: w, height: h}, isMobile: true, hasTouch: true, serviceWorkers: 'allow'}); contexts.push(c); c.setDefaultTimeout(20000);
  await c.addInitScript({content: `window.__spoken=[];window.__cancels=0;window.__agriVoicePauseScale=0.02;class U{constructor(t){this.text=t}}Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:()=>{window.__cancels++},speak:(u)=>{window.__spoken.push(u.text);if(u.onstart)u.onstart();if(u.onend)u.onend();}}});`});
  const p = await c.newPage(); p.on('pageerror', (e: Error) => errors.push(e.message)); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-phone').waitFor(); return {c, p};
}
const measure = (p: Page) => p.evaluate((ids) => {
  const de = document.documentElement; const root = document.querySelector<HTMLElement>('[data-testid=ussd-only-page]')!;
  const vh = window.innerHeight, vw = window.innerWidth; const clipped: string[] = []; const small: Record<string, number> = {}; let minH = 999, minW = 999;
  for (const id of ids) { const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (!el) { clipped.push(id + ' missing'); continue; } const r = el.getBoundingClientRect(); if (r.top < -0.5 || r.left < -0.5 || r.bottom > vh + 0.5 || r.right > vw + 0.5) clipped.push(`${id} ${Math.round(r.top)}-${Math.round(r.bottom)}`); minH = Math.min(minH, r.height); minW = Math.min(minW, r.width); if (r.height < 44) small[id] = Math.round(r.height); }
  const fs = parseFloat(getComputedStyle(document.querySelector('[data-testid=ussd-text]')!).fontSize);
  const screenEl = document.querySelector<HTMLElement>('[data-testid=ussd-screen]')!;
  return {pageScrolls: root.scrollHeight > root.clientHeight + 1 || de.scrollHeight > vh + 1, sideways: de.scrollWidth > vw + 1 || root.scrollWidth > root.clientWidth + 1, clipped, minTouchH: Math.round(minH), minTouchW: Math.round(minW), under44: small, textPx: Math.round(fs * 10) / 10, screenScrolls: screenEl.scrollHeight > screenEl.clientHeight + 1};
}, KEYS);
async function reachMain(p: Page) {
  await choose(p, '*440#'); await p.waitForFunction(() => /enroll\.welcome/.test(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''));
  await choose(p, '1'); await choose(p, '2'); await choose(p, '1'); let t = await screen(p).innerText(); for (let i = 0; i < 30 && /\n1 Next\n/.test(t); i++) { await choose(p, '1'); t = await screen(p).innerText(); } await choose(p, '1');
  await p.getByTestId('ussd-screen').filter({has: screen(p).filter({hasText: 'FARM ADVICE'})}).waitFor();
}
try {
  for (const [label, w, h] of SIZES) {
    const {c, p} = await open(w, h);
    const idle = await measure(p);
    await choose(p, '*440#'); await p.waitForFunction(() => /enroll\.welcome/.test(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''));
    const dialed = await measure(p);
    await reachMain(p); const menu = await measure(p); // the longest screen: 9 options plus title
    assert.match(await screen(p).innerText(), /9 Weather/);
    const box = (await p.getByTestId('key-0').boundingBox())!; const cancels = await p.evaluate(() => (window as any).__cancels);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(1650); await p.mouse.up();
    assert.equal(await p.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false', `${label}: long-press 0 mutes`); assert.ok(await p.evaluate(() => (window as any).__cancels) > cancels);
    await p.getByTestId('ussd-voice-toggle').click(); await p.getByTestId('ussd-voice-repeat').click(); await p.waitForFunction(() => (window as any).__spoken.some((t: string) => /FARM ADVICE|Press one for/.test(t)));
    await choose(p, '1'); assert.match(await screen(p).innerText(), /Crops & planting/);
    const after = await measure(p);
    await p.getByTestId('ussd-back-to-site').click(); await p.waitForURL((u: URL) => u.pathname === '/'); await p.goBack(); await p.getByTestId('ussd-phone').waitFor(); await p.reload(); await p.getByTestId('ussd-phone').waitFor();
    const all = {idle, dialed, menu, after};
    for (const [k, m] of Object.entries(all)) { assert.equal(m.pageScrolls, false, `${label} ${k}: page scrolls`); assert.equal(m.sideways, false, `${label} ${k}: sideways overflow`); assert.deepEqual(m.clipped, [], `${label} ${k}: clipped controls`); assert.ok(m.textPx >= 12, `${label} ${k}: text ${m.textPx}px`); }
    report.push({size: label, minTouchHeightPx: menu.minTouchH, controlsUnder44px: menu.under44, textPx: menu.textPx, displayScrollsInternally: menu.screenScrolls});
    console.log('PASS ' + label, JSON.stringify(report.at(-1))); await c.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(JSON.stringify({note: 'simulated viewports in desktop Chromium with touch emulation; no physical iPhone or Android phone', report}, null, 1));
} catch (e) { console.error('USSD fit QA failed:', e); process.exitCode = 1; }
finally { for (const c of contexts) await c.close().catch(() => undefined); await browser.close().catch(() => undefined); await backend.stop(); }
