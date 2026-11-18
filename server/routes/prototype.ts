import {Router} from 'express';
import {
  LIBERIA_COUNTIES,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_UNITS,
} from '../constants.ts';
import {getDb} from '../db.ts';
import {type AuthedRequest, requireRole, writeAuditLog} from '../security.ts';
import {idempotent} from '../idempotency.ts';
import {seedPrototypeData} from '../seedPrototype.ts';
import {normalizeLiberianPhone} from '../../src/lib/phone.ts';

export const prototypeRouter = Router();

const AVAILABILITY_VALUES = ['Available', 'Limited Stock', 'Sold Out'] as const;

interface RawListingRow {
  id: number;
  seller_user_id: number | null;
  owner_token: string;
  seller_name: string;
  farm_name: string;
  category: string;
  product_name: string;
  quantity: string;
  unit: string;
  price_lrd: number;
  county: string;
  town: string;
  description: string;
  image_url: string;
  availability_status: string;
  seller_phone: string;
  phone_consent: number;
  phone_verified: number;
  is_fictional_seller: number;
  view_count: number;
  is_demo_listing: number;
  moderation_status: string;
  inquiry_count?: number;
  created_at: string;
  updated_at: string;
}

function sanitizeListingForPublic(row: RawListingRow, requesterOwnerToken: string, isAdmin: boolean) {
  const isOwner = Boolean(requesterOwnerToken && row.owner_token === requesterOwnerToken);
  const canExposePhone = Boolean(isOwner || isAdmin || row.phone_consent === 1);
  return {
    ...row,
    seller_phone: canExposePhone ? row.seller_phone : '',
  };
}

