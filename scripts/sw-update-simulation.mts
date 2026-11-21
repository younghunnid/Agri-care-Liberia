/**
 * Reproduces and verifies the "returning visitor still sees the old app" problem with REAL builds of three versions and a real service worker in Chromium.
 *
 *   npx tsx scripts/sw-update-simulation.mts <oldCommit> <midCommit>      (the current working tree's `dist` is the FIXED version; run `npm run build` first)
 *
 * old = a version without the /ussd route (for example c7b80eb), mid = the version that added it but whose worker waits (for example 8cb5464).
 * The script builds old and mid into a fresh temporary folder, serves whichever version is "current" from a tiny static server (SPA fallback, same
 * cache headers as production) and drives one browser through: old -> mid (bug reproduced) -> fixed (page updates by itself).
 * Limitation: Chromium automation, not physical Safari. Current-client form protection and WebKit compatibility are tested separately.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
const {chromium} = (await import(path.resolve('node_modules/playwright/index.mjs'))) as typeof import('playwright');
const [oldCommit, midCommit] = process.argv.slice(2); assert.ok(oldCommit && midCommit, 'usage: sw-update-simulation.mts <oldCommit> <midCommit>');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-swsim-')); const root = process.cwd();
const dists: Record<string, string> = {fixed: path.join(root, 'dist')};
for (const [name, commit] of [['old', oldCommit], ['mid', midCommit]] as const) {
  const dir = path.join(work, name); fs.mkdirSync(dir);
  const revision = execFileSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], {cwd: root, encoding: 'utf8'}).trim();
  const archive = path.join(work, `${name}.tar`);
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, revision], {cwd: root});
  execFileSync('tar', ['-xf', archive, '-C', dir]); fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  execFileSync('npx', ['vite', 'build'], {cwd: dir, stdio: 'ignore'}); dists[name] = path.join(dir, 'dist');
  console.log(`built ${name} (${commit}): skipWaiting() calls in sw.js = ${(fs.readFileSync(path.join(dir, 'dist/sw.js'), 'utf8').match(/skipWaiting\(\)/g) ?? []).length}`);
}
let current = 'old';
const types: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.ico': 'image/x-icon'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x'); const dist = dists[current];
  if (url.pathname.startsWith('/api/')) { res.writeHead(404, {'content-type': 'application/json'}); res.end('{"error":{"code":"NOT_FOUND"}}'); return; }
  let file = path.join(dist, decodeURIComponent(url.pathname)); const isFile = file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!isFile) file = path.join(dist, 'index.html');
  const ext = path.extname(file); const revalidate = ['sw.js', 'index.html', 'manifest.webmanifest', 'sw-update.js', 'ussd-update-bridge.js'].includes(path.basename(file));
  res.writeHead(200, {'content-type': types[ext] ?? 'application/octet-stream', 'cache-control': revalidate ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'}); fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
const entryOf = (name: string) => (fs.readFileSync(path.join(dists[name], 'index.html'), 'utf8').match(/assets\/index-[\w-]+\.js/) ?? [''])[0];
const browser = await chromium.launch({executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const log = (s: string) => console.log(s); let failed = false;
const standalone = (p: import('playwright').Page) => p.getByTestId('ussd-only-page').waitFor({timeout: 60000});
try {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'allow'}); ctx.setDefaultTimeout(30000);
  const page = await ctx.newPage(); let navs = 0; page.on('load', () => { navs++; }); // full document loads (a same-document route change is not a reload)
  // 1. the visitor has the OLD version installed
  current = 'old'; await page.goto(base + '/'); await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  log('1. old version installed and controlling the page');
  // 2. the MID version is deployed; the visitor scans the QR (opens /ussd)
  current = 'mid'; await page.goto(base + '/ussd'); await page.waitForTimeout(6000);
  const body = await page.locator('body').innerText();
  const reproduced = /could not find that page/i.test(body) && (await page.getByTestId('ussd-only-page').count()) === 0;
  log(`2. mid version deployed, /ussd opened by a returning visitor: old "not found" screen shown = ${reproduced}  (this is the reported bug)`);
  // 3. the FIXED version is deployed; the visitor scans again / reloads
  current = 'fixed'; navs = 0; await page.goto(base + '/ussd'); await standalone(page);
  const afterNavs = navs; assert.ok(afterNavs <= 3, `bounded legacy recovery: ${afterNavs} loads`); log(`3. fixed version deployed: the standalone phone page appeared by itself (page loads: ${afterNavs})`);
  assert.equal(await page.locator('nav').count(), 0); assert.deepEqual(await page.locator('a').evaluateAll((a) => a.map((x) => x.getAttribute('href'))), ['/']);
  const entry = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-/.test(s)) ?? ''); assert.ok(entry.endsWith(entryOf('fixed')), `the page runs the fixed bundle: ${entry}`);
  await page.waitForTimeout(8000); assert.ok(navs <= afterNavs + 0, `no reload loop (page loads stayed at ${navs})`);
  await page.reload(); await standalone(page); await page.goto(base + '/ussd'); await standalone(page); await page.goto(base + '/ussd/'); await standalone(page); log('   refresh and direct visits to /ussd and /ussd/ work');
  await page.getByTestId('ussd-back-to-site').click(); await page.getByRole('heading', {level: 1}).filter({hasText: /Practical Farming Help/}).waitFor(); log('   Back to website returns to the normal homepage (full layout)');
  // 4. another old tab remains usable; only legacy handsets are explicitly recovered
  const ctx2 = await browser.newContext({serviceWorkers: 'allow'}); ctx2.setDefaultTimeout(30000); const p2 = await ctx2.newPage(); current = 'old'; await p2.goto(base + '/guides'); await p2.evaluate(async () => { await navigator.serviceWorker.ready; }); await p2.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  const tab2 = await ctx2.newPage(); current = 'fixed'; await tab2.goto(base + '/ussd') ; await standalone(tab2);
  await p2.getByRole('heading', {level: 1}).first().waitFor();
  log('4. the second old website tab remains usable; current form preservation is tested separately');
  // 5. old -> fixed directly, and a brand-new visitor
  const ctx3 = await browser.newContext({serviceWorkers: 'allow'}); ctx3.setDefaultTimeout(30000); const p3 = await ctx3.newPage(); current = 'old'; await p3.goto(base + '/'); await p3.evaluate(async () => { await navigator.serviceWorker.ready; }); current = 'fixed'; await p3.goto(base + '/ussd'); await standalone(p3); log('5. old -> fixed directly: /ussd opens the standalone page');
  const ctx4 = await browser.newContext({serviceWorkers: 'allow'}); ctx4.setDefaultTimeout(30000); const p4 = await ctx4.newPage(); let n4 = 0; p4.on('load', () => { n4++; }); current = 'fixed'; await p4.goto(base + '/ussd'); await standalone(p4); await p4.waitForTimeout(6000);
  assert.equal(n4, 1, 'a brand-new visitor is never reloaded'); log('6. a brand-new visitor opens /ussd directly and is not reloaded');
  assert.ok(reproduced, 'the old behaviour should have been reproduced in step 2');
  log('RESULT: OK');
} catch (e) { failed = true; console.error('FAILED', e); } finally { await browser.close(); server.close(); if (failed) process.exitCode = 1; }
