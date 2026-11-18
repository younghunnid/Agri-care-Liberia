/**
 * What this browser/address can do for offline use. Several powerful web features exist ONLY in a
 * secure context (HTTPS, or http://localhost). On a phone opening http://192.168.x.x they are missing,
 * which is why the app cannot be installed, cannot open without internet, and cannot use Cache
 * Storage there. IndexedDB (where guides, pictures, audio and drafts are kept) works on any address.
 */
export interface DeviceCapabilities {
  origin: string;
  secureContext: boolean;
  /** true for http://localhost, which browsers treat as secure for development. */
  isLocalhost: boolean;
  serviceWorker: boolean;
  cacheStorage: boolean;
  indexedDB: boolean;
  storageEstimate: boolean;
  persistentStorage: boolean;
  microphone: boolean;
  standalone: boolean;
}

export function detectCapabilities(): DeviceCapabilities {
  const w = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const host = w?.location.hostname ?? '';
  return {
    origin: w?.location.origin ?? '',
    secureContext: Boolean(w?.isSecureContext),
    isLocalhost: host === 'localhost' || host === '127.0.0.1' || host === '[::1]',
    serviceWorker: Boolean(nav && 'serviceWorker' in nav),
    cacheStorage: typeof caches !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined' && indexedDB !== null,
    storageEstimate: Boolean(nav?.storage?.estimate),
    persistentStorage: Boolean(nav?.storage?.persist),
    microphone: Boolean(nav?.mediaDevices?.getUserMedia),
    standalone: Boolean(w?.matchMedia?.('(display-mode: standalone)').matches),
  };
}

/** True when the page can work as an installable offline app. */
export function canWorkOfflineAsApp(c: DeviceCapabilities): boolean {
  return c.secureContext && c.serviceWorker && c.cacheStorage;
}

/** Plain-language reasons shown to the farmer / tester when something is unavailable. */
export function limitationMessages(c: DeviceCapabilities): string[] {
  const out: string[] = [];
  if (!c.secureContext) {
    out.push(
      `This address (${c.origin}) is not secure. Chrome only allows installing the app and opening it without internet on https:// addresses.`
    );
  }
  if (!c.serviceWorker && c.secureContext) out.push('This browser does not support the offline app engine (service worker).');
  if (!c.cacheStorage) out.push('Cache Storage is unavailable here. Pictures and guides are kept in the phone database instead.');
  if (!c.indexedDB) out.push('The phone database (IndexedDB) is unavailable, so nothing can be saved for offline use.');
  if (!c.microphone) out.push('Voice recording needs a secure https:// address.');
  return out;
}
