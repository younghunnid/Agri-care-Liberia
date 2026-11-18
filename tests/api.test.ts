import assert from 'node:assert/strict';
import test, {after, before} from 'node:test';
import {startBackend, type Backend} from './harness/backend.ts';
import {CookieJar, getBaseUrl, req} from './harness/http.ts';
import type {Fixtures} from './harness/fixtures.ts';
import {normalizeLiberianPhone} from '../src/lib/phone.ts';

/**
 * Black-box API suite. It talks to the backend ONLY over HTTP plus the test-only fixture contract (tests/harness, docs/TEST_HARNESS.md).
 * Default: boots the Node reference backend in-process on a disposable DB. With API_BASE_URL set it runs against any server implementing the
 * same contract (the PHP backend in later milestones).
 */
let backend: Backend;
let fx: Fixtures;

async function loginJar(identifier: string, password: string): Promise<CookieJar> {
  const jar = new CookieJar();
  const res = await req(jar, '/api/v1/auth/login', {method: 'POST', body: {identifier, password}});
  assert.equal(res.status, 200, `login failed for ${identifier}`);
  return jar;
}
const expertJar = () => loginJar('+231770000201', 'ExpertDemo!2026');
let cachedAdmin: Promise<CookieJar> | null = null;
function adminJar(): Promise<CookieJar> {
  cachedAdmin ??= (async () => {
    await fx.createUser({displayName: 'Sec Admin', phone: '+231775555555', password: 'AdminTestPass!123', roles: ['admin']});
    return loginJar('+231775555555', 'AdminTestPass!123');
  })();
  return cachedAdmin;
}
const farmerJars = new Map<string, Promise<CookieJar>>();
/** Creates a farmer through the fixture contract (the registration endpoint is rate limited to 10/hour) and logs in. */
function farmerJar(phone: string, name: string): Promise<CookieJar> {
  if (!farmerJars.has(phone)) {
    farmerJars.set(
      phone,
      (async () => {
        await fx.createUser({displayName: name, phone, password: 'SafePassword123', roles: ['farmer'], county: 'Bong'});
        return loginJar(phone, 'SafePassword123');
      })()
    );
  }
  return farmerJars.get(phone)!;
}
const SENSITIVE = ['requester_token', 'requester_key_hash', 'user_id', 'owner_token', 'owner_key_hash', 'demo-seed-req'];
const expertBody = (name: string, extra: Record<string, unknown> = {}) => ({
  requesterKey: K(name),
  farmerName: `Farmer ${name}`,
  category: 'Poultry farming',
  county: 'Bong',
  title: `Private question ${name}`,
  description: `Private description for ${name}, written by the farmer.`,
  ...extra,
});

/** Listing ownership secret for a test name (valid shape: 32-128 of A-Za-z0-9_-). */
const K = (name: string): string => `${name}-owner-key-`.padEnd(48, 'k');
const keyHdr = (name: string) => ({'X-Listing-Key': K(name)});

before(async () => {
  backend = await startBackend();
  fx = backend.fixtures;
});

after(async () => {
  await backend.stop();
});

test('1. Health check and public guides return only published approved guides', async () => {
  const jar = new CookieJar();
  const health = await req(jar, '/api/v1/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.publishedGuides, 7);

  const guides = await req(jar, '/api/v1/guides');
  assert.equal(guides.status, 200);
  assert.equal(guides.data.guides.length, 7);
  for (const g of guides.data.guides) {
    assert.equal(g.reviewStatus, 'approved');
  }
});

test('2. Language fallback serves reviewed Liberian English preview and falls back safely to English', async () => {
  const jar = new CookieJar();
  const lreRes = await req(jar, '/api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=lre');
  assert.equal(lreRes.status, 200);
  assert.equal(lreRes.data.guide.languageCode, 'lre');
  assert.equal(lreRes.data.guide.fallbackApplied, false);

  const kpeRes = await req(jar, '/api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=kpe');
  assert.equal(kpeRes.status, 200);
  assert.equal(kpeRes.data.guide.languageCode, 'en');
  assert.equal(kpeRes.data.guide.fallbackApplied, true);
});

test('3. CSRF blocks state-changing requests without token', async () => {
  const jar = new CookieJar();
  const res = await req(jar, '/api/v1/feedback', {
    method: 'POST',
    skipCsrf: true,
    body: {name: 'Test', message: 'Missing CSRF header check'},
  });
  assert.equal(res.status, 403);
  assert.equal(res.data.error.code, 'CSRF_INVALID');
});

test('4. Farmer registration, isolation, and SQL injection resistance', async () => {
  const jarA = new CookieJar();
  const regA = await req(jarA, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      displayName: 'Farmer A',
      phone: '+231771111111',
      password: 'SafePassword123',
      county: 'Lofa',
      preferredLanguage: 'en',
      cropsOfInterest: ['Cassava'],
    },
  });
  assert.equal(regA.status, 201);

  const qRes = await req(jarA, '/api/v1/farmer/questions', {
    method: 'POST',
    body: {
      topic: 'Pest Prevention',
      county: 'Lofa',
      title: 'Private Lofa farm question',
      description: 'Leaves on my Lofa cassava plot have whiteflies underneath.',
    },
  });
  assert.equal(qRes.status, 201);
  const qId = qRes.data.questionId;

  // Register Farmer B and verify Farmer B cannot access Farmer A's question
  const jarB = new CookieJar();
  const regB = await req(jarB, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      displayName: 'Farmer B',
      phone: '+231772222222',
      password: 'SafePassword123',
      county: 'Nimba',
      preferredLanguage: 'en',
    },
  });
  assert.equal(regB.status, 201);

  const crossAccess = await req(jarB, `/api/v1/farmer/questions/${qId}`);
  assert.equal(crossAccess.status, 403);

  // Farmer cannot access admin or expert routes
  const adminAttempt = await req(jarB, '/api/v1/admin/overview');
  assert.equal(adminAttempt.status, 403);
  const expertAttempt = await req(jarB, '/api/v1/expert/questions');
  assert.equal(expertAttempt.status, 403);

  // SQL injection attempt on login and search
  const sqliLogin = await req(new CookieJar(), '/api/v1/auth/login', {
    method: 'POST',
    body: {identifier: "' OR 1=1 --", password: 'wrong'},
  });
  assert.equal(sqliLogin.status, 401);

  const sqliSearch = await req(jarB, "/api/v1/guides?q=' OR 1=1 --");
  assert.equal(sqliSearch.status, 200);
  assert.equal(sqliSearch.data.guides.length, 0);
});

