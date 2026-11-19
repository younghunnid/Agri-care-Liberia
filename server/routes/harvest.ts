import {Router} from 'express';
import {LIBERIA_COUNTIES} from '../constants.ts';
import {getDb} from '../db.ts';
import {computeAggregates} from '../insights.ts';
import {seedDemoMarketData} from '../demoMarket.ts';
import {getRuntimeConfig} from '../runtime.ts';
import {
  type AuthedRequest, checkAndRecordRateLimit, clientAddress, hashIdentifier, hashRequesterKey, isValidOwnerKey, requireRole, writeAuditLog,
} from '../security.ts';
import {cropBySlug, HARVEST_STATUSES} from '../../src/data/harvestCrops.ts';
import {SELL_CODE_PATTERN} from '../../src/lib/harvestRules.ts';
import {canManageListing} from './prototype.ts';

/**
 * Phase 1B: buyer discovery of harvest listings, private conversations, aggregates for the (simulated) Ministry view, and the synthetic demo-data loader.
 * Mounted on /api/v1 behind the global CSRF check. Listing creation, editing and inquiry creation reuse the EXISTING marketplace routes.
 */
export const harvestRouter = Router();

const err = (res: import('express').Response, status: number, code: string, message: string): void => { res.status(status).json({error: {code, message}}); };

interface Row {
  id: number; listing_code: string | null; crop_slug: string; quantity_kg: number | null; price_lrd: number; county: string; town: string; harvest_date: string | null;
  availability_status: string; description: string; seller_name: string; farm_name: string; seller_phone: string; phone_consent: number;
  is_fictional_seller: number; created_at: string; updated_at: string;
}

/**
 * Explicit allow-list for what a BUYER may see. The seller's phone number appears only when the seller consented (the existing rule); owner keys, user ids and
 * moderation fields never appear.
 */