// 1. AGRICULTURAL MARKETPLACE (Isolated Team 8 Prototype — No payments)
prototypeRouter.get('/marketplace/listings', (req: AuthedRequest, res) => {
  const db = getDb();
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const county = typeof req.query.county === 'string' ? req.query.county.trim() : '';
  const availability = typeof req.query.availability === 'string' ? req.query.availability.trim() : '';
  const maxPriceRaw = req.query.maxPrice ? Number(req.query.maxPrice) : 0;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const ownerToken = typeof req.query.ownerToken === 'string' ? req.query.ownerToken.trim() : '';
  const viewerToken = typeof req.query.viewerToken === 'string' ? req.query.viewerToken.trim() : ownerToken;
  const includeAllModeration = req.query.admin === '1';

  const where: string[] = [];
  const args: (string | number)[] = [];

  if (!includeAllModeration) {
    where.push("moderation_status = 'approved'");
  }
  if (category) {
    where.push('category = ?');
    args.push(category);
  }
  if (county) {
    where.push('county = ?');
    args.push(county);
  }
  if (availability && AVAILABILITY_VALUES.includes(availability as (typeof AVAILABILITY_VALUES)[number])) {
    where.push('availability_status = ?');
    args.push(availability);
  }
  if (Number.isFinite(maxPriceRaw) && maxPriceRaw > 0) {
    where.push('price_lrd <= ?');
    args.push(Math.round(maxPriceRaw));
  }
  if (q) {
    where.push('(product_name LIKE ? OR description LIKE ? OR town LIKE ? OR seller_name LIKE ? OR farm_name LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  if (ownerToken) {
    where.push('owner_token = ?');
    args.push(ownerToken);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT l.*,
              (SELECT COUNT(*) FROM marketplace_inquiries i WHERE i.listing_id = l.id) AS inquiry_count
       FROM marketplace_listings l
       ${whereSql}
       ORDER BY l.id DESC`
    )
    .all(...args) as unknown as RawListingRow[];

  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const sanitized = rows.map((row) => sanitizeListingForPublic(row, viewerToken, isAdmin));

  res.json({
    listings: sanitized,
    categories: MARKETPLACE_CATEGORIES,
    units: MARKETPLACE_UNITS,
    counties: LIBERIA_COUNTIES,
    availabilityOptions: AVAILABILITY_VALUES,
  });
});

prototypeRouter.post('/marketplace/listings/:id/view', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM marketplace_listings WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Listing not found.'}});
    return;
  }
  db.prepare('UPDATE marketplace_listings SET view_count = view_count + 1 WHERE id = ?').run(id);
  const updated = db.prepare('SELECT view_count FROM marketplace_listings WHERE id = ?').get(id) as {view_count: number};
  res.json({view_count: updated.view_count});
});

prototypeRouter.post('/marketplace/listings', idempotent('marketplace.listing.create'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {
    ownerToken,
    sellerName,
    farmName,
    category,
    productName,
    quantity,
    unit,
    priceLrd,
    county,
    town,
    description,
    imageUrl,
    availabilityStatus,
    sellerPhone,
    phoneConsent,
  } = req.body ?? {};

  const cleanProduct = typeof productName === 'string' ? productName.trim() : '';
  const cleanQty = typeof quantity === 'string' || typeof quantity === 'number' ? String(quantity).trim() : '';
  const cleanUnit = typeof unit === 'string' ? unit.trim() : 'kg';
  const cleanPrice = Number(priceLrd);
  const cleanCounty = typeof county === 'string' ? county.trim() : '';
  const cleanTown = typeof town === 'string' ? town.trim() : '';
  const cleanDesc = typeof description === 'string' ? description.trim() : '';
  const cleanFarm = typeof farmName === 'string' ? farmName.trim().slice(0, 80) : '';
  const cleanAvail = AVAILABILITY_VALUES.includes(availabilityStatus) ? availabilityStatus : 'Available';
  const cleanSeller =
    typeof sellerName === 'string' && sellerName.trim().length >= 2
      ? sellerName.trim().slice(0, 80)
      : req.user?.displayName || 'Liberia Farmer (Demo)';
  const cleanOwnerToken = typeof ownerToken === 'string' ? ownerToken.trim().slice(0, 80) : '';

  const rawPhone = typeof sellerPhone === 'string' ? sellerPhone.trim() : '';
  let normalizedPhone = '';
  if (rawPhone) {
    const check = normalizeLiberianPhone(rawPhone);
    if (!check.valid) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: check.error || 'Invalid Liberian phone number.'}});
      return;
    }
    normalizedPhone = check.normalized;
  }
  const consentFlag = phoneConsent === true || phoneConsent === 1 ? 1 : 0;
  // Offline-synced writes (Idempotency-Key present) never store a phone number without consent.
  if (req.get('Idempotency-Key') && consentFlag !== 1) normalizedPhone = '';

  if (cleanProduct.length < 2 || cleanProduct.length > 100) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Product name must be 2 to 100 characters.'}});
    return;
  }
  if (!MARKETPLACE_CATEGORIES.includes(category)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Select a valid marketplace category.'}});
    return;
  }
  if (!cleanQty) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Quantity is required.'}});
    return;
  }
  if (!Number.isFinite(cleanPrice) || cleanPrice <= 0 || cleanPrice > 50000000) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Enter a valid price in Liberian dollars (LRD).'}});
    return;
  }
  if (!LIBERIA_COUNTIES.includes(cleanCounty as (typeof LIBERIA_COUNTIES)[number])) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Select a valid Liberian county.'}});
    return;
  }
  if (cleanTown.length < 2) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'Enter a town or community name.'},
    });
    return;
  }

  let safeImage = '/src/assets/images/liberia_agri_market_1794996422856.jpg';
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    const trimmedImg = imageUrl.trim();
    if (
      (trimmedImg.startsWith('/src/assets/images/') || trimmedImg.startsWith('data:image/')) &&
      trimmedImg.length <= 2_500_000
    ) {
      safeImage = trimmedImg;
    }
  }

  const ins = db
    .prepare(
      `INSERT INTO marketplace_listings (
        seller_user_id, owner_token, seller_name, farm_name, category, product_name, quantity, unit,
        price_lrd, county, town, description, image_url, availability_status, seller_phone,
        phone_consent, phone_verified, is_fictional_seller, view_count, is_demo_listing, moderation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 'approved')`
    )
    .run(
      req.user?.id ?? null,
      cleanOwnerToken,
      cleanSeller,
      cleanFarm,
      category,
      cleanProduct,
      cleanQty.slice(0, 40),
      cleanUnit.slice(0, 40),
      Math.round(cleanPrice),
      cleanCounty,
      cleanTown.slice(0, 80),
      cleanDesc.slice(0, 1200),
      safeImage,
      cleanAvail,
      normalizedPhone,
      consentFlag
    );

  const listingId = Number(ins.lastInsertRowid);
  const listing = db.prepare('SELECT * FROM marketplace_listings WHERE id = ?').get(listingId) as unknown as RawListingRow;
  res.status(201).json({
    listing: sanitizeListingForPublic(listing, cleanOwnerToken, Boolean(req.user?.roles.includes('admin'))),
  });
});

prototypeRouter.patch('/marketplace/listings/:id', (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM marketplace_listings WHERE id = ?').get(id) as unknown as RawListingRow | undefined;

  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Listing not found.'}});
    return;
  }

  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const tokenMatch =
    typeof req.body?.ownerToken === 'string' &&
    req.body.ownerToken.trim() !== '' &&
    req.body.ownerToken.trim() === existing.owner_token;
  const userMatch = req.user && existing.seller_user_id === req.user.id;

  if (!isAdmin && !tokenMatch && !userMatch) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'You can only edit your own listings.'}});
    return;
  }

  // Optimistic concurrency for offline edits: if the client says which version it started from
  // and the listing has changed since, refuse instead of silently overwriting.
  const baseUpdatedAt = typeof req.body?.baseUpdatedAt === 'string' ? req.body.baseUpdatedAt : '';
  if (baseUpdatedAt && baseUpdatedAt !== existing.updated_at) {
    res.status(409).json({
      error: {code: 'CONFLICT', message: 'This listing was changed online after you edited it on your phone.'},
    });
    return;
  }

  const {
    sellerName,
    farmName,
    category,
    productName,
    quantity,
    unit,
    priceLrd,
    county,
    town,
    description,
    availabilityStatus,
    sellerPhone,
    phoneConsent,
    moderationStatus,
  } = req.body ?? {};

  let nextPhone: string | null = null;
  if (sellerPhone !== undefined) {
    const trimmedPhone = typeof sellerPhone === 'string' ? sellerPhone.trim() : '';
    if (!trimmedPhone) {
      nextPhone = '';
    } else {
      const check = normalizeLiberianPhone(trimmedPhone);
      if (!check.valid) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: check.error || 'Invalid Liberian phone number.'}});
        return;
      }
      nextPhone = check.normalized;
    }
  }

  const nextConsent =
    phoneConsent !== undefined ? (phoneConsent === true || phoneConsent === 1 ? 1 : 0) : null;
  if (req.get('Idempotency-Key') && nextConsent !== 1 && nextPhone) nextPhone = '';

  const nextMod =
    isAdmin && ['approved', 'flagged', 'hidden'].includes(moderationStatus) ? moderationStatus : undefined;

  db.prepare(
    `UPDATE marketplace_listings
     SET seller_name = COALESCE(?, seller_name),
         farm_name = COALESCE(?, farm_name),
         category = COALESCE(?, category),
         product_name = COALESCE(?, product_name),
         quantity = COALESCE(?, quantity),
         unit = COALESCE(?, unit),
         price_lrd = COALESCE(?, price_lrd),
         county = COALESCE(?, county),
         town = COALESCE(?, town),
         description = COALESCE(?, description),
         availability_status = COALESCE(?, availability_status),
         seller_phone = COALESCE(?, seller_phone),
         phone_consent = COALESCE(?, phone_consent),
         phone_verified = CASE WHEN ? IS NOT NULL THEN 0 ELSE phone_verified END,
         is_fictional_seller = CASE WHEN ? IS NOT NULL AND ? != '' THEN 0 ELSE is_fictional_seller END,
         moderation_status = COALESCE(?, moderation_status),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    typeof sellerName === 'string' && sellerName.trim().length >= 2 ? sellerName.trim().slice(0, 80) : null,
    typeof farmName === 'string' ? farmName.trim().slice(0, 80) : null,
    typeof category === 'string' && MARKETPLACE_CATEGORIES.includes(category as (typeof MARKETPLACE_CATEGORIES)[number])
      ? category
      : null,
    typeof productName === 'string' && productName.trim().length >= 2 ? productName.trim().slice(0, 100) : null,
    quantity !== undefined && String(quantity).trim() ? String(quantity).trim().slice(0, 40) : null,
    typeof unit === 'string' && unit.trim() ? unit.trim().slice(0, 40) : null,
    Number.isFinite(Number(priceLrd)) && Number(priceLrd) > 0 ? Math.round(Number(priceLrd)) : null,
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number]) ? county : null,
    typeof town === 'string' && town.trim().length >= 2 ? town.trim().slice(0, 80) : null,
    description !== undefined ? (typeof description === 'string' ? description.trim().slice(0, 1200) : '') : null,
    AVAILABILITY_VALUES.includes(availabilityStatus) ? availabilityStatus : null,
    nextPhone,
    nextConsent,
    nextPhone,
    nextPhone,
    nextPhone,
    nextMod ?? null,
    id
  );

  const updated = db.prepare('SELECT * FROM marketplace_listings WHERE id = ?').get(id) as unknown as RawListingRow;
  res.json({listing: sanitizeListingForPublic(updated, typeof req.body?.ownerToken === 'string' ? req.body.ownerToken.trim() : '', isAdmin)});
});

