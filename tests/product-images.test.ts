import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {PRODUCT_IMAGES, isSellerPhoto, listingPicture, productImageKey, type ProductImageKey} from '../src/data/productImages.ts';

const root = process.cwd();
// Names and categories exactly as they appear in the live marketplace (read-only API, 2026-11-21)
const LIVE: [string, string, ProductImageKey][] = [
  ['Rice', 'Rice and grains', 'rice'], ['Cassava', 'Cassava and root crops', 'cassava'], ['Pepper', 'Vegetables', 'pepper'], ['Okra', 'Vegetables', 'okra'], ['Plantain', 'Fruits and plantains', 'plantain'],
  ['Knapsack Sprayer, Cu', 'Agricultural supplies', 'supplies'], ['Cured Organic Compost', 'Agricultural supplies', 'fertilizer'], ['Clean Cassava Cuttings', 'Seeds and seedlings', 'seeds'],
  ['Green & Turning Cooking Plantains', 'Fruits and plantains', 'plantain'], ['Healthy West African Dwarf Goats', 'Livestock', 'livestock'], ['Fresh Pond-Raised Tilapia', 'Fish and seafood', 'fish'],
  ['Farm-Fresh Table Eggs', 'Poultry and eggs', 'eggs'], ['Fresh Red Hot Pepper', 'Vegetables', 'pepper'], ['Fresh Harvested Cassava Roots', 'Cassava and root crops', 'cassava'],
  ['Clean Parboiled Upland Rice', 'Rice and grains', 'rice'], ['Premium Lofa Country Rice', 'Rice and grains', 'rice'],
  ['Maize', 'Rice and grains', 'maize'], ['Broiler chickens', 'Poultry and eggs', 'poultry'], ['Mystery thing', 'Vegetables', 'generic'], ['Something', 'Unknown category', 'generic'],
];

test('each product maps to its own picture, by name first, then crop, then category, then a neutral picture', () => {
  for (const [name, category, want] of LIVE) assert.equal(productImageKey({productName: name, category}), want, `${name} (${category})`);
  assert.equal(productImageKey({productName: 'Harvest listing', category: 'Rice and grains', cropSlug: 'plantain'}), 'plantain', 'crop slug beats category');
  assert.equal(productImageKey({productName: 'Egg crate and rice', category: 'Rice and grains'}), 'eggs', 'specific words come first');
  assert.equal(productImageKey({}), 'generic');
  assert.ok(new Set(LIVE.filter(([, , k]) => k !== 'generic').map(([, , k]) => PRODUCT_IMAGES[k].src)).size >= 12, 'many different pictures, not one shared photograph');
});

test('the six products named in the report no longer share one picture', () => {
  const srcs = ['Rice', 'Cassava', 'Pepper', 'Okra', 'Plantain'].map((n) => listingPicture({image_url: '/src/assets/images/liberia_agri_market_1794996422856.jpg', product_name: n, category: 'x'}).src);
  assert.equal(new Set(srcs).size, 5); assert.ok(srcs.every((s) => !s.includes('liberia_agri_market')));
});

test("a seller's own photo is always kept; built-in sample paths are never treated as a seller's photo; representative pictures say so", () => {
  const upload = 'data:image/jpeg;base64,/9j/4AAQ'; const saved = '/offline-img/x.webp';
  const own = listingPicture({image_url: upload, product_name: 'Rice', category: 'Rice and grains'}); assert.equal(own.src, upload); assert.equal(own.representative, false); assert.match(own.caption, /supplied by the seller/);
  assert.equal(listingPicture({image_url: saved, product_name: 'Cassava'}).src, saved);
  for (const legacy of ['/src/assets/images/crop_rice_1794924195882.jpg', '/src/assets/images/hero_liberia_farm_1794924193363.jpg', '', null, undefined, 'https://example.com/a.jpg']) assert.equal(isSellerPhoto(legacy as string), false);
  const rep = listingPicture({image_url: '/src/assets/images/hero_liberia_farm_1794924193363.jpg', product_name: 'Fresh Okra', category: 'Vegetables'});
  assert.equal(rep.representative, true); assert.match(rep.caption, /Representative illustration of okra/); assert.match(rep.caption, /not a photograph of this seller's product/i);
});

test('every picture is a small project-owned local file (no external links), valid SVG, and no code or script', () => {
  for (const [k, v] of Object.entries(PRODUCT_IMAGES)) {
    assert.match(v.src, /^\/images\/products\/[a-z]+\.svg$/, k); const f = path.join(root, 'public', v.src); assert.ok(fs.existsSync(f), f);
    const svg = fs.readFileSync(f, 'utf8'); assert.ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'), k); assert.ok(svg.length < 6000, `${k} is ${svg.length} bytes`);
    assert.ok(!/(<script|http:|https:|href=|onload|xlink)/i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', '')), `${k}: no scripts or external references`);
  }
});

test('the marketplace page uses the central mapping everywhere a listing picture is drawn, and no universal default picture', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/public/MarketplacePage.tsx'), 'utf8');
  assert.equal((page.match(/<SafeImage/g) ?? []).length, 2); assert.ok(!/src=\{item\.image_url\}|src=\{detailsListing\.image_url\}/.test(page)); assert.ok(!/PRESET_IMAGES/.test(page));
  assert.match(page, /loading="lazy"/); assert.match(page, /Representative illustration/);
});