test('5. AI Advisor handles missing API key honestly and enforces guest rate limiting', async () => {
  const jar = new CookieJar();
  for (let i = 0; i < 3; i++) {
    const res = await req(jar, '/api/v1/advisor/ask', {
      method: 'POST',
      body: {question: 'My cassava leaves are turning yellow. What should I do?', cropSlug: 'cassava'},
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.advisor.providerMode, 'unavailable_demo');
    assert.ok(res.data.advisor.recommendedGuides.length > 0);
  }

  // 4th attempt should trigger guest daily limit (set to 3 for test)
  const limited = await req(jar, '/api/v1/advisor/ask', {
    method: 'POST',
    body: {question: 'Fourth question should hit anonymous daily limit.'},
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error.code, 'ANON_QUOTA_REACHED');
});

test('6. Admin question assignment, expert response, and guide approval workflow', async () => {
  // Bootstrap an admin user through the fixture contract
  await fx.createUser({displayName: 'Test Admin', phone: '+231779999999', password: 'AdminTestPass!123', roles: ['admin']});

  const adminJar = new CookieJar();
  const loginAdmin = await req(adminJar, '/api/v1/auth/login', {
    method: 'POST',
    body: {identifier: '+231779999999', password: 'AdminTestPass!123'},
  });
  assert.equal(loginAdmin.status, 200);

  const expertsRes = await req(adminJar, '/api/v1/admin/experts');
  const demoExpertId = expertsRes.data.experts[0].id;

  const qList = await req(adminJar, '/api/v1/admin/questions');
  const targetQ = qList.data.questions.find((q: {title: string}) => q.title === 'Private Lofa farm question');
  assert.ok(targetQ);

  const assignRes = await req(adminJar, `/api/v1/admin/questions/${targetQ.id}/assign`, {
    method: 'POST',
    body: {expertId: demoExpertId},
  });
  assert.equal(assignRes.status, 200);

  // Expert logs in and answers
  const expertJar = new CookieJar();
  const loginExp = await req(expertJar, '/api/v1/auth/login', {
    method: 'POST',
    body: {identifier: '+231770000201', password: 'ExpertDemo!2026'},
  });
  assert.equal(loginExp.status, 200);

  const respRes = await req(expertJar, `/api/v1/expert/questions/${targetQ.id}/respond`, {
    method: 'POST',
    body: {
      messageText: 'Inspect leaf undersides for whiteflies and keep drainage trenches clear around cassava mounds.',
      status: 'Answered',
    },
  });
  assert.equal(respRes.status, 201);
  assert.equal(respRes.data.status, 'Answered');
});

test('7. Agricultural Marketplace filters, Liberian phone consent/validation, view count, and ownership check', async () => {
  const jar = new CookieJar();
  const initial = await req(jar, '/api/v1/marketplace/listings');
  assert.equal(initial.status, 200);
  assert.ok(initial.data.listings.length >= 11);
  assert.equal(initial.data.categories.length, 9);
  assert.ok(initial.data.categories.includes('Livestock'));
  assert.ok(initial.data.categories.includes('Agricultural supplies'));
  assert.ok(
    initial.data.listings.some((l: {product_name: string}) => l.product_name === 'Premium Lofa Country Rice'),
    'Should include Premium Lofa Country Rice demo listing'
  );

  // Filter by maxPrice & county
  const filtered = await req(jar, '/api/v1/marketplace/listings?county=Lofa&maxPrice=8000&availability=Available');
  assert.equal(filtered.status, 200);
  assert.ok(filtered.data.listings.every((l: {county: string; price_lrd: number}) => l.county === 'Lofa' && l.price_lrd <= 8000));

  // Invalid Liberian phone number rejected
  const badPhone = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: {
      ownerKey: K('test-owner-123'),
      sellerName: 'Bad Phone Test',
      category: 'Fish and seafood',
      productName: 'Test Tilapia',
      quantity: '10',
      unit: 'kg',
      priceLrd: 900,
      county: 'Bomi',
      town: 'Tubmanburg',
      description: 'Testing phone validation rejection.',
      sellerPhone: '12345',
      phoneConsent: true,
    },
  });
  assert.equal(badPhone.status, 400);

  // Valid Liberian phone normalized & exposed only when consented
  const created = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: {
      ownerKey: K('test-owner-123'),
      sellerName: 'Kpelle Pond Collective',
      farmName: 'Kpelle Aquaculture',
      category: 'Fish and seafood',
      productName: 'Fresh Harvest Catfish',
      quantity: '30',
      unit: 'kg',
      priceLrd: 1200,
      county: 'Nimba',
      town: 'Ganta',
      description: 'Clean pond-raised catfish ready for Friday morning pickup in Ganta.',
      availabilityStatus: 'Available',
      sellerPhone: '077 012 3456',
      phoneConsent: true,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.listing.seller_phone, '+231770123456');
  assert.equal(created.data.listing.phone_verified, 0);
  assert.equal(created.data.listing.is_fictional_seller, 0);
  const listingId = created.data.listing.id;

  // Unconsented phone must NOT leak to public GET requests
  const privatePhoneCreated = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: {
      ownerKey: K('private-owner-456'),
      sellerName: 'Private Seller',
      category: 'Vegetables',
      productName: 'Fresh Okra Without Public Phone',
      quantity: '5',
      unit: 'basket',
      priceLrd: 1500,
      county: 'Bong',
      town: 'Gbarnga',
      description: 'Seller provided phone privately without public display consent.',
      sellerPhone: '0886123456',
      phoneConsent: false,
    },
  });
  assert.equal(privatePhoneCreated.status, 201);
  const publicView = await req(jar, '/api/v1/marketplace/listings?q=Okra%20Without%20Public%20Phone');
  const maskedItem = publicView.data.listings.find((l: {id: number}) => l.id === privatePhoneCreated.data.listing.id);
  assert.equal(maskedItem.seller_phone, '');

  // Buyer view increment
  const viewRes = await req(jar, `/api/v1/marketplace/listings/${listingId}/view`, {method: 'POST', body: {}});
  assert.equal(viewRes.status, 200);
  assert.equal(viewRes.data.view_count, 1);

  // Edit availability & price
  const updated = await req(jar, `/api/v1/marketplace/listings/${listingId}`, {
    method: 'PATCH',
    headers: keyHdr('test-owner-123'),
    body: {
      priceLrd: 1350,
      quantity: '35',
      availabilityStatus: 'Limited Stock',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.listing.price_lrd, 1350);
  assert.equal(updated.data.listing.availability_status, 'Limited Stock');

  const wrongOwnerDelete = await req(jar, `/api/v1/marketplace/listings/${listingId}`, {
    method: 'DELETE',
    headers: keyHdr('wrong-token'),
  });
  assert.equal(wrongOwnerDelete.status, 403);
});