prototypeRouter.delete('/marketplace/listings/:id', (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, seller_user_id, owner_token FROM marketplace_listings WHERE id = ?').get(id) as
    | {id: number; seller_user_id: number | null; owner_token: string}
    | undefined;
  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Listing not found.'}});
    return;
  }
  const ownerToken = typeof req.query.ownerToken === 'string' ? req.query.ownerToken.trim() : '';
  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  if (!isAdmin && existing.seller_user_id !== req.user?.id && existing.owner_token !== ownerToken) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Not allowed to delete this listing.'}});
    return;
  }
  db.prepare('DELETE FROM marketplace_listings WHERE id = ?').run(id);
  res.json({ok: true});
});

prototypeRouter.get('/marketplace/inquiries', (req: AuthedRequest, res) => {
  const db = getDb();
  const listingId = req.query.listingId ? Number(req.query.listingId) : null;
  const buyerToken = typeof req.query.buyerToken === 'string' ? req.query.buyerToken.trim() : '';
  const ownerToken = typeof req.query.ownerToken === 'string' ? req.query.ownerToken.trim() : '';

  const where: string[] = [];
  const args: (string | number)[] = [];

  if (listingId) {
    where.push('i.listing_id = ?');
    args.push(listingId);
  }
  if (buyerToken && ownerToken) {
    where.push('(i.buyer_token = ? OR l.owner_token = ?)');
    args.push(buyerToken, ownerToken);
  } else if (buyerToken) {
    where.push('i.buyer_token = ?');
    args.push(buyerToken);
  } else if (ownerToken) {
    where.push('l.owner_token = ?');
    args.push(ownerToken);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT i.*, l.product_name, l.price_lrd, l.unit, l.seller_name, l.owner_token AS listing_owner_token
       FROM marketplace_inquiries i
       JOIN marketplace_listings l ON l.id = i.listing_id
       ${whereSql}
       ORDER BY i.id DESC
       LIMIT 60`
    )
    .all(...args);

  res.json({inquiries: rows});
});

prototypeRouter.post('/marketplace/listings/:id/inquiries', (req: AuthedRequest, res) => {
  const db = getDb();
  const listingId = Number(req.params.id);
  const listing = db.prepare('SELECT id FROM marketplace_listings WHERE id = ?').get(listingId);
  if (!listing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Marketplace listing not found.'}});
    return;
  }

  const {buyerName, buyerPhone, buyerCounty, message, buyerToken, isSimulated} = req.body ?? {};
  const cleanName = typeof buyerName === 'string' ? buyerName.trim() : '';
  const cleanCounty = typeof buyerCounty === 'string' ? buyerCounty.trim() : 'Montserrado';
  const cleanMsg = typeof message === 'string' ? message.trim() : '';

  if (cleanName.length < 2 || cleanMsg.length < 5) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Buyer name and inquiry message required.'}});
    return;
  }

  const ins = db
    .prepare(
      `INSERT INTO marketplace_inquiries (
        listing_id, buyer_user_id, buyer_token, buyer_name, buyer_phone, buyer_county,
        message, status, is_demo_inquiry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?)`
    )
    .run(
      listingId,
      req.user?.id ?? null,
      typeof buyerToken === 'string' ? buyerToken.trim().slice(0, 80) : '',
      cleanName.slice(0, 80),
      typeof buyerPhone === 'string' ? buyerPhone.trim().slice(0, 30) : '',
      LIBERIA_COUNTIES.includes(cleanCounty as (typeof LIBERIA_COUNTIES)[number]) ? cleanCounty : 'Montserrado',
      cleanMsg.slice(0, 1000),
      isSimulated === false ? 0 : 1
    );

  const inquiry = db
    .prepare(
      `SELECT i.*, l.product_name, l.price_lrd, l.unit, l.seller_name
       FROM marketplace_inquiries i
       JOIN marketplace_listings l ON l.id = i.listing_id
       WHERE i.id = ?`
    )
    .get(Number(ins.lastInsertRowid));

  res.status(201).json({inquiry});
});

prototypeRouter.patch('/marketplace/inquiries/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {status, farmerReply} = req.body ?? {};
  const nextStatus = ['New', 'Farmer Replied', 'Closed'].includes(status) ? status : 'Farmer Replied';

  db.prepare(
    `UPDATE marketplace_inquiries
     SET status = ?,
         farmer_reply = COALESCE(?, farmer_reply),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextStatus,
    typeof farmerReply === 'string' && farmerReply.trim() ? farmerReply.trim().slice(0, 1000) : null,
    id
  );

  const updated = db.prepare('SELECT * FROM marketplace_inquiries WHERE id = ?').get(id);
  res.json({inquiry: updated});
});

