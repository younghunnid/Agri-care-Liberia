import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {Fixtures} from './fixtures.ts';
import {setBaseUrl} from './http.ts';

/**
 * Starts (or attaches to) the backend under test.
 *
 *  - API_BASE_URL unset  -> boots the Node reference backend IN-PROCESS on a random port with a disposable SQLite file in the OS temp dir.
 *  - API_BASE_URL set    -> black-box mode against any server (e.g. the PHP backend). The server must be a FRESH, disposable instance started with
 *                           APP_ENV=test, TEST_FIXTURE_TOKEN=<same value as here>, AI_ANON_DAILY_LIMIT=3 and no Gemini key. See docs/TEST_HARNESS.md.
 * Either way the tests talk to it only over HTTP.
 */
export interface Backend {
  mode: 'in-process' | 'external';
  baseUrl: string;
  fixtures: Fixtures;
  /** Operator token for the development-only simulated SMS inbox (in-process mode). */
  operatorToken: string;
  stop(): Promise<void>;
}

export async function startBackend(): Promise<Backend> {
  const external = process.env.API_BASE_URL;
  if (external) {
    const token = process.env.TEST_FIXTURE_TOKEN ?? '';
    if (token.length < 16) throw new Error('External mode needs TEST_FIXTURE_TOKEN (>= 16 chars) matching the server under test.');
    setBaseUrl(external);
    return {mode: 'external', baseUrl: external, fixtures: new Fixtures(token), operatorToken: process.env.DEMO_OPERATOR_TOKEN ?? '', stop: async () => undefined};
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-advisory-test-'));
  const token = crypto.randomBytes(24).toString('hex');
  process.env.DB_PATH = path.join(tmpDir, 'test.db');
  process.env.AI_ANON_DAILY_LIMIT = '3';
  process.env.GEMINI_API_KEY = '';
  process.env.NODE_ENV = 'production';
  process.env.APP_ENV = 'test';
  process.env.TEST_FIXTURE_TOKEN = token;
  // Simulated SMS (development/test only): codes are readable ONLY through the operator-token-protected inbox.
  const operatorToken = crypto.randomBytes(24).toString('hex');
  process.env.SMS_PROVIDER = 'simulated';
  process.env.SIMULATED_INBOX = '1';
  process.env.DEMO_INLINE_INBOX = '1';
  process.env.ENABLE_DEMO_SEED = '1'; // the contract and API suites sign in as the synthetic demo expert
  process.env.DEMO_OPERATOR_TOKEN = operatorToken;
  process.env.OTP_HMAC_SECRET = crypto.randomBytes(32).toString('hex');

  // Imported only now, after the environment above is in place.
  const {createApp} = await import('../../server.ts');
  const {closeDb} = await import('../../server/db.ts');
  const app = await createApp();
  const server: http.Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (typeof addr !== 'object' || !addr) throw new Error('Could not determine the test server port.');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  setBaseUrl(baseUrl);

  return {
    mode: 'in-process',
    baseUrl,
    fixtures: new Fixtures(token),
    operatorToken,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      closeDb();
      fs.rmSync(tmpDir, {recursive: true, force: true});
    },
  };
}
