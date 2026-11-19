import fs from 'node:fs';
import path from 'node:path';

/**
 * Runtime / deployment configuration of the Node server. Fail-closed: a production-like environment that is unsafe or misconfigured stops at start-up with
 * a message that names settings (never values).
 *
 * Environments:
 *  - production : NODE_ENV=production and APP_ENV not test/demo. The bundle `server.js` defaults NODE_ENV to production when it is unset.
 *  - demo       : APP_ENV=demo, an explicitly acknowledged hackathon server with synthetic accounts only (see authConfig.ts). Gets the same strict
 *                 secret, storage and proxy checks as production, and is the ONLY place the simulated SMS inbox may exist outside local development.
 *  - test       : APP_ENV=test (black-box harness, disposable database).
 *  - development: everything else.
 */
export interface RuntimeConfig {
  production: boolean;
  demoEnvironment: boolean;
  strict: boolean;
  appRoot: string;
  dbPath: string;
  journalMode: 'wal' | 'delete';
  cookieMode: 'first_party' | 'cross_site';
  /** Value for Express `trust proxy`. */
  trustProxy: boolean | number | string[];
  trustProxyExplicit: boolean;
  enableDemoSeed: boolean;
  /** Private passwords for the two synthetic demo accounts in a strict environment (never the published ones); null when not seeding there. */
  demoSeedPasswords: {farmer: string; expert: string} | null;
  stagingDiagToken: string | null;
}

