import {getBaseUrl} from './http.ts';

/**
 * Typed client for the TEST-ONLY fixture contract (see docs/TEST_HARNESS.md). Any backend that implements these `/__test__/*` routes can
 * run the full suite. The tests never open a database; everything server-side they need to seed or inspect goes through here.
 */
export class Fixtures {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<{status: number; data: T}> {
    const res = await fetch(`${getBaseUrl()}/__test__${path}`, {
      method,
      headers: {'X-Test-Fixture-Token': this.token, ...(body !== undefined ? {'Content-Type': 'application/json'} : {})},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return {status: res.status, data};
  }

  private async ok<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.call<T>(method, path, body);
    if (r.status >= 300) throw new Error(`fixture ${method} ${path} failed with ${r.status}: ${JSON.stringify(r.data)}`);
    return r.data;
  }

  /** Creates an active user with the given roles (and a farmer/expert profile when relevant). */
  async createUser(input: {displayName: string; phone: string; password: string; roles: ('farmer' | 'expert' | 'admin')[]; expertStatus?: string; county?: string; phoneVerified?: boolean}) {
    return this.ok<{id: number}>('POST', '/users', input);
  }

  // ---- authentication adapters (SMS verification milestone). Narrow, explicit, test-only; real login code paths still run. ----
  /** Creates a real trusted-device row for an existing user and returns the cookie value to put in a jar as `agri_device`. */
  /** Replaces a user's password (e.g. moves a seeded demo account off its published password). */
  async setPassword(phone: string, password: string): Promise<void> {
    await this.ok('POST', '/users/set-password', {phone, password});
  }
  async trustDevice(phone: string): Promise<string> {
    return (await this.ok<{token: string}>('POST', '/trusted-devices', {phone})).token;
  }
  async userByPhone(phone: string) {
    return (await this.ok<{user: {id: number; phone: string; phone_verified_at: string | null; session_version: number}}>('GET', `/users/by-phone/${encodeURIComponent(phone)}`)).user;
  }
  async setClaimExpiry(phone: string, hoursFromNow: number): Promise<void> {
    await this.ok('POST', '/users/claim-expiry', {phone, hoursFromNow});
  }
  async ageChallenges(by: {userId?: number; phone?: string}, purpose: string, ms: number): Promise<number> {
    return (await this.ok<{changed: number}>('POST', '/challenges/age', {...by, purpose, ms})).changed;
  }
  async challenges(userId: number) {
    return (await this.ok<{challenges: {purpose: string; status: string; attempts: number; send_count: number; phone: string}[]}>('GET', `/challenges?userId=${userId}`)).challenges;
  }
  async resetOtpRates(): Promise<void> {
    await this.ok('DELETE', '/otp-rate-events');
  }
  async auditText(): Promise<string> {
    return (await this.ok<{text: string}>('GET', '/audit-text')).text;
  }
  async count(table: string): Promise<number> {
    return (await this.ok<{count: number}>('GET', `/count/${table}`)).count;
  }
  async listing(id: number) {
    return (
      await this.ok<{listing: {id: number; price_lrd: number; seller_phone: string; phone_consent: number; moderation_status: string; seller_user_id: number | null; owner_key_hash: string; owner_token: string}}>(
        'GET',
        `/listings/${id}`
      )
    ).listing;
  }
  async listingIdByLegacyToken(token: string): Promise<number> {
    return (await this.ok<{id: number}>('GET', `/listings/by-legacy-token/${encodeURIComponent(token)}`)).id;
  }
  async setListingModeration(id: number, status: string): Promise<void> {
    await this.ok('POST', `/listings/${id}/moderation`, {status});
  }
  async setListingUpdatedAt(id: number, value: string): Promise<void> {
    await this.ok('POST', `/listings/${id}/updated-at`, {value});
  }
  /** True if the stored ownership hash of the listing corresponds to this raw key (the HMAC stays inside the backend). */
  async listingKeyMatches(id: number, key: string): Promise<boolean> {
    return (await this.ok<{matches: boolean}>('POST', '/listings/key-matches', {id, key})).matches;
  }
  async expertRequest(id: number) {
    return (
      await this.ok<{request: {id: number; status: string; expert_reply: string; assigned_expert_name: string; requester_key_hash: string; requester_token: string; user_id: number | null}}>(
        'GET',
        `/expert-requests/${id}`
      )
    ).request;
  }
  async expertRequestsForKey(key: string): Promise<number> {
    return (await this.ok<{count: number}>('POST', '/expert-requests/count-by-key', {key})).count;
  }
  async recording(id: number) {
    return (await this.ok<{recording: {id: number; review_status: string}}>('GET', `/recordings/${id}`)).recording;
  }
  async auditCount(action: string, targetId = ''): Promise<number> {
    return (await this.ok<{count: number}>('GET', `/audit-count?action=${encodeURIComponent(action)}&targetId=${encodeURIComponent(targetId)}`)).count;
  }
  async syncOperations(opKey: string) {
    return (await this.ok<{rows: {actor: string; kind: string; status_code: number; response_json: string}[]}>('GET', `/sync-operations/${encodeURIComponent(opKey)}`)).rows;
  }
}
