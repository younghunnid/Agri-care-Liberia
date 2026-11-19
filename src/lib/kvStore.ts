import {kvGet, kvSet} from './offlineDb';

/** Minimal key-value contract so storage logic can be tested without a browser (IndexedDB `kv` store in the app). */
export interface KvStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export const idbKv: KvStore = {get: (k) => kvGet(k), set: (k, v) => kvSet(k, v)};

export function memoryKv(): KvStore & {data: Map<string, unknown>} {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string) { return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined; },
    async set<T>(key: string, value: T) { data.set(key, structuredClone(value)); },
  };
}