test('8. Local Language AI Lab enforces speaker consent and review status workflow', async () => {
  const jar = new CookieJar();
  const listRes = await req(jar, '/api/v1/language-lab/recordings?lang=bas');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.data.recordings.length >= 1);

  // Must reject without explicit consentConfirmed
  const noConsent = await req(jar, '/api/v1/language-lab/recordings', {
    method: 'POST',
    body: {
      languageCode: 'man',
      topicSlug: 'poultry',
      speakerName: 'Gayeleh Tokpah (Nimba)',
      questionText: 'Keeping young chicks warm during rain',
      answerText: 'Keep litter dry and shield night drafts.',
      consentConfirmed: false,
    },
  });
  assert.equal(noConsent.status, 400);
  assert.equal(noConsent.data.error.code, 'CONSENT_REQUIRED');

  const withConsent = await req(jar, '/api/v1/language-lab/recordings', {
    method: 'POST',
    body: {
      languageCode: 'man',
      topicSlug: 'poultry',
      topicLabel: 'Poultry & Chick Health',
      speakerName: 'Gayeleh Tokpah (Nimba)',
      questionText: 'Keeping young chicks warm during rain',
      answerText: 'Keep litter dry and shield night drafts.',
      consentConfirmed: true,
    },
  });
  assert.equal(withConsent.status, 201);
  assert.equal(withConsent.data.recording.review_status, 'pending_review');

  // Public visitors can no longer approve; a verified reviewer (approved expert) can.
  const anonReview = await req(jar, `/api/v1/language-lab/recordings/${withConsent.data.recording.id}/review`, {
    method: 'PATCH',
    body: {reviewStatus: 'reviewed'},
  });
  assert.equal(anonReview.status, 401);
  const reviewed = await req(await expertJar(), `/api/v1/language-lab/recordings/${withConsent.data.recording.id}/review`, {
    method: 'PATCH',
    body: {reviewStatus: 'reviewed'},
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.recording.review_status, 'reviewed');
});

test('9. Demo Expert Requests, Simulated Expert reply, and Management summary separation', async () => {
  const jar = new CookieJar();
  const created = await req(jar, '/api/v1/expert-requests/demo', {
    method: 'POST',
    body: {
      requesterKey: K('demo-user-99'),
      farmerName: 'Oldpa Sumo',
      category: 'Poultry farming',
      county: 'Margibi',
      title: 'Wet bedding in broiler coop',
      description: 'Heavy rain splashed onto wood shavings in one corner of our chicken house.',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.request.status, 'Submitted');

  const replyBody = {
    expertReply: 'Remove damp litter immediately, add dry shavings, and check roof overhang.',
    status: 'Answered',
    assignedExpertName: 'Dr. Samuel Tarr (Simulated Extension Officer)',
  };
  assert.equal((await req(jar, `/api/v1/expert-requests/demo/${created.data.request.id}/reply`, {method: 'PATCH', body: replyBody})).status, 401);
  const replied = await req(await expertJar(), `/api/v1/expert-requests/demo/${created.data.request.id}/reply`, {method: 'PATCH', body: replyBody});
  assert.equal(replied.status, 200);
  assert.equal(replied.data.request.status, 'Answered');
  assert.notEqual(replied.data.request.assigned_expert_name, 'Dr. Samuel Tarr (Simulated Extension Officer)');

  const summary = await req(jar, '/api/v1/prototype/management-summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.data.actualData.publishedCropGuides, 7);
  assert.ok(summary.data.demoAndExperimentalData.marketplaceListings >= 11);
});

test('10. Demo Reset restores clean hackathon prototype dataset', async () => {
  const jar = await adminJar();
  const resetRes = await req(jar, '/api/v1/demo/reset', {method: 'POST', body: {}});
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.data.ok, true);

  const postResetListings = await req(jar, '/api/v1/marketplace/listings');
  assert.equal(postResetListings.status, 200);
  assert.equal(postResetListings.data.listings.length, 11);
});

test('11. Liberian phone normalization accepts valid formats and rejects missing/invalid numbers', () => {
  const local = normalizeLiberianPhone('0770123456');
  assert.equal(local.valid, true);
  assert.equal(local.normalized, '+231770123456');
  assert.equal(local.telHref, 'tel:+231770123456');

  const spaced = normalizeLiberianPhone('+231 88-612-3456');
  assert.equal(spaced.valid, true);
  assert.equal(spaced.normalized, '+231886123456');

  const prefix00 = normalizeLiberianPhone('00231555123456');
  assert.equal(prefix00.valid, true);
  assert.equal(prefix00.normalized, '+231555123456');

  const missing = normalizeLiberianPhone('');
  assert.equal(missing.valid, false);
  assert.equal(missing.normalized, '');

  const invalid = normalizeLiberianPhone('+1-555-123-4567');
  assert.equal(invalid.valid, false);
  assert.ok(invalid.error);
});

test('12. Marketplace listings support empty optional description and clearing description on edit', async () => {
  const jar = new CookieJar();

  // 1. Publish without description
  const noDesc = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: {
      ownerKey: K('desc-test-owner'),
      sellerName: 'Flomo Farm',
      category: 'Rice and grains',
      productName: 'Bong Upland Rice',
      quantity: '10',
      unit: '50kg bag',
      priceLrd: 8500,
      county: 'Bong',
      town: 'Gbarnga',
      description: '',
    },
  });
  assert.equal(noDesc.status, 201);
  assert.equal(noDesc.data.listing.description, '');

  // 2. Publish with description
  const withDesc = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: {
      ownerKey: K('desc-test-owner'),
      sellerName: 'Flomo Farm',
      category: 'Cassava and root crops',
      productName: 'Margibi Cassava',
      quantity: '12',
      unit: '50kg bag',
      priceLrd: 3500,
      county: 'Margibi',
      town: 'Kakata',
      description: 'Freshly dug today and ready for pickup.',
    },
  });
  assert.equal(withDesc.status, 201);
  assert.equal(withDesc.data.listing.description, 'Freshly dug today and ready for pickup.');
  const editId = withDesc.data.listing.id;

  // 3. Partial PATCH without description preserves existing description
  const partialPatch = await req(jar, `/api/v1/marketplace/listings/${editId}`, {
    method: 'PATCH',
    headers: keyHdr('desc-test-owner'),
    body: {
      priceLrd: 3700,
    },
  });
  assert.equal(partialPatch.status, 200);
  assert.equal(partialPatch.data.listing.description, 'Freshly dug today and ready for pickup.');

  // 4. PATCH with empty description removes description
  const clearDesc = await req(jar, `/api/v1/marketplace/listings/${editId}`, {
    method: 'PATCH',
    headers: keyHdr('desc-test-owner'),
    body: {
      description: '',
    },
  });
  assert.equal(clearDesc.status, 200);
  assert.equal(clearDesc.data.listing.description, '');
});