export class RuntimeConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid deployment configuration: ${problems.join('; ')}`);
  }
}

const weak = (s: string): boolean => /^(change.?me|your[-_ ]|example|placeholder|replace|todo|dev[-_]|test[-_]?secret|password|secret|insecure|default|xxx)/i.test(s) || new Set(s).size < 8;
const truthy = (v: string | undefined): boolean => ['1', 'true', 'yes', 'on'].includes((v ?? '').trim().toLowerCase());

export function appRootFrom(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.APP_ROOT || process.cwd());
}

/** Is `child` the same as or inside `parent`? (after resolving symlinks where the path exists) */
export function isInside(child: string, parent: string): boolean {
  const real = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const c = real(path.dirname(child)) + path.sep + path.basename(child);
  const p = real(parent) + path.sep;
  return c.startsWith(p) || c + path.sep === p;
}

export function parseTrustProxy(raw: string | undefined, problems: string[]): {value: boolean | number | string[]; explicit: boolean} {
  const v = (raw ?? '').trim();
  if (v === '') return {value: 1, explicit: false};
  if (['0', 'false', 'no', 'off'].includes(v.toLowerCase())) return {value: false, explicit: true};
  if (/^\d{1,2}$/.test(v)) { const n = Number(v); if (n < 1 || n > 10) { problems.push('TRUST_PROXY hops must be 1 to 10 (or 0 to disable)'); return {value: 1, explicit: true}; } return {value: n, explicit: true}; }
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  const ok = parts.every((p) => ['loopback', 'linklocal', 'uniquelocal'].includes(p) || /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(p));
  if (!ok || parts.length === 0) { problems.push('TRUST_PROXY must be 0, a hop count (1-10) or a comma list of addresses/CIDRs/loopback/linklocal/uniquelocal'); return {value: 1, explicit: true}; }
  if (parts.some((p) => p === '0.0.0.0/0' || p === '::/0')) problems.push('TRUST_PROXY must not trust every address');
  return {value: parts, explicit: true};
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env, appRoot: string = appRootFrom(env)): RuntimeConfig {
  const problems: string[] = [];
  const demoEnvironment = env.APP_ENV === 'demo';
  const testEnv = env.APP_ENV === 'test';
  const production = env.NODE_ENV === 'production' && !testEnv && !demoEnvironment;
  const strict = production || demoEnvironment;

  // ---- secrets
  const session = env.SESSION_SECRET ?? '';
  if (strict && (session.length < 32 || weak(session))) problems.push('SESSION_SECRET is required (at least 32 random characters). Without a fixed value every restart or redeploy would sign everyone out');
  else if (!strict && session && session.length < 16) problems.push('SESSION_SECRET is shorter than 16 characters');

  // ---- database location
  const rawDb = (env.DB_PATH ?? '').trim();
  const defaultDb = path.resolve(appRoot, 'data', 'agri_advisory.db');
  let dbPath = rawDb ? (path.isAbsolute(rawDb) ? rawDb : path.resolve(appRoot, rawDb)) : defaultDb;
  if (strict) {
    if (!rawDb) problems.push('DB_PATH is required (an absolute path OUTSIDE the application folder, for example /home/<user>/agri-data/agri.db)');
    else if (!path.isAbsolute(rawDb)) problems.push('DB_PATH must be an absolute path');
    else {
      if (isInside(dbPath, appRoot)) problems.push('DB_PATH must be outside the application folder (each deployment replaces that folder)');
      if (/(^|[\\/])(hbuilds|public_html)([\\/]|$)/.test(dbPath)) problems.push('DB_PATH must not be inside hbuilds or public_html');
      if (/\.\./.test(rawDb)) problems.push('DB_PATH must not contain ".."');
    }
  }
  const jm = (env.SQLITE_JOURNAL_MODE ?? 'wal').trim().toLowerCase();
  if (!['wal', 'delete'].includes(jm)) problems.push('SQLITE_JOURNAL_MODE must be wal or delete');

  // ---- cookies and proxy
  const cm = (env.COOKIE_MODE ?? '').trim().toLowerCase();
  if (cm && !['first_party', 'cross_site'].includes(cm)) problems.push('COOKIE_MODE must be first_party or cross_site');
  const cookieMode: 'first_party' | 'cross_site' = cm === 'cross_site' ? 'cross_site' : cm === 'first_party' ? 'first_party' : strict ? 'first_party' : 'cross_site';
  if (strict && cookieMode === 'cross_site') problems.push('COOKIE_MODE=cross_site (SameSite=None) is not allowed in production or the demo environment');
  const tp = parseTrustProxy(env.TRUST_PROXY, problems);

  // ---- demo accounts
  const enableDemoSeed = truthy(env.ENABLE_DEMO_SEED);
  if (production && enableDemoSeed) problems.push('ENABLE_DEMO_SEED must not be set in production (it creates accounts with published passwords)');
  if (env.ENABLE_DEMO_SEED && !['0', '1', 'true', 'false', 'yes', 'no', 'on', 'off'].includes(env.ENABLE_DEMO_SEED.toLowerCase())) problems.push('ENABLE_DEMO_SEED must be 1 or 0');

  // In a strict environment the synthetic demo accounts must NOT use the passwords published in the project documents: anyone could sign in as the
  // "approved expert". They get private passwords from the environment, or are not created at all.
  let demoSeedPasswords: {farmer: string; expert: string} | null = null;
  const farmerPw = env.DEMO_FARMER_PASSWORD ?? '';
  const expertPw = env.DEMO_EXPERT_PASSWORD ?? '';
  if (strict) {
    const published = ['FarmerDemo!2026', 'ExpertDemo!2026'];
    const secrets = [env.SESSION_SECRET, env.OTP_HMAC_SECRET, env.DEMO_OPERATOR_TOKEN].filter(Boolean);
    const okPw = (v: string) => v.length >= 12 && !weak(v) && !published.includes(v) && !secrets.includes(v);
    if (enableDemoSeed) {
      if (!okPw(farmerPw) || !okPw(expertPw) || farmerPw === expertPw) {
        problems.push('ENABLE_DEMO_SEED in the demo environment requires DEMO_FARMER_PASSWORD and DEMO_EXPERT_PASSWORD (two different private passwords of at least 12 characters, never the published demo passwords)');
      } else demoSeedPasswords = {farmer: farmerPw, expert: expertPw};
    } else if (farmerPw || expertPw) {
      problems.push('DEMO_FARMER_PASSWORD / DEMO_EXPERT_PASSWORD are only used together with ENABLE_DEMO_SEED in the demo environment');
    }
  } else if (farmerPw || expertPw) {
    problems.push('DEMO_FARMER_PASSWORD / DEMO_EXPERT_PASSWORD apply only to the production-like demo environment (development uses the documented demo passwords)');
  }

  // ---- staging diagnostics (explicit opt-in; remove after the staging tests)
  const diag = env.STAGING_DIAG_TOKEN ?? '';
  let stagingDiagToken: string | null = null;
  if (diag) {
    if (diag.length < 32 || weak(diag)) problems.push('STAGING_DIAG_TOKEN must be at least 32 random characters');
    else if (diag === session || diag === env.OTP_HMAC_SECRET) problems.push('STAGING_DIAG_TOKEN must be a separate secret');
    else stagingDiagToken = diag;
  }

  if (problems.length) throw new RuntimeConfigError(problems);
  return {production, demoEnvironment, strict, appRoot, dbPath, journalMode: jm === 'delete' ? 'delete' : 'wal', cookieMode, trustProxy: tp.value, trustProxyExplicit: tp.explicit, enableDemoSeed, demoSeedPasswords, stagingDiagToken};
}

let cached: RuntimeConfig | null = null;
export function getRuntimeConfig(): RuntimeConfig { return (cached ??= loadRuntimeConfig()); }
export function resetRuntimeConfigForTests(): void { cached = null; }

/** Fails fast if the database directory cannot be created, written, fsynced and read back (shared hosts may be read-only or restrict file locking). */
export function checkStorage(dbPath: string): {ok: true; dir: string} {
  const dir = path.dirname(dbPath);
  try {
    fs.mkdirSync(dir, {recursive: true});
    const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}`);
    const fd = fs.openSync(probe, 'wx', 0o600);
    fs.writeSync(fd, 'agri-storage-check');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    const back = fs.readFileSync(probe, 'utf8');
    fs.unlinkSync(probe);
    if (back !== 'agri-storage-check') throw new Error('read-back mismatch');
    return {ok: true, dir};
  } catch (e) {
    throw new RuntimeConfigError([`the database folder is not writable (${(e as NodeJS.ErrnoException).code ?? 'error'}): choose a writable, persistent folder for DB_PATH`]);
  }
}
