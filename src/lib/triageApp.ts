import {apiFetch, ApiRequestError} from './api';
import {createAdviceClient} from './adviceCardsClient';
import {getRequesterKey} from './listingKeys';
import {createHarvestClient} from './harvestClient';
import {createInsightsClient} from './insightsClient';
import {createTriageStore} from './triageStore';
import {createTriageSync} from './triageSync';

/** The app's instances: IndexedDB storage and the real API. Tests build their own with in-memory storage and fakes. */
export const triageStore = createTriageStore();
export const harvestClient = createHarvestClient({get: (path) => apiFetch(path)});
export const insightsClient = createInsightsClient({get: (path) => apiFetch(path)});
export const adviceClient = createAdviceClient({get: (path) => apiFetch(path)});

export const triageSync = createTriageSync({
  store: triageStore,
  requesterKey: getRequesterKey,
  send: async (payload, opId) => {
    try {
      const body = await apiFetch<unknown>('/triage/reports', {method: 'POST', headers: {'Idempotency-Key': opId}, body: JSON.stringify(payload)});
      return {status: 201, body};
    } catch (e) {
      if (e instanceof ApiRequestError) throw {status: e.status, retryAfterMs: e.retryAfterMs ?? null, message: e.message};
      throw e;
    }
  },
});

let started = false;
/** Sends waiting checks when the phone reconnects, the app is reopened, or a timer says one is due. */
export function startTriageAutoSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const attempt = () => { if (navigator.onLine) void triageSync.hasDue().then((due) => { if (due) void triageSync.sync(); }).catch(() => undefined); };
  window.addEventListener('online', attempt);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') attempt(); });
  setInterval(attempt, 15_000);
  attempt();
}
