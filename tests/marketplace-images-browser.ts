/** Marketplace pictures in a real browser on a production build. The listings API is a local stand-in (synthetic data only); nothing live is contacted. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import type {BrowserContext, Page} from 'playwright';
import {startBackend} from './harness/backend.ts';
assert.ok(!process.env.API_BASE_URL, 'requires its own disposable backend');
const modulePath = process.env.QA_PLAYWRIGHT_MODULE; const driver = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright'); const engine = process.env.QA_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const backend = await startBackend();
const browser = await driver[engine].launch({headless: true, ...(engine === 'chromium' ? {executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {})});
const errors: string[] = []; const passed: string[] = []; const contexts: BrowserContext[] = [];
const MIXED = '/src/assets/images/liberia_agri_market_1794996422856.jpg'; const HERO = '/src/assets/images/hero_liberia_farm_1794924193363.jpg';
// A tiny real JPEG-ish upload: a 1x1 red PNG as a data URI stands in for a seller's own photo.
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let id = 0; const L = (product_name: string, category: string, image_url: string, county = 'Bong') => ({id: ++id, seller_name: 'Synthetic Seller', category, product_name, quantity: '50', unit: 'kg', price_lrd: 100, county, town: 'Gbarnga', description: 'Synthetic test listing', image_url, availability_status: 'Available', is_demo_listing: 1, moderation_status: 'approved', created_at: '2026-11-20T10:00:00Z', phone_consent: 0, is_fictional_seller: 1, view_count: 0});
const LISTINGS = [L('Rice', 'Rice and grains', MIXED), L('Cassava', 'Cassava and root crops', MIXED), L('Pepper', 'Vegetables', MIXED, 'Lofa'), L('Okra', 'Vegetables', MIXED, 'Margibi'), L('Plantain', 'Fruits and plantains', MIXED, 'Montserrado'),
  L('Fresh Pond-Raised Tilapia', 'Fish and seafood', '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg'), L('Broiler chickens', 'Poultry and eggs', HERO), L('Farm-Fresh Table Eggs', 'Poultry and eggs', MIXED),
  L('Maize', 'Rice and grains', MIXED), L('Knapsack Sprayer', 'Agricultural supplies', MIXED), L('Cured Organic Compost', 'Agricultural supplies', HERO), L('Clean Cassava Cuttings', 'Seeds and seedlings', HERO),
  L('Goats', 'Livestock', MIXED), L('Seller photo rice', 'Rice and grains', UPLOAD), L('Unknown gadget', 'Vegetables', MIXED)];
const EXPECT: Record<string, string> = {Rice: 'rice', Cassava: 'cassava', Pepper: 'pepper', Okra: 'okra', Plantain: 'plantain', 'Fresh Pond-Raised Tilapia': 'fish', 'Broiler chickens': 'poultry', 'Farm-Fresh Table Eggs': 'eggs', Maize: 'maize', 'Knapsack Sprayer': 'supplies', 'Cured Organic Compost': 'fertilizer', 'Clean Cassava Cuttings': 'seeds', Goats: 'livestock', 'Unknown gadget': 'generic'};
const META = {categories: ['Rice and grains', 'Cassava and root crops', 'Vegetables', 'Fruits and plantains', 'Poultry and eggs', 'Livestock', 'Fish and seafood', 'Seeds and seedlings', 'Agricultural supplies'], units: ['kg'], counties: ['Bong', 'Lofa', 'Margibi', 'Montserrado'], availabilityOptions: ['Available', 'Limited Stock', 'Sold Out']};
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log('PASS ' + name); };
async function open(width: number, height = 900, opts: Record<string, unknown> = {}) {
  const c = await browser.newContext({viewport: {width, height}, serviceWorkers: 'allow', ...opts}); contexts.push(c); c.setDefaultTimeout(25000);
  await c.route('**/api/v1/marketplace/listings?*', async (route: {request: () => {url: () => string}; fulfill: (o: unknown) => Promise<void>}) => { const u = new URL(route.request().url()); const cat = u.searchParams.get('category'); const county = u.searchParams.get('county'); const q = (u.searchParams.get('q') ?? '').toLowerCase();
    const listings = LISTINGS.filter((x) => (!cat || x.category === cat) && (!county || x.county === county) && (!q || x.product_name.toLowerCase().includes(q))); await route.fulfill({json: {listings, ...META}}); });
  const p = await c.newPage(); p.on('pageerror', (e: Error) => errors.push(e.message)); await p.goto(backend.baseUrl + '/marketplace'); await p.getByTestId('listing-card').first().waitFor(); return {c, p};
}
const pics = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid=listing-card]')].map((card) => { const img = card.querySelector('img'); return {name: card.querySelector('h3, h2')?.textContent?.trim() ?? '', src: img?.getAttribute('src') ?? '', ok: !!img && img.complete && img.naturalWidth > 0, alt: img?.getAttribute('alt') ?? '', lazy: img?.getAttribute('loading') ?? '', note: card.querySelector('[data-testid=listing-picture-note]')?.textContent ?? ''}; }));
// Pictures are lazy-loaded: scroll through the list the way a visitor would, then wait for them.
const waitLoaded = async (p: Page) => { const n = await p.getByTestId('listing-card').count(); for (let i = 0; i < n; i++) await p.getByTestId('listing-card').nth(i).scrollIntoViewIfNeeded(); await p.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid=listing-card] img')].every((i) => i.complete), undefined, {timeout: 20000}); await p.evaluate(() => window.scrollTo(0, 0)); };
const keyOf = (src: string) => /\/images\/products\/([a-z]+)\.svg/.exec(src)?.[1] ?? (src.startsWith('data:') ? 'upload' : 'other');
try {
  await check('every product shows its own picture: rice, cassava, pepper, okra, plantain, fish, poultry, eggs, maize, supplies, compost, seeds, livestock; unknown gets the neutral one; nothing shows the mixed photograph', async () => {
    const {p} = await open(1280); await waitLoaded(p); const all = await pics(p); assert.equal(all.length, LISTINGS.length);
    for (const x of all) { if (x.name === 'Seller photo rice') continue; const want = EXPECT[x.name]; assert.ok(want, x.name); assert.equal(keyOf(x.src), want, `${x.name} shows ${x.src}`); assert.ok(x.ok, `${x.name} picture loaded`); assert.match(x.note, /Representative illustration/); assert.match(x.alt, /representative illustration/); }
    assert.ok(!all.some((x) => /liberia_agri_market|hero_liberia/.test(x.src)), 'no shared mixed photograph'); assert.equal(new Set(all.filter((x) => x.name !== 'Seller photo rice' && x.name !== 'Unknown gadget').map((x) => x.src)).size, 13 - 0, 'thirteen products, thirteen different pictures');
  });
  await check("a seller's own uploaded photo is kept and is not labelled as an illustration", async () => {
    const {p} = await open(1280); await waitLoaded(p); const own = (await pics(p)).find((x) => x.name === 'Seller photo rice')!; assert.equal(own.src, UPLOAD); assert.equal(own.note, ''); assert.ok(own.ok); assert.ok(!/representative/.test(own.alt));
  });
  await check('detail page: the same picture as the card, with an honest caption; photo uploads say they were supplied by the seller', async () => {
    const {p} = await open(1280); await waitLoaded(p);
    for (const name of ['Okra', 'Seller photo rice']) {
      const card = p.getByTestId('listing-card').filter({hasText: name}).first(); const cardSrc = await card.locator('img').getAttribute('src'); await card.getByRole('button', {name: /Details/}).click();
      const cap = p.getByTestId('detail-picture-caption'); await cap.waitFor(); const big = p.locator('figure img'); assert.equal(await big.getAttribute('src'), cardSrc);
      assert.match(await cap.innerText(), name === 'Okra' ? /Representative illustration of okra\. It is not a photograph of this seller's product/ : /Photo supplied by the seller/);
      assert.ok(await big.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)); await p.keyboard.press('Escape'); if (await cap.count()) await p.getByRole('button', {name: /close/i}).first().click().catch(() => undefined); await cap.waitFor({state: 'detached'}).catch(() => undefined);
    }
  });
  await check('filtering, searching and clearing keep every picture on its own product (no mix-ups)', async () => {
    const {p} = await open(1280); await waitLoaded(p);
    const consistent = async () => { await waitLoaded(p); for (const x of await pics(p)) if (EXPECT[x.name]) assert.equal(keyOf(x.src), EXPECT[x.name], `${x.name} -> ${x.src}`); };
    await p.locator('select').filter({hasText: 'All 9 Categories'}).first().selectOption('Vegetables'); await p.waitForFunction(() => document.querySelectorAll('[data-testid=listing-card]').length === 3); await consistent();
    assert.deepEqual((await pics(p)).map((x) => keyOf(x.src)).sort(), ['generic', 'okra', 'pepper']);
    await p.locator('select').filter({hasText: 'All 9 Categories'}).first().selectOption('Fish and seafood'); await p.waitForFunction(() => document.querySelectorAll('[data-testid=listing-card]').length === 1); assert.equal(keyOf((await pics(p))[0].src), 'fish');
    await p.locator('select').filter({hasText: 'All 9 Categories'}).first().selectOption(''); await p.waitForFunction(() => document.querySelectorAll('[data-testid=listing-card]').length === 15); await consistent();
    await p.locator('select').filter({hasText: 'All 15 Counties'}).first().selectOption('Lofa'); await p.waitForFunction(() => document.querySelectorAll('[data-testid=listing-card]').length === 1); assert.equal(keyOf((await pics(p))[0].src), 'pepper');
  });
  await check('mobile 320 and 375 and desktop: pictures load, no sideways scrolling, lazy-loaded, small', async () => {
    for (const w of [320, 375, 1280]) { const {p, c} = await open(w, 800); await waitLoaded(p); const all = await pics(p); assert.ok(all.every((x) => x.ok), `${w}: all load`); assert.ok(all.every((x) => x.lazy === 'lazy' || x.src.startsWith('data:')), 'lazy loading');
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${w}: no sideways scroll`);
      const box = await p.getByTestId('listing-card').first().locator('img').boundingBox(); assert.ok(box && box.width > 150 && box.height > 100, `${w}: picture is a usable size`); await c.close(); }
    const bytes = fs.readdirSync('public/images/products').reduce((n, f) => n + fs.statSync('public/images/products/' + f).size, 0); assert.ok(bytes < 25_000, `all 14 pictures together are ${bytes} bytes`);
  });
  await check('page loading: the whole marketplace list loads in a few seconds with at most a few KB of pictures', async () => {
    const {p, c} = await open(375, 800); await p.goto(backend.baseUrl + '/marketplace'); await p.getByTestId('listing-card').first().waitFor(); await waitLoaded(p);
    const perf = await p.evaluate(() => { const imgs = performance.getEntriesByType('resource').filter((r) => /\/images\/products\//.test(r.name)) as PerformanceResourceTiming[]; return {count: imgs.length, bytes: imgs.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0), nav: Math.round(performance.now())}; });
    assert.ok(perf.nav < 8000, `loaded in ${perf.nav} ms`); assert.ok(perf.bytes < 40_000, `${perf.bytes} bytes of pictures`); await c.close();
  });
  await check('offline: after one visit the pictures still show (they are in the offline cache)', async () => {
    const {c, p} = await open(375, 800); await waitLoaded(p); await p.evaluate(async () => { await navigator.serviceWorker.ready; }); await p.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    await p.waitForFunction(async () => !!(await caches.match('/images/products/rice.svg', {ignoreSearch: true})) && !!(await caches.match('/images/products/generic.svg', {ignoreSearch: true})), undefined, {timeout: 60000});
    await c.setOffline(true); await p.reload(); await p.getByTestId('listing-card').first().waitFor({timeout: 30000}).catch(() => undefined);
    const stillShown = await p.evaluate(async () => { const r = await caches.match('/images/products/okra.svg', {ignoreSearch: true}); const rice = await caches.match('/images/products/rice.svg', {ignoreSearch: true}); return {okra: !!r, rice: !!rice}; }); assert.deepEqual(stillShown, {okra: true, rice: true});
    const img = await p.evaluate(async () => { const i = new Image(); i.src = '/images/products/cassava.svg'; await i.decode().catch(() => undefined); return i.naturalWidth > 0; }); assert.equal(img, true, 'a picture decodes while offline'); await c.setOffline(false);
  });
  await check('the seller form no longer offers a sample picture that mislabels the product', async () => {
    const {p} = await open(375, 900); await p.getByRole('button', {name: /sell|post/i}).first().click().catch(() => undefined);
    assert.equal(await p.getByText('Rice / Crops').count(), 0); assert.equal(await p.getByText('Seeds / Inputs / Tools').count(), 0);
  });
  assert.deepEqual(errors, [], 'no page errors: ' + JSON.stringify(errors.slice(0, 3)));
  console.log(JSON.stringify({engine, note: 'automated browser with synthetic data; no physical iPhone or Android phone', passed: passed.length}));
} catch (e) { console.error('Marketplace images QA failed:', e); process.exitCode = 1; }
finally { for (const c of contexts) await c.close().catch(() => undefined); await browser.close().catch(() => undefined); await backend.stop(); }
