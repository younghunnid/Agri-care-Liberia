import {getDb} from './db.ts';
import {anonymousMediaBudgetMb, ANON_MEDIA_PER_DAY, writeLimitScale} from './limits.ts';
import {checkAndRecordRateLimit, clientAddress, hashIdentifier, type AuthedRequest} from './security.ts';

/**
 * Photos and voice notes are stored INSIDE the SQLite file as data URLs. Anonymous visitors (no account) get smaller per-item caps, a per-address daily
 * count, and a global byte budget, so neither one client nor many addresses can grow the database without bound. Signed-in accounts keep the original
 * 2.5 MB per item and are limited by the per-account write limits.
 */
export const maxImageChars = (req: AuthedRequest): number => (req.user ? 2_500_000 : 1_000_000);
export const maxAudioChars = (req: AuthedRequest): number => (req.user ? 2_500_000 : 1_500_000);

let cache: {at: number; bytes: number} | null = null;
/** Test hook. */
export function resetMediaQuotaCacheForTests(): void { cache = null; }

/** Bytes of visitor-supplied media stored now (octet_length reads the record header only: no row content is loaded). */
export function anonymousMediaBytes(): number {
  const now = Date.now();
  if (cache && now - cache.at < 5_000) return cache.bytes;
  const db = getDb();
  const sum = (sql: string): number => Number((db.prepare(sql).get() as {n: number | null}).n ?? 0);
  let bytes: number;
  try {
    bytes =
      sum('SELECT SUM(COALESCE(octet_length(photo_data_url), 0) + COALESCE(octet_length(voice_note_data_url), 0)) AS n FROM demo_expert_requests WHERE user_id IS NULL') +
      sum("SELECT SUM(octet_length(image_url)) AS n FROM marketplace_listings WHERE seller_user_id IS NULL AND octet_length(image_url) > 300") +
      sum('SELECT SUM(COALESCE(octet_length(audio_data_url), 0)) AS n FROM local_language_recordings WHERE is_sample_demo = 0');
  } catch {
    // Older SQLite without octet_length(): CAST to BLOB gives the byte length.
    bytes =
      sum('SELECT SUM(length(CAST(COALESCE(photo_data_url, \'\') AS BLOB)) + length(CAST(COALESCE(voice_note_data_url, \'\') AS BLOB))) AS n FROM demo_expert_requests WHERE user_id IS NULL') +
      sum("SELECT SUM(length(CAST(image_url AS BLOB))) AS n FROM marketplace_listings WHERE seller_user_id IS NULL AND length(CAST(image_url AS BLOB)) > 300") +
      sum('SELECT SUM(length(CAST(COALESCE(audio_data_url, \'\') AS BLOB))) AS n FROM local_language_recordings WHERE is_sample_demo = 0');
  }
  cache = {at: now, bytes};
  return bytes;
}

export interface MediaRefusal {status: number; code: string; message: string; retryAfterSeconds?: number}

/** Admission check for a submission carrying `mediaChars` characters of photo/voice data. Returns null when allowed (and counts it), else the refusal. */
export function mediaAdmission(req: AuthedRequest, mediaChars: number): MediaRefusal | null {
  if (mediaChars <= 0 || req.user) return null;
  const budget = anonymousMediaBudgetMb() * 1024 * 1024;
  if (anonymousMediaBytes() + mediaChars > budget) {
    return {status: 507, code: 'ANON_STORAGE_QUOTA', message: 'Photo and voice storage for visitors who are not signed in is full. Please sign in, or send the question without a photo, or try again later.'};
  }
  const rl = checkAndRecordRateLimit(hashIdentifier(`media:${clientAddress(req)}`), 'media_anon', ANON_MEDIA_PER_DAY * writeLimitScale(), 1440, true);
  if (!rl.allowed) {
    return {status: 429, code: 'RATE_LIMITED', message: 'Too many photo or voice uploads from this device today. Please try again later or sign in.', retryAfterSeconds: rl.retryAfterSeconds};
  }
  if (cache) cache.bytes += mediaChars;
  return null;
}
