import {pathToFileURL} from 'node:url';

/** Read-only release gate: public GETs only. Never logs cookies, secrets or submitted user data. */
export async function inspectDeployment(configured, expectedMode = 'real', request = fetch) {
  const origin = new URL(configured);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new Error('Use an HTTPS origin without credentials, paths, queries or fragments (localhost HTTP is allowed for tests).');
  if (!['real', 'demo'].includes(expectedMode)) throw new Error('Expected mode must be real or demo.');
  const checks = [];
  const check = (name, ok) => checks.push({name, ok: Boolean(ok)});
  const get = async (path) => {
    const url = new URL(path, origin);
    if (url.origin !== origin.origin) throw new Error('Refusing an off-origin asset.');
    const response = await request(url.href, {method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`Public deployment GET failed: ${url.pathname} (HTTP ${response.status}).`);
    return response;
  };
  const environment = await (await get('/api/v1/environment')).json();
  check('expected registration mode', expectedMode === 'real' ? environment.demoEnvironment === false && environment.syntheticAccountsOnly === false && environment.registryMode === 'real' : environment.demoEnvironment === true && environment.syntheticAccountsOnly === true && environment.registryMode === 'synthetic');
  check('phone/password without mandatory SMS', environment.phoneVerification === 'none' && environment.simulatedSms === false);
  check('API healthy', (await (await get('/api/v1/health')).json()).status === 'ok');
  const shell = await get('/ussd'); const html = await shell.text();
  check('deep link serves HTML', (shell.headers.get('content-type') || '').includes('text/html'));
  check('shell is not stored by HTTP caches', (shell.headers.get('cache-control') || '').includes('no-store'));
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const entry = scripts.find((s) => /^\/?assets\/index-[\w-]+\.js$/.test(s));
  check('hashed application entry exists', entry);
  if (entry) {
    const js = await (await get(new URL(entry, origin).href)).text();
    const handset = js.match(/(?:assets\/)?UssdOnlyPage-[\w-]+\.js/)?.[0];
    check('application includes standalone handset', handset);
    if (handset) {
      const asset = await get('/assets/' + handset.replace(/^assets\//, ''));
      check('standalone chunk is JavaScript, not SPA fallback HTML', /javascript/.test(asset.headers.get('content-type') || ''));
    }
  }
  const worker = await get('/sw.js');
  check('worker is not stored by HTTP caches', (worker.headers.get('cache-control') || '').includes('no-store'));
  check('legacy handset recovery is shipped', (await worker.text()).includes('ussd-update-bridge.js'));
  const bridge = await get('/ussd-update-bridge.js');
  check('recovery bridge is JavaScript', /javascript/.test(bridge.headers.get('content-type') || ''));
  check('current forms have a recovery handshake', (await bridge.text()).includes('AGRICARE_USSD_CLIENT_PROBE'));
  return {origin: origin.origin, expectedMode, observedMode: environment.registryMode ?? 'unknown', phoneVerification: environment.phoneVerification ?? 'unknown', ready: checks.every((c) => c.ok), checks};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  try {
    const origin = argument('--origin'); if (!origin) throw new Error('Usage: node scripts/check-public-deployment.mjs --origin https://agricare.mpgmca.com --mode real|demo');
    const result = await inspectDeployment(origin, argument('--mode') || 'real'); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ready ? 0 : 3;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
