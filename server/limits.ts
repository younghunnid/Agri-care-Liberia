/**
 * Tunable abuse limits. Read at call time so tests can scale them; invalid values fall back to the safe default (never to "unlimited").
 * Defaults are for a public demonstration; the black-box test harness raises them (many logins/writes from one address) and the deployment tests
 * run real servers with the defaults to prove the limits work.
 */
function intEnv(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
}

/** Failed sign-in attempts allowed per network address per 15 minutes, across all accounts. */
export const loginIpFailMax = (): number => intEnv('LOGIN_IP_FAIL_MAX', 30, 1, 1_000_000);
/** Multiplier for the anonymous/public write limits below (1 = defaults). */
export const writeLimitScale = (): number => intEnv('PUBLIC_WRITE_LIMIT_SCALE', 1, 1, 10_000);
/** Password hashes computed at the same time (each uses ~16 MB and ~80 ms of a worker thread). */
export const passwordConcurrency = (): number => intEnv('PASSWORD_HASH_CONCURRENCY', 3, 1, 8);
/** Requests allowed to wait for a hashing slot before the server answers "busy". */
export const passwordQueueMax = (): number => intEnv('PASSWORD_HASH_QUEUE', 40, 1, 1000);

export interface WriteLimit { anonPerHour: number; userPerHour: number }
/** Per-hour caps for public write endpoints (per address for anonymous callers, per account for signed-in users). */
export const WRITE_LIMITS = {
  'expert.request': {anonPerHour: 12, userPerHour: 30},
  'marketplace.listing': {anonPerHour: 12, userPerHour: 30},
  'marketplace.inquiry': {anonPerHour: 20, userPerHour: 40},
  'language.recording': {anonPerHour: 10, userPerHour: 30},
  'triage.report': {anonPerHour: 20, userPerHour: 60},
} as const satisfies Record<string, WriteLimit>;
export type WriteKind = keyof typeof WRITE_LIMITS;

/** Total size of photo / voice data that visitors who are NOT signed in may store in the database (megabytes). Bounds database growth whatever addresses are used. */
export const anonymousMediaBudgetMb = (): number => intEnv('ANON_MEDIA_BUDGET_MB', 150, 1, 100_000);
/** Anonymous submissions WITH a photo or voice note allowed per address (/64 for IPv6) per 24 hours, before PUBLIC_WRITE_LIMIT_SCALE. */
export const ANON_MEDIA_PER_DAY = 8;