test('13. Farmer registration validates Liberian phone, rejects duplicates and invalid CSRF, and grants dashboard access on login', async () => {
  // 1. Missing CSRF token on register returns 403 CSRF_INVALID
  const noCsrfJar = new CookieJar();
  const missingCsrf = await req(noCsrfJar, '/api/v1/auth/register', {
    method: 'POST',
    skipCsrf: true,
    body: {
      displayName: 'No CSRF Farmer',
      phone: '0770333333',
      password: 'SafePassword123',
      county: 'Bong',
    },
  });
  assert.equal(missingCsrf.status, 403);
  assert.equal(missingCsrf.data.error.code, 'CSRF_INVALID');

  // 2. Invalid/mismatched CSRF token returns 403 CSRF_INVALID
  const badCsrfJar = new CookieJar();
  await req(badCsrfJar, '/api/v1/csrf-token');
  const badCsrfRes = await fetch(`${getBaseUrl()}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: badCsrfJar.headerValue(),
      'X-CSRF-Token': 'invalid-csrf-token-1234567890',
    },
    body: JSON.stringify({
      displayName: 'Bad CSRF Farmer',
      phone: '0770333333',
      password: 'SafePassword123',
      county: 'Bong',
    }),
  });
  assert.equal(badCsrfRes.status, 403);
  const badCsrfData = (await badCsrfRes.json()) as {error: {code: string}};
  assert.equal(badCsrfData.error.code, 'CSRF_INVALID');

  // 3. Invalid Liberian phone number rejected with 400
  const regJar = new CookieJar();
  const invalidPhone = await req(regJar, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      displayName: 'Invalid Phone Farmer',
      phone: '+1-555-123-4567',
      password: 'SafePassword123',
      county: 'Bong',
    },
  });
  assert.equal(invalidPhone.status, 400);
  assert.equal(invalidPhone.data.error.code, 'VALIDATION_ERROR');

  // 4. Successful farmer registration with local phone format & optional email omitted
  const validReg = await req(regJar, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      displayName: 'Korpo Flomo',
      phone: '0770333333',
      password: 'SafePassword123',
      county: 'Bong',
      preferredLanguage: 'en',
      cropsOfInterest: ['Cassava', 'Rice'],
    },
  });
  assert.equal(validReg.status, 201);
  assert.equal(validReg.data.user.phone, '+231770333333');
  assert.equal(validReg.data.user.email, null);
  assert.ok(validReg.data.user.roles.includes('farmer'));

  // 5. Duplicate phone rejected even when formatted differently (+231 77 033 3333)
  const dupJar = new CookieJar();
  const dupReg = await req(dupJar, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      displayName: 'Duplicate Farmer',
      phone: '+231 77 033 3333',
      password: 'SafePassword123',
      county: 'Bong',
    },
  });
  assert.equal(dupReg.status, 409);
  assert.equal(dupReg.data.error.code, 'PHONE_EXISTS');

  // 6. Logout then log back in using the newly registered account (local format) & access Farmer Dashboard APIs
  const logoutRes = await req(regJar, '/api/v1/auth/logout', {method: 'POST', body: {}});
  assert.equal(logoutRes.status, 200);

  const loginJar = new CookieJar();
  const loginRes = await req(loginJar, '/api/v1/auth/login', {
    method: 'POST',
    body: {identifier: '077 033 3333', password: 'SafePassword123'},
  });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.data.user.displayName, 'Korpo Flomo');

  const meRes = await req(loginJar, '/api/v1/auth/me');
  assert.equal(meRes.status, 200);
  assert.equal(meRes.data.user.phone, '+231770333333');

  const savedRes = await req(loginJar, '/api/v1/farmer/saved');
  assert.equal(savedRes.status, 200);
  assert.ok(Array.isArray(savedRes.data.saved));

  const questionsRes = await req(loginJar, '/api/v1/farmer/questions');
  assert.equal(questionsRes.status, 200);
  assert.ok(Array.isArray(questionsRes.data.questions));
});

test('14. HTTPS preview proxy headers issue single SameSite=None Secure Partitioned CSRF & session cookies', async () => {
  const csrfRes = await fetch(`${getBaseUrl()}/api/v1/csrf-token`, {
    headers: {
      'X-Forwarded-Proto': 'https',
      Origin: 'https://ais-dev-ucahc4pwaqg7jovu43w7s4-1010835103112.europe-west2.run.app',
    },
  });
  assert.equal(csrfRes.status, 200);

  const setCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [];
  const csrfCookies = setCookies.filter((c) => c.startsWith('agri_csrf='));
  assert.equal(csrfCookies.length, 1, 'Should emit exactly one agri_csrf Set-Cookie header');
  assert.match(csrfCookies[0], /SameSite=None/i);
  assert.match(csrfCookies[0], /;\s*Secure/i);
  assert.match(csrfCookies[0], /;\s*Partitioned/i);

  const csrfData = (await csrfRes.json()) as {csrfToken: string};
  const cookiePair = csrfCookies[0].split(';')[0];
  assert.equal(cookiePair, `agri_csrf=${csrfData.csrfToken}`);

  const regRes = await fetch(`${getBaseUrl()}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
      Origin: 'https://ais-dev-ucahc4pwaqg7jovu43w7s4-1010835103112.europe-west2.run.app',
      Cookie: cookiePair,
      'X-CSRF-Token': csrfData.csrfToken,
    },
    body: JSON.stringify({
      displayName: 'Preview Farmer',
      phone: '0770444444',
      password: 'SafePassword123',
      county: 'Lofa',
      preferredLanguage: 'en',
    }),
  });
  assert.equal(regRes.status, 201);
  const regSetCookies = regRes.headers.getSetCookie ? regRes.headers.getSetCookie() : [];
  const sessionCookie = regSetCookies.find((c) => c.startsWith('agri_session='));
  assert.ok(sessionCookie, 'Registration should set agri_session cookie');
  assert.match(sessionCookie, /SameSite=None/i);
  assert.match(sessionCookie, /;\s*Secure/i);
  assert.match(sessionCookie, /;\s*Partitioned/i);
});



