/** Run after VITE_USSD_MARKETPLACE_ENABLED=true npm run build. Isolated production browser QA. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium, type Page, type BrowserContext} from 'playwright';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agriccare-codex-browser-'));
const secret = () => crypto.randomBytes(32).toString('hex');
Object.assign(process.env, {NODE_ENV: 'production', APP_ENV: 'demo', DB_PATH: path.join(temp, 'qa.db'), SESSION_SECRET: secret(), OTP_HMAC_SECRET: secret(), TRUST_PROXY: '0', SMS_PROVIDER: 'simulated', DEMO_INLINE_INBOX: '1', DEMO_ENV_ACK: 'synthetic-accounts-only', ENABLE_DEMO_MARKET_DATA: '1'});
const {createApp} = await import('../server.ts');
const {closeDb} = await import('../server/db.ts');
const server = (await createApp()).listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const addr = server.address();
assert.ok(addr && typeof addr === 'object');
const base = `http://127.0.0.1:${addr.port}`;
const results: string[] = [];
const errors: string[] = [];
let context: BrowserContext | undefined;
const launch = async () => {
  const c = await chromium.launchPersistentContext(path.join(temp, 'profile'), {headless: true, executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', viewport: {width: 375, height: 812}, serviceWorkers: 'allow'});
  c.setDefaultTimeout(15000);
  c.setDefaultNavigationTimeout(15000);
  return c;
};
const check = async (name: string, run: () => Promise<void>) => { await run(); results.push(name); console.log(`PASS ${name}`); };
const screen = (p: Page) => p.getByTestId('ussd-text');
const choose = async (p: Page, choice: string) => { for (const digit of choice) await p.getByTestId(`key-${digit}`).click(); await p.getByTestId('key-send').click(); };
const review = async (p: Page) => { for (let n = 0; n < 30 && /\n1 Next\n/.test(await screen(p).innerText()); n++) await choose(p, '1'); };
const match = async (p: Page, pattern: RegExp) => { await screen(p).filter({hasText: pattern}).waitFor(); };
try {
  context = await launch();
  let page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/today');
  await page.getByTestId('farmer-today').waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {once: true})); });
  await check('service worker installed, activated and controls the first visit', async () => {
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller?.state), 'activated');
    const resources = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname)))).flat());
    assert.ok(resources.some((r) => r.endsWith('.m4a')));
    assert.ok(resources.some((r) => r.startsWith('/src/assets/images/')));
    assert.ok(resources.some((r) => r.startsWith('/offline-img/')));
  });
  await context.setOffline(true);
  await check('unvisited Farmer Today, guidance, livestock, soil and USSD reopen and refresh offline at all mobile widths', async () => {
    for (const width of [320, 360, 375, 412]) {
      await page.setViewportSize({width, height: 812});
      for (const route of ['/today', '/guidance', '/livestock', '/soil', '/ussd-demo']) {
        await page.goto(base + route);
        await page.locator('main').waitFor();
        if (route === '/ussd-demo') await page.getByTestId('ussd-phone').waitFor();
        else await page.locator('h1').first().waitFor();
        await page.reload();
        await page.locator('h1').first().waitFor();
        const dims = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
        assert.ok(dims.scroll <= dims.width + 1, `${route} overflows at ${width}: ${JSON.stringify(dims)}`);
      }
      await page.screenshot({path: path.join(os.tmpdir(), `agriccare-codex-ussd-${width}.png`), fullPage: true});
    }
    for (const url of ['/offline-img/crop_rice_1794924195882.webp', '/src/assets/images/liberia_livestock_goats_1794996422377.jpg', '/audio/en/rice-planting-demo.m4a']) assert.equal(await page.evaluate(async (u) => (await fetch(u)).ok, url), true, url);
  });
  await check('keypad and keyboard: original option 8, invalid choice, Back, Home, Cancel, timeout and restart', async () => {
    await page.goto(base + '/ussd-demo?timeout=5');
    await page.getByTestId('key-send').click();
    await choose(page, '8'); await match(page, /Sell & market/);
    await page.getByTestId('key-back').click();
    await page.locator('h1').click();
    await page.keyboard.press('9'); await page.keyboard.press('Enter'); await match(page, /Invalid choice/);
    await page.keyboard.press('1'); await page.keyboard.press('Enter'); await match(page, /Crops & planting/);
    await page.keyboard.press('2'); await page.keyboard.press('Backspace');
    assert.match(await page.getByTestId('ussd-input').innerText(), /^>\s*_?$/);
    await page.getByTestId('key-home').click(); await match(page, /FARM ADVICE/);
    await page.keyboard.press('Escape'); await match(page, /Session cancelled/);
    await page.getByTestId('key-send').focus(); await page.keyboard.press('Enter'); await match(page, /FARM ADVICE/);
    await page.getByTestId('key-back').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'key-home');
    await match(page, /Session timed out/);
    await page.getByTestId('key-send').click(); await match(page, /FARM ADVICE/);
  });
  await context.setOffline(false);
  await page.goto(base + '/ussd-demo');
  await page.getByTestId('ussd-write-status').filter({hasText: 'Interactive synthetic demo enabled'}).waitFor();
  await check('confirmed USSD sale persists offline and receives one server reference on reconnection', async () => {
    await context!.setOffline(true);
    await page.getByTestId('key-send').click();
    for (const choice of ['3', '2', '4', '650', '62', '2', '1']) await choose(page, choice);
    await review(page); await choose(page, '1'); await match(page, /Listing status|Pending Sync/);
    await page.goto(base + '/harvest/sell');
    await page.getByTestId('my-listing').filter({has: page.locator('[data-testid="my-listing-state"]', {hasText: 'Pending'})}).waitFor();
    assert.ok(!(await page.getByTestId('my-listing-code').innerText()).includes('SELL-'));
    await context!.close(); context = await launch(); page = await context.newPage();
    await context.setOffline(true);
    await page.goto(base + '/harvest/sell');
    await page.getByTestId('my-listing').waitFor();
    await context.setOffline(false);
    await page.getByTestId('my-listing').filter({hasText: 'The server has it.'}).waitFor({timeout: 45000});
    assert.match(await page.getByTestId('my-listing-code').innerText(), /SELL-\d{4}-\d{6}/);
    const rows = await page.evaluate(async () => (await (await fetch('/api/v1/harvest/listings?includeSoldOut=1')).json()).listings.filter((r: any) => r.description.startsWith('USSD DEMO:') && r.quantityKg === 650));
    assert.equal(rows.length, 1);
    await page.reload(); await page.getByTestId('my-listing').filter({hasText: 'The server has it.'}).waitFor();
    const after = await page.evaluate(async () => (await (await fetch('/api/v1/harvest/listings?includeSoldOut=1')).json()).listings.filter((r: any) => r.description.startsWith('USSD DEMO:') && r.quantityKg === 650));
    assert.equal(after.length, 1);
    assert.equal(after[0].id, rows[0].id);
  });
  await check('offline buyer inquiry is refused without a queued or successful inquiry', async () => {
    await page.goto(base + '/ussd-demo');
    await page.getByTestId('ussd-write-status').filter({hasText: 'Interactive synthetic demo enabled'}).waitFor();
    await context!.setOffline(true);
    await page.getByTestId('key-send').click();
    for (const choice of ['3', '1', '4', '2', '1']) await choose(page, choice);
    await review(page); await choose(page, '1'); await choose(page, '1');
    await review(page); await choose(page, '1');
    await match(page, /Offline\. Nothing was sent\./);
    const queued = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open('agri-advisory-offline'); r.onsuccess = () => resolve(r.result); }); return new Promise<any[]>((resolve) => { const r = db.transaction('syncQueue').objectStore('syncQueue').getAll(); r.onsuccess = () => { db.close(); resolve(r.result); }; }); });
    assert.equal(queued.length, 0);
  });
  await context.setOffline(false);
  await check('browser inquiry and seller reply use their existing authorized workspaces', async () => {
    const buyer = await context!.browser()!.newContext();
    try {
      const phone = await buyer.newPage();
      await phone.goto(base + '/ussd-demo');
      await phone.getByTestId('ussd-write-status').filter({hasText: 'Interactive synthetic demo enabled'}).waitFor();
      await phone.getByTestId('key-send').click();
      for (const choice of ['3', '1', '4', '2', '1']) await choose(phone, choice);
      await review(phone); await choose(phone, '1'); await choose(phone, '1');
      await review(phone); await choose(phone, '1');
      await match(phone, /Server confirmed/);
      await page.goto(base + '/harvest/sell');
      await page.getByTestId('reply-input').first().fill('Synthetic QA harvest is ready.');
      await page.getByTestId('reply-send').first().click();
      await page.getByTestId('sell-message').filter({hasText: 'Your reply was sent to the buyer.'}).waitFor();
      await phone.getByTestId('market-refresh').click();
      await phone.getByTestId('market-refresh').filter({hasText: 'Refresh market & inquiries'}).waitFor();
      await phone.getByTestId('key-home').click();
      for (const choice of ['3', '4', '1']) await choose(phone, choice);
      let transcript = await screen(phone).innerText();
      for (let i = 0; i < 30 && /\n1 Next\n/.test(await screen(phone).innerText()); i++) { await choose(phone, '1'); transcript += await screen(phone).innerText(); }
      assert.match(transcript, /Synthetic QA harvest is ready/);
    } finally { await buyer.close(); }
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(JSON.stringify({base, browser: 'Headless desktop Chrome; viewport and offline emulation only; no real device', results}, null, 2));
} finally {
  await context?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(temp, {recursive: true, force: true});
}
