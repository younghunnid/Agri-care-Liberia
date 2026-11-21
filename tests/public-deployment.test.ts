import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectDeployment} from '../scripts/check-public-deployment.mjs';
function fixture(over: {demo?: boolean; worker?: boolean; shellCache?: string; chunkType?: string; externalEntry?: boolean} = {}) {
  const paths: string[] = [];
  const request = async (input: string, options: RequestInit) => {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    const url = new URL(input); assert.equal(url.origin, 'https://agricare.mpgmca.com'); paths.push(url.pathname);
    const demo = over.demo === true;
    if (url.pathname === '/api/v1/environment') return Response.json({demoEnvironment: demo, syntheticAccountsOnly: demo, registryMode: demo ? 'synthetic' : 'real', phoneVerification: 'none', simulatedSms: false});
    if (url.pathname === '/api/v1/health') return Response.json({status: 'ok'});
    if (url.pathname === '/ussd') return new Response(`<html><script type="module" src="${over.externalEntry ? 'https://untrusted.invalid/app.js' : '/assets/index-current.js'}"></script></html>`, {headers: {'content-type': 'text/html', 'cache-control': over.shellCache ?? 'no-store'}});
    if (url.pathname === '/assets/index-current.js') return new Response('import("./UssdOnlyPage-current.js")');
    if (url.pathname === '/assets/UssdOnlyPage-current.js') return new Response('/* standalone phone */', {headers: {'content-type': over.chunkType ?? 'application/javascript'}});
    if (url.pathname === '/sw.js') return new Response(over.worker === false ? '/* legacy worker */' : 'importScripts("sw-update.js")', {headers: {'cache-control': 'no-store'}});
    if (url.pathname === '/sw-update.js') return new Response('AGRICARE_USSD_CLIENT_PROBE', {headers: {'content-type': 'application/javascript'}});
    throw new Error('Unexpected public request');
  };
  return {request: request as typeof fetch, paths};
}
test('source-defined real-user deployment passes the public read-only release gate', async () => {
  const f = fixture(); const result = await inspectDeployment('https://agricare.mpgmca.com', 'real', f.request); assert.equal(result.ready, true); assert.ok(f.paths.every((p) => !/register|login|admin/.test(p)));
});
test('synthetic-only mode never passes a real-user gate and is not changed by the check', async () => {
  const f = fixture({demo: true}); assert.equal((await inspectDeployment('https://agricare.mpgmca.com', 'real', f.request)).ready, false); assert.equal((await inspectDeployment('https://agricare.mpgmca.com', 'demo', f.request)).ready, true);
});
test('stale shell, old worker and HTML returned for a missing chunk are detected', async () => {
  for (const over of [{shellCache: 'public, max-age=3600'}, {worker: false}, {chunkType: 'text/html'}]) {
    const result = await inspectDeployment('https://agricare.mpgmca.com', 'real', fixture(over).request); assert.equal(result.ready, false);
  }
});
test('untrusted origins and off-origin script references are never followed', async () => {
  for (const origin of ['https://user:password@agricare.mpgmca.com', 'http://agricare.mpgmca.com', 'https://agricare.mpgmca.com/ussd', 'https://agricare.mpgmca.com?token=private']) await assert.rejects(inspectDeployment(origin));
  const f = fixture({externalEntry: true}); assert.equal((await inspectDeployment('https://agricare.mpgmca.com', 'real', f.request)).ready, false); assert.ok(f.paths.every((p) => !p.includes('untrusted')));
});
