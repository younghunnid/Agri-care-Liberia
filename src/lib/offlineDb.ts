/**
 * Minimal promise wrapper around IndexedDB for the offline-first features.
 *
 * Stores (all created in v1 so later stages do not need schema upgrades):
 *  - guides      downloaded agricultural guides            (key: id)
 *  - kv          small key/value metadata (sync times...)  (key: key)
 *  - syncQueue   pending write operations                  (key: opId)
 *  - drafts      offline marketplace listing drafts        (key: localId)
 *  - questions   offline expert-question drafts            (key: localId)
 *  - audio       downloaded audio lessons (blobs)          (key: id)
 *  - apiCache    last-known GET snapshots (listings...)    (key: key)
 *
 * Nothing here is ever used for credentials or session data.
 */

export const DB_NAME = 'agri-advisory-offline';
export const DB_VERSION = 1;

export const STORES = {
  guides: {keyPath: 'id'},
  kv: {keyPath: 'key'},
  syncQueue: {keyPath: 'opId'},
  drafts: {keyPath: 'localId'},
  questions: {keyPath: 'localId'},
  audio: {keyPath: 'id'},
  apiCache: {keyPath: 'key'},
} as const;

export type StoreName = keyof typeof STORES;

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not available in this browser context.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, {keyPath: opts.keyPath});
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // If another tab upgrades the schema, release our connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB open request was blocked.'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineDb();
  return wrap<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key));
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openOfflineDb();
  return wrap<T[]>(db.transaction(store, 'readonly').objectStore(store).getAll());
}

/** Resolves only after the transaction has committed (durable write). */
export async function dbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function dbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openOfflineDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await txDone(tx);
}

export async function dbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await dbGet<{key: string; value: T}>('kv', key);
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await dbPut('kv', {key, value});
}

export interface StorageSummary {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean | null;
}

/** Browser-reported origin usage/quota (estimate only; values are coarse). */
export async function getStorageSummary(): Promise<StorageSummary> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return {supported: false, usageBytes: null, quotaBytes: null, persisted: null};
  }
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return {
      supported: true,
      usageBytes: est.usage ?? null,
      quotaBytes: est.quota ?? null,
      persisted,
    };
  } catch {
    return {supported: false, usageBytes: null, quotaBytes: null, persisted: null};
  }
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // ignore
  }
  return false;
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {name?: string; code?: number};
  return e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}
