import {LIBERIA_COUNTIES} from '../../../server/constants';
import {validateHarvestFields} from '../harvestRules';
import type {HarvestListing, HarvestLoad} from '../harvestClient';
import type {ListingData, ListingRecord} from '../offlineDrafts';
import {DEMO_TOWNS, EMPTY_MARKETPLACE, INQUIRY_MESSAGES, USSD_DEMO_MARKER, type DemoInquiry, type MarketplaceEnv, type MarketCommand, type MarketResult, type OwnDemoListing} from './marketTypes';

interface Environment {demoEnvironment?: boolean; syntheticAccountsOnly?: boolean}
interface InquiryResponse {id: number; role: 'buyer' | 'seller'; listingId: number; listingCode: string | null; cropLabel: string; message: string; farmerReply: string; status: string}
export interface MarketClientDeps {
  enabled: boolean; timeoutMs?: number; online: () => boolean; now?: () => Date; uuid: () => string;
  get: <T>(path: string, headers?: Record<string, string>) => Promise<T>;
  post: <T>(path: string, body: unknown, headers: Record<string, string>) => Promise<T>;
  loadMarket: () => Promise<HarvestLoad>; init: () => Promise<void>; records: () => ListingRecord[];
  save: (data: ListingData) => Promise<ListingRecord>; queue: (localId: string) => Promise<void>; syncSoon: () => void;
  requesterKey: () => string;
}
const isDemo = (l: HarvestListing): boolean => l.synthetic === true || (typeof l.description === 'string' && l.description.startsWith(USSD_DEMO_MARKER));
const isOwnDemo = (l: ListingRecord): boolean => l.data.description.startsWith(USSD_DEMO_MARKER) && !!l.data.cropSlug;
const publicDemo = (l: HarvestListing) => ({id: l.id, code: l.code, cropSlug: l.cropSlug, quantityKg: l.quantityKg, pricePerKgLrd: l.pricePerKgLrd, county: l.county, town: l.town, status: l.status});