// 2. LOCAL LANGUAGE AI LAB (Bassa, Mano, English, Kpelle)
prototypeRouter.get('/language-lab/recordings', (req, res) => {
  const db = getDb();
  const lang = typeof req.query.lang === 'string' ? req.query.lang.trim() : '';
  const topic = typeof req.query.topic === 'string' ? req.query.topic.trim() : '';

  const where: string[] = [];
  const args: string[] = [];
  if (lang) {
    where.push('language_code = ?');
    args.push(lang);
  }
  if (topic) {
    where.push('topic_slug = ?');
    args.push(topic);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const recordings = db
    .prepare(`SELECT * FROM local_language_recordings ${whereSql} ORDER BY id DESC`)
    .all(...args);

  res.json({recordings});
});

prototypeRouter.post('/language-lab/recordings', (req, res) => {
  const db = getDb();
  const {
    languageCode,
    topicSlug,
    topicLabel,
    questionText,
    answerText,
    localPhraseGloss,
    audioDataUrl,
    speakerName,
    consentConfirmed,
  } = req.body ?? {};

  if (!['en', 'bas', 'man', 'kpe', 'lre'].includes(languageCode)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Select a valid language code.'}});
    return;
  }
  if (!consentConfirmed) {
    res.status(400).json({
      error: {
        code: 'CONSENT_REQUIRED',
        message: 'Speaker consent must be confirmed before uploading or saving any voice recording.',
      },
    });
    return;
  }
  const cleanSpeaker = typeof speakerName === 'string' ? speakerName.trim() : '';
  const cleanQuestion = typeof questionText === 'string' ? questionText.trim() : '';
  const cleanAnswer = typeof answerText === 'string' ? answerText.trim() : '';
  if (cleanSpeaker.length < 2 || cleanQuestion.length < 4 || cleanAnswer.length < 5) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'Speaker name, question summary, and advice text are required.'},
    });
    return;
  }

  let safeAudio = '';
  if (typeof audioDataUrl === 'string' && audioDataUrl.startsWith('data:audio/') && audioDataUrl.length <= 2_500_000) {
    safeAudio = audioDataUrl;
  }

  const ins = db
    .prepare(
      `INSERT INTO local_language_recordings (
        language_code, topic_slug, topic_label, question_text, answer_text,
        local_phrase_gloss, audio_data_url, speaker_name, consent_confirmed, review_status, is_sample_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending_review', 0)`
    )
    .run(
      languageCode,
      typeof topicSlug === 'string' && topicSlug.trim() ? topicSlug.trim().slice(0, 60) : 'general',
      typeof topicLabel === 'string' && topicLabel.trim() ? topicLabel.trim().slice(0, 80) : 'General Farming',
      cleanQuestion.slice(0, 400),
      cleanAnswer.slice(0, 1200),
      typeof localPhraseGloss === 'string' ? localPhraseGloss.trim().slice(0, 400) : '',
      safeAudio,
      cleanSpeaker.slice(0, 80)
    );

  const recording = db
    .prepare('SELECT * FROM local_language_recordings WHERE id = ?')
    .get(Number(ins.lastInsertRowid));
  res.status(201).json({recording});
});

