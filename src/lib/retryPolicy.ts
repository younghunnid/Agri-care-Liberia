/**
 * Retry timing for queued offline writes. Pure functions (no storage, no network) so the rules can be tested.
 *
 * - Plain network trouble: exponential back-off 5 s, 10 s, 20 s ... capped at 5 minutes, up to 6 automatic attempts, then "Sync Failed" (the farmer
 *   decides). Unchanged from before.
 * - When the SERVER says how long to wait (HTTP Retry-After on 429/503, e.g. a rate limit): wait at least that long, even when it is longer than the
 *   back-off cap (up to one hour per wait; a larger value is retried after one hour and then asked again). A server-directed wait is not a failure of
 *   the item, so it gets a larger automatic budget (12 waits) before the item is handed back to the farmer. The record and its Idempotency-Key are
 *   never changed, so every retry is safe: the server replays the first accepted result instead of creating a second record.
 */
export const MAX_AUTO_ATTEMPTS = 6;
export const MAX_BACKOFF_MS = 5 * 60_000;
export const MAX_SERVER_DIRECTED_ATTEMPTS = 12;
export const MAX_RETRY_AFTER_MS = 60 * 60_000;
export const MIN_RETRY_AFTER_MS = 1_000;

/** Parses a Retry-After header value (delta-seconds or an HTTP date) into milliseconds from `now`. Returns null when absent or unusable. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/^\d{1,9}$/.test(v)) return Number(v) * 1000;
  if (!/^[A-Za-z]{3,9}, \d{1,2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(v)) return null; // only a real HTTP-date; Date.parse alone accepts junk such as "1.5"
  const when = Date.parse(v);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - now);
}

export interface RetryInput {
  /** Attempts already made BEFORE this failure. */
  previousAttempts: number;
  retryable: boolean;
  /** Milliseconds the server asked us to wait, if it did. */
  retryAfterMs?: number | null;
  /** Random 0..1 (injectable for tests). */
  random?: number;
}
export interface RetryPlan {
  attempts: number;
  giveUp: boolean;
  /** Milliseconds from now until the next automatic attempt (0 when giving up). */
  delayMs: number;
  serverDirected: boolean;
}

export function planRetry(i: RetryInput): RetryPlan {
  const attempts = i.previousAttempts + 1;
  const jitter = Math.floor((i.random ?? Math.random()) * 1000);
  const serverDirected = typeof i.retryAfterMs === 'number' && Number.isFinite(i.retryAfterMs) && i.retryable;
  if (serverDirected) {
    const wait = Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, i.retryAfterMs as number));
    const giveUp = attempts >= MAX_SERVER_DIRECTED_ATTEMPTS;
    return {attempts, giveUp, delayMs: giveUp ? 0 : wait + jitter, serverDirected: true};
  }
  const giveUp = !i.retryable || attempts >= MAX_AUTO_ATTEMPTS;
  const backoff = Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (attempts - 1)) + jitter;
  return {attempts, giveUp, delayMs: giveUp ? 0 : backoff, serverDirected: false};
}
