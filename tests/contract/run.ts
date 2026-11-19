import fs from 'node:fs';
import path from 'node:path';
import {startBackend} from '../harness/backend.ts';
import {CookieJar, req} from '../harness/http.ts';
import {cookieShapes, deepDiff, headerShape, normalizeJson} from './normalize.ts';
import {STEPS, type Ctx, type JarName} from './script.ts';

/**
 * Runs the contract script against a FRESH backend and either records (--update) or verifies the golden snapshot.
 *   npm run test:contract           verify (fails on any difference)
 *   npm run test:contract:update    regenerate golden (only from the Node reference backend, on a fresh database)
 * Default backend: Node in-process on a disposable DB. API_BASE_URL + TEST_FIXTURE_TOKEN: any other backend (see docs/TEST_HARNESS.md).
 */
const GOLDEN = path.resolve('tests/contract/golden/node.v1.json');
const update = process.argv.includes('--update');

interface Recorded {
  name: string;
  request: {method: string; path: string};
  status: number;
  headers: Record<string, string>;
  cookies: unknown;
  body: unknown;
}

const maskPath = (p: string): string => p.replace(/\/\d+(?=\/|\?|$)/g, '/<id>');

async function main(): Promise<void> {
  const backend = await startBackend();
  try {
    const jars: Record<JarName, CookieJar> = {anon: new CookieJar(), farmer: new CookieJar(), farmer2: new CookieJar(), other: new CookieJar(), admin: new CookieJar(), expert: new CookieJar()};
    // Setup logins (not recorded) go through the normal login path from devices the fixture registered as trusted.
    const trust = async (jar: CookieJar, phone: string) => jar.set('agri_device', await backend.fixtures.trustDevice(phone));
    await backend.fixtures.createUser({displayName: 'Contract Admin', phone: '+231775550001', password: 'AdminTestPass!123', roles: ['admin']});
    await trust(jars.admin, '+231775550001');
    const adminLogin = await req(jars.admin, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231775550001', password: 'AdminTestPass!123'}});
    await backend.fixtures.createUser({displayName: 'Contract Other Farmer', phone: '+231771234002', password: 'SafePassword123', roles: ['farmer']});
    await trust(jars.other, '+231771234002');
    const otherLogin = await req(jars.other, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231771234002', password: 'SafePassword123'}});
    if (otherLogin.status !== 200) throw new Error('Could not sign in the contract second farmer.');
    // Answering other people's expert requests is reserved for accounts with a PRIVATE password: the seeded demo expert's password is published (so it is an
    // untrusted shared account). The contract plays a real extension officer, so the same seeded record gets a private password. Every recorded response is
    // unchanged (same user, same name); the shared-account restriction itself is covered by tests/api.test.ts and tests/phase0.test.ts.
    await backend.fixtures.setPassword('+231770000201', 'OfficerPrivate!2026x');
    await trust(jars.expert, '+231770000201');
    const expertLogin = await req(jars.expert, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231770000201', password: 'OfficerPrivate!2026x'}});
    if (adminLogin.status !== 200 || expertLogin.status !== 200) throw new Error('Could not sign in the contract admin/expert users.');

    const ctx: Ctx = {jars, fx: backend.fixtures, ids: {}};
    const recorded: Recorded[] = [];
    for (const step of STEPS) {
      const urlPath = typeof step.path === 'function' ? step.path(ctx) : step.path;
      const body = typeof step.body === 'function' ? (step.body as (c: Ctx) => unknown)(ctx) : step.body;
      const method = step.method ?? 'GET';
      await step.before?.(ctx); // setup only; never recorded
      const res = await req(jars[step.jar], urlPath, {method, body, headers: step.headers, skipCsrf: step.skipCsrf});
      step.capture?.(res.data, ctx);
      recorded.push({
        name: step.name,
        request: {method, path: maskPath(urlPath)},
        status: res.status,
        headers: headerShape(res.headers),
        cookies: cookieShapes(res.headers),
        body: normalizeJson(res.data),
      });
    }

    const snapshot = {schema: 1, source: 'node-express-sqlite (reference)', steps: recorded};
    if (update) {
      fs.mkdirSync(path.dirname(GOLDEN), {recursive: true});
      fs.writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 2) + '\n');
      console.log(`Golden snapshot written: ${GOLDEN} (${recorded.length} requests)`);
      return;
    }

    if (!fs.existsSync(GOLDEN)) throw new Error(`No golden snapshot at ${GOLDEN}. Run npm run test:contract:update on the Node reference first.`);
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as typeof snapshot;
    let failures = 0;
    if (golden.steps.length !== recorded.length) {
      console.error(`Step count differs: golden ${golden.steps.length}, actual ${recorded.length}`);
      failures++;
    }
    for (let i = 0; i < Math.min(golden.steps.length, recorded.length); i++) {
      const diffs = deepDiff(golden.steps[i], recorded[i]);
      if (diffs.length > 0) {
        failures++;
        console.error(`\nX  [${i + 1}] ${recorded[i].name}  (${recorded[i].request.method} ${recorded[i].request.path})`);
        for (const d of diffs.slice(0, 6)) console.error(`     ${d.path}\n       expected: ${JSON.stringify(d.expected)}\n       actual:   ${JSON.stringify(d.actual)}`);
        if (diffs.length > 6) console.error(`     ... and ${diffs.length - 6} more differences`);
      }
    }
    if (failures > 0) {
      console.error(`\nContract check FAILED: ${failures} of ${Math.max(golden.steps.length, recorded.length)} requests differ.`);
      process.exitCode = 1;
    } else {
      console.log(`Contract check passed: all ${recorded.length} requests match the golden snapshot.`);
    }
  } finally {
    await backend.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
