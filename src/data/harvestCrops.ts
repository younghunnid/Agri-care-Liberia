/** Crops a farmer can list as a harvest. Slugs and market categories match the Crops Library and the marketplace categories. Shared by browser and server. */
export interface HarvestCrop {slug: string; label: string; category: string}
export const HARVEST_CROPS: HarvestCrop[] = [
  {slug: 'rice', label: 'Rice', category: 'Rice and grains'},
  {slug: 'maize', label: 'Maize', category: 'Rice and grains'},
  {slug: 'groundnuts', label: 'Groundnuts', category: 'Rice and grains'},
  {slug: 'cassava', label: 'Cassava', category: 'Cassava and root crops'},
  {slug: 'sweet-potatoes', label: 'Sweet potatoes', category: 'Cassava and root crops'},
  {slug: 'pepper', label: 'Pepper', category: 'Vegetables'},
  {slug: 'okra', label: 'Okra', category: 'Vegetables'},
  {slug: 'tomatoes', label: 'Tomatoes', category: 'Vegetables'},
  {slug: 'plantain', label: 'Plantain', category: 'Fruits and plantains'},
];
export const cropBySlug = (slug: string): HarvestCrop | undefined => HARVEST_CROPS.find((c) => c.slug === slug);
export const HARVEST_STATUSES = ['Available', 'Limited Stock', 'Sold Out'] as const;
export type HarvestStatus = (typeof HARVEST_STATUSES)[number];
export const HARVEST_LIMITS = {minKg: 1, maxKg: 1_000_000, maxAgeDays: 400, maxFutureDays: 1} as const;

export const SELL_CODE_NOTE = 'A reference number issued by the server so a buyer and a seller can talk about the same listing. It is a lookup number only: not a blockchain, not a signature, and not proof of origin or quality.';
