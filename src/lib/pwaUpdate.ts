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
let registrationRef: ServiceWorkerRegistration | undefined;
let updateRequested = false;

function setState(patch: Partial<PwaState>): void {
  state = {...state, ...patch};
  listeners.forEach((fn) => fn());
}

/** Registers the service worker (production builds only). Safe to call once at startup. */
export function initPwa(): void {
  if (started) return;
  started = true;
  // Acknowledge before registration: the migration worker must not reload a current
  // handset while its farmer is typing. Older cached bundles have no such handler.
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'AGRICARE_USSD_CLIENT_PROBE') {
        event.ports?.[0]?.postMessage({type: 'AGRICARE_USSD_CLIENT_READY'});
      }
    });
  }
  try {
    updateSW = registerSW({
      immediate: true,
      onNeedReload() {
        // Another legacy tab may activate the worker. Keep current forms intact
        // unless this page's user explicitly chose to update.
        if (updateRequested) window.location.reload();
        else setState({needRefresh: true});
      },
      onNeedRefresh() {
        setState({needRefresh: true});
      },
      onOfflineReady() {
        setState({offlineReady: true});
      },
      onRegisteredSW(_swUrl, registration) {
        registrationRef = registration;
        // Check on entry too: a QR visitor should not wait an hour for a route fix.
        if (registration) {
          if (navigator.onLine) void registration.update().catch(() => undefined);
          setInterval(() => {
            if (navigator.onLine) void registration.update().catch(() => undefined);
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError() {
        // Registration can fail on insecure origins; the online app keeps working.
      },
    });
  } catch {
    // Service workers unsupported: nothing to do.
  }
}

/** Activates the waiting service worker and reloads. */
export async function applyPwaUpdate(): Promise<void> {
  updateRequested = true;
  if (registrationRef?.active && !registrationRef.waiting) window.location.reload();
  else if (updateSW) await updateSW(true);
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