/** No new identity or API. Uses existing CSRF/cookies, owner keys, requester keys, queue and idempotency. */
export function createUssdMarketClient(d: MarketClientDeps) {
  let verifiedDemo = false;
  let state: MarketplaceEnv = {...EMPTY_MARKETPLACE};
  const inFlight = new Map<string, Promise<MarketResult>>();
  const completed = new Map<string, MarketResult>();
  const operationKeys = new Map<string, string>();
  const localForCommand = new Map<string, string>();
  const now = () => (d.now ?? (() => new Date()))();
  async function deadline<T>(action: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([action(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Request deadline exceeded')), d.timeoutMs ?? 12_000); })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  const reason = () => !d.enabled ? 'Interactive demo submissions are not configured. Advice and practice menus still work.' : !verifiedDemo ? 'Submissions need the existing protected synthetic-only demo server. Open this page online there first. No development database is changed by enabling this screen.' : '';
  const own = (): OwnDemoListing[] => d.records().filter(isOwnDemo).map((r) => ({localId: r.localId, code: r.status === 'published' ? r.listingCode ?? null : null, cropSlug: r.data.cropSlug!, quantityKg: Number(r.data.quantityKg), price: Number(r.data.priceLrd), county: r.data.county, town: r.data.town, status: r.status, error: r.lastError}));
  const snapshot = (): MarketplaceEnv => ({...state, own: own(), allowed: d.enabled && verifiedDemo, reason: reason()});
  async function checkEnvironment(): Promise<void> {
    try { const e = await deadline(() => d.get<Environment>('/environment')); verifiedDemo = e.demoEnvironment === true && e.syntheticAccountsOnly === true; }
    catch { verifiedDemo = false; }
  }
  async function load(): Promise<MarketplaceEnv> {
    state = {...state, loading: true, error: null};
    try {
      await d.init();
      if (d.online()) await checkEnvironment();
      const market = await deadline(() => d.loadMarket());
      state = {...state, source: market.source, asOf: market.asOf ?? null, listings: market.listings.filter(isDemo).map(publicDemo),
        legacy: {source: market.source, asOf: market.asOf ?? null, listings: market.listings.map((l) => ({code: l.code, cropSlug: l.cropSlug, quantityKg: l.quantityKg, pricePerKgLrd: l.pricePerKgLrd, county: l.county, status: l.status}))},
      };
      if (d.online() && verifiedDemo) {
        const local = d.records().filter(isOwnDemo); const ids = new Set([...state.listings.map((l) => l.id), ...local.flatMap((r) => r.serverId ? [r.serverId] : [])]);
        const key = d.requesterKey();
        if (key !== d.requesterKey()) throw new Error('This browser cannot retain its private requester key. Inquiries are unavailable.');
        const received = new Map<number, DemoInquiry>();
        const accept = (r: InquiryResponse) => { if (ids.has(r.listingId)) received.set(r.id, {id: r.id, role: r.role, listingId: r.listingId, listingCode: r.listingCode, cropLabel: r.cropLabel, message: r.message, reply: r.farmerReply, status: r.status}); };
        (await deadline(() => d.get<{inquiries: InquiryResponse[]}>('/harvest/inquiries', {'X-Requester-Key': key}))).inquiries.forEach(accept);
        for (const r of local) if (r.serverId && r.ownerKey) (await deadline(() => d.get<{inquiries: InquiryResponse[]}>(`/harvest/inquiries?listingId=${r.serverId}`, {'X-Listing-Key': r.ownerKey!}))).inquiries.forEach(accept);
        state = {...state, inquiries: [...received.values()].sort((a, b) => b.id - a.id)};
      }
    } catch { state = {...state, error: 'Could not refresh the demo market or private inquiries. Existing saved information may be old. Try again when connected.'}; }
    finally { state = {...state, loading: false}; }
    return snapshot();
  }
  async function perform(c: MarketCommand): Promise<MarketResult> {
    if (!d.enabled) return {status: 'failed', message: reason()};
    // Recheck the existing server guard before online writes. No host/query parameter can enable it.
    if (d.online()) await checkEnvironment();
    if (!verifiedDemo) return {status: 'failed', message: reason()};
    await d.init();
    if (c.kind === 'sell') {
      const h = validateHarvestFields({cropSlug: c.crop, quantityKg: c.kg, harvestDate: c.harvestDate}, now());
      if (!h.ok) return {status: 'failed', message: h.error};
      if (!Number.isInteger(c.price) || c.price < 1 || c.price > 50_000_000 || !(LIBERIA_COUNTIES as readonly string[]).includes(c.county) || !(DEMO_TOWNS as readonly string[]).includes(c.town)) return {status: 'failed', message: 'Choose a valid whole asking price, county and synthetic town. Nothing was submitted.'};
      let localId = localForCommand.get(c.token);
      if (!localId) {
        const data: ListingData = {sellerType: 'farmer', sellerName: 'Synthetic USSD Farmer', farmName: '', category: h.crop.category, productName: h.crop.label, quantity: String(h.quantityKg), unit: 'kg', priceLrd: String(c.price), county: c.county, town: c.town, availabilityStatus: 'Available', description: USSD_DEMO_MARKER, photoDataUrl: '', sellerPhone: '', phoneConsent: false, cropSlug: c.crop, quantityKg: h.quantityKg, harvestDate: h.harvestDate};
        const rec = await d.save(data); localId = rec.localId; localForCommand.set(c.token, localId);
      }
      try { await d.queue(localId); } catch { return {status: 'failed', localId, message: 'The draft is saved, but could not be queued. Review it in Sell my harvest. It has no server confirmation.'}; }
      d.syncSoon();
      return {status: 'pending', localId, message: 'Saved on this phone and queued with your permission. Pending Sync until the server confirms. A SELL reference is issued only by the server.'};
    }
    if (c.kind === 'retry') {
      const r = d.records().find((r) => r.localId === c.localId && isOwnDemo(r));
      if (!r || r.status !== 'failed') return {status: 'failed', message: 'Only your own failed demo draft can be retried here.'};
      await d.queue(r.localId); d.syncSoon(); return {status: 'pending', localId: r.localId, message: 'Your existing operation was queued again. No duplicate listing was created.'};
    }
    if (!d.online()) return {status: 'failed', message: 'Offline. No inquiry was sent or queued. Connect before confirming an inquiry.'};
    if (!(LIBERIA_COUNTIES as readonly string[]).includes(c.county) || !(INQUIRY_MESSAGES as readonly string[]).includes(c.message)) return {status: 'failed', message: 'Choose one of the synthetic demo questions and a valid county.'};
    const listed = state.listings.find((l) => l.id === c.listingId);
    if (!listed?.code) return {status: 'failed', message: 'This listing is not in the demo list. Refresh before sending. Nothing was sent.'};
    // A stale snapshot can never authorize an inquiry about hidden, sold-out or non-demo produce.
    let current: HarvestListing;
    try { current = (await deadline(() => d.get<{listing: HarvestListing}>(`/harvest/listings/${encodeURIComponent(listed.code!)}`))).listing; }
    catch { return {status: 'failed', message: 'The listing could not be confirmed with the server. Nothing was sent. Refresh before trying again.'}; }
    if (!isDemo(current) || current.id !== c.listingId || current.status === 'Sold Out') return {status: 'failed', message: 'This demo listing is unavailable. Nothing was sent.'};
    const key = d.requesterKey();
    if (key !== d.requesterKey()) return {status: 'failed', message: 'This browser cannot retain its private device key. Nothing was sent. Use a browser that permits storage.'};
    const op = operationKeys.get(c.token) ?? d.uuid(); operationKeys.set(c.token, op);
    try {
      const r = await deadline(() => d.post<{inquiry: {id: number}}>('/marketplace/listings/' + c.listingId + '/inquiries', {buyerName: 'Synthetic USSD Buyer', buyerCounty: c.county, message: c.message, requesterKey: key, buyerToken: '', buyerPhoneConsent: false, isSimulated: true}, {'Idempotency-Key': op}));
      if (!r.inquiry?.id) throw new Error('No confirmation');
      return {status: 'synced', message: `Server confirmed demo inquiry ${r.inquiry.id}. Read it in My Inquiries after refreshing. No phone number was shared.`};
    } catch (error) {
      const status = (error as {status?: number}).status;
      if (status && status >= 400 && status < 500) return {status: 'failed', message: status === 429 ? 'Server refused this inquiry: too many requests. Wait and try again.' : 'Server refused this inquiry. Refresh and check your permissions or listing availability. Nothing was confirmed.'};
      return {status: 'unconfirmed', message: 'Delivery is unconfirmed. The server may have received it. Check My Inquiries or retry this same operation. No offline inquiry was queued.'};
    }
  }
  function run(command: MarketCommand): Promise<MarketResult> {
    const done = completed.get(command.token); if (done) return Promise.resolve(done);
    const running = inFlight.get(command.token); if (running) return running;
    if (inFlight.size) return Promise.resolve({status: 'failed', message: 'Another confirmed action is finishing. Check My Listings or My Inquiries before submitting again.'});
    const promise = perform(command).catch((): MarketResult => ({status: 'failed', message: 'The action could not finish. Check My Listings or My Inquiries before trying again.'})).then((result) => {
      if (result.status === 'synced' || result.status === 'pending') completed.set(command.token, result);
      return result;
    }).finally(() => inFlight.delete(command.token));
    inFlight.set(command.token, promise); return promise;
  }
  return {load, run, snapshot};
}
