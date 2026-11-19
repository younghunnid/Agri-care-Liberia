import type {DatabaseSync} from 'node:sqlite';
import {caseById} from '../src/data/triageCases.ts';
import {evaluateTriage} from '../src/lib/triageRules.ts';
import {cropBySlug} from '../src/data/harvestCrops.ts';
import {formatSellCode} from '../src/lib/harvestRules.ts';
import {findCard} from './adviceCards.ts';
import {getDb} from './db.ts';

/**
 * SYNTHETIC demonstration market data for the farm-to-market walkthrough: harvest listings from invented sellers and crop-check reports from invented
 * devices, deliberately shaped so some groups are too small to publish (to show the suppression). Everything is marked: listings carry the legacy marker
 * owner_token = 'demo-market-seed' and is_fictional_seller = 1; reports carry is_synthetic = 1. Never loaded in production (see server/runtime.ts).
 * SAFE TO REPEAT: every synthetic record has a stable key (demo_seed_key), and seeding only ADDS what is missing. Restarting the app never deletes,
 * resets or rewrites anything: inquiries, replies, status changes and view counts made while presenting survive. A full reset is a separate, explicit
 * action ({reset: true}, administrator button only) and touches only synthetic rows. Real records are never read, changed or deleted.
 */
export const SEED_MARKER = 'demo-market-seed';

const LISTINGS: {sellers: number; n: number; county: string; crop: string; kg: number; price: number; town: string; start: number}[] = [
  {sellers: 5, n: 5, county: 'Bong', crop: 'rice', kg: 400, price: 150, town: 'Gbarnga', start: 0},
  {sellers: 3, n: 3, county: 'Bong', crop: 'cassava', kg: 900, price: 60, town: 'Gbarnga', start: 5},
  {sellers: 4, n: 4, county: 'Nimba', crop: 'cassava', kg: 700, price: 65, town: 'Sanniquellie', start: 8},
  {sellers: 3, n: 3, county: 'Nimba', crop: 'pepper', kg: 120, price: 400, town: 'Ganta', start: 12},
  {sellers: 2, n: 2, county: 'Lofa', crop: 'rice', kg: 350, price: 155, town: 'Voinjama', start: 15},
  {sellers: 1, n: 1, county: 'Lofa', crop: 'pepper', kg: 80, price: 420, town: 'Voinjama', start: 17},
  {sellers: 3, n: 3, county: 'Montserrado', crop: 'plantain', kg: 500, price: 80, town: 'Paynesville', start: 18},
  {sellers: 1, n: 1, county: 'Margibi', crop: 'okra', kg: 60, price: 120, town: 'Kakata', start: 21},
];
const STATUSES = ['Available', 'Available', 'Limited Stock', 'Available'] as const;

const CHECKS: {county: string; slug: string; answers: Record<string, string>[]; devices: number}[] = [
  {county: 'Bong', slug: 'cassava-patchy-young-leaves', devices: 6, answers: [{extent: 'some', spread: 'slow', insects: 'yes'}, {extent: 'many', spread: 'fast', insects: 'yes'}, {extent: 'few', spread: 'same', insects: 'no'}]},
  {county: 'Nimba', slug: 'cassava-yellow-old-leaves', devices: 4, answers: [{extent: 'some', spread: 'slow', top: 'green'}, {extent: 'few', spread: 'same', top: 'green'}]},
  {county: 'Bong', slug: 'rice-brown-leaf-spots', devices: 3, answers: [{extent: 'some', spread: 'same', shoots: 'some'}, {extent: 'many', spread: 'slow', shoots: 'many'}]},
  {county: 'Lofa', slug: 'rice-water-too-deep', devices: 2, answers: [{extent: 'many', spread: 'fast', submerged: 'gt2'}]},
  {county: 'Montserrado', slug: 'poultry-chicks-cold-sneezing', devices: 5, answers: [{extent: 'some', spread: 'slow', eating: 'some'}, {extent: 'few', spread: 'same', eating: 'yes'}]},
  {county: 'Montserrado', slug: 'poultry-sudden-deaths', devices: 3, answers: [{extent: 'many', spread: 'fast', deaths: 'three-plus'}, {extent: 'some', spread: 'slow', deaths: 'one-two'}]},
  {county: 'Margibi', slug: 'poultry-chicks-cold-sneezing', devices: 1, answers: [{extent: 'few', spread: 'same', eating: 'yes'}]},
];

export interface SeedResult {listings: number; checks: number; added: {listings: number; checks: number}; reset: boolean}

