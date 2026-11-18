import {useSyncExternalStore} from 'react';
import {dbDelete, dbGetAll, dbPut, isIndexedDbAvailable, isQuotaError} from './offlineDb';
import {checkStorageFor} from './offlinePacks';
import {getLesson, type AudioLesson} from '../data/audioLessons';

/**
 * Optional offline audio. Files are downloaded on request into IndexedDB (store `audio`) as
 * Blobs, so they are not part of the Starter Pack and are never fetched automatically.
 * A download is stored only after it fully arrived and passed basic checks; an interrupted
 * download leaves nothing behind and can simply be retried.
 */

export interface StoredAudio {
  id: string;
  lessonId: string;
  language: string;
  mimeType: string;
  bytes: number;
  version: number;
  downloadedAt: string;
  blob: Blob;
}

export type AudioMeta = Omit<StoredAudio, 'blob'>;

export type AudioErrorKind = 'storage' | 'network' | 'invalid' | 'cancelled' | 'unsupported';

export class AudioError extends Error {
  kind: AudioErrorKind;
  constructor(kind: AudioErrorKind, message: string) {
    super(message);
    this.name = 'AudioError';
    this.kind = kind;
  }
}

let meta = new Map<string, AudioMeta>();
let version = 0;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function initAudioStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isIndexedDbAvailable()) return;
    try {
      const rows = await dbGetAll<StoredAudio>('audio');
      meta = new Map(rows.map(({blob: _blob, ...rest}) => [rest.id, rest]));
    } catch {
      meta = new Map();
    }
  })().finally(emit);
  return initPromise;
}

export function getDownloadedAudio(): AudioMeta[] {
  return Array.from(meta.values());
}
export function isAudioDownloaded(id: string): boolean {
  return meta.has(id);
}
export function getAudioMeta(id: string): AudioMeta | undefined {
  return meta.get(id);
}
export function totalAudioBytes(): number {
  return getDownloadedAudio().reduce((n, a) => n + a.bytes, 0);
}

export function useAudioStore(): {downloaded: AudioMeta[]; totalBytes: number} {
  useSyncExternalStore(subscribe, () => version, () => version);
  return {downloaded: getDownloadedAudio(), totalBytes: totalAudioBytes()};
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const rows = await dbGetAll<StoredAudio>('audio');
  return rows.find((r) => r.id === id)?.blob ?? null;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
}

export async function downloadAudio(
  lessonId: string,
  opts: {signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void} = {}
): Promise<AudioMeta> {
  const lesson: AudioLesson | undefined = getLesson(lessonId);
  if (!lesson) throw new AudioError('invalid', 'This audio lesson is not available.');
  if (!isIndexedDbAvailable()) throw new AudioError('unsupported', 'This browser cannot keep audio offline.');

  const space = await checkStorageFor(lesson.bytes);
  if (!space.ok) {
    throw new AudioError('storage', 'Not enough free storage for this audio. Delete some downloads and try again.');
  }

  let response: Response;
  try {
    response = await fetch(lesson.url, {signal: opts.signal, cache: 'no-cache'});
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new AudioError('cancelled', 'Download cancelled.');
    throw new AudioError('network', 'Could not reach the server. Check your connection and try again.');
  }
  // A missing file is answered with the app's HTML page (status 200): never store that as audio.
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('audio/')) {
    throw new AudioError('invalid', 'The audio file could not be found on the server.');
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        opts.onProgress?.({receivedBytes: received, totalBytes: lesson.bytes});
      }
    } else {
      const buf = new Uint8Array(await response.arrayBuffer());
      chunks.push(buf);
      received = buf.length;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new AudioError('cancelled', 'Download cancelled.');
    throw new AudioError('network', 'The connection dropped during the download. Nothing was saved. Please try again.');
  }

  // Integrity: the file on the server must be the one this app version expects.
  if (received !== lesson.bytes) {
    throw new AudioError('invalid', 'The downloaded audio was incomplete or has changed. Nothing was saved. Please try again.');
  }

  const blob = new Blob(chunks as BlobPart[], {type: lesson.mimeType});
  const record: StoredAudio = {
    id: lesson.id,
    lessonId: lesson.id,
    language: lesson.language,
    mimeType: lesson.mimeType,
    bytes: received,
    version: lesson.version,
    downloadedAt: new Date().toISOString(),
    blob,
  };
  try {
    await dbPut('audio', record);
  } catch (err) {
    if (isQuotaError(err)) throw new AudioError('storage', 'Not enough storage on this device. Delete some downloads and try again.');
    throw new AudioError('storage', 'Could not save the audio on this device.');
  }
  const {blob: _b, ...m} = record;
  meta = new Map(meta).set(m.id, m);
  emit();
  return m;
}

export async function deleteAudio(id: string): Promise<number> {
  const freed = meta.get(id)?.bytes ?? 0;
  await dbDelete('audio', id);
  const next = new Map(meta);
  next.delete(id);
  meta = next;
  emit();
  return freed;
}

export async function deleteAllAudio(): Promise<number> {
  let freed = 0;
  for (const m of getDownloadedAudio()) freed += await deleteAudio(m.id);
  return freed;
}

export function formatAudioSize(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
