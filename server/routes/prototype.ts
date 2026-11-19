import {Router} from 'express';
import {
  LIBERIA_COUNTIES,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_UNITS,
} from '../constants.ts';
import {getDb} from '../db.ts';
import {
  type AuthedRequest,
  hashOwnerKey,
  hashRequesterKey,
  isValidOwnerKey,
  requireRole,
  verifyOwnerKey,
  writeAuditLog,
  isSharedDemoAccount,
  writeLimit,
} from '../security.ts';
import {idempotent} from '../idempotency.ts';
import {demoPhoneProblem} from '../demoPolicy.ts';
import {maxAudioChars, maxImageChars, mediaAdmission, type MediaRefusal} from '../mediaQuota.ts';
import {seedPrototypeData} from '../seedPrototype.ts';
import {normalizeLiberianPhone} from '../../src/lib/phone.ts';

export const prototypeRouter = Router();

const AVAILABILITY_VALUES = ['Available', 'Limited Stock', 'Sold Out'] as const;

interface RawListingRow {
  id: number;
  seller_user_id: number | null;
  /** Legacy, client-chosen, previously exposed. Never read for authorisation and never returned. */
  owner_token: string;
  owner_key_hash: string;
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

type OwnerFields = Pick<RawListingRow, 'seller_user_id' | 'owner_key_hash'>;

/**
 * Who may change a listing: an administrator, its signed-in seller, or whoever presents the listing's secret key in the
 * `X-Listing-Key` header (never in the URL or body, so it does not end up in logs). Nothing a visitor can read from the API
 * is sufficient: the key is only ever hashed on the server and never returned.
 */
function canManageListing(req: AuthedRequest, row: OwnerFields): boolean {
  if (req.user?.roles.includes('admin')) return true;
  if (req.user && row.seller_user_id !== null && row.seller_user_id === req.user.id) return true;
  return verifyOwnerKey(req.get('X-Listing-Key'), row.owner_key_hash);
}

/**
 * Explicit allow-list of public fields. owner_token, owner_key_hash and seller_user_id are never included, so adding a column
 * to the table can never leak it by accident.
 */
function toPublicListing(row: RawListingRow, canSeePhoneAlways: boolean, canManage: boolean) {
  return {
    id: row.id,
    seller_name: row.seller_name,
    farm_name: row.farm_name,
    category: row.category,
    product_name: row.product_name,
    quantity: row.quantity,
    unit: row.unit,
    price_lrd: row.price_lrd,
    county: row.county,
    town: row.town,
    description: row.description,
    image_url: row.image_url,
    availability_status: row.availability_status,
    seller_phone: canSeePhoneAlways || row.phone_consent === 1 ? row.seller_phone : '',
    phone_consent: row.phone_consent,
    phone_verified: row.phone_verified,
    is_fictional_seller: row.is_fictional_seller,
    view_count: row.view_count,
    is_demo_listing: row.is_demo_listing,
    moderation_status: row.moderation_status,
    inquiry_count: row.inquiry_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    /** True only for an administrator or the signed-in seller. Anonymous owners know their own key locally. */
    can_manage: canManage,
  };
}

function publicListingFor(req: AuthedRequest, row: RawListingRow) {
  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const isSellerUser = Boolean(req.user && row.seller_user_id !== null && row.seller_user_id === req.user.id);
  return toPublicListing(row, isAdmin || isSellerUser, isAdmin || isSellerUser);
}

// 1. AGRICULTURAL MARKETPLACE (Isolated Team 8 Prototype — No payments)
prototypeRouter.get('/marketplace/listings', (req: AuthedRequest, res) => {
  const db = getDb();
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const county = typeof req.query.county === 'string' ? req.query.county.trim() : '';
  const availability = typeof req.query.availability === 'string' ? req.query.availability.trim() : '';
  const maxPriceRaw = req.query.maxPrice ? Number(req.query.maxPrice) : 0;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  // Hidden/flagged listings are for administrators only. Ownership tokens are no longer accepted as a filter or a viewer identity.
  const includeAllModeration = req.query.admin === '1' && Boolean(req.user?.roles.includes('admin'));

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

  res.json({
    listings: rows.map((row) => publicListingFor(req, row)),
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

prototypeRouter.post('/marketplace/listings', idempotent('marketplace.listing.create'), writeLimit('marketplace.listing'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {
    ownerKey,
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
  // Anonymous sellers must supply a high-entropy secret that only their device knows; signed-in sellers are identified by account.
  if (!req.user && !isValidOwnerKey(ownerKey)) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'A listing owner key (32 to 128 letters, digits, - or _) is required to publish without signing in.'},
    });
    return;
  }
  const ownerKeyHash = isValidOwnerKey(ownerKey) ? hashOwnerKey(ownerKey) : '';

  const rawPhone = typeof sellerPhone === 'string' ? sellerPhone.trim() : '';
  const demoPhone = demoPhoneProblem(rawPhone, 'The seller phone number');
  if (demoPhone) {
    res.status(422).json({error: {code: 'PHONE_NOT_ALLOWED', message: demoPhone}});
    return;
  }
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
      trimmedImg.length <= maxImageChars(req)
    ) {
      safeImage = trimmedImg;
    }
  }
  const imageGate = mediaAdmission(req, safeImage.startsWith('data:') ? safeImage.length : 0);
  if (imageGate) {
    sendMediaRefusal(res, imageGate);
    return;
  }

  const ins = db
    .prepare(
      `INSERT INTO marketplace_listings (
        seller_user_id, owner_key_hash, seller_name, farm_name, category, product_name, quantity, unit,
        price_lrd, county, town, description, image_url, availability_status, seller_phone,
        phone_consent, phone_verified, is_fictional_seller, view_count, is_demo_listing, moderation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 'approved')`
    )
    .run(
      req.user?.id ?? null,
      ownerKeyHash,
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
  res.status(201).json({listing: publicListingFor(req, listing)});
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
  if (!canManageListing(req, existing)) {
    writeAuditLog({actorUserId: req.user?.id ?? null, actorRole: req.user?.roles[0] ?? 'anonymous', action: 'listing_edit_denied', targetType: 'marketplace_listing', targetId: id, ip: req.ip});
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
    const demoPhone = demoPhoneProblem(trimmedPhone, 'The seller phone number');
    if (demoPhone) {
      res.status(422).json({error: {code: 'PHONE_NOT_ALLOWED', message: demoPhone}});
      return;
    }
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
  res.json({listing: publicListingFor(req, updated)});
});

prototypeRouter.delete('/marketplace/listings/:id', (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, seller_user_id, owner_key_hash FROM marketplace_listings WHERE id = ?').get(id) as
    | (OwnerFields & {id: number})
    | undefined;
  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Listing not found.'}});
    return;
  }
  if (!canManageListing(req, existing)) {
    writeAuditLog({actorUserId: req.user?.id ?? null, actorRole: req.user?.roles[0] ?? 'anonymous', action: 'listing_delete_denied', targetType: 'marketplace_listing', targetId: id, ip: req.ip});
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Not allowed to delete this listing.'}});
    return;
  }
  db.prepare('DELETE FROM marketplace_listings WHERE id = ?').run(id);
  res.json({ok: true});
});

// Inquiries are a retired feature (buyers now call directly). The endpoints remain but expose nothing to the public.
prototypeRouter.get('/marketplace/inquiries', (req: AuthedRequest, res) => {
  const db = getDb();
  const isAdmin = Boolean(req.user?.roles.includes('admin'));
  const listingId = req.query.listingId ? Number(req.query.listingId) : null;
  const where: string[] = [];
  const args: (string | number)[] = [];

  if (!isAdmin) {
    // Only inquiries on listings the caller can prove they manage, or ones they wrote while signed in.
    const manageable: number[] = [];
    if (listingId) {
      const row = db.prepare('SELECT id, seller_user_id, owner_key_hash FROM marketplace_listings WHERE id = ?').get(listingId) as
        | (OwnerFields & {id: number})
        | undefined;
      if (row && canManageListing(req, row)) manageable.push(row.id);
    }
    if (req.user) {
      where.push('(l.seller_user_id = ? OR i.buyer_user_id = ?)');
      args.push(req.user.id, req.user.id);
    } else if (manageable.length > 0) {
      where.push('i.listing_id = ?');
      args.push(manageable[0]);
    } else {
      res.json({inquiries: []});
      return;
    }
  }
  if (listingId) {
    where.push('i.listing_id = ?');
    args.push(listingId);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT i.*, l.product_name, l.price_lrd, l.unit, l.seller_name
       FROM marketplace_inquiries i
       JOIN marketplace_listings l ON l.id = i.listing_id
       ${whereSql}
       ORDER BY i.id DESC
       LIMIT 60`
    )
    .all(...args);
  res.json({inquiries: rows});
});

prototypeRouter.post('/marketplace/listings/:id/inquiries', writeLimit('marketplace.inquiry'), (req: AuthedRequest, res) => {
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
  const demoBuyerPhone = demoPhoneProblem(buyerPhone, 'The buyer phone number');
  if (demoBuyerPhone) {
    res.status(422).json({error: {code: 'PHONE_NOT_ALLOWED', message: demoBuyerPhone}});
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

prototypeRouter.patch('/marketplace/inquiries/:id', (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const owner = db
    .prepare('SELECT l.seller_user_id, l.owner_key_hash FROM marketplace_inquiries i JOIN marketplace_listings l ON l.id = i.listing_id WHERE i.id = ?')
    .get(id) as OwnerFields | undefined;
  if (!owner) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Inquiry not found.'}});
    return;
  }
  if (!canManageListing(req, owner)) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'Only the listing owner can answer this inquiry.'}});
    return;
  }
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

prototypeRouter.post('/language-lab/recordings', writeLimit('language.recording'), (req, res) => {
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
  if (typeof audioDataUrl === 'string' && audioDataUrl.startsWith('data:audio/') && audioDataUrl.length <= maxAudioChars(req)) {
    safeAudio = audioDataUrl;
  }
  const audioGate = mediaAdmission(req, safeAudio.length);
  if (audioGate) {
    sendMediaRefusal(res, audioGate);
    return;
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

// Only verified reviewers (expert or administrator accounts) may approve, reject or reset a submission's review status.
prototypeRouter.patch('/language-lab/recordings/:id/review', requireRole('expert', 'admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {reviewStatus} = req.body ?? {};
  if (!['reviewed', 'pending_review', 'needs_rerecording'].includes(reviewStatus)) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Invalid review status.'}});
    return;
  }
  const exists = db.prepare('SELECT id FROM local_language_recordings WHERE id = ?').get(id);
  if (!exists) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Recording not found.'}});
    return;
  }
  db.prepare('UPDATE local_language_recordings SET review_status = ? WHERE id = ?').run(reviewStatus, id);
  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: req.user!.roles.includes('admin') ? 'admin' : 'expert',
    action: 'language_recording_reviewed',
    targetType: 'local_language_recording',
    targetId: id,
    details: {reviewStatus},
    ip: req.ip,
  });
  const recording = db.prepare('SELECT * FROM local_language_recordings WHERE id = ?').get(id);
  res.json({recording});
});

// 3. DEMO & VISITOR EXPERT REQUESTS (Accessible without login wall + syncs with Simulated Expert Dashboard)
interface RawExpertRequestRow {
  id: number;
  user_id: number | null;
  requester_token: string;
  requester_key_hash: string;
  farmer_name: string;
  category: string;
  county: string;
  title: string;
  description: string;
  photo_data_url: string;
  voice_note_data_url: string;
  voice_note_summary: string;
  status: string;
  assigned_expert_name: string;
  expert_reply: string;
  is_simulated_demo: number;
  created_at: string;
  updated_at: string;
}

/** Fictional seeded samples are public demonstration content. Everything a real person submitted is private. */
const PUBLIC_SAMPLE_SQL = "requester_token LIKE 'demo-seed-req-%' AND user_id IS NULL AND requester_key_hash = ''";

/** Explicit allow-list: requester_token, requester_key_hash and user_id are never returned. */
function toPublicExpertRequest(row: RawExpertRequestRow, isMine: boolean, canReply: boolean) {
  return {
    id: row.id,
    farmer_name: row.farmer_name,
    category: row.category,
    county: row.county,
    title: row.title,
    description: row.description,
    photo_data_url: row.photo_data_url,
    voice_note_data_url: row.voice_note_data_url,
    voice_note_summary: row.voice_note_summary,
    status: row.status,
    assigned_expert_name: row.assigned_expert_name,
    expert_reply: row.expert_reply,
    is_simulated_demo: row.is_simulated_demo,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_mine: isMine,
    can_reply: canReply,
  };
}

/**
 * Who sees what: experts and administrators see the whole queue (they answer it); a signed-in farmer or a device holding the
 * requester key (header `X-Requester-Key`, never a URL) sees its own requests; everyone else sees only the fictional samples.
 */
/** Sends a media-quota refusal (see server/mediaQuota.ts). */
function sendMediaRefusal(res: import('express').Response, g: MediaRefusal): void {
  if (g.retryAfterSeconds) res.setHeader('Retry-After', String(g.retryAfterSeconds));
  res.status(g.status).json({error: {code: g.code, message: g.message}});
}

/** True for the fictional seeded sample requests (public demonstration content). */
const isSampleRow = (r: RawExpertRequestRow): boolean => r.requester_token.startsWith('demo-seed-req-') && r.user_id === null && r.requester_key_hash === '';

/**
 * Who may read and answer OTHER people's requests: administrators and approved experts whose password is private. A shared demonstration account
 * (documented password, so anyone can sign in as it; permanently flagged, so a password change does not change this) is an UNTRUSTED responder: it is treated like an ordinary visitor and may only work on the
 * fictional samples.
 */
function responderScope(req: AuthedRequest): {sharedDemoAccount: boolean; seesQueue: boolean} {
  const isResponder = Boolean(req.user?.roles.some((r) => r === 'expert' || r === 'admin'));
  const sharedDemoAccount = isResponder && isSharedDemoAccount(req.user!.id);
  return {sharedDemoAccount, seesQueue: isResponder && !sharedDemoAccount};
}

prototypeRouter.get('/expert-requests/demo', (req: AuthedRequest, res) => {
  const db = getDb();
  const {sharedDemoAccount, seesQueue} = responderScope(req);
  const key = req.get('X-Requester-Key');
  const keyHash = isValidOwnerKey(key) ? hashRequesterKey(key) : '';

  let rows: RawExpertRequestRow[];
  if (seesQueue) {
    rows = db.prepare('SELECT * FROM demo_expert_requests ORDER BY id DESC LIMIT 100').all() as unknown as RawExpertRequestRow[];
  } else {
    const clauses = [`(${PUBLIC_SAMPLE_SQL})`];
    const args: (string | number)[] = [];
    if (keyHash) {
      clauses.push('requester_key_hash = ?');
      args.push(keyHash);
    }
    if (req.user) {
      clauses.push('user_id = ?');
      args.push(req.user.id);
    }
    rows = db
      .prepare(`SELECT * FROM demo_expert_requests WHERE ${clauses.join(' OR ')} ORDER BY id DESC LIMIT 40`)
      .all(...args) as unknown as RawExpertRequestRow[];
  }
  res.json({
    requests: rows.map((r) =>
      toPublicExpertRequest(
        r,
        Boolean((keyHash && r.requester_key_hash === keyHash) || (req.user && r.user_id === req.user.id)),
        seesQueue || (sharedDemoAccount && isSampleRow(r))
      )
    ),
  });
});

prototypeRouter.post('/expert-requests/demo', idempotent('expert.request.create'), writeLimit('expert.request'), (req: AuthedRequest, res) => {
  const db = getDb();
  const {
    requesterKey,
    farmerName,
    category,
    county,
    title,
    description,
    photoDataUrl,
    voiceNoteDataUrl,
    voiceNoteSummary,
  } = req.body ?? {};

  // Without an account, the device must supply a high-entropy secret so only it can see this request again.
  if (!req.user && !isValidOwnerKey(requesterKey)) {
    res.status(400).json({
      error: {code: 'VALIDATION_ERROR', message: 'A device requester key (32 to 128 letters, digits, - or _) is required to ask without signing in.'},
    });
    return;
  }
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
    typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image/') && photoDataUrl.length <= maxImageChars(req)
      ? photoDataUrl
      : '';
  const safeVoice =
    typeof voiceNoteDataUrl === 'string' && voiceNoteDataUrl.startsWith('data:audio/') && voiceNoteDataUrl.length <= maxAudioChars(req)
      ? voiceNoteDataUrl
      : '';
  const mediaGate = mediaAdmission(req, safePhoto.length + safeVoice.length);
  if (mediaGate) {
    sendMediaRefusal(res, mediaGate);
    return;
  }

  const ins = db
    .prepare(
      `INSERT INTO demo_expert_requests (
        user_id, requester_token, requester_key_hash, farmer_name, category, county, title, description,
        photo_data_url, voice_note_data_url, voice_note_summary, status, is_simulated_demo
      ) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 1)`
    )
    .run(
      req.user?.id ?? null,
      isValidOwnerKey(requesterKey) ? hashRequesterKey(requesterKey) : '',
      cleanFarmer,
      cleanCat,
      cleanCounty,
      cleanTitle.slice(0, 160),
      cleanDesc.slice(0, 2500),
      safePhoto,
      safeVoice,
      typeof voiceNoteSummary === 'string' ? voiceNoteSummary.trim().slice(0, 400) : ''
    );

  const created = db.prepare('SELECT * FROM demo_expert_requests WHERE id = ?').get(Number(ins.lastInsertRowid)) as unknown as RawExpertRequestRow;
  res.status(201).json({request: toPublicExpertRequest(created, true, false)});
});

// Only verified expert or administrator accounts may reply. The replying expert's name comes from their account, never from the request.
prototypeRouter.patch('/expert-requests/demo/:id/reply', requireRole('expert', 'admin'), (req: AuthedRequest, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const {expertReply, status} = req.body ?? {};
  const existing = db.prepare('SELECT * FROM demo_expert_requests WHERE id = ?').get(id) as unknown as RawExpertRequestRow | undefined;
  if (!existing) {
    res.status(404).json({error: {code: 'NOT_FOUND', message: 'Request not found.'}});
    return;
  }
  // A shared demonstration account (documented password) may only answer the fictional samples, never a real visitor's request.
  if (responderScope(req).sharedDemoAccount && !isSampleRow(existing)) {
    res.status(403).json({error: {code: 'FORBIDDEN', message: 'This shared demonstration account can only answer the sample requests.'}});
    return;
  }
  if (typeof expertReply !== 'string' || expertReply.trim().length < 5) {
    res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Expert reply must be at least 5 characters.'}});
    return;
  }
  const nextStatus = ['Submitted', 'Assigned', 'Answered'].includes(status) ? status : 'Answered';
  db.prepare(
    `UPDATE demo_expert_requests
     SET expert_reply = ?,
         status = ?,
         assigned_expert_name = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(expertReply.trim().slice(0, 2500), nextStatus, req.user!.displayName.slice(0, 80), id);
  writeAuditLog({
    actorUserId: req.user!.id,
    actorRole: req.user!.roles.includes('admin') ? 'admin' : 'expert',
    action: 'expert_request_replied',
    targetType: 'demo_expert_request',
    targetId: id,
    ip: req.ip,
  });
  const updated = db.prepare('SELECT * FROM demo_expert_requests WHERE id = ?').get(id) as unknown as RawExpertRequestRow;
  res.json({request: toPublicExpertRequest(updated, false, true)});
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
// Wipes and reseeds demonstration data, so it is administrator-only.
prototypeRouter.post('/demo/reset', requireRole('admin'), (_req, res) => {
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
