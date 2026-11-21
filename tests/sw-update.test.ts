import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

/** public/sw-update.js (imported into the generated service worker) and the worker settings that make a new version take over by itself. */
const root = process.cwd();
const script = fs.readFileSync(path.join(root, 'public/sw-update.js'), 'utf8');
type Handler = (event: {waitUntil: (p: Promise<unknown>) => void}) => void;
function worker(opts: {activeAtInstall: boolean; navigate?: (url: string) => Promise<unknown>}) {
  const handlers: Record<string, Handler> = {}; const log = {claims: 0, navigated: [] as string[], messages: [] as unknown[]};
  const pages = ['https://x.test/ussd', 'https://x.test/guides'].map((url) => ({url, navigate: (u: string) => { log.navigated.push(u); return opts.navigate ? opts.navigate(u) : Promise.resolve(); }, postMessage: (m: unknown) => { log.messages.push(m); }}));
  const self = {registration: {active: opts.activeAtInstall ? {} : null}, addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; }, clients: {claim: async () => { log.claims++; }, matchAll: async () => pages}};
  vm.runInNewContext(script, {self}); return {handlers, log};
}
const fire = async (h: Handler) => { let waited: Promise<unknown> = Promise.resolve(); h({waitUntil: (p) => { waited = p; }}); await waited; };

test('a first install never reloads anything (there is no old version to replace)', async () => {
  const w = worker({activeAtInstall: false}); await fire(w.handlers.install); await fire(w.handlers.activate);
  assert.equal(w.log.claims, 0); assert.deepEqual(w.log.navigated, []);
});

test('an update takes control and reloads every open page of the old version, once', async () => {
  const w = worker({activeAtInstall: true}); await fire(w.handlers.install); await fire(w.handlers.activate);
  assert.equal(w.log.claims, 1); assert.deepEqual(w.log.navigated, ['https://x.test/ussd', 'https://x.test/guides']);
});

test('activation does not wait for the reloads (a reload is answered by this very worker, so waiting would deadlock)', async () => {
  const w = worker({activeAtInstall: true, navigate: () => new Promise(() => undefined)}); // never settles
  await Promise.race([fire(w.handlers.install).then(() => fire(w.handlers.activate)), new Promise((_, reject) => setTimeout(() => reject(new Error('activate waited for navigate()')), 1500))]);
  assert.equal(w.log.navigated.length, 2);
});

test('when the browser refuses to navigate a page, the page is told instead (the app reloads itself)', async () => {
  const w = worker({activeAtInstall: true, navigate: () => Promise.reject(new Error('refused'))}); await fire(w.handlers.install); await fire(w.handlers.activate); await new Promise((r) => setTimeout(r, 20));
  assert.equal(JSON.stringify(w.log.messages), JSON.stringify([{type: 'AGRICARE_SW_UPDATED'}, {type: 'AGRICARE_SW_UPDATED'}]));
});

test('the build is configured so a new version activates by itself, imports the helper and does not precache it', () => {
  const vite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
  assert.match(vite, /skipWaiting: true/); assert.match(vite, /clientsClaim: true/); assert.match(vite, /importScripts: \['sw-update\.js'\]/); assert.match(vite, /globIgnores: \['sw-update\.js'\]/);
  const sw = path.join(root, 'dist/sw.js');
  if (fs.existsSync(sw)) { const built = fs.readFileSync(sw, 'utf8'); assert.match(built, /importScripts\("sw-update\.js"\)/); assert.match(built, /self\.skipWaiting\(\)/); assert.ok(!/sw-update\.js",\s*revision|"url":\s*"sw-update\.js"/.test(built)); assert.ok(fs.existsSync(path.join(root, 'dist/sw-update.js'))); }
  const app = fs.readFileSync(path.join(root, 'src/lib/pwaUpdate.ts'), 'utf8');
  assert.match(app, /AGRICARE_SW_UPDATED/); assert.match(app, /registration\.update\(\)/); assert.match(app, /visibilitychange/);
});

test('the standalone /ussd route is rendered outside the website layout, and server and service worker fall back to the app for it', () => {
  const appSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /STANDALONE = \/\^\\\/ussd\\\/\?\$\//); assert.match(appSrc, /if \(STANDALONE\.test\(pathname\)\) return <RouteContent><UssdOnlyPage \/><\/RouteContent>/);
  const vite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8'); assert.match(vite, /navigateFallback: '\/index\.html'/); assert.ok(!/navigateFallbackDenylist:[^\]]*ussd/.test(vite), '/ussd is never excluded from the app fallback');
});