prototypeRouter.patch('/language-lab/recordings/:id/review', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {reviewStatus} = req.body ?? {};
  if (!['reviewed', 'pending_review', 'needs_rerecording'].includes(reviewStatus)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid review status.'}});
    return;
  }
  db.prepare('UPDATE local_language_recordings SET review_status = ? WHERE id = ?').run(reviewStatus, id);
  const recording = db.prepare('SELECT * FROM local_language_recordings WHERE id = ?').get(id);
  res.json({recording});
});

// 3. DEMO & VISITOR EXPERT REQUESTS (Accessible without login wall + syncs with Simulated Expert Dashboard)
prototypeRouter.get('/expert-requests/demo', (req, res) => {
  const db = getDb();
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const rows = token
    ? db
        .prepare('SELECT * FROM demo_expert_requests WHERE requester_token = ? OR is_simulated_demo = 1 ORDER BY id DESC LIMIT 40')
        .all(token)
    : db.prepare('SELECT * FROM demo_expert_requests ORDER BY id DESC LIMIT 40').all();
  res.json({requests: rows});
});

prototypeRouter.post('/expert-requests/demo', idempotent('expert.request.create'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {
    requesterToken,
    farmerName,
    category,
    county,
    title,
    description,
    photoDataUrl,
    voiceNoteDataUrl,
    voiceNoteSummary,
  } = req.body ?? {};

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDesc = typeof description === 'string' ? description.trim() : '';
  const cleanCat = typeof category === 'string' && category.trim() ? category.trim().slice(0, 80) : 'General Farming';
  const cleanCounty =
    typeof county === 'string' && LIBERIA_COUNTIES.includes(county as (typeof LIBERIA_COUNTIES)[number])
      ? county
      : req.user?.county || 'Montserrado';
  const cleanFarmer =
    typeof farmerName === 'string' && farmerName.trim().length >= 2
      ? farmerName.trim().slice(0, 80)
      : req.user?.displayName || 'Demo Farmer';

  if (cleanTitle.length < 4 || cleanDesc.length < 10) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'Enter a problem title (4+ chars) and description (10+ chars).'},
    });
    return;
  }

  const safePhoto =
    typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image/') && photoDataUrl.length <= 2_500_000
      ? photoDataUrl
      : '';
  const safeVoice =
    typeof voiceNoteDataUrl === 'string' && voiceNoteDataUrl.startsWith('data:audio/') && voiceNoteDataUrl.length <= 2_500_000
      ? voiceNoteDataUrl
      : '';

  const ins = db
    .prepare(
      `INSERT INTO demo_expert_requests (
        user_id, requester_token, farmer_name, category, county, title, description,
        photo_data_url, voice_note_data_url, voice_note_summary, status, is_simulated_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 1)`
    )
    .run(
      req.user?.id ?? null,
      typeof requesterToken === 'string' ? requesterToken.trim().slice(0, 80) : '',
      cleanFarmer,
      cleanCat,
      cleanCounty,
      cleanTitle.slice(0, 160),
      cleanDesc.slice(0, 2500),
      safePhoto,
      safeVoice,
      typeof voiceNoteSummary === 'string' ? voiceNoteSummary.trim().slice(0, 400) : ''
    );

  const created = db.prepare('SELECT * FROM demo_expert_requests WHERE id = ?').get(Number(ins.lastInsertRowid));
  res.status(201).json({request: created});
});

