import {useSyncExternalStore} from 'react';
import {registerSW} from 'virtual:pwa-register';

export interface PwaState {
  /** A new version has been downloaded and is waiting for the user to apply it. */
  needRefresh: boolean;
  /** The app shell has been cached for the first time and now works offline. */
  offlineReady: boolean;
}

let state: PwaState = {needRefresh: false, offlineReady: false};
const listeners = new Set<() => void>();
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let started = false;

function setState(patch: Partial<PwaState>): void {
  state = {...state, ...patch};
  listeners.forEach((fn) => fn());
}

/** Registers the service worker (production builds only). Safe to call once at startup. */
export function initPwa(): void {
  if (started) return;
  started = true;
  try {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setState({needRefresh: true});
      },
      onOfflineReady() {
        setState({offlineReady: true});
      },
      onRegisteredSW(_swUrl, registration) {
        // Look for a new version right away (a visitor holding an old version gets the current one without waiting) and then hourly while the app stays open.
        if (registration) {
          if (navigator.onLine) void registration.update().catch(() => undefined);
          // Safari only re-checks for a new version now and then: also check whenever the app comes back to the foreground (at most every 5 minutes).
          let lastCheck = Date.now();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastCheck > 5 * 60 * 1000) { lastCheck = Date.now(); void registration.update().catch(() => undefined); }
          });
          setInterval(() => {
            if (navigator.onLine) void registration.update().catch(() => undefined);
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError() {
        // Registration can fail on insecure origins; the online app keeps working.
      },
    });
    // public/sw-update.js reloads open pages itself; this is the fallback when the browser refuses that (the page is told instead), at most once per 20 seconds.
    navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type !== 'AGRICARE_SW_UPDATED') return;
      try { const last = Number(sessionStorage.getItem('agri_sw_reload_at') || 0); if (Date.now() - last < 20000) return; sessionStorage.setItem('agri_sw_reload_at', String(Date.now())); } catch { /* storage unavailable: reload anyway */ }
      location.reload();
    });
  } catch {
    // Service workers unsupported: nothing to do.
  }
}

/** Activates the waiting service worker and reloads. */
export async function applyPwaUpdate(): Promise<void> {
  if (updateSW) await updateSW(true);
}

export function dismissPwaNotice(kind: keyof PwaState): void {
  setState({[kind]: false} as Partial<PwaState>);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
