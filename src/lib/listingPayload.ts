import type {ListingData} from './offlineDrafts';

/**
 * The request body for creating or editing a listing. Pure, so it can be tested without a browser. For a harvest listing it also carries the crop, whole
 * kilograms and harvest date (the server validates them again and derives the category, product name, quantity and unit from them).
 */
export function listingBody(rec: {data: ListingData}, includeImage: boolean, ownerKey?: string): Record<string, unknown> {
  const d = rec.data;
  const phone = d.phoneConsent ? d.sellerPhone : '';
  const baseSeller = (d.sellerName || 'Liberia Farmer').trim();
  const seller = d.sellerType === 'supplier' && !baseSeller.toLowerCase().includes('supplier') ? `${baseSeller} (Supplier)` : baseSeller;
  return {
    // The secret is sent only when creating; the server stores a hash and never returns it.
    ...(ownerKey ? {ownerKey} : {}),
    sellerName: seller,
    farmName: d.farmName,
    category: d.category,
    productName: d.productName,
    quantity: d.quantity,
    unit: d.unit,
    priceLrd: Number(d.priceLrd),
    availabilityStatus: d.availabilityStatus,
    county: d.county,
    town: d.town,
    description: d.description,
    // Never send a number without the farmer's consent.
    sellerPhone: phone,
    phoneConsent: Boolean(d.phoneConsent && phone),
    ...(d.cropSlug !== undefined ? {cropSlug: d.cropSlug, quantityKg: Number(d.quantityKg), harvestDate: d.harvestDate} : {}),
    ...(includeImage && d.photoDataUrl ? {imageUrl: d.photoDataUrl} : {}),
  };
}
