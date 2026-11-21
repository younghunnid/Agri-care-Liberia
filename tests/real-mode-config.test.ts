import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {loadAuthConfig, AuthConfigError} from '../server/authConfig.ts';
import {loadRuntimeConfig, RuntimeConfigError} from '../server/runtime.ts';

/** The exact environment for real-user operation, checked against the real configuration loaders (no guessing). */
const secret = () => crypto.randomBytes(32).toString('hex');
const APP = '/home/u123/domains/agricare.mpgmca.com/nodejs';
const real = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production', START_SERVER: '1', TRUST_PROXY: '1', APP_URL: 'https://agricare.mpgmca.com',
  DB_PATH: '/home/u123/agricare-data/agri.db', SESSION_SECRET: secret(), OTP_HMAC_SECRET: secret(), ...extra,
} as NodeJS.ProcessEnv);
const loads = (env: NodeJS.ProcessEnv) => { const a = loadAuthConfig(env); const r = loadRuntimeConfig(env, APP); return {a, r}; };

test('the recommended real-user environment loads: production, no demo, SMS off (phone number + password), no seed, no diagnostics', () => {
  const {a, r} = loads(real());
  assert.equal(r.production, true); assert.equal(r.demoEnvironment, false); assert.equal(r.strict, true);
  assert.equal(a.production, true); assert.equal(a.requireSms, false); assert.equal(a.smsProvider, 'none'); assert.equal(a.simulatedInbox, false); assert.equal(a.demoInlineInbox, false);
  assert.equal(r.enableDemoSeed, false); assert.equal(r.enableDemoMarketData, false); assert.equal(r.demoSeedPasswords, null); assert.equal(r.stagingDiagToken, null);
  assert.equal(r.cookieMode, 'first_party'); assert.equal(r.journalMode, 'wal'); assert.equal(r.dbPath, '/home/u123/agricare-data/agri.db');
});

test('every demonstration leftover is refused (or identified) in real-user mode', () => {
  const refusedAuth = (extra: Record<string, string>) => assert.throws(() => loadAuthConfig(real(extra)), AuthConfigError, JSON.stringify(extra));
  const refusedRuntime = (extra: Record<string, string>) => assert.throws(() => loadRuntimeConfig(real(extra), APP), RuntimeConfigError, JSON.stringify(extra));
  refusedAuth({SMS_PROVIDER: 'simulated'}); refusedAuth({DEMO_INLINE_INBOX: '1'}); refusedAuth({SIMULATED_INBOX: '1'}); refusedAuth({DEMO_OPERATOR_TOKEN: secret()});
  refusedAuth({DEMO_ENV_ACK: 'synthetic-accounts-only'}); refusedAuth({AUTH_REQUIRE_SMS: '1'}); refusedAuth({SMS_PROVIDER: 'twilio'});
  refusedRuntime({ENABLE_DEMO_SEED: '1', DEMO_FARMER_PASSWORD: 'Private-Farmer-5521!', DEMO_EXPERT_PASSWORD: 'Private-Expert-9921!'}); refusedRuntime({ENABLE_DEMO_MARKET_DATA: '1'});
  refusedRuntime({DEMO_FARMER_PASSWORD: 'Private-Farmer-5521!'}); refusedRuntime({DEMO_EXPERT_PASSWORD: 'Private-Expert-9921!'});
  // APP_ENV=demo is not an error, it simply switches the protected demonstration mode back on: real-user mode requires it to be ABSENT.
  assert.equal(loads(real({APP_ENV: 'demo', DEMO_ENV_ACK: 'synthetic-accounts-only', SMS_PROVIDER: 'simulated'})).r.demoEnvironment, true);
  // STAGING_DIAG_TOKEN is accepted by the loader, so it would silently keep /api/v1/__staging mounted: it must be REMOVED, not just ignored.
  assert.notEqual(loads(real({STAGING_DIAG_TOKEN: secret()})).r.stagingDiagToken, null);
});

test('unsafe real-user settings stop the server: weak secrets, database inside the application folder, cross-site cookies, trusting every proxy', () => {
  assert.throws(() => loadRuntimeConfig(real({SESSION_SECRET: 'short'}), APP), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig(real({DB_PATH: `${APP}/data/agri.db`}), APP), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig(real({DB_PATH: ''}), APP), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig(real({COOKIE_MODE: 'cross_site'}), APP), RuntimeConfigError);
  assert.throws(() => loadRuntimeConfig(real({TRUST_PROXY: '0.0.0.0/0'}), APP), RuntimeConfigError);
  assert.throws(() => loadAuthConfig(real({OTP_HMAC_SECRET: 'short'})), AuthConfigError);
  const s = secret(); assert.throws(() => loadAuthConfig(real({SESSION_SECRET: s, OTP_HMAC_SECRET: s})), AuthConfigError, 'the two secrets must differ');
});