const listingBody = (token: string, extra: Record<string, unknown> = {}) => ({
  ownerKey: K(token),
  sellerName: 'Offline Farmer',
  category: 'Rice and grains',
  productName: 'Offline Rice',
  quantity: '10',
  unit: '50kg bag',
  priceLrd: 7000,
  county: 'Bong',
  town: 'Gbarnga',
  availabilityStatus: 'Available',
  ...extra,
});

test('15. Idempotent listing sync: repeated key creates one listing and replays the response', async () => {
  const jar = new CookieJar();
  const key = 'op-test-listing-0001';
  const body = listingBody('tok-sync-1');
  const first = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers: {'Idempotency-Key': key}});
  assert.equal(first.status, 201);
  assert.equal(first.data.replayed, undefined);
  const second = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers: {'Idempotency-Key': key}});
  assert.equal(second.status, 201);
  assert.equal(second.data.replayed, true);
  assert.equal(second.data.listing.id, first.data.listing.id);

  const list = await req(jar, '/api/v1/marketplace/listings?q=Offline%20Rice');
  const mine = list.data.listings.filter((l: {product_name: string}) => l.product_name === 'Offline Rice');
  assert.equal(mine.length, 1);

  // A different key is a different operation; keys are scoped per actor.
  const other = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers: {'Idempotency-Key': 'op-test-listing-0002'}});
  assert.notEqual(other.data.listing.id, first.data.listing.id);
  const otherActor = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: listingBody('tok-sync-2'),
    headers: {'Idempotency-Key': key},
  });
  assert.notEqual(otherActor.data.listing.id, first.data.listing.id);
});

test('16. Idempotency: invalid keys are rejected, failures are not cached, key cannot change request type', async () => {
  const jar = new CookieJar();
  const bad = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('t3'), headers: {'Idempotency-Key': 'x'}});
  assert.equal(bad.status, 400);

  const key = 'op-test-fail-then-fix-1';
  const invalid = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: listingBody('t3', {priceLrd: -5}),
    headers: {'Idempotency-Key': key},
  });
  assert.equal(invalid.status, 400);
  const fixed = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('t3'), headers: {'Idempotency-Key': key}});
  assert.equal(fixed.status, 201);

  const reuse = await req(jar, '/api/v1/expert-requests/demo', {
    method: 'POST',
    body: {ownerKey: K('t3'), requesterToken: 't3', title: 'Leaf spots', description: 'Brown spots on cassava leaves'},
    headers: {'Idempotency-Key': key},
  });
  assert.equal(reuse.status, 422);
});

test('17. Synced listings never store or expose a phone number without consent', async () => {
  const jar = new CookieJar();
  const noConsent = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: listingBody('t4', {sellerPhone: '0771234567', phoneConsent: false}),
    headers: {'Idempotency-Key': 'op-test-phone-0001'},
  });
  assert.equal(noConsent.status, 201);
  assert.equal(noConsent.data.listing.seller_phone, '');
  const row = await fx.listing(noConsent.data.listing.id);
  assert.equal(row.seller_phone, '');
  assert.equal(row.phone_consent, 0);

  const withConsent = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: listingBody('t4', {sellerPhone: '0771234567', phoneConsent: true}),
    headers: {'Idempotency-Key': 'op-test-phone-0002'},
  });
  assert.equal(withConsent.status, 201);
  const anon = new CookieJar();
  const pub = await req(anon, '/api/v1/marketplace/listings?q=Offline%20Rice');
  const found = pub.data.listings.find((l: {id: number}) => l.id === withConsent.data.listing.id);
  assert.ok(found.seller_phone.length > 0);
});

test('18. Offline edit sync enforces ownership and detects conflicts', async () => {
  const jar = new CookieJar();
  const created = await req(jar, '/api/v1/marketplace/listings', {
    method: 'POST',
    body: listingBody('owner-A'),
    headers: {'Idempotency-Key': 'op-test-edit-0001'},
  });
  const {id, updated_at: updatedAt} = created.data.listing;

  const stranger = await req(jar, `/api/v1/marketplace/listings/${id}`, {
    method: 'PATCH',
    headers: keyHdr('someone-else'),
    body: {priceLrd: 1},
  });
  assert.equal(stranger.status, 403);

  const ok = await req(jar, `/api/v1/marketplace/listings/${id}`, {
    method: 'PATCH',
    headers: keyHdr('owner-A'),
    body: {priceLrd: 8000, baseUpdatedAt: updatedAt},
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.listing.price_lrd, 8000);

  await fx.setListingUpdatedAt(id, '2000-01-01 00:00:00');
  const conflict = await req(jar, `/api/v1/marketplace/listings/${id}`, {
    method: 'PATCH',
    headers: keyHdr('owner-A'),
    body: {priceLrd: 9000, baseUpdatedAt: updatedAt},
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error.code, 'CONFLICT');
  assert.equal((await fx.listing(id)).price_lrd, 8000);
});

test('19. Idempotent expert question sync creates one request and keeps the photo/voice fields', async () => {
  const jar = new CookieJar();
  const key = 'op-test-question-001';
  const body = {
    requesterKey: K('tok-q-1'),
    farmerName: 'Offline Farmer',
    category: 'Soil fertility and land preparation',
    county: 'Lofa',
    title: 'Yellow cassava leaves',
    description: 'Leaves turn yellow from the bottom, written while offline.',
    voiceNoteDataUrl: 'data:audio/webm;base64,AAAA',
  };
  const a = await req(jar, '/api/v1/expert-requests/demo', {method: 'POST', body, headers: {'Idempotency-Key': key}});
  const b = await req(jar, '/api/v1/expert-requests/demo', {method: 'POST', body, headers: {'Idempotency-Key': key}});
  assert.equal(a.status, 201);
  assert.equal(b.data.replayed, true);
  assert.equal(b.data.request.id, a.data.request.id);
  assert.equal(await fx.expertRequestsForKey(K('tok-q-1')), 1);
  assert.ok(a.data.request.voice_note_data_url.startsWith('data:audio/'));
});

// ---------------------------------------------------------------- listing ownership security

const FORBIDDEN_FIELDS = ['owner_token', 'owner_key_hash', 'seller_user_id', 'listing_owner_token'];

test('20. Public listing responses never expose ownership tokens, key hashes or seller user ids', async () => {
  const jar = new CookieJar();
  const created = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('leak-check-1')});
  assert.equal(created.status, 201);
  const edited = await req(jar, `/api/v1/marketplace/listings/${created.data.listing.id}`, {
    method: 'PATCH',
    headers: keyHdr('leak-check-1'),
    body: {priceLrd: 7100},
  });
  const list = await req(new CookieJar(), '/api/v1/marketplace/listings');
  for (const [label, payload] of [['create', created.data], ['patch', edited.data], ['list', list.data]] as const) {
    const text = JSON.stringify(payload);
    for (const f of FORBIDDEN_FIELDS) assert.equal(text.includes(f), false, `${label} response leaks ${f}`);
    assert.equal(text.includes(K('leak-check-1')), false, `${label} response leaks the owner key`);
    assert.equal(text.includes('demo-seed'), false, `${label} response leaks a legacy token`);
  }
  assert.ok(list.data.listings.length > 10);
  assert.equal(list.data.listings.every((l: {can_manage: boolean}) => l.can_manage === false), true);
});

