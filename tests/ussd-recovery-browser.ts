import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import type {Browser, Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {DB_NAME, DB_VERSION, STORES} from '../src/lib/offlineDb.ts';
import {choosePhone as choose, phoneText as screen} from './ussdBrowserHelpers.ts';

assert.ok(!process.env.API_BASE_URL, 'requires a disposable backend, never production');
const modulePath = process.env.QA_PLAYWRIGHT_MODULE;
const driver = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const engineName = process.env.QA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const backend = await startBackend();
const browser = await driver[engineName].launch({headless: true, ...(engineName === 'chromium' ? {executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})}).catch(async (error: unknown) => { await backend.stop(); throw error; }) as Browser;
let release = 0;
const legacyHtml = '<!doctype html><html><body><h1>We could not find that page</h1><script>navigator.serviceWorker.register("/sw.js")</script></body></html>';
const oldWorker = `self.addEventListener('install',e=>e.waitUntil(caches.open('legacy-shell').then(c=>c.put('/old-shell',new Response(${JSON.stringify(legacyHtml)},{headers:{'Content-Type':'text/html'}})))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(caches.open('legacy-shell').then(c=>c.match('/old-shell')))});`;
const server = http.createServer((req, res) => {
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript'); res.setHeader('Cache-Control', 'no-store');
    res.end(release === 0 ? oldWorker : fs.readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8') + `\n/* fixture release ${release} */`); return;
  }
  if (release === 0 && ['/ussd', '/', '/index.html'].includes(req.url ?? '')) { res.setHeader('Content-Type', 'text/html'); res.end(legacyHtml); return; }
  const upstream = http.request(new URL(req.url ?? '/', backend.baseUrl), {method: req.method, headers: req.headers}, (reply) => { res.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(res); });
  upstream.on('error', () => { res.statusCode = 502; res.end(); }); req.pipe(upstream);
});
server.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}`;
const passed: string[] = []; const errors: string[] = [];
const check = async (name: string, run: () => Promise<void>) => { console.log('CHECK ' + name); await run(); passed.push(name); console.log('PASS ' + name); };
const context = await browser.newContext({viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true, serviceWorkers: 'allow'});
context.setDefaultTimeout(25000);
await context.addInitScript({content: `window.__spoken=[];window.__rates=[];window.__cancels=0;window.__agriVoicePauseScale=0.01;class U{constructor(t){this.text=t}}Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:()=>{window.__cancels++},speak:(u)=>{window.__spoken.push(u.text);window.__rates.push(u.rate);if(u.onstart)u.onstart();if(u.onend)u.onend();}}});`});
context.on('page', (page: Page) => page.on('pageerror', (e) => errors.push(e.message)));
const page = await context.newPage();
let recoveryLoads = 0; page.on('load', () => { recoveryLoads++; });
try {
  await check('reproduce cached missing /ussd route with an old active worker', async () => {
    await page.goto(origin + '/ussd'); await page.getByRole('heading', {name: 'We could not find that page'}).waitFor();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    await page.reload(); await page.getByRole('heading', {name: 'We could not find that page'}).waitFor();
    await page.evaluate(async ({name, version, stores}) => {
      localStorage.setItem('qa-saved-setting', 'preserved');
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name, version); r.onupgradeneeded = () => { for (const [s, options] of Object.entries(stores)) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, options); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await new Promise<void>((resolve) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put({key: 'qa-retained-draft-marker', value: 'preserved'}); t.oncomplete = () => resolve(); }); db.close();
    }, {name: DB_NAME, version: DB_VERSION, stores: STORES});
  });
  await check('a new worker recovers the legacy QR page while preserving IndexedDB and localStorage', async () => {
    release = 1;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await page.getByTestId('ussd-only-page').waitFor(); await page.getByTestId('ussd-phone').waitFor();
    assert.equal(await page.getByTestId('not-found').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('qa-saved-setting')), 'preserved');
    const retained = await page.evaluate(async (name) => { const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); }); const value = await new Promise<any>((resolve) => { const r = db.transaction('kv').objectStore('kv').get('qa-retained-draft-marker'); r.onsuccess = () => resolve(r.result); }); db.close(); return value.value; }, DB_NAME);
    assert.equal(retained, 'preserved');
    const loads = recoveryLoads; await page.waitForTimeout(3000);
    // Chromium reloads the legacy page once. The WebKit 17.4 runner showed one extra settling load, then nothing: bounded, never a loop.
    const allowed = engineName === 'webkit' ? 1 : 0; assert.ok(recoveryLoads - loads <= allowed, `no legacy recovery reload loop (${recoveryLoads - loads} extra loads)`);
    const settled = recoveryLoads; await page.waitForTimeout(4000); assert.equal(recoveryLoads, settled, 'loads stay constant after recovery settles');
  });
  await check('current active input is preserved both while an update waits and when another tab activates it', async () => {
    await page.evaluate(async () => { (window as any).__priorWorker = (await navigator.serviceWorker.getRegistration())?.active; });
    for (const d of ['star', '4', '4']) await page.getByTestId('key-' + d).tap();
    const before = await page.getByTestId('ussd-input').innerText();
    const form = await context.newPage(); await form.goto(origin + '/register');
    await form.locator('#reg-name').fill('Unsaved Farmer'); await form.locator('#reg-phone').fill('0770000199');
    await form.locator('#reg-password').fill('Unsaved-Garden-7391!');
    const handset = await context.newPage(); await handset.goto(origin + '/ussd');
    await choose(handset, '*440#'); await choose(handset, '1'); await choose(handset, '1');
    await handset.locator('[data-frame="enroll.county"]').waitFor(); await handset.getByTestId('key-2').tap();
    let documentLoads = 0; for (const current of [page, form, handset]) current.on('load', () => { documentLoads++; });

    release = 2; await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && !r.installing && (r.waiting?.state === 'installed' || (r.active?.state === 'activated' && r.active !== (window as any).__priorWorker)); });
    assert.equal(await page.getByTestId('ussd-input').innerText(), before);
    await page.evaluate(async () => { const waiting = (await navigator.serviceWorker.getRegistration())?.waiting; if (!waiting) return; const changed = new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {once: true})); waiting.postMessage({type: 'SKIP_WAITING'}); await changed; });
    await page.waitForTimeout(5000);
    assert.equal(await page.getByTestId('ussd-input').innerText(), before, 'update did not reload current active input');
    assert.equal(await form.locator('#reg-name').inputValue(), 'Unsaved Farmer');
    assert.equal(await form.locator('#reg-phone').inputValue(), '0770000199');
    assert.equal(await form.locator('#reg-password').inputValue(), 'Unsaved-Garden-7391!');
    assert.equal(await handset.getByTestId('ussd-screen').getAttribute('data-frame'), 'enroll.county');
    assert.match(await handset.getByTestId('ussd-input').innerText(), /2/);
    assert.equal(await handset.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(documentLoads, 0, 'no current form or registration document was reloaded');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 1);
    await form.close(); await handset.close();
    await page.reload(); await page.getByTestId('ussd-only-page').waitFor();
  });
  await check('standalone direct navigation, refresh, trailing slash work at mobile widths', async () => {
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({width, height: 812});
      for (const path of ['/ussd', '/ussd/', '/ussd?timeout=20']) {
        await page.goto(origin + path); await page.getByTestId('ussd-only-page').waitFor();
        assert.equal(await page.locator('nav').count(), 0); assert.equal(await page.locator('header').count(), 1); assert.equal(await page.locator('footer').count(), 0);
        assert.deepEqual(await page.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href'))), ['/']);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      }
    }
  });
  await check('voice, adjustable speed, enrollment, all eight menus and mute remain available in the standalone handset', async () => {
    await page.goto(origin + '/ussd'); await choose(page, '*440#'); await choose(page, '1');
    await page.getByTestId('ussd-screen').and(page.locator('[data-frame="enroll.category"]')).waitFor();
    await choose(page, '1'); await choose(page, '2');
    while (/\n1 Next\n/.test(await screen(page).innerText())) await choose(page, '1');
    await choose(page, '1'); await page.getByTestId('ussd-screen').and(page.locator('[data-frame="main"]')).waitFor();
    for (const option of ['1','2','3','4','5','6','7','8']) { await choose(page, option); assert.ok(!/Invalid choice/.test(await screen(page).innerText())); await page.getByTestId('key-home').click(); }
    await page.getByTestId('ussd-speed-slow').click(); await page.waitForFunction(() => (window as any).__rates.at(-1) === 0.6);
    const box = await page.getByTestId('key-0').boundingBox(); assert.ok(box); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1700);
    assert.equal(await page.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false'); await page.mouse.up();
    assert.match(await page.getByTestId('ussd-input').innerText(), /^>\s*_?$/);
    await page.getByTestId('ussd-back-to-site').click(); await page.waitForURL(origin + '/'); await page.locator('nav').first().waitFor({state: 'attached'});
  });
  await check('offline reopening and refresh', async () => {
    await page.goto(origin + '/ussd'); await page.getByTestId('ussd-phone').waitFor();
    await context.setOffline(true);
    try { await page.reload(); await page.getByTestId('ussd-only-page').waitFor(); }
    finally { await context.setOffline(false); }
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({engine: engineName, version: browser.version(), origin, passed, limitation: 'Automated desktop engine with mobile/touch emulation and instrumented speech; not a physical iPhone or audible playback test.'}, null, 2));
} catch (error) { console.error(error); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await backend.stop(); }
