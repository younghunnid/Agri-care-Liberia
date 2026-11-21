/** Android Chrome emulation (Pixel 7 profile: touch, mobile user agent, DPR 2.6) for the voice handset. Speech is instrumented; this is NOT a real phone and NOT iPhone Safari (WebKit is not installed here). */
import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';
import {startBackend} from './harness/backend.ts';
import {choosePhone as choose, phoneText as screen} from './ussdBrowserHelpers.ts';
assert.ok(!process.env.API_BASE_URL, 'requires its own disposable backend');
const backend = await startBackend();
const browser = await chromium.launch({executablePath: process.env.QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
let failed = false;
try {
  const ctx = await browser.newContext({...devices['Pixel 7']}); ctx.setDefaultTimeout(20000);
  await ctx.addInitScript({content: `window.__spoken=[];window.__rates=[];window.__cancels=0;window.__agriVoicePauseScale=0.05;class U{constructor(t){this.text=t}}Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel:()=>{window.__cancels++},speak:(u)=>{window.__rates.push(u.rate);window.__spoken.push(u.text);if(u.onstart)u.onstart();if(u.onend)u.onend();}}});`});
  const p = await ctx.newPage(); const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(backend.baseUrl + '/ussd-demo'); await p.getByTestId('ussd-phone').waitFor();
  assert.match(await p.evaluate(() => navigator.userAgent), /Android.*Chrome/); assert.ok(await p.evaluate(() => 'ontouchstart' in window), 'touch emulation is on');
  for (const d of '*440#') await p.getByTestId(`key-${d === '*' ? 'star' : d === '#' ? 'hash' : d}`).tap(); await p.getByTestId('key-send').tap();
  await p.waitForFunction(() => document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame === 'enroll.welcome');
  await p.getByTestId('key-1').tap(); await p.getByTestId('key-send').tap();
  await p.waitForFunction(() => document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame === 'enroll.category');
  await p.waitForFunction(() => ((window as any).__spoken as string[]).some((t) => /^Press one for farmer\./.test(t)));
  assert.ok((await p.evaluate(() => (window as any).__rates as number[])).every((r) => r === 0.75), 'default speed 0.75 on a phone profile');
  // the speed buttons are real touch targets
  for (const id of ['slow', 'normal', 'fast']) { const b = await p.getByTestId(`ussd-speed-${id}`).boundingBox(); assert.ok(b && b.height >= 44 && b.width >= 44, `${id} is at least 44 px`); }
  await p.getByTestId('ussd-speed-slow').tap(); await p.waitForFunction(() => ((window as any).__rates as number[]).at(-1) === 0.6);
  assert.equal(await p.evaluate(() => localStorage.getItem('agri_ussd_voice_speed_v1')), 'slow');
  // touch long-press on 0 mutes while the finger is still down; a short touch tap still enters 0
  const box = await p.getByTestId('key-0').boundingBox(); assert.ok(box); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await ctx.newCDPSession(p); const cancels = await p.evaluate(() => (window as any).__cancels);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]}); await p.waitForTimeout(1700);
  assert.equal(await p.getByTestId('ussd-voice-toggle').getAttribute('aria-pressed'), 'false', 'a touch long-press mutes while still held'); assert.ok(await p.evaluate(() => (window as any).__cancels) > cancels);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.match(await p.getByTestId('ussd-input').innerText(), /^>\s*_?$/, 'releasing the long-press typed no 0');
  const frozen = await p.evaluate(() => (window as any).__spoken.length); await p.waitForTimeout(800); assert.equal(await p.evaluate(() => (window as any).__spoken.length), frozen);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scrolling');
  assert.deepEqual(errors, []);
  console.log('PASS Android Chrome (Pixel 7 emulation): touch dial, voice, 0.75 default, speed buttons remembered, touch long-press mute');
} catch (e) { failed = true; console.error('FAILED', e); } finally { await browser.close(); await backend.stop(); if (failed) process.exitCode = 1; }
