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
        // Look for a new version hourly while the app stays open.
        if (registration) {
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
