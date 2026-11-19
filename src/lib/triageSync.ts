import {planRetry} from './retryPolicy';
import type {SavedAssessment, TriageReceipt, TriageStore} from './triageStore';

/**
 * Sends saved crop checks to the server, ONE anonymous report each (no photo, no name, no phone), and only for checks the farmer agreed to share.
 *
 * Safety properties (all tested in tests/triage.test.ts):
 *  - Every send of a check carries the SAME Idempotency-Key (its opId), so a lost response or a retry can never create a second report: the server
 *    answers a repeat with the stored result and this module shows it as a DUPLICATE receipt.
 *  - A check is never deleted or changed by a failure: only its sync status and message change.
 *  - Waiting uses retryPolicy.ts: exponential back-off for network trouble, and the server's Retry-After (even beyond the normal cap) when it sends one.
 *  - Mistakes the farmer cannot fix by waiting (the server refuses the report) stop retrying and show "Not sent", with the reason.
 *  - One run at a time; items sent in the order they were created.
 */
export interface SendResult {status: number; body: any}
export type SendFn = (payload: Record<string, unknown>, opId: string) => Promise<SendResult>;

export interface TriageSyncDeps {
  store: TriageStore;
  send: SendFn;
  requesterKey: () => string;
  now?: () => number;
  random?: () => number;
}
export interface TriageSyncResult {attempted: number; succeeded: number; failed: number; stoppedOffline: boolean; waiting: number}

interface HttpLikeError {status?: number; retryAfterMs?: number | null; message?: string}

export function payloadFor(a: SavedAssessment, requesterKey: string): Record<string, unknown> {
  // Deliberately explicit: nothing else from the saved check (photo, notes) can leak into the request.
  return {requesterKey, caseId: a.caseId, answers: a.answers, county: a.county, capturedAt: a.createdAt, escalated: a.escalated};
}

export function createTriageSync(deps: TriageSyncDeps) {
  const now = deps.now ?? (() => Date.now());
  let running: Promise<TriageSyncResult> | null = null;

  async function sendOne(a: SavedAssessment): Promise<'ok' | 'failed' | 'waiting' | 'offline'> {
    try {
      const res = await deps.send(payloadFor(a, deps.requesterKey()), a.opId);
      const b = res.body ?? {};
      const receipt: TriageReceipt = {
        ref: String(b.report?.ref ?? ''),
        status: b.replayed === true ? 'DUPLICATE' : 'APPLIED',
        serverTime: String(b.receipt?.serverTime ?? new Date(now()).toISOString()),
      };
      await deps.store.update(a.id, (x) => ({...x, sync: {status: 'synced', attempts: x.sync.attempts + 1, nextAttemptAt: 0, receipt, serverBand: b.report?.band}}));
      return 'ok';
    } catch (e) {
      const err = e as HttpLikeError;
      const status = typeof err.status === 'number' ? err.status : null;
      if (status === null) {
        // No answer from the server: offline or interrupted. Keep it queued and try later.
        const plan = planRetry({previousAttempts: a.sync.attempts, retryable: true, random: deps.random?.()});
        await deps.store.update(a.id, (x) => ({...x, sync: {...x.sync, status: plan.giveUp ? 'failed' : 'pending', attempts: plan.attempts, nextAttemptAt: plan.giveUp ? 0 : now() + plan.delayMs, lastError: 'No connection to the server. Your check is safe on this phone.'}}));
        return 'offline';
      }
      const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
      const plan = planRetry({previousAttempts: a.sync.attempts, retryable, retryAfterMs: retryable ? err.retryAfterMs ?? null : null, random: deps.random?.()});
      const message = retryable
        ? (err.retryAfterMs ? 'The server asked us to wait a while. Your check is safe on this phone and will be sent automatically.' : 'The server is busy. We will try again.')
        : (err.message || 'The server did not accept this check.');
      await deps.store.update(a.id, (x) => ({...x, sync: {...x.sync, status: plan.giveUp ? 'failed' : 'pending', attempts: plan.attempts, nextAttemptAt: plan.giveUp ? 0 : now() + plan.delayMs, lastError: message}}));
      return plan.giveUp ? 'failed' : 'waiting';
    }
  }

  async function run(manual: boolean): Promise<TriageSyncResult> {
    const result: TriageSyncResult = {attempted: 0, succeeded: 0, failed: 0, stoppedOffline: false, waiting: 0};
    if (manual) {
      // "Try again" on failed items: back to pending with a fresh attempt count (the same opId, so still safe).
      for (const a of await deps.store.list()) if (a.sync.status === 'failed' && a.share) await deps.store.update(a.id, (x) => ({...x, sync: {...x.sync, status: 'pending', attempts: 0, nextAttemptAt: 0}}));
    }
    const queue = (await deps.store.list()).filter((a) => a.share && a.sync.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const a of queue) {
      if (!manual && a.sync.nextAttemptAt > now()) { result.waiting++; continue; }
      result.attempted++;
      const outcome = await sendOne(a);
      if (outcome === 'ok') result.succeeded++;
      else if (outcome === 'failed') result.failed++;
      else if (outcome === 'waiting') result.waiting++;
      else { result.stoppedOffline = true; break; }
    }
    return result;
  }

  return {
    /** Runs one pass. Concurrent calls share the run in progress. */
    sync(opts: {manual?: boolean} = {}): Promise<TriageSyncResult> {
      if (!running) running = run(opts.manual === true).finally(() => { running = null; });
      return running;
    },
    /** True when something is waiting for its turn (used by the auto-sync timer). */
    async hasDue(): Promise<boolean> { return (await deps.store.list()).some((a) => a.share && a.sync.status === 'pending' && a.sync.nextAttemptAt <= now()); },
  };
}
export type TriageSync = ReturnType<typeof createTriageSync>;
