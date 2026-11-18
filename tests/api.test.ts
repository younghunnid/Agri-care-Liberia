import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test, {after, before} from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-advisory-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.AI_ANON_DAILY_LIMIT = '3';
process.env.GEMINI_API_KEY = '';
process.env.NODE_ENV = 'production';

import {createApp} from '../server.ts';
import {closeDb, getDb} from '../server/db.ts';
import {hashPassword} from '../server/security.ts';
import {normalizeLiberianPhone} from '../src/lib/phone.ts';

let server: http.Server;
let baseUrl = '';

class CookieJar {
  cookies = new Map<string, string>();

  updateFromHeaders(headers: Headers) {
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  headerValue(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  getCsrf(): string {
    return decodeURIComponent(this.cookies.get('agri_csrf') || '');
  }
}

async function req(
  jar: CookieJar,
  urlPath: string,
  opts: {method?: string; body?: unknown; skipCsrf?: boolean; headers?: Record<string, string>} = {}
) {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {...(opts.headers || {})};
  const cookieHeader = jar.headerValue();
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !opts.skipCsrf) {
    if (!jar.getCsrf()) {
      const csrfRes = await fetch(`${baseUrl}/api/v1/csrf-token`, {headers});
      jar.updateFromHeaders(csrfRes.headers);
      const updatedCookie = jar.headerValue();
      if (updatedCookie) headers['Cookie'] = updatedCookie;
    }
    headers['X-CSRF-Token'] = jar.getCsrf();
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  jar.updateFromHeaders(res.headers);
  const data = await res.json().catch(() => ({}));
  return {status: res.status, data};
}

before(async () => {
  const app = await createApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (typeof addr === 'object' && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  fs.rmSync(tmpDir, {recursive: true, force: true});
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
  // Bootstrap an admin user directly in isolated test DB
  const db = getDb();
  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'admin'").get() as {id: number};
  const ins = db
    .prepare("INSERT INTO users (display_name, phone, password_hash, status) VALUES ('Test Admin', '+231779999999', ?, 'active')")
    .run(hashPassword('AdminTestPass!123'));
  const adminId = Number(ins.lastInsertRowid);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, adminRole.id);

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
      ownerToken: 'test-owner-123',
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
      ownerToken: 'test-owner-123',
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
      ownerToken: 'private-owner-456',
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
    body: {
      ownerToken: 'test-owner-123',
      priceLrd: 1350,
      quantity: '35',
      availabilityStatus: 'Limited Stock',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.listing.price_lrd, 1350);
  assert.equal(updated.data.listing.availability_status, 'Limited Stock');

  const wrongOwnerDelete = await req(jar, `/api/v1/marketplace/listings/${listingId}?ownerToken=wrong-token`, {
    method: 'DELETE',
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

  const reviewed = await req(jar, `/api/v1/language-lab/recordings/${withConsent.data.recording.id}/review`, {
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
      requesterToken: 'demo-user-99',
      farmerName: 'Oldpa Sumo',
      category: 'Poultry farming',
      county: 'Margibi',
      title: 'Wet bedding in broiler coop',
      description: 'Heavy rain splashed onto wood shavings in one corner of our chicken house.',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.request.status, 'Submitted');

  const replied = await req(jar, `/api/v1/expert-requests/demo/${created.data.request.id}/reply`, {
    method: 'PATCH',
    body: {
      expertReply: 'Remove damp litter immediately, add dry shavings, and check roof overhang.',
      status: 'Answered',
      assignedExpertName: 'Dr. Samuel Tarr (Simulated Extension Officer)',
    },
  });
  assert.equal(replied.status, 200);
  assert.equal(replied.data.request.status, 'Answered');

  const summary = await req(jar, '/api/v1/prototype/management-summary');
  assert.equal(summary.status, 200);
  assert.equal(summary.data.actualData.publishedCropGuides, 7);
  assert.ok(summary.data.demoAndExperimentalData.marketplaceListings >= 11);
});

test('10. Demo Reset restores clean hackathon prototype dataset', async () => {
  const jar = new CookieJar();
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
      ownerToken: 'desc-test-owner',
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
      ownerToken: 'desc-test-owner',
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
    body: {
      ownerToken: 'desc-test-owner',
      priceLrd: 3700,
    },
  });
  assert.equal(partialPatch.status, 200);
  assert.equal(partialPatch.data.listing.description, 'Freshly dug today and ready for pickup.');

  // 4. PATCH with empty description removes description
  const clearDesc = await req(jar, `/api/v1/marketplace/listings/${editId}`, {
    method: 'PATCH',
    body: {
      ownerToken: 'desc-test-owner',
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
  const badCsrfRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
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
  const csrfRes = await fetch(`${baseUrl}/api/v1/csrf-token`, {
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

  const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
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
  ownerToken: token,
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
  const mine = list.data.listings.filter((l: {owner_token: string}) => l.owner_token === 'tok-sync-1');
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
    body: {requesterToken: 't3', title: 'Leaf spots', description: 'Brown spots on cassava leaves'},
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
  const db = getDb();
  const row = db.prepare('SELECT seller_phone, phone_consent FROM marketplace_listings WHERE id = ?').get(noConsent.data.listing.id) as {
    seller_phone: string;
    phone_consent: number;
  };
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
    body: {ownerToken: 'someone-else', priceLrd: 1},
  });
  assert.equal(stranger.status, 403);

  const ok = await req(jar, `/api/v1/marketplace/listings/${id}`, {
    method: 'PATCH',
    body: {ownerToken: 'owner-A', priceLrd: 8000, baseUpdatedAt: updatedAt},
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.listing.price_lrd, 8000);

  const getDbRow = getDb();
  getDbRow.prepare("UPDATE marketplace_listings SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(id);
  const conflict = await req(jar, `/api/v1/marketplace/listings/${id}`, {
    method: 'PATCH',
    body: {ownerToken: 'owner-A', priceLrd: 9000, baseUpdatedAt: updatedAt},
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error.code, 'CONFLICT');
  const row = getDbRow.prepare('SELECT price_lrd FROM marketplace_listings WHERE id = ?').get(id) as {price_lrd: number};
  assert.equal(row.price_lrd, 8000);
});

test('19. Idempotent expert question sync creates one request and keeps the photo/voice fields', async () => {
  const jar = new CookieJar();
  const key = 'op-test-question-001';
  const body = {
    requesterToken: 'tok-q-1',
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
  const count = getDb().prepare('SELECT COUNT(*) AS c FROM demo_expert_requests WHERE requester_token = ?').get('tok-q-1') as {c: number};
  assert.equal(count.c, 1);
  assert.ok(a.data.request.voice_note_data_url.startsWith('data:audio/'));
});