test('21. Only the key holder, the signed-in seller or an admin can edit or delete a listing', async () => {
  const anon = new CookieJar();
  const created = await req(anon, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('victim')});
  const id = created.data.listing.id;
  const base = `/api/v1/marketplace/listings/${id}`;

  // No credential, wrong key, malformed key, key in body, key in URL, the legacy token style: all refused.
  assert.equal((await req(anon, base, {method: 'PATCH', body: {priceLrd: 1}})).status, 403);
  assert.equal((await req(anon, base, {method: 'PATCH', headers: keyHdr('attacker'), body: {priceLrd: 1}})).status, 403);
  assert.equal((await req(anon, base, {method: 'PATCH', headers: {'X-Listing-Key': 'short'}, body: {priceLrd: 1}})).status, 403);
  assert.equal((await req(anon, base, {method: 'PATCH', body: {ownerKey: K('victim'), ownerToken: K('victim'), priceLrd: 1}})).status, 403);
  assert.equal((await req(anon, `${base}?ownerKey=${K('victim')}&ownerToken=victim`, {method: 'DELETE'})).status, 403);
  assert.equal((await req(anon, base, {method: 'DELETE', headers: keyHdr('attacker')})).status, 403);

  // The victim's listing is untouched.
  assert.equal((await fx.listing(id)).price_lrd, 7000);

  // The server stores a hash, never the key itself.
  const stored = await fx.listing(id);
  assert.equal(stored.owner_key_hash.length, 64);
  assert.notEqual(stored.owner_key_hash, K('victim'));
  assert.equal(stored.owner_key_hash.includes(K('victim')), false);
  assert.equal(await fx.listingKeyMatches(id, K('victim')), true);
  assert.equal(await fx.listingKeyMatches(id, K('attacker')), false);
  assert.equal(stored.owner_token, '');

  // Legacy rows: demo seed tokens (publicly known) and rows with no key hash cannot be managed with any token.
  const seeded = await fx.listingIdByLegacyToken('demo-seed-0');
  assert.equal((await req(anon, `/api/v1/marketplace/listings/${seeded}`, {method: 'PATCH', body: {ownerToken: 'demo-seed-0', priceLrd: 1}})).status, 403);
  assert.equal((await req(anon, `/api/v1/marketplace/listings/${seeded}`, {method: 'PATCH', headers: {'X-Listing-Key': 'demo-seed-0'.padEnd(40, '0')}, body: {priceLrd: 1}})).status, 403);

  // A different signed-in farmer cannot manage it either.
  const other = new CookieJar();
  const reg = await req(other, '/api/v1/auth/register', {
    method: 'POST',
    body: {displayName: 'Other Farmer', phone: '+231773333333', password: 'SafePassword123', county: 'Bong', preferredLanguage: 'en', cropsOfInterest: []},
  });
  assert.equal(reg.status, 201);
  assert.equal((await req(other, base, {method: 'PATCH', body: {priceLrd: 1}})).status, 403);
  assert.equal((await req(other, base, {method: 'DELETE'})).status, 403);

  // The legitimate owner can edit, and finally delete.
  const ok = await req(anon, base, {method: 'PATCH', headers: keyHdr('victim'), body: {priceLrd: 7200}});
  assert.equal(ok.status, 200);
  assert.equal(ok.data.listing.price_lrd, 7200);
  assert.equal((await req(anon, base, {method: 'DELETE', headers: keyHdr('victim')})).status, 200);
});

test('22. A signed-in seller and an administrator can manage a listing without the key', async () => {
  const seller = new CookieJar();
  await req(seller, '/api/v1/auth/register', {
    method: 'POST',
    body: {displayName: 'Seller Account', phone: '+231774444444', password: 'SafePassword123', county: 'Nimba', preferredLanguage: 'en', cropsOfInterest: []},
  });
  const created = await req(seller, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('acct', {ownerKey: undefined})});
  assert.equal(created.status, 201);
  assert.equal(created.data.listing.can_manage, true);
  const id = created.data.listing.id;
  assert.equal((await req(seller, `/api/v1/marketplace/listings/${id}`, {method: 'PATCH', body: {priceLrd: 6100}})).status, 200);

  await fx.createUser({displayName: 'Own Admin', phone: '+231778888888', password: 'AdminTestPass!123', roles: ['admin']});
  const admin = new CookieJar();
  assert.equal((await req(admin, '/api/v1/auth/login', {method: 'POST', body: {identifier: '+231778888888', password: 'AdminTestPass!123'}})).status, 200);
  assert.equal((await req(admin, `/api/v1/marketplace/listings/${id}`, {method: 'PATCH', body: {priceLrd: 6200}})).status, 200);

  // Hidden listings are visible only to administrators, even if someone passes admin=1.
  await fx.setListingModeration(id, 'hidden');
  const publicAll = await req(new CookieJar(), '/api/v1/marketplace/listings?admin=1');
  assert.equal(publicAll.data.listings.some((l: {id: number}) => l.id === id), false);
  const adminAll = await req(admin, '/api/v1/marketplace/listings?admin=1');
  assert.equal(adminAll.data.listings.some((l: {id: number}) => l.id === id), true);
});

test('23. Publishing anonymously requires a well-formed owner key; old token filters are ignored', async () => {
  const jar = new CookieJar();
  const noKey = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('x', {ownerKey: undefined})});
  assert.equal(noKey.status, 400);
  const shortKey = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('x', {ownerKey: 'too-short'})});
  assert.equal(shortKey.status, 400);
  const all = await req(jar, '/api/v1/marketplace/listings');
  const filtered = await req(jar, '/api/v1/marketplace/listings?ownerToken=demo-seed-0&viewerToken=demo-seed-0');
  assert.equal(filtered.data.listings.length, all.data.listings.length);
});

