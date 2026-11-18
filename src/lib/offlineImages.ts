import {dbClear, dbDelete, dbGet, dbGetAll, dbPut, isQuotaError} from './offlineDb';

/**
 * Guide pictures kept as Blobs in IndexedDB.
 *
 * Why not only the service-worker Cache Storage? Cache Storage (and service workers) exist only in a
 * SECURE context (HTTPS or localhost). On a phone opening http://192.168.x.x:3000 they are missing, so
 * picture downloads failed even though IndexedDB (which works on any origin) saved the guide text.
 * IndexedDB is therefore the primary store; Cache Storage is still filled when available so the
 * service worker can serve the same files to <img> tags without any JavaScript.
 */

const IMAGE_CACHE_NAME = 'agri-local-images'; // must match vite.config.ts

export interface StoredImage {
  url: string;
  blob: Blob;
  bytes: number;
  storedAt: string;
}

export class ImageStorageError extends Error {
  quotaExceeded: boolean;
  constructor(message: string, quotaExceeded = false) {
    super(message);
    this.name = 'ImageStorageError';
    this.quotaExceeded = quotaExceeded;
  }
}

export async function isImageStored(url: string): Promise<boolean> {
  try {
    return Boolean(await dbGet<StoredImage>('images', url));
  } catch {
    return false;
  }
}

export async function getStoredImageBlob(url: string): Promise<Blob | null> {
  try {
    return (await dbGet<StoredImage>('images', url))?.blob ?? null;
  } catch {
    return null;
  }
}

/** Downloads one picture and keeps it on the device. Throws a readable error on failure. */
export async function storeImage(url: string, signal?: AbortSignal): Promise<number> {
  const res = await fetch(url, {signal, cache: 'no-cache'});
  // A missing file can be answered with the app's HTML page and status 200: never keep that as a picture.
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) {
    throw new Error(`The picture could not be found on the server (${res.status}).`);
  }
  const blob = await res.clone().blob();
  if (blob.size === 0) throw new Error('The picture file was empty.');

  try {
    await dbPut<StoredImage>('images', {url, blob, bytes: blob.size, storedAt: new Date().toISOString()});
  } catch (err) {
    if (isQuotaError(err)) throw new ImageStorageError('Not enough storage on this device.', true);
    throw new ImageStorageError('Could not save the picture on this device.');
  }

  // Best effort: also let the service worker serve it (only possible in a secure context).
  if (typeof caches !== 'undefined') {
    try {
      const c = await caches.open(IMAGE_CACHE_NAME);
      await c.put(url, res);
    } catch {
      // IndexedDB already has the picture; the Cache copy is optional.
    }
  }
  return blob.size;
}

export async function removeStoredImage(url: string): Promise<void> {
  await dbDelete('images', url).catch(() => undefined);
  if (typeof caches !== 'undefined') {
    try {
      await (await caches.open(IMAGE_CACHE_NAME)).delete(url);
    } catch {
      // ignore
    }
  }
}

export async function clearStoredImages(): Promise<void> {
  await dbClear('images').catch(() => undefined);
  if (typeof caches !== 'undefined') await caches.delete(IMAGE_CACHE_NAME).catch(() => undefined);
}

export interface ImageStats {
  count: number;
  bytes: number;
  sizes: Record<string, number>;
}

export async function getStoredImageStats(): Promise<ImageStats> {
  try {
    const rows = await dbGetAll<StoredImage>('images');
    const sizes: Record<string, number> = {};
    for (const r of rows) sizes[r.url] = r.bytes;
    return {count: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0), sizes};
  } catch {
    return {count: 0, bytes: 0, sizes: {}};
  }
}

/** Removes stored pictures that no saved guide uses any more. */
export async function pruneImages(inUse: Set<string>): Promise<void> {
  const stats = await getStoredImageStats();
  for (const url of Object.keys(stats.sizes)) if (!inUse.has(url)) await removeStoredImage(url);
}
