import type {Fixtures} from '../harness/fixtures.ts';
import {CookieJar} from '../harness/http.ts';

/**
 * The contract script: ~50 ordered requests covering every endpoint family and the main failure modes. It is deterministic on a FRESH database.
 * Each step is recorded (status, key headers, cookie attributes, normalised body) into tests/contract/golden/node.v1.json by the Node reference
 * backend; a new backend must reproduce it. Dynamic ids are carried between steps through `ctx`.
 */
export type JarName = 'anon' | 'farmer' | 'farmer2' | 'other' | 'admin' | 'expert';

export interface Ctx {
  jars: Record<JarName, CookieJar>;
  fx: Fixtures;
  ids: Record<string, number>;
}

export interface Step {
  name: string;
  jar: JarName;
  method?: string;
  path: string | ((ctx: Ctx) => string);
  body?: unknown | ((ctx: Ctx) => unknown);
  headers?: Record<string, string>;
  skipCsrf?: boolean;
  /** Runs BEFORE the request and is not recorded (test setup, e.g. registering a trusted device through the fixture adapter). */
  before?: (ctx: Ctx) => Promise<void>;
  /** Runs after the response, to remember ids (e.g. a created listing) for later steps. */
  capture?: (data: any, ctx: Ctx) => void;
}

export const KEY = (n: string): string => `${n}-contract-key-`.padEnd(48, 'c');

const listingBody = (extra: Record<string, unknown> = {}) => ({
  ownerKey: KEY('listing'),
  sellerName: 'Contract Farmer',
  farmName: 'Contract Farm',
  category: 'Rice and grains',
  productName: 'Contract Rice',
  quantity: '10',
  unit: '50kg bag',
  priceLrd: 7000,
  county: 'Bong',
  town: 'Gbarnga',
  description: 'Contract listing description.',
  availabilityStatus: 'Available',
  sellerPhone: '0771234567',
  phoneConsent: true,
  ...extra,
});

