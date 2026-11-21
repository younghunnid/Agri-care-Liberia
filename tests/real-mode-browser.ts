/** Real-user mode browser QA on a production-build server (no APP_ENV, SMS off) with a disposable SQLite database and synthetic people. Run after a build with VITE_USSD_MARKETPLACE_ENABLED=true. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {chromium, type BrowserContext, type Page} from 'playwright';
import {choosePhone as choose, readPhonePages as review, phoneText as screen} from './ussdBrowserHelpers.ts';
assert.ok(!process.env.API_BASE_URL, 'real-mode browser QA requires its own disposable server');
const PW = 'Garden-Harvest-7391!';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-realbrowser-')); const dbPath = path.join(dir, 'p.db');
const port = await new Promise<number>((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const base = `http://127.0.0.1:${port}`; let out = '';
const server: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NODE_ENV: 'production', DB_PATH: dbPath, PORT: String(port), HOST: '127.0.0.1', TRUST_PROXY: '1', SESSION_SECRET: crypto.randomBytes(32).toString('hex'), OTP_HMAC_SECRET: crypto.randomBytes(32).toString('hex')}});
server.stdout?.on('data', (d) => (out += d)); server.stderr?.on('data', (d) => (out += d));
for (let i = 0; i < 120; i++) { try { await fetch(`${base}/api/v1/health`, {signal: AbortSignal.timeout(3000)}); break; } catch { if (server.exitCode !== null) break; await new Promise((r) => setTimeout(r, 250)); } }
assert.equal(server.exitCode, null, `server did not start: ${out}`);
const db = () => new DatabaseSync(dbPath);
const one = <T,>(sql: string, ...a: string[]): T => db().prepare(sql).get(...a) as T;
const browser = await chromium.launch({executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const errors: string[] = []; const passed: string[] = []; const contexts: BrowserContext[] = [];
const check = async (name: string, f: () => Promise<void>) => { await f(); passed.push(name); console.log('PASS ' + name); };
async function profile(width = 375) {
  const c = await browser.newContext({viewport: {width, height: 812}, serviceWorkers: 'allow'}); contexts.push(c); c.setDefaultTimeout(20000);
  await c.addInitScript({content: `window.__spoken = []; window.__rates = []; window.__agriVoicePauseScale = 0.02; class U { constructor(t) { this.text = t; } } Object.defineProperty(window, 'SpeechSynthesisUtterance', {configurable: true, value: U});
    Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: {getVoices: () => [], cancel: () => {}, speak: (u) => { window.__rates.push(u.rate); window.__spoken.push(u.text); if (u.onstart) u.onstart(); if (u.onend) u.onend(); }}});`});
  c.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  return c;
}
const frame = (p: Page) => p.getByTestId('ussd-screen').getAttribute('data-frame');
const waitFrame = (p: Page, re: string) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''), re);
const dialAndWelcome = async (p: Page, voice: boolean) => { await p.goto(base + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor(); await choose(p, '*440#'); await waitFrame(p, 'enroll.welcome'); await choose(p, voice ? '1' : '2'); await waitFrame(p, 'enroll.category'); };
const participants = () => one<{n: number}>('SELECT count(*) n FROM participant_registrations').n;
const users = () => one<{n: number}>('SELECT count(*) n FROM users').n;
const fillCreate = async (p: Page, name: string, phone: string, pw = PW, accept = true) => {
  await p.getByTestId('uf-name').fill(name); await p.getByTestId('uf-phone').fill(phone); await p.getByTestId('uf-pw').fill(pw);
  if (accept) await p.getByTestId('uf-privacy').check(); await p.getByTestId('uf-submit').click();
};
try {
  const ctxA = await profile(); const A = await ctxA.newPage();
  await check('real mode: dial *440#, voice on, category, county, then the ACCOUNT step (nothing is saved for an anonymous browser)', async () => {
    await dialAndWelcome(A, true);
    assert.match(await screen(A).innerText(), /Choose your category/); assert.ok(!/demo/i.test(await screen(A).innerText()));
    await choose(A, '1'); await waitFrame(A, 'enroll.county'); await choose(A, '1'); await waitFrame(A, 'enroll.account');
    const t = await screen(A).innerText(); assert.match(t, /1 Sign in\n2 Create account/); assert.match(t, /not detected or verified/);
    assert.equal(participants(), 0); assert.equal(users(), 0);
    assert.ok((await A.evaluate(() => (window as any).__spoken.length)) >= 2, 'screens are read automatically after voice was switched on');
    assert.ok((await A.evaluate(() => (window as any).__rates as number[])).every((r) => r === 0.75), 'the default voice speed is 0.75');
    const lastSpoken = await A.evaluate(() => (window as any).__spoken.at(-1) as string); assert.match(lastSpoken, /\.$/); assert.ok((await A.evaluate(() => (window as any).__spoken as string[])).some((t) => /^Press \w+ for /.test(t)), 'menu numbers are read as Press-one-for instructions'); assert.ok(!/\n/.test(lastSpoken));
  });
  await check('create an account in the secure form: privacy notice required, phone entered explicitly and NOT verified, handset continues to consent by itself', async () => {
    await choose(A, '2'); await waitFrame(A, 'enroll.form'); await A.getByTestId('ussd-account-form').waitFor();
    assert.match(await A.getByTestId('ussd-account-form').innerText(), /not detected|does not verify/i); assert.match(await screen(A).innerText(), /secure form/);
    await fillCreate(A, 'Mary Kollie', '0886 500 111', PW, false); assert.match(await A.getByTestId('uf-error').innerText(), /privacy notice/); assert.equal(users(), 0);
    await A.getByTestId('uf-privacy').check(); await A.getByTestId('uf-submit').click();
    await waitFrame(A, 'enroll.consent'); assert.equal(users(), 1);
    const u = one<{phone: string; phone_verified_at: string | null}>('SELECT phone, phone_verified_at FROM users'); assert.equal(u.phone, '+231886500111'); assert.equal(u.phone_verified_at, null, 'the typed number is not marked verified');
    assert.equal(one<{n: number}>('SELECT count(*) n FROM privacy_consents').n, 1); assert.equal(participants(), 0, 'not yet: registry consent is still to be given');
    let transcript = await screen(A).innerText(); for (let i = 0; i < 30 && /\n1 Next\n/.test(await screen(A).innerText()); i++) { await choose(A, '1'); transcript += '\n' + await screen(A).innerText(); }
    const body = transcript.split('\n').filter((l) => !/^(Registry consent \d+\/\d+|1 Next|0 Back|1 Agree & register|2 Decline)$/.test(l)).join(' ').replace(/\s+/g, ' ');
    assert.match(body, /not verified/i); assert.match(body, /not an active telecom service/i); assert.ok(!/synthetic|demo/i.test(transcript), 'the real consent text never calls the registry a demo');
  });
  await check('agree: a genuine non-synthetic participant is saved once and the original menu opens', async () => {
    await choose(A, '1'); await A.getByTestId('ussd-screen').filter({has: screen(A).filter({hasText: 'FARM ADVICE'})}).waitFor();
    const p = one<{is_synthetic: number; user_id: number; category: string; county: string}>('SELECT is_synthetic, user_id, category, county FROM participant_registrations'); assert.equal(p.is_synthetic, 0); assert.equal(p.category, 'Farmer'); assert.equal(p.county, 'Bomi'); assert.ok(p.user_id);
    assert.equal(one<{v: string}>('SELECT consent_version v FROM participant_consents').v, 'ussd-registry-v1');
    const id = await A.getByTestId('ussd-identity').innerText(); assert.match(id, /Registered Farmer · Bomi/); assert.match(id, /not verified/); assert.ok(!/synthetic/i.test(id));
    const spoken = (await A.evaluate(() => (window as any).__spoken as string[])).join('\n'); assert.ok(!spoken.includes(PW) && !/500 ?111|0886/.test(spoken), 'the typed password and phone are never spoken');
    assert.equal(participants(), 1);
  });
  await check('every existing USSD menu still opens in real mode (1 to 8), option 8 Sell & Market included, voice reads them', async () => {
    for (const option of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      await choose(A, option); const t = await screen(A).innerText(); assert.ok(t.length > 5 && !/Invalid choice/.test(t), `option ${option}: ${t}`);
      await A.getByTestId('key-home').click(); await A.getByTestId('ussd-screen').filter({has: screen(A).filter({hasText: 'FARM ADVICE'})}).waitFor();
    }
    await choose(A, '8'); assert.match(await screen(A).innerText(), /Sell & market/); await A.getByTestId('key-home').click();
    assert.ok(!/demo|synthetic/i.test(await A.getByTestId('ussd-write-status').innerText()), await A.getByTestId('ussd-write-status').innerText());
    assert.match(await A.getByTestId('ussd-write-status').innerText(), /enabled for your account/);
  });
  await check('real marketplace sale through option 3: confirmed once, reaches the server as a real listing, no phone published, nothing marked verified', async () => {
    await choose(A, '3'); await choose(A, '2'); await choose(A, '1'); await choose(A, '300'); await choose(A, '90'); await choose(A, '2');
    let t = await screen(A).innerText(); for (let i = 0; i < 30 && /\n1 Next\n/.test(await screen(A).innerText()); i++) { await choose(A, '1'); t += '\n' + await screen(A).innerText(); }
    assert.match(t, /Mary Kollie/); assert.ok(!/demo|synthetic/i.test(t), t);
    await choose(A, '1');
    await A.waitForFunction(async () => (await (await fetch('/api/v1/harvest/listings?includeSoldOut=1')).json()).listings.some((r: {quantityKg: number; description: string}) => r.quantityKg === 300 && r.description.startsWith('Posted through the Agricare USSD')), undefined, {timeout: 60000}).catch(() => undefined);
    let found = false; for (let i = 0; i < 80 && !found; i++) { found = one<{n: number}>("SELECT count(*) n FROM marketplace_listings WHERE description LIKE 'Posted through the Agricare USSD%'").n === 1; if (!found) await A.waitForTimeout(500); }
    assert.ok(found, 'the listing reached the server');
    const l = one<{is_fictional_seller: number; phone_verified: number; seller_phone: string; seller_name: string; seller_user_id: number}>("SELECT is_fictional_seller, phone_verified, seller_phone, seller_name, seller_user_id FROM marketplace_listings WHERE description LIKE 'Posted through the Agricare USSD%'");
    assert.equal(l.is_fictional_seller, 0); assert.equal(l.phone_verified, 0); assert.ok(!l.seller_phone); assert.equal(l.seller_name, 'Mary Kollie'); assert.ok(l.seller_user_id);
  });
  await check('a returning participant on a NEW browser: dial, sign in with phone + password, recognised, no second registration, no second account', async () => {
    const ctxB = await profile(); const B = await ctxB.newPage();
    await dialAndWelcome(B, false); await choose(B, '1'); await choose(B, '1'); await waitFrame(B, 'enroll.account'); await choose(B, '1'); await B.getByTestId('ussd-account-form').waitFor();
    await B.getByTestId('uf-phone').fill('+231 886 500 111'); await B.getByTestId('uf-pw').fill('Wrong-Password-9!'); await B.getByTestId('uf-submit').click();
    assert.match(await B.getByTestId('uf-error').innerText(), /Invalid|password/i); assert.equal(users(), 1);
    await B.getByTestId('uf-pw').fill(PW); await B.getByTestId('uf-submit').click();
    await B.getByTestId('ussd-screen').filter({has: screen(B).filter({hasText: 'FARM ADVICE'})}).waitFor();
    assert.equal(participants(), 1); assert.equal(users(), 1); assert.match(await B.getByTestId('ussd-identity').innerText(), /Registered Farmer · Bomi/);
  });
  await check('an existing phone number cannot be registered twice and a phone number alone never opens an account', async () => {
    const ctxC = await profile(); const C = await ctxC.newPage();
    await dialAndWelcome(C, false); await choose(C, '2'); await choose(C, '1'); await waitFrame(C, 'enroll.account'); await choose(C, '2'); await C.getByTestId('ussd-account-form').waitFor();
    await fillCreate(C, 'Someone Else', '0886 500 111', 'Another-Garden-4821!');
    assert.match(await C.getByTestId('uf-error').innerText(), /already has an account/); assert.equal(users(), 1); assert.equal(participants(), 1);
    assert.equal(await frame(C), 'enroll.form');
    await C.getByTestId('ussd-public-advice').click(); await C.getByTestId('ussd-screen').filter({has: screen(C).filter({hasText: 'FARM ADVICE'})}).waitFor();
    assert.match(await C.getByTestId('ussd-identity').innerText(), /Public advice only/);
  });
  await check('declining the registry consent keeps public advice and creates no participant (account stays)', async () => {
    const ctxD = await profile(); const D = await ctxD.newPage();
    await dialAndWelcome(D, false); await choose(D, '1'); await choose(D, '1'); await waitFrame(D, 'enroll.account'); await choose(D, '2'); await D.getByTestId('ussd-account-form').waitFor();
    await fillCreate(D, 'Decliner Person', '0886 500 222'); await waitFrame(D, 'enroll.consent'); await review(D); await choose(D, '2');
    await D.getByTestId('ussd-screen').filter({has: screen(D).filter({hasText: 'FARM ADVICE'})}).waitFor();
    assert.equal(participants(), 1); assert.match(await D.getByTestId('ussd-identity').innerText(), /Public advice only/);
    assert.match(await D.getByTestId('ussd-write-status').innerText(), /Register with your account/);
  });
  await check('Ministry dashboard: administrator sees separated classes and phone status; others are locked out', async () => {
    const d = db(); d.prepare("INSERT INTO user_roles (user_id, role_id) VALUES ((SELECT id FROM users WHERE phone = '+231886500222'), (SELECT id FROM roles WHERE name = 'admin'))").run(); d.close();
    const ctxE = await profile(); const E = await ctxE.newPage();
    await E.goto(base + '/ministry'); await E.getByTestId('registry-locked').waitFor();
    await E.goto(base + '/login'); await E.locator('#login-ident').fill('0886500222'); await E.locator('#login-password').fill(PW); await E.locator('form').evaluate((f: HTMLFormElement) => f.requestSubmit());
    await E.waitForURL((u) => !u.pathname.startsWith('/login')); await E.goto(base + '/ministry');
    const panel = E.getByTestId('participant-registry'); await panel.waitFor();
    const t = await panel.innerText(); assert.match(t, /Synthetic demo participants/); assert.match(t, /Real participants: genuine accounts/); assert.match(t, /Anonymous browser participants/); assert.match(t, /Phone status of genuine participants/); assert.match(t, /Not verified/); assert.match(t, /Suppressed/);
    assert.ok(!/\+231|0886/.test(t), 'no phone numbers in the dashboard');
  });
  await check('layouts: the account form fits 320, 360, 375 and 412 px without sideways scrolling', async () => {
    for (const w of [320, 360, 375, 412]) {
      const c = await profile(w); const P = await c.newPage(); await dialAndWelcome(P, false); await choose(P, '1'); await choose(P, '1'); await waitFrame(P, 'enroll.account'); await choose(P, '2'); await P.getByTestId('ussd-account-form').waitFor();
      assert.ok(await P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow at ${w}`);
      const box = await P.getByTestId('uf-submit').boundingBox(); assert.ok(box && box.height >= 44, 'touch target');
    }
  });
  await check('device voice check button reports speech support (for real-device testing on an iPhone)', async () => {
    const c = await profile(); const P = await c.newPage(); await P.goto(base + '/ussd-demo'); await P.getByTestId('ussd-voice-test').click();
    assert.match(await P.getByTestId('ussd-voice-info').innerText(), /speech is available/); assert.ok((await P.evaluate(() => (window as any).__spoken as string[])).some((t) => /voice test/i.test(t)));
  });
  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(JSON.stringify({base, browser: 'Headless desktop Chrome with mobile viewports; speech calls instrumented; no real device', passed}, null, 2));
} catch (error) { console.error('Real-mode browser QA failed:', error); process.exitCode = 1; }
finally { for (const c of contexts) await c.close().catch(() => undefined); await browser.close().catch(() => undefined); server.kill(); fs.rmSync(dir, {recursive: true, force: true}); }