prototypeRouter.patch('/expert-requests/demo/:id/reply', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {expertReply, status, assignedExpertName} = req.body ?? {};
  if (typeof expertReply !== 'string' || expertReply.trim().length < 5) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Expert reply must be at least 5 characters.'}});
    return;
  }
  const nextStatus = ['Submitted', 'Assigned', 'Answered'].includes(status) ? status : 'Answered';
  db.prepare(
    `UPDATE demo_expert_requests
     SET expert_reply = ?,
         status = ?,
         assigned_expert_name = COALESCE(?, assigned_expert_name),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    expertReply.trim().slice(0, 2500),
    nextStatus,
    typeof assignedExpertName === 'string' && assignedExpertName.trim() ? assignedExpertName.trim().slice(0, 80) : null,
    id
  );
  const updated = db.prepare('SELECT * FROM demo_expert_requests WHERE id = ?').get(id);
  res.json({request: updated});
});

// 4. PROTOTYPE MANAGEMENT & ANALYTICS (Clearly separates actual DB counts vs simulated demo counts)
prototypeRouter.get('/prototype/management-summary', (_req, res) => {
  const db = getDb();
  const actualFarmers = (db.prepare("SELECT COUNT(*) as c FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'farmer'").get() as {c: number}).c;
  const actualQuestions = (db.prepare('SELECT COUNT(*) as c FROM advisory_questions').get() as {c: number}).c;
  const publishedGuides = (db.prepare("SELECT COUNT(*) as c FROM agricultural_guides WHERE is_published = 1 AND review_status = 'approved'").get() as {c: number}).c;
  const demoMarketplace = (db.prepare('SELECT COUNT(*) as c FROM marketplace_listings').get() as {c: number}).c;
  const demoInquiries = (db.prepare('SELECT COUNT(*) as c FROM marketplace_inquiries').get() as {c: number}).c;
  const demoRecordings = (db.prepare('SELECT COUNT(*) as c FROM local_language_recordings').get() as {c: number}).c;
  const demoExpertRequests = (db.prepare('SELECT COUNT(*) as c FROM demo_expert_requests').get() as {c: number}).c;

  res.json({
    actualData: {
      registeredFarmers: actualFarmers,
      formalAdvisoryQuestions: actualQuestions,
      publishedCropGuides: publishedGuides,
    },
    demoAndExperimentalData: {
      marketplaceListings: demoMarketplace,
      marketplaceInquiries: demoInquiries,
      localLanguageRecordings: demoRecordings,
      simulatedExpertRequests: demoExpertRequests,
    },
  });
});

// 5. ADMIN AUDIT LOGS CHECK FOR PROTECTED ROUTE COMPATIBILITY
prototypeRouter.post('/demo/reset', (_req, res) => {
  seedPrototypeData(true);
  res.json({ok: true, message: 'Demo marketplace, recordings, and simulated expert queue reset to clean hackathon defaults.'});
});

// Keep admin-protected alias for moderation audits if signed in
prototypeRouter.post('/admin/marketplace/:id/moderate', requireRole('admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {moderationStatus} = req.body ?? {};
  if (!['approved', 'flagged', 'hidden'].includes(moderationStatus)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid moderation status.'}});
    return;
  }
  db.prepare('UPDATE marketplace_listings SET moderation_status = ? WHERE id = ?').run(moderationStatus, id);
  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: 'admin',
    action: 'marketplace_moderated',
    targetType: 'marketplace_listing',
    targetId: id,
    details: {moderationStatus},
    ip: req.ip,
  });
  res.json({ok: true});
});
