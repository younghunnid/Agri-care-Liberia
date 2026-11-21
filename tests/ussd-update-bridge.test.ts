import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {MessageChannel} from 'node:worker_threads';
const source = fs.readFileSync(new URL('../public/ussd-update-bridge.js', import.meta.url), 'utf8');
async function run(event: 'install' | 'activate', rows: {path: string; aware: boolean}[], active = true) {
  const callbacks = new Map<string, (e: {waitUntil(p: Promise<unknown>): void}) => void>(); const navigated: string[] = []; let skipped = 0;
  const self = {location: {origin: 'https://agricare.mpgmca.com'}, registration: {active: active ? {} : null}, addEventListener: (name: string, fn: any) => callbacks.set(name, fn), skipWaiting: async () => { skipped++; }, clients: {matchAll: async () => rows.map((r) => ({url: new URL(r.path, 'https://agricare.mpgmca.com').href, postMessage: (_msg: unknown, ports: MessagePort[]) => { if (r.aware) ports[0].postMessage({type: 'AGRICARE_USSD_CLIENT_READY'}); }, navigate: async () => { navigated.push(r.path); }}))}};
  vm.runInNewContext(source, {self, URL, MessageChannel, setTimeout: (f: () => void) => setTimeout(f, 25), clearTimeout});
  let waiting = Promise.resolve(); callbacks.get(event)!({waitUntil(p) { waiting = p.then(() => undefined); }}); await waiting;
  return {skipped, navigated};
}
test('a legacy /ussd shell activates its replacement and is navigated to the current shell', async () => {
  assert.equal((await run('install', [{path: '/ussd', aware: false}])).skipped, 1);
  assert.deepEqual((await run('activate', [{path: '/ussd?timeout=20', aware: false}])).navigated, ['/ussd?timeout=20']);
});
test('current handset pages, including active forms, are never force-reloaded', async () => {
  assert.equal((await run('install', [{path: '/ussd', aware: true}])).skipped, 0);
  assert.deepEqual((await run('activate', [{path: '/ussd', aware: true}])).navigated, []);
});
test('other website pages and origins keep the existing prompt-based update policy', async () => {
  const pages = [{path: '/harvest/sell', aware: false}, {path: '/register', aware: false}, {path: '/ussd-demo', aware: false}, {path: 'https://example.org/ussd', aware: false}];
  assert.equal((await run('install', pages)).skipped, 0); assert.deepEqual((await run('activate', pages)).navigated, []);
});
test('first installation is not forcibly activated; trailing slash legacy handsets are recovered', async () => {
  assert.equal((await run('install', [{path: '/ussd', aware: false}], false)).skipped, 0);
  assert.deepEqual((await run('activate', [{path: '/ussd/', aware: false}])).navigated, ['/ussd/']);
});