/** Rows seeded before stable keys existed (migration 011 adds the column empty) adopt the keys in the order they were created, which is the plan order. */
function adoptUnkeyed(db: DatabaseSync, table: 'marketplace_listings' | 'triage_reports', where: string, keys: string[]): void {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE ${where} AND demo_seed_key IS NULL ORDER BY id`).all() as {id: number}[];
  const taken = new Set((db.prepare(`SELECT demo_seed_key k FROM ${table} WHERE demo_seed_key IS NOT NULL`).all() as {k: string}[]).map((r) => r.k));
  const free = keys.filter((k) => !taken.has(k));
  rows.slice(0, free.length).forEach((r, i) => db.prepare(`UPDATE ${table} SET demo_seed_key = ? WHERE id = ?`).run(free[i], r.id));
}

export function seedDemoMarketData(db: DatabaseSync = getDb(), opts: {reset?: boolean} = {}): SeedResult {
  const reset = opts.reset === true;
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (reset) {
      db.prepare("DELETE FROM marketplace_listings WHERE owner_token = ?").run(SEED_MARKER); // their inquiries go with them: this is the explicit "start over"
      db.prepare('DELETE FROM triage_reports WHERE is_synthetic = 1').run();
    }
    const listingKeys: string[] = []; LISTINGS.forEach((g, gi) => { for (let i = 0; i < g.n; i++) listingKeys.push(`HL-${String(gi).padStart(2, '0')}-${i}`); });
    adoptUnkeyed(db, 'marketplace_listings', `owner_token = '${SEED_MARKER}'`, listingKeys);
    const have = new Set((db.prepare('SELECT demo_seed_key k FROM marketplace_listings WHERE demo_seed_key IS NOT NULL').all() as {k: string}[]).map((r) => r.k));
    let seller = 0; let listings = 0; let checks = 0; let addedL = 0; let addedC = 0;
    const today = Date.now();
    const insert = db.prepare(
      `INSERT INTO marketplace_listings (owner_token, owner_key_hash, seller_name, farm_name, category, product_name, quantity, unit, price_lrd, county, town, description,
         image_url, availability_status, seller_phone, phone_consent, phone_verified, is_fictional_seller, view_count, is_demo_listing, moderation_status,
         crop_slug, quantity_kg, harvest_date, is_harvest_listing, demo_seed_key)
       VALUES (?, ?, ?, '', ?, ?, ?, 'kg', ?, ?, ?, ?, '/src/assets/images/liberia_agri_market_1794996422856.jpg', ?, '', 0, 0, 1, 0, 1, 'approved', ?, ?, ?, 1, ?)`
    );
    for (const [gi, g] of LISTINGS.entries()) {
      const crop = cropBySlug(g.crop)!;
      for (let i = 0; i < g.n; i++) {
        listings++;
        const s = g.sellers === 1 ? 0 : i % g.sellers; // sellers are reused inside a group on purpose (a group can have few distinct farmers)
        const key = `HL-${String(gi).padStart(2, '0')}-${i}`;
        if (have.has(key)) continue; // already there: leave it exactly as it is
        const sellerNo = 100 + seller + s;
        const day = new Date(today - (g.start + i) * 86_400_000).toISOString().slice(0, 10);
        const kg = g.kg + i * 25;
        const r = insert.run(SEED_MARKER, `demo-seed-seller-${sellerNo}`, `Synthetic Farmer ${sellerNo}`, crop.category, crop.label, String(kg), g.price + (i % 3) * 5, g.county, g.town, 'Synthetic demonstration listing. Not a real harvest.', STATUSES[(listings - 1) % STATUSES.length], g.crop, kg, day, key);
        const id = Number(r.lastInsertRowid);
        const created = db.prepare('SELECT created_at FROM marketplace_listings WHERE id = ?').get(id) as {created_at: string};
        db.prepare('UPDATE marketplace_listings SET listing_code = ? WHERE id = ?').run(formatSellCode(id, created.created_at), id);
        addedL++;
      }
      seller += g.sellers;
    }
    const reportKeys: string[] = []; let dn = 0;
    for (const g of CHECKS) for (let i = 0; i < g.devices; i++) { if (!evaluateTriage(g.slug, g.answers[i % g.answers.length]).ok) continue; dn++; reportKeys.push(`HC-${String(dn).padStart(2, '0')}`); }
    adoptUnkeyed(db, 'triage_reports', 'is_synthetic = 1', reportKeys);
    const haveR = new Set((db.prepare('SELECT demo_seed_key k FROM triage_reports WHERE demo_seed_key IS NOT NULL').all() as {k: string}[]).map((r) => r.k));
    const ins = db.prepare(
      `INSERT INTO triage_reports (report_ref, requester_key_hash, case_id, crop, county, answers_json, score, band, advice_code, advice_version, escalated, is_synthetic, created_at, demo_seed_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now', ?), ?)`
    );
    let device = 0;
    for (const g of CHECKS) {
      const c = caseById(g.slug)!;
      const card = findCard(c.cardSlug, db);
      if (!card) continue;
      for (let i = 0; i < g.devices; i++) {
        const answers = g.answers[i % g.answers.length];
        const ev = evaluateTriage(g.slug, answers);
        if (!ev.ok) continue;
        device++; checks++;
        const key = `HC-${String(device).padStart(2, '0')}`;
        if (haveR.has(key)) continue;
        const next = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM triage_reports').get() as {n: number}).n;
        ins.run(`TRG-${new Date().getFullYear()}-${String(next).padStart(6, '0')}`, `demo-seed-device-${device}`, g.slug, c.crop, g.county, JSON.stringify(answers), ev.score, ev.band, card.advice_code, card.current_version, `-${i} days`, key);
        addedC++;
      }
    }
    db.exec('COMMIT;');
    return {listings, checks, added: {listings: addedL, checks: addedC}, reset};
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}