export const STEPS: Step[] = [
  // --- platform
  {name: 'health', jar: 'anon', path: '/api/v1/health'},
  {name: 'csrf token', jar: 'anon', path: '/api/v1/csrf-token'},
  // --- public reference data
  {name: 'crops list', jar: 'anon', path: '/api/v1/crops'},
  {name: 'categories list', jar: 'anon', path: '/api/v1/categories'},
  {name: 'guides list', jar: 'anon', path: '/api/v1/guides?lang=en'},
  {name: 'guide detail by slug', jar: 'anon', path: '/api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=en'},
  {name: 'guide language fallback', jar: 'anon', path: '/api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=kpe'},
  {name: 'guide not found', jar: 'anon', path: '/api/v1/guides/does-not-exist'},
  {name: 'public home', jar: 'anon', path: '/api/v1/public/home'},
  // --- auth
  {name: 'me (anonymous)', jar: 'anon', path: '/api/v1/auth/me'},
  {name: 'register farmer', jar: 'farmer', method: 'POST', path: '/api/v1/auth/register', body: {displayName: 'Contract Farmer', phone: '+231771234001', password: 'SafePassword123', county: 'Lofa', preferredLanguage: 'en', cropsOfInterest: ['Cassava']}},
  {name: 'register duplicate phone', jar: 'farmer2', method: 'POST', path: '/api/v1/auth/register', body: {displayName: 'Dup Farmer', phone: '+231771234001', password: 'SafePassword123', county: 'Lofa', preferredLanguage: 'en', cropsOfInterest: []}},
  {name: 'me (farmer)', jar: 'farmer', path: '/api/v1/auth/me'},
  {name: 'login wrong password', jar: 'farmer2', method: 'POST', path: '/api/v1/auth/login', body: {identifier: '+231771234001', password: 'WrongPassword!1'}},
  {name: 'login ok', jar: 'farmer2', method: 'POST', path: '/api/v1/auth/login', body: {identifier: '+231771234001', password: 'SafePassword123'},
    before: async (ctx) => { ctx.jars.farmer2.set('agri_device', await ctx.fx.trustDevice('+231771234001')); }},
  {name: 'request without CSRF token', jar: 'anon', method: 'POST', path: '/api/v1/feedback', skipCsrf: true, body: {name: 'X', message: 'No csrf header'}},
  // --- signed-in farmer
  {name: 'profile get', jar: 'farmer', path: '/api/v1/profile'},
  {name: 'profile patch', jar: 'farmer', method: 'PATCH', path: '/api/v1/profile', body: {displayName: 'Contract Farmer', county: 'Nimba', preferredLanguage: 'en', cropsOfInterest: ['Rice']}},
  {name: 'farmer question create', jar: 'farmer', method: 'POST', path: '/api/v1/farmer/questions', body: {topic: 'Pest Prevention', county: 'Lofa', title: 'Contract farm question', description: 'Whiteflies appear under my cassava leaves every morning.'}, capture: (d, c) => (c.ids.question = d.questionId)},
  {name: 'farmer questions list', jar: 'farmer', path: '/api/v1/farmer/questions'},
  {name: 'farmer question detail', jar: 'farmer', path: (c) => `/api/v1/farmer/questions/${c.ids.question}`},
  {name: 'farmer question: other user denied', jar: 'other', path: (c) => `/api/v1/farmer/questions/${c.ids.question}`},
  {name: 'saved advice list', jar: 'farmer', path: '/api/v1/farmer/saved'},
  {name: 'advisor ask (AI not configured)', jar: 'anon', method: 'POST', path: '/api/v1/advisor/ask', body: {question: 'How do I plant rice in the swamp?', topic: 'crops', language: 'en'}},
  {name: 'advisor history (signed in)', jar: 'farmer', path: '/api/v1/advisor/history'},
  {name: 'feedback submit', jar: 'anon', method: 'POST', path: '/api/v1/feedback', body: {name: 'Contract Tester', message: 'The offline guides are very useful.'}},
  // --- marketplace
  {name: 'marketplace list', jar: 'anon', path: '/api/v1/marketplace/listings'},
  {name: 'marketplace filtered', jar: 'anon', path: '/api/v1/marketplace/listings?county=Lofa&maxPrice=8000&availability=Available'},
  {name: 'listing create (anonymous with key)', jar: 'anon', method: 'POST', path: '/api/v1/marketplace/listings', body: () => listingBody(), capture: (d, c) => (c.ids.listing = d.listing.id)},
  {name: 'listing create without key', jar: 'anon', method: 'POST', path: '/api/v1/marketplace/listings', body: () => listingBody({ownerKey: undefined})},
  {name: 'listing create invalid price', jar: 'anon', method: 'POST', path: '/api/v1/marketplace/listings', body: () => listingBody({priceLrd: -1})},
  {name: 'listing patch by owner key', jar: 'anon', method: 'PATCH', path: (c) => `/api/v1/marketplace/listings/${c.ids.listing}`, headers: {'X-Listing-Key': KEY('listing')}, body: {priceLrd: 7500, availabilityStatus: 'Limited Stock'}},
  {name: 'listing patch without credential', jar: 'anon', method: 'PATCH', path: (c) => `/api/v1/marketplace/listings/${c.ids.listing}`, body: {priceLrd: 1}},
  {name: 'listing delete with wrong key', jar: 'anon', method: 'DELETE', path: (c) => `/api/v1/marketplace/listings/${c.ids.listing}`, headers: {'X-Listing-Key': KEY('attacker')}},
  {name: 'listing view counter', jar: 'anon', method: 'POST', path: (c) => `/api/v1/marketplace/listings/${c.ids.listing}/view`, body: {}},
  {name: 'idempotent create', jar: 'anon', method: 'POST', path: '/api/v1/marketplace/listings', headers: {'Idempotency-Key': 'contract-op-000001'}, body: () => listingBody({ownerKey: KEY('idem'), productName: 'Contract Idempotent Okra'})},
  {name: 'idempotent replay', jar: 'anon', method: 'POST', path: '/api/v1/marketplace/listings', headers: {'Idempotency-Key': 'contract-op-000001'}, body: () => listingBody({ownerKey: KEY('idem'), productName: 'Contract Idempotent Okra'})},
  {name: 'idempotency key reuse (other kind)', jar: 'anon', method: 'POST', path: '/api/v1/expert-requests/demo', headers: {'Idempotency-Key': 'contract-op-000001'}, body: {ownerKey: KEY('idem'), requesterKey: KEY('idem'), title: 'Other kind', description: 'Reusing an idempotency key for another endpoint.'}},
  {name: 'inquiries (anonymous: empty)', jar: 'anon', path: '/api/v1/marketplace/inquiries'},
  // --- expert requests
  {name: 'expert requests (visitor: samples only)', jar: 'anon', path: '/api/v1/expert-requests/demo'},
  {name: 'expert request create', jar: 'anon', method: 'POST', path: '/api/v1/expert-requests/demo', body: {requesterKey: KEY('req'), farmerName: 'Contract Farmer', category: 'Poultry farming', county: 'Margibi', title: 'Wet bedding in broiler coop', description: 'Heavy rain splashed onto the wood shavings in one corner.'}, capture: (d, c) => (c.ids.request = d.request.id)},
  {name: 'expert request create without key', jar: 'anon', method: 'POST', path: '/api/v1/expert-requests/demo', body: {farmerName: 'No Key', category: 'Poultry farming', county: 'Margibi', title: 'No device key', description: 'This request has no requester key at all.'}},
  {name: 'expert requests (own device)', jar: 'anon', path: '/api/v1/expert-requests/demo', headers: {'X-Requester-Key': KEY('req')}},
  {name: 'expert reply without login', jar: 'anon', method: 'PATCH', path: (c) => `/api/v1/expert-requests/demo/${c.ids.request}/reply`, body: {expertReply: 'Move birds to a dry pen.'}},
  {name: 'expert reply as farmer', jar: 'farmer', method: 'PATCH', path: (c) => `/api/v1/expert-requests/demo/${c.ids.request}/reply`, body: {expertReply: 'Move birds to a dry pen.'}},
  {name: 'expert reply as expert', jar: 'expert', method: 'PATCH', path: (c) => `/api/v1/expert-requests/demo/${c.ids.request}/reply`, body: {expertReply: 'Move birds to a dry pen and keep water clean.', status: 'Answered'}},
  // --- language lab
  {name: 'language lab list', jar: 'anon', path: '/api/v1/language-lab/recordings'},
  {name: 'language lab submit', jar: 'anon', method: 'POST', path: '/api/v1/language-lab/recordings', body: {languageCode: 'bas', topicSlug: 'rice', topicLabel: 'Rice', speakerName: 'Contract Speaker', questionText: 'How do I plant rice?', answerText: 'Plant at the start of the rains in rows.', consentConfirmed: true, reviewStatus: 'reviewed'}, capture: (d, c) => (c.ids.recording = d.recording.id)},
  {name: 'language lab submit without consent', jar: 'anon', method: 'POST', path: '/api/v1/language-lab/recordings', body: {languageCode: 'bas', speakerName: 'No Consent', questionText: 'Question text', answerText: 'Answer text here', consentConfirmed: false}},
  {name: 'language review without login', jar: 'anon', method: 'PATCH', path: (c) => `/api/v1/language-lab/recordings/${c.ids.recording}/review`, body: {reviewStatus: 'reviewed'}},
  {name: 'language review as expert', jar: 'expert', method: 'PATCH', path: (c) => `/api/v1/language-lab/recordings/${c.ids.recording}/review`, body: {reviewStatus: 'reviewed'}},
  // --- management and admin
  {name: 'management summary', jar: 'anon', path: '/api/v1/prototype/management-summary'},
  {name: 'admin overview (anonymous)', jar: 'anon', path: '/api/v1/admin/overview'},
  {name: 'admin overview (farmer)', jar: 'farmer', path: '/api/v1/admin/overview'},
  {name: 'admin overview (admin)', jar: 'admin', path: '/api/v1/admin/overview'},
  {name: 'admin users', jar: 'admin', path: '/api/v1/admin/users'},
  {name: 'admin guides', jar: 'admin', path: '/api/v1/admin/guides'},
  {name: 'admin settings', jar: 'admin', path: '/api/v1/admin/settings'},
  {name: 'expert question queue (expert)', jar: 'expert', path: '/api/v1/expert/questions'},
  {name: 'expert question queue (farmer)', jar: 'farmer', path: '/api/v1/expert/questions'},
  {name: 'demo reset (anonymous)', jar: 'anon', method: 'POST', path: '/api/v1/demo/reset', body: {}},
  {name: 'logout', jar: 'farmer', method: 'POST', path: '/api/v1/auth/logout', body: {}},
  {name: 'me after logout', jar: 'farmer', path: '/api/v1/auth/me'},
];