test('24. Inquiry endpoints expose no owner tokens and cannot be changed by strangers', async () => {
  const jar = new CookieJar();
  const created = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body: listingBody('inq-owner')});
  const listingId = created.data.listing.id;
  const inq = await req(jar, `/api/v1/marketplace/listings/${listingId}/inquiries`, {
    method: 'POST',
    body: {buyerName: 'Buyer Person', buyerCounty: 'Bong', message: 'Is this still available?'},
  });
  assert.equal(inq.status, 201);
  const inqId = inq.data.inquiry.id;

  const anonList = await req(new CookieJar(), '/api/v1/marketplace/inquiries');
  assert.deepEqual(anonList.data.inquiries, []);
  const ownerList = await req(new CookieJar(), `/api/v1/marketplace/inquiries?listingId=${listingId}`, {headers: keyHdr('inq-owner')});
  assert.equal(ownerList.data.inquiries.length, 1);
  assert.equal(JSON.stringify(ownerList.data).includes('owner_token'), false);

  assert.equal((await req(jar, `/api/v1/marketplace/inquiries/${inqId}`, {method: 'PATCH', body: {farmerReply: 'Hacked reply'}})).status, 403);
  assert.equal((await req(jar, `/api/v1/marketplace/inquiries/${inqId}`, {method: 'PATCH', headers: keyHdr('inq-owner'), body: {farmerReply: 'Yes, available.'}})).status, 200);
});

test('25. Retries stay safe: the owner key is never stored in the idempotency table and a replay creates no duplicate', async () => {
  const jar = new CookieJar();
  const body = listingBody('retry-owner');
  const headers = {'Idempotency-Key': 'op-test-ownerkey-0001'};
  const first = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers});
  const replay = await req(jar, '/api/v1/marketplace/listings', {method: 'POST', body, headers});
  assert.equal(first.status, 201);
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.listing.id, first.data.listing.id);

  const rows = await fx.syncOperations('op-test-ownerkey-0001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].response_json.includes(K('retry-owner')), false);
  assert.equal(rows[0].actor.includes(K('retry-owner')), false);

  // The creator's key still works after the retry; someone else's does not.
  const base = `/api/v1/marketplace/listings/${first.data.listing.id}`;
  assert.equal((await req(jar, base, {method: 'PATCH', headers: keyHdr('retry-owner'), body: {priceLrd: 7300}})).status, 200);
  assert.equal((await req(jar, base, {method: 'PATCH', headers: keyHdr('someone-else'), body: {priceLrd: 1}})).status, 403);
});

// ---------------------------------------------------------------- expert request privacy and reply authorization

