import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';

const source = fs.readFileSync(new URL('../public/sw-update.js', import.meta.url), 'utf8');
async function activate(navigate: () => Promise<unknown>) {
  const handlers: Record<string, (event: {waitUntil(p: Promise<unknown>): void}) => void> = {};
  const self = {location: {origin: 'https://x.test'}, registration: {active: {}}, skipWaiting: async () => {}, addEventListener: (name: string, fn: any) => { handlers[name] = fn; }, clients: {matchAll: async () => [{url: 'https://x.test/ussd', postMessage: () => {}, navigate}]}};
  vm.runInNewContext(source, {self, URL, MessageChannel, setTimeout: (fn: () => void) => setTimeout(fn, 10), clearTimeout});
  for (const name of ['install', 'activate']) { let waiting = Promise.resolve(); handlers[name]({waitUntil(p) { waiting = p.then(() => undefined); }}); await waiting; }
}
test('activation never waits for a navigation which may depend on activation completing', async () => {
  let navigated = 0;
  await Promise.race([activate(() => { navigated++; return new Promise(() => {}); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('activation deadlock')), 1500); timer.unref(); })]);
  assert.equal(navigated, 1);
});
test('refused legacy navigation is handled without broadcasting an unsafe reload fallback', async () => {
  await activate(() => Promise.reject(new Error('closed tab')));
  assert.ok(!source.includes('AGRICARE_SW_UPDATED'));
});
test('one worker imports one canonical recovery helper and retains offline fallback', () => {
  const config = fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /importScripts: \['sw-update\.js'\]/);
  assert.match(config, /globIgnores: \['sw-update\.js'\]/);
  assert.ok(!/skipWaiting:\s*true/.test(config), 'no blanket automatic activation');
  assert.match(config, /clientsClaim: true/); assert.match(config, /navigateFallback: '\/index\.html'/);
  assert.ok(!fs.existsSync(new URL('../public/ussd-update-bridge.js', import.meta.url)), 'no competing helper');
  const built = fs.readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  assert.match(built, /importScripts\("sw-update\.js"\)/);
  assert.ok(!built.includes('ussd-update-bridge.js'));
});
test('application detects foreground updates and protects current inputs on external activation', () => {
  const app = fs.readFileSync(new URL('../src/lib/pwaUpdate.ts', import.meta.url), 'utf8');
  assert.match(app, /visibilitychange/); assert.match(app, /5 \* 60 \* 1000/);
  assert.match(app, /AGRICARE_USSD_CLIENT_PROBE/); assert.match(app, /onNeedReload\(\)/);
  assert.ok(!app.includes('AGRICARE_SW_UPDATED'));
  const registrations = [...app.matchAll(/\bregisterSW\(/g)]; assert.equal(registrations.length, 1);
});