function publicHarvest(r: Row) {
  return {
    id: r.id,
    code: r.listing_code,
    cropSlug: r.crop_slug,
    cropLabel: cropBySlug(r.crop_slug)?.label ?? r.crop_slug,
    quantityKg: r.quantity_kg,
    pricePerKgLrd: r.price_lrd,
    county: r.county,
    town: r.town,
    harvestDate: r.harvest_date,
    status: r.availability_status,
    description: r.description,
    sellerName: r.seller_name,
    farmName: r.farm_name,
    sellerPhone: r.phone_consent === 1 && r.seller_phone ? r.seller_phone : '',
    phoneConsent: r.phone_consent === 1,
    synthetic: r.is_fictional_seller === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
const COLS = 'id, listing_code, crop_slug, quantity_kg, price_lrd, county, town, harvest_date, availability_status, description, seller_name, farm_name, seller_phone, phone_consent, is_fictional_seller, created_at, updated_at';

// ---------------------------------------------------------------------------------------------------------------------------------- buyer discovery
harvestRouter.get('/harvest/listings', (req, res) => {
  const q = req.query;
  const where = ["is_harvest_listing = 1", "moderation_status = 'approved'"];
  const args: (string | number)[] = [];
  const crop = typeof q.crop === 'string' ? q.crop : '';
  if (crop) { if (!cropBySlug(crop)) { err(res, 400, 'VALIDATION_ERROR', 'Unknown crop.'); return; } where.push('crop_slug = ?'); args.push(crop); }
  const county = typeof q.county === 'string' ? q.county : '';
  if (county) { if (!(LIBERIA_COUNTIES as readonly string[]).includes(county)) { err(res, 400, 'VALIDATION_ERROR', 'Unknown county.'); return; } where.push('county = ?'); args.push(county); }
  const status = typeof q.status === 'string' ? q.status : '';
  if (status) { if (!(HARVEST_STATUSES as readonly string[]).includes(status)) { err(res, 400, 'VALIDATION_ERROR', 'Unknown status.'); return; } where.push('availability_status = ?'); args.push(status); }
  else if (q.includeSoldOut !== '1') where.push("availability_status <> 'Sold Out'");
  for (const [name, col, op] of [['minKg', 'quantity_kg', '>='], ['maxPrice', 'price_lrd', '<=']] as const) {
    if (q[name] !== undefined && q[name] !== '') {
      const n = Number(q[name]);
      if (!Number.isInteger(n) || n < 0 || n > 100_000_000) { err(res, 400, 'VALIDATION_ERROR', `${name} must be a whole number.`); return; }
      where.push(`${col} ${op} ?`); args.push(n);
    }
  }
  const rows = getDb().prepare(`SELECT ${COLS} FROM marketplace_listings WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 100`).all(...args) as unknown as Row[];
  res.json({listings: rows.map(publicHarvest), generatedAt: new Date().toISOString(), count: rows.length});
});

function findByCode(code: string): Row | undefined {
  if (!SELL_CODE_PATTERN.test(code.toUpperCase())) return undefined;
  return getDb().prepare(`SELECT ${COLS} FROM marketplace_listings WHERE listing_code = ? AND is_harvest_listing = 1 AND moderation_status = 'approved'`).get(code.toUpperCase()) as unknown as Row | undefined;
}

harvestRouter.get('/harvest/listings/:code', (req, res) => {
  const r = findByCode(String(req.params.code));
  if (!r) { err(res, 404, 'NOT_FOUND', 'No harvest listing has this reference.'); return; }
  res.json({listing: publicHarvest(r), generatedAt: new Date().toISOString()});
});

/** "Check this reference": one identical 404 for every unknown, malformed, hidden or non-harvest reference. */
harvestRouter.get('/harvest/verify/:code', (req, res) => {
  const rl = checkAndRecordRateLimit(hashIdentifier(`harvest-verify:${clientAddress(req)}`), 'harvest_verify', 60, 10, true);
  if (!rl.allowed) { res.setHeader('Retry-After', String(rl.retryAfterSeconds ?? 600)); err(res, 429, 'RATE_LIMITED', 'Too many checks. Please wait a little.'); return; }
  const r = findByCode(String(req.params.code));
  if (!r) { err(res, 404, 'NOT_FOUND', 'No harvest listing has this reference.'); return; }
  const p = publicHarvest(r);
  res.json({found: true, code: p.code, cropLabel: p.cropLabel, quantityKg: p.quantityKg, county: p.county, status: p.status, synthetic: p.synthetic, note: 'This reference is a lookup number. It does not prove origin or quality.'});
});

// ---------------------------------------------------------------------------------------------------------------------------------- private conversations
interface InqRow {
  id: number; listing_id: number; listing_code: string | null; crop_slug: string; seller_user_id: number | null; owner_key_hash: string;
  buyer_user_id: number | null; buyer_key_hash: string; buyer_name: string; buyer_phone: string; buyer_phone_consent: number; buyer_county: string;
  message: string; status: string; farmer_reply: string; created_at: string; updated_at: string;
}

/**
 * A caller sees ONLY conversations they are part of, and each side sees only what it should:
 *  - the SELLER (the signed-in owner, or the device holding the listing's private key via X-Listing-Key for ?listingId=): the buyer's name, county, message,
 *    and the buyer's phone number ONLY if the buyer consented to share it;
 *  - the BUYER (the signed-in account, or the device holding the requester key in X-Requester-Key): their own inquiries and the seller's replies.
 * Anyone else gets an empty list. Raw rows are never returned: no buyer token, user ids or key hashes.
 */
harvestRouter.get('/harvest/inquiries', (req: AuthedRequest, res) => {
  const db = getDb();
  const out = new Map<number, ReturnType<typeof shape>>();
  const shape = (r: InqRow, role: 'seller' | 'buyer') => ({
    id: r.id, role, listingId: r.listing_id, listingCode: r.listing_code, cropLabel: cropBySlug(r.crop_slug)?.label ?? 'Listing',
    buyerName: r.buyer_name, buyerCounty: r.buyer_county,
    buyerPhone: role === 'buyer' || r.buyer_phone_consent === 1 ? r.buyer_phone : '',
    message: r.message, status: r.status, farmerReply: r.farmer_reply, createdAt: r.created_at, updatedAt: r.updated_at,
  });
  const base = `SELECT i.id, i.listing_id, l.listing_code, l.crop_slug, l.seller_user_id, l.owner_key_hash, i.buyer_user_id, i.buyer_key_hash, i.buyer_name, i.buyer_phone,
                       i.buyer_phone_consent, i.buyer_county, i.message, i.status, i.farmer_reply, i.created_at, i.updated_at
                FROM marketplace_inquiries i JOIN marketplace_listings l ON l.id = i.listing_id`;
  if (req.user) {
    for (const r of db.prepare(`${base} WHERE l.seller_user_id = ? ORDER BY i.id DESC LIMIT 60`).all(req.user.id) as unknown as InqRow[]) out.set(r.id, shape(r, 'seller'));
    for (const r of db.prepare(`${base} WHERE i.buyer_user_id = ? ORDER BY i.id DESC LIMIT 60`).all(req.user.id) as unknown as InqRow[]) if (!out.has(r.id)) out.set(r.id, shape(r, 'buyer'));
  }
  const listingId = Number(req.query.listingId);
  if (Number.isInteger(listingId) && listingId > 0) {
    const l = db.prepare('SELECT id, seller_user_id, owner_key_hash FROM marketplace_listings WHERE id = ?').get(listingId) as {id: number; seller_user_id: number | null; owner_key_hash: string} | undefined;
    if (l && canManageListing(req, l)) for (const r of db.prepare(`${base} WHERE i.listing_id = ? ORDER BY i.id DESC LIMIT 60`).all(listingId) as unknown as InqRow[]) out.set(r.id, shape(r, 'seller'));
  }
  const key = req.get('X-Requester-Key');
  if (isValidOwnerKey(key)) {
    for (const r of db.prepare(`${base} WHERE i.buyer_key_hash = ? ORDER BY i.id DESC LIMIT 60`).all(hashRequesterKey(key)) as unknown as InqRow[]) if (!out.has(r.id)) out.set(r.id, shape(r, 'buyer'));
  }
  res.json({inquiries: [...out.values()].sort((a, b) => b.id - a.id)});
});

// ---------------------------------------------------------------------------------------------------------------------------------- aggregates (simulated Ministry view)
harvestRouter.get('/insights/aggregates', (req, res) => {
  const rl = checkAndRecordRateLimit(hashIdentifier(`insights:${clientAddress(req)}`), 'insights_read', 120, 1, true);
  if (!rl.allowed) { res.setHeader('Retry-After', String(rl.retryAfterSeconds ?? 60)); err(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait a little.'); return; }
  res.json(computeAggregates());
});

// ---------------------------------------------------------------------------------------------------------------------------------- synthetic demo data
harvestRouter.post('/admin/demo/market-data', requireRole('admin'), (req: AuthedRequest, res) => {
  if (getRuntimeConfig().production) { err(res, 403, 'NOT_AVAILABLE', 'Synthetic demonstration data is never loaded in production.'); return; }
  const r = seedDemoMarketData();
  writeAuditLog({actorUserId: req.user!.id, actorRole: 'admin', action: 'demo_market_data_loaded', targetType: 'demo', details: r, ip: req.ip});
  res.json({ok: true, ...r, note: 'Synthetic harvest listings and crop-check reports were (re)loaded. They are marked as synthetic.'});
});