test('26. Anonymous visitors see only fictional sample expert requests and no credentials', async () => {
  const jar = new CookieJar();
  const mine = await req(jar, '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('priv-a')});
  assert.equal(mine.status, 201);
  const text = JSON.stringify(mine.data);
  for (const f of SENSITIVE) assert.equal(text.includes(f), false, `create response leaks ${f}`);
  assert.equal(text.includes(K('priv-a')), false);

  const anon = await req(new CookieJar(), '/api/v1/expert-requests/demo');
  assert.equal(anon.status, 200);
  const listText = JSON.stringify(anon.data);
  for (const f of SENSITIVE) assert.equal(listText.includes(f), false, `list leaks ${f}`);
  assert.equal(anon.data.requests.some((r: {title: string}) => r.title === 'Private question priv-a'), false);
  assert.ok(anon.data.requests.length >= 1, 'seeded fictional samples stay public');
  assert.equal(anon.data.requests.every((r: {is_mine: boolean; can_reply: boolean}) => r.is_mine === false && r.can_reply === false), true);
});

test('27. A device sees only its own requests; legacy tokens and keys in URLs grant nothing', async () => {
  const a = await req(new CookieJar(), '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('dev-a')});
  const b = await req(new CookieJar(), '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('dev-b')});
  const asA = await req(new CookieJar(), '/api/v1/expert-requests/demo', {headers: {'X-Requester-Key': K('dev-a')}});
  const idsA = asA.data.requests.map((r: {id: number}) => r.id);
  assert.ok(idsA.includes(a.data.request.id));
  assert.equal(idsA.includes(b.data.request.id), false);
  assert.equal(asA.data.requests.find((r: {id: number}) => r.id === a.data.request.id).is_mine, true);

  const wrong = await req(new CookieJar(), '/api/v1/expert-requests/demo', {headers: {'X-Requester-Key': K('nobody')}});
  assert.equal(wrong.data.requests.some((r: {id: number}) => r.id === a.data.request.id), false);
  const viaUrl = await req(new CookieJar(), `/api/v1/expert-requests/demo?token=${K('dev-a')}&requesterKey=${K('dev-a')}&requester_token=dev-a`);
  assert.equal(viaUrl.data.requests.some((r: {id: number}) => r.id === a.data.request.id), false);

  // Publishing without any identity at all is refused.
  const noKey = await req(new CookieJar(), '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('x', {requesterKey: undefined})});
  assert.equal(noKey.status, 400);
  const shortKey = await req(new CookieJar(), '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('x', {requesterKey: 'short'})});
  assert.equal(shortKey.status, 400);
  // The server keeps only a hash.
  const row = await fx.expertRequest(a.data.request.id);
  assert.equal(row.requester_key_hash.length, 64);
  assert.equal(row.requester_key_hash.includes(K('dev-a')), false);
  assert.equal(await fx.expertRequestsForKey(K('dev-a')), 1);
  assert.equal(row.requester_token, '');
});

test('28. Only approved experts and administrators can reply; there is no spoofable bypass', async () => {
  const created = await req(new CookieJar(), '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('reply-target')});
  const id = created.data.request.id;
  const url = `/api/v1/expert-requests/demo/${id}/reply`;
  const body = {expertReply: 'Move the birds to a dry pen and keep water clean.', status: 'Answered', assignedExpertName: 'Impostor Expert'};

  assert.equal((await req(new CookieJar(), url, {method: 'PATCH', body})).status, 401);
  // The requester themself, a different farmer, and spoofed role claims are all refused.
  assert.equal((await req(new CookieJar(), url, {method: 'PATCH', body, headers: {'X-Requester-Key': K('reply-target')}})).status, 401);
  const farmer = await farmerJar('+231776666661', 'Reply Farmer');
  assert.equal((await req(farmer, url, {method: 'PATCH', body})).status, 403);
  assert.equal((await req(farmer, url, {method: 'PATCH', body: {...body, role: 'admin', roles: ['expert']}, headers: {'X-Role': 'admin', Authorization: 'Bearer expert', 'X-Expert': '1'}})).status, 403);
  assert.equal((await req(new CookieJar(), url, {method: 'PATCH', body: {...body, role: 'expert'}, headers: {'X-Role': 'expert', Cookie: 'role=expert; agri_role=admin'}})).status, 401);
  const stillOpen = await fx.expertRequest(id);
  assert.equal(stillOpen.status, 'Submitted');
  assert.equal(stillOpen.expert_reply, '');

  // A real approved expert can; the displayed name comes from the account, not the request body.
  const expert = await expertJar();
  const ok = await req(expert, url, {method: 'PATCH', body});
  assert.equal(ok.status, 200);
  assert.equal(ok.data.request.status, 'Answered');
  assert.notEqual(ok.data.request.assigned_expert_name, 'Impostor Expert');
  assert.equal(JSON.stringify(ok.data).includes('requester_key_hash'), false);
  assert.equal((await req(expert, '/api/v1/expert-requests/demo/999999/reply', {method: 'PATCH', body})).status, 404);
  assert.equal((await req(expert, url, {method: 'PATCH', body: {expertReply: 'no'}})).status, 400);

  // Administrators can too, and the requester sees the answer on their own request.
  assert.equal((await req(await adminJar(), url, {method: 'PATCH', body: {...body, expertReply: 'Admin follow-up: vaccinate only on a vet officer\'s advice.'}})).status, 200);
  const seen = await req(new CookieJar(), '/api/v1/expert-requests/demo', {headers: {'X-Requester-Key': K('reply-target')}});
  assert.match(seen.data.requests.find((r: {id: number}) => r.id === id).expert_reply, /Admin follow-up/);
});

test('29. Experts and admins see the full queue; signed-in farmers see only their own; no credentials ever returned', async () => {
  const farmer = await farmerJar('+231776666662', 'Account Farmer');
  const created = await req(farmer, '/api/v1/expert-requests/demo', {method: 'POST', body: expertBody('acct-q', {requesterKey: undefined})});
  assert.equal(created.status, 201);
  assert.equal(created.data.request.is_mine, true);
  const other = await farmerJar('+231776666663', 'Other Account Farmer');

  const ownView = await req(farmer, '/api/v1/expert-requests/demo');
  assert.ok(ownView.data.requests.some((r: {id: number}) => r.id === created.data.request.id));
  const otherView = await req(other, '/api/v1/expert-requests/demo');
  assert.equal(otherView.data.requests.some((r: {id: number}) => r.id === created.data.request.id), false);

  for (const jar of [await expertJar(), await adminJar()]) {
    const view = await req(jar, '/api/v1/expert-requests/demo');
    assert.ok(view.data.requests.some((r: {id: number}) => r.id === created.data.request.id));
    assert.equal(view.data.requests.every((r: {can_reply: boolean}) => r.can_reply === true), true);
    const text = JSON.stringify(view.data);
    for (const f of SENSITIVE) assert.equal(text.includes(f), false, `responder view leaks ${f}`);
  }
});

// ---------------------------------------------------------------- language lab review and demo reset

test('30. Language lab review is limited to experts/admins; public submissions cannot self-approve', async () => {
  const anon = new CookieJar();
  const sub = await req(anon, '/api/v1/language-lab/recordings', {
    method: 'POST',
    body: {
      languageCode: 'bas',
      topicSlug: 'rice',
      speakerName: 'Test Speaker',
      questionText: 'How do I plant rice?',
      answerText: 'Plant at the start of the rains in rows.',
      consentConfirmed: true,
      reviewStatus: 'reviewed',
      review_status: 'reviewed',
      isSampleDemo: false,
    },
  });
  assert.equal(sub.status, 201);
  assert.equal(sub.data.recording.review_status, 'pending_review');
  const id = sub.data.recording.id;
  const url = `/api/v1/language-lab/recordings/${id}/review`;

  assert.equal((await req(anon, url, {method: 'PATCH', body: {reviewStatus: 'reviewed'}})).status, 401);
  const farmer = await farmerJar('+231776666664', 'Lab Farmer');
  assert.equal((await req(farmer, url, {method: 'PATCH', body: {reviewStatus: 'reviewed'}})).status, 403);
  assert.equal((await req(farmer, url, {method: 'PATCH', body: {reviewStatus: 'reviewed', role: 'admin'}, headers: {'X-Role': 'admin'}})).status, 403);
  assert.equal((await fx.recording(id)).review_status, 'pending_review');

  const expert = await expertJar();
  assert.equal((await req(expert, url, {method: 'PATCH', body: {reviewStatus: 'bogus'}})).status, 400);
  assert.equal((await req(expert, '/api/v1/language-lab/recordings/999999/review', {method: 'PATCH', body: {reviewStatus: 'reviewed'}})).status, 404);
  const approved = await req(expert, url, {method: 'PATCH', body: {reviewStatus: 'reviewed'}});
  assert.equal(approved.status, 200);
  assert.equal(approved.data.recording.review_status, 'reviewed');
  const rejected = await req(await adminJar(), url, {method: 'PATCH', body: {reviewStatus: 'needs_rerecording'}});
  assert.equal(rejected.data.recording.review_status, 'needs_rerecording');
  assert.equal(await fx.auditCount('language_recording_reviewed', String(id)), 2);
});

test('31. Resetting demo data is administrator-only (kept last: it reseeds the prototype tables)', async () => {
  assert.equal((await req(new CookieJar(), '/api/v1/demo/reset', {method: 'POST', body: {}})).status, 401);
  const farmer = await farmerJar('+231776666665', 'Reset Farmer');
  assert.equal((await req(farmer, '/api/v1/demo/reset', {method: 'POST', body: {}})).status, 403);
  assert.equal((await req(await expertJar(), '/api/v1/demo/reset', {method: 'POST', body: {}})).status, 403);
  const before = await fx.count('marketplace_listings');
  assert.ok(before > 11, 'earlier tests left extra listings that an unauthorised reset must not wipe');
  assert.equal((await req(await adminJar(), '/api/v1/demo/reset', {method: 'POST', body: {}})).status, 200);
  assert.equal(await fx.count('marketplace_listings'), 11);
});
