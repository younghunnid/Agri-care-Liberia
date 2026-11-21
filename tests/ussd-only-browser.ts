/** The standalone /ussd page (QR destination). Production-build browser checks on a disposable backend. Build with VITE_USSD_MARKETPLACE_ENABLED=true first. */
import assert from 'node:assert/strict';
import {chromium, type BrowserContext, type Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {choosePhone as choose, phoneText as screen} from './ussdBrowserHelpers.ts';
import {demoDestination} from '../src/lib/ussd/demoQr.ts';
assert.ok(!process.env.API_BASE_URL, 'requires its own disposable backend');
const backend = await startBackend();
const browser = await chromium.launch({executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const errors: string[] = []; const passed: string[] = []; const contexts: BrowserContext[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log('PASS ' + name); };
async function profile(width: number, height = 812, mobile = width < 600) {
  const c = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'allow'}); contexts.push(c); c.setDefaultTimeout(20000);
  await c.addInitScript({content: `window.__spoken=[];window.__rates=[];window.__cancels=0;window.__agriVoicePauseScale=0.02;class U{constructor(t){this.text=t}}Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:()=>{window.__cancels++},speak:(u)=>{window.__rates.push(u.rate);window.__spoken.push(u.text);if(u.onstart)u.onstart();if(u.onend)u.onend();}}});`});
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  return c;
}
const waitFrame = (p: Page, re: string) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''), re);
const main = (p: Page) => p.getByTestId('ussd-screen').filter({has: screen(p).filter({hasText: 'FARM ADVICE'})}).waitFor();
try {
  await check('the QR destination is the standalone page and every accepted configuration encodes /ussd', async () => {
    assert.deepEqual(demoDestination('https://agricare.mpgmca.com'), {ok: true, url: 'https://agricare.mpgmca.com/ussd'});
    assert.deepEqual(demoDestination('https://agricare.mpgmca.com/ussd-demo'), {ok: true, url: 'https://agricare.mpgmca.com/ussd'});
  });
  for (const [label, width, height] of [['phone 375', 375, 812], ['phone 320', 320, 640], ['tablet 768', 768, 1024], ['desktop 1280', 1280, 800]] as const) {
    await check(`/ussd at ${label}px: only the brand, the phone and the back button; centered; nothing else on the page`, async () => {
      const c = await profile(width, height); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-only-page').waitFor(); await p.getByTestId('ussd-phone').waitFor();
      // no website layout
      assert.equal(await p.locator('header').count(), 1, 'only the small brand header'); assert.equal(await p.locator('footer').count(), 1, 'only the back-button footer');
      assert.equal(await p.locator('nav').count(), 0, 'no navigation'); assert.equal(await p.getByRole('banner').count(), 1);
      const text = await p.locator('body').innerText();
      for (const gone of ['Practical Farming Help', 'Common Farming Questions', 'Knowledge', 'Marketplace', 'Skip to main content', 'Demonstration environment', 'ready to work offline', 'Install', 'What happens when you confirm', 'The main menu', 'Keyboard']) assert.ok(!text.includes(gone), `${gone} must not appear`);
      assert.match(text, /Agricare Liberia/); assert.match(text, /Phone simulation/); assert.match(text, /Back to website/);
      const links = await p.locator('a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href'))); assert.deepEqual(links, ['/'], `the only link is the way back: ${links}`);
      // fullscreen feel, centered, nothing below
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll');
      const box = (await p.getByTestId('ussd-phone').boundingBox())!; assert.ok(Math.abs(box.x + box.width / 2 - width / 2) <= 10, `phone centered: ${box.x + box.width / 2} vs ${width / 2}`); assert.ok(box.width <= 440 + 2);
      const endsWithBack = await p.evaluate(() => { const f = document.querySelector('footer'); const all = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().height > 0); const lowest = all.reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0); return {footerBottom: f!.getBoundingClientRect().bottom, lowest}; });
      assert.ok(endsWithBack.lowest <= endsWithBack.footerBottom + 1, 'nothing is rendered below the back button');
      assert.equal(await p.getByTestId('ussd-write-status').count(), 0, 'no explanatory status block'); assert.equal(await p.getByTestId('ussd-net-note').count(), 0);
      assert.ok((await p.title()).includes('Agricare Liberia'));
    });
  }
  await check('the phone works exactly as before: dial *440#, voice on, category, county, consent, menu, every option, long-press mute, speed', async () => {
    const c = await profile(375); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-phone').waitFor();
    await choose(p, '*440#'); await waitFrame(p, 'enroll.welcome'); await choose(p, '1'); await waitFrame(p, 'enroll.category');
    await p.waitForFunction(() => (window as any).__spoken.some((t: string) => /^Press one for farmer\./.test(t)));
    assert.ok((await p.evaluate(() => (window as any).__rates as number[])).every((r) => r === 0.75));
    await choose(p, '2'); await choose(p, '1'); let t = await screen(p).innerText(); for (let i = 0; i < 30 && /\n1 Next\n/.test(t); i++) { await choose(p, '1'); t = await screen(p).innerText(); }
    await choose(p, '1'); await main(p);
    assert.match(await p.getByTestId('ussd-identity').innerText(), /Synthetic Buyer/);
    for (const o of ['1', '2', '3', '4', '5', '6', '7', '8']) { await choose(p, o); const s = await screen(p).innerText(); assert.ok(s.length > 5 && !/Invalid choice/.test(s), `option ${o}`); await p.getByTestId('key-home').click(); await main(p); }
    await p.getByTestId('ussd-speed-slow').click(); await p.waitForFunction(() => ((window as any).__rates as number[]).at(-1) === 0.6);
    const box = (await p.getByTestId('key-0').boundingBox())!; const cancels = await p.evaluate(() => (window as any).__cancels);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(1650); await p.mouse.up();
    assert.equal(await p.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false'); assert.ok(await p.evaluate(() => (window as any).__cancels) > cancels);
    assert.equal(await p.getByTestId('ussd-voice-repeat').count(), 1);
    // still no website around it after a whole session
    assert.deepEqual(await p.locator('a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href'))), ['/']);
  });
  await check('direct load, reload, trailing slash and a different timeout all open the standalone page', async () => {
    const c = await profile(375); const p = await c.newPage();
    for (const path of ['/ussd', '/ussd/', '/ussd?timeout=20']) { await p.goto(backend.baseUrl + path); await p.getByTestId('ussd-only-page').waitFor(); assert.equal(await p.locator('nav').count(), 0, path); }
    await p.reload(); await p.getByTestId('ussd-only-page').waitFor();
  });
  await check('Back to website returns to the normal homepage, and the full website still works', async () => {
    const c = await profile(375); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-back-to-site').click();
    await p.waitForURL(backend.baseUrl + '/'); await p.getByRole('heading', {level: 1}).filter({hasText: 'Practical Farming Help'}).waitFor();
    assert.ok(await p.locator('header nav, nav').count() > 0, 'the website navigation is back');
    for (const route of ['/guides', '/marketplace', '/about', '/login', '/privacy']) { await p.goto(backend.baseUrl + route); assert.ok((await p.locator('header').count()) >= 1, route); assert.ok(!/ussd-only-page/.test(await p.content()), route); }
    await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-demo-page').waitFor(); assert.ok((await p.locator('body').innerText()).includes('The main menu'), '/ussd-demo keeps the full explanation page');
  });
  await check('offline: after one visit the standalone page reopens without a network', async () => {
    const c = await profile(375); const p = await c.newPage(); await p.goto(backend.baseUrl + '/ussd'); await p.getByTestId('ussd-phone').waitFor();
    await p.evaluate(async () => { await navigator.serviceWorker.ready; }); await p.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    await c.setOffline(true); await p.reload(); await p.getByTestId('ussd-only-page').waitFor(); await p.getByTestId('ussd-phone').waitFor();
    await choose(p, '*440#'); await waitFrame(p, 'enroll.welcome'); await c.setOffline(false);
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(JSON.stringify({browser: 'Headless desktop Chrome with phone, tablet and desktop viewports', passed}, null, 2));
} catch (error) { console.error('USSD-only browser QA failed:', error); process.exitCode = 1; }
finally { for (const c of contexts) await c.close().catch(() => undefined); await browser.close().catch(() => undefined); await backend.stop(); }
