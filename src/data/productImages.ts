/**
 * Marketplace product pictures: ONE central mapping.
 *
 * A listing shows (in this order):
 *  1. the seller's own uploaded photo (a `data:image/...` upload, or a picture saved for offline use);
 *  2. otherwise a REPRESENTATIVE ILLUSTRATION chosen from the product name, then the crop, then the category;
 *  3. otherwise a neutral illustration.
 * Anything stored as `/src/assets/images/...` is a built-in sample picture or an old shared default, never a seller's upload, so it is NOT trusted to
 * show the product: that is what made rice, cassava, pepper, okra and plantain all show the same mixed market photograph.
 *
 * The illustrations are project-made vector drawings in /images/products (no external hotlinks, about 1 KB each, cached for offline use). They must
 * never be described as a photograph of the product being sold: the screens label them "Representative illustration".
 * Pure data and functions: no imports, so the server can use the same table.
 */
export type ProductImageKey = 'rice' | 'cassava' | 'pepper' | 'okra' | 'plantain' | 'maize' | 'poultry' | 'eggs' | 'fish' | 'livestock' | 'seeds' | 'supplies' | 'fertilizer' | 'generic';

export const PRODUCT_IMAGES: Record<ProductImageKey, {src: string; label: string}> = {
  rice: {src: '/images/products/rice.svg', label: 'Rice'},
  cassava: {src: '/images/products/cassava.svg', label: 'Cassava roots'},
  pepper: {src: '/images/products/pepper.svg', label: 'Fresh peppers'},
  okra: {src: '/images/products/okra.svg', label: 'Okra'},
  plantain: {src: '/images/products/plantain.svg', label: 'Plantains'},
  maize: {src: '/images/products/maize.svg', label: 'Maize'},
  poultry: {src: '/images/products/poultry.svg', label: 'Chicken'},
  eggs: {src: '/images/products/eggs.svg', label: 'Eggs'},
  fish: {src: '/images/products/fish.svg', label: 'Fish'},
  livestock: {src: '/images/products/livestock.svg', label: 'Livestock'},
  seeds: {src: '/images/products/seeds.svg', label: 'Seeds and cuttings'},
  supplies: {src: '/images/products/supplies.svg', label: 'Farm tools and equipment'},
  fertilizer: {src: '/images/products/fertilizer.svg', label: 'Compost and fertilizer'},
  generic: {src: '/images/products/generic.svg', label: 'Farm produce'},
};

/** First match wins, so specific words (egg, compost, sprayer, cuttings) come before the crop they mention. */
const BY_NAME: [RegExp, ProductImageKey][] = [
  [/\b(egg|eggs)\b/i, 'eggs'],
  [/\b(compost|manure|fertili[sz]er|npk|urea|lime|mulch)\b/i, 'fertilizer'],
  [/\b(sprayer|knapsack|cutlass|machete|hoe|tool|tools|wheelbarrow|equipment|irrigation|pump|net|tarpaulin|sack|bag|bags|pesticide|herbicide)\b/i, 'supplies'],
  [/\b(seed|seeds|seedling|seedlings|cutting|cuttings|nursery|planting material)\b/i, 'seeds'],
  [/\b(rice|paddy|upland|parboiled)\b/i, 'rice'],
  [/\b(cassava|gari|garri|fufu|tapioca)\b/i, 'cassava'],
  [/\b(pepper|peppers|chili|chilli|scotch bonnet)\b/i, 'pepper'],
  [/\b(okra|okro)\b/i, 'okra'],
  [/\b(plantain|plantains|cooking banana|banana|bananas)\b/i, 'plantain'],
  [/\b(maize|corn)\b/i, 'maize'],
  [/\b(chicken|chickens|hen|hens|broiler|broilers|poultry|duck|ducks|turkey|chick|chicks|layer|layers)\b/i, 'poultry'],
  [/\b(fish|tilapia|catfish|fingerling|fingerlings|shrimp|crab|seafood|smoked fish)\b/i, 'fish'],
  [/\b(goat|goats|sheep|pig|pigs|cattle|cow|cows|livestock|rabbit|rabbits)\b/i, 'livestock'],
];
/** Crop slugs used by harvest listings. */
const BY_CROP: Record<string, ProductImageKey> = {rice: 'rice', cassava: 'cassava', pepper: 'pepper', okra: 'okra', plantain: 'plantain', maize: 'maize', corn: 'maize'};
const BY_CATEGORY: Record<string, ProductImageKey> = {
  'Rice and grains': 'rice', 'Cassava and root crops': 'cassava', 'Vegetables': 'generic', 'Fruits and plantains': 'plantain', 'Poultry and eggs': 'poultry',
  'Livestock': 'livestock', 'Fish and seafood': 'fish', 'Seeds and seedlings': 'seeds', 'Agricultural supplies': 'supplies',
};

export function productImageKey(p: {productName?: string | null; category?: string | null; cropSlug?: string | null}): ProductImageKey {
  const name = (p.productName ?? '').trim();
  for (const [re, key] of BY_NAME) if (re.test(name)) return key;
  const crop = (p.cropSlug ?? '').trim().toLowerCase(); if (BY_CROP[crop]) return BY_CROP[crop];
  return BY_CATEGORY[(p.category ?? '').trim()] ?? 'generic';
}

/** A picture the seller supplied: an uploaded photo (data URI, size-limited by the server) or one saved on this phone. Built-in sample paths are not. */
export const isSellerPhoto = (url: string | null | undefined): boolean => typeof url === 'string' && (url.startsWith('data:image/') || url.startsWith('/offline-img/'));

export interface ListingPicture {src: string; representative: boolean; caption: string}
export function listingPicture(l: {image_url?: string | null; product_name?: string | null; category?: string | null; crop_slug?: string | null}): ListingPicture {
  if (isSellerPhoto(l.image_url)) return {src: l.image_url!, representative: false, caption: 'Photo supplied by the seller'};
  const img = PRODUCT_IMAGES[productImageKey({productName: l.product_name, category: l.category, cropSlug: l.crop_slug})];
  return {src: img.src, representative: true, caption: `Representative illustration of ${img.label.toLowerCase()}. It is not a photograph of this seller's product.`};
}
