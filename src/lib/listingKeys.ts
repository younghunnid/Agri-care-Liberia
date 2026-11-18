/**
 * Per-listing ownership secrets.
 *
 * Each marketplace listing is protected by a random secret generated ON THIS DEVICE when the listing is first prepared. The
 * server stores only a keyed hash of it and never returns it, so nothing a visitor can read from the API lets them edit or
 * delete someone else's listing. The device keeps the secret (here, and inside the offline draft record) and sends it in the
 * `X-Listing-Key` header when editing or deleting.
 *
 * Trade-off (anonymous demo mode): whoever holds the secret owns the listing. Clearing site data on the phone loses the ability
 * to edit it; signing in as the seller or an administrator still works. It is stored unencrypted in the browser profile.
 */

const STORAGE_KEY = 'agri_listing_keys_v1';

export function generateOwnerKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // 64 hex characters = 256 bits of randomness.
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getListingKey(listingId: number): string | null {
  return readAll()[String(listingId)] ?? null;
}

export function hasListingKey(listingId: number): boolean {
  return getListingKey(listingId) !== null;
}

export function saveListingKey(listingId: number, key: string): void {
  try {
    const all = readAll();
    all[String(listingId)] = key;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the listing still exists, but this browser cannot manage it later.
  }
}

export function removeListingKey(listingId: number): void {
  try {
    const all = readAll();
    delete all[String(listingId)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

/** Headers proving ownership of a listing (empty if this device has no key for it). */
export function ownerHeaders(listingId: number): Record<string, string> {
  const key = getListingKey(listingId);
  return key ? {'X-Listing-Key': key} : {};
}

// ---------------------------------------------------------------- expert-request requester key

const REQUESTER_KEY = 'agri_requester_key_v1';

/**
 * One random secret per device for the expert requests it submits. The server stores only a hash and never returns it, so only this
 * device (or the signed-in account that submitted) can read its own private requests. Stored unencrypted in the browser profile.
 */
export function getRequesterKey(): string {
  try {
    let key = localStorage.getItem(REQUESTER_KEY);
    if (!key || !/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
      key = generateOwnerKey();
      localStorage.setItem(REQUESTER_KEY, key);
    }
    return key;
  } catch {
    return generateOwnerKey(); // storage blocked: requests still work but cannot be listed again from this browser
  }
}

export function requesterHeaders(): Record<string, string> {
  return {'X-Requester-Key': getRequesterKey()};
}
