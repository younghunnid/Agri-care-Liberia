/**
 * The ONLY shape in which a marketplace inquiry leaves the server on the legacy routes (list, create reply, owner reply).
 * An explicit allow-list: no buyer client token, user ids, key hashes or other internal columns can ever be added by a table change.
 * The buyer's phone number goes to the seller (or an administrator) only if the buyer consented; the buyer always sees their own.
 */
export const INQUIRY_SELECT = `i.id, i.listing_id, i.buyer_user_id, i.buyer_name, i.buyer_phone, i.buyer_phone_consent, i.buyer_county, i.message, i.status, i.farmer_reply,
  i.created_at, i.updated_at, l.product_name, l.price_lrd, l.unit, l.seller_name, l.seller_user_id, l.owner_key_hash`;

export interface InquiryRow {
  id: number; listing_id: number; buyer_user_id: number | null; buyer_name: string; buyer_phone: string; buyer_phone_consent: number; buyer_county: string;
  message: string; status: string; farmer_reply: string; created_at: string; updated_at: string; product_name: string; price_lrd: number; unit: string; seller_name: string;
  seller_user_id: number | null; owner_key_hash: string;
}

export function inquiryView(r: InquiryRow, side: 'seller' | 'buyer') {
  return {
    id: r.id, listing_id: r.listing_id, product_name: r.product_name, price_lrd: r.price_lrd, unit: r.unit, seller_name: r.seller_name,
    buyer_name: r.buyer_name, buyer_county: r.buyer_county,
    buyer_phone: side === 'buyer' || r.buyer_phone_consent === 1 ? r.buyer_phone : '',
    buyer_phone_shared: r.buyer_phone_consent === 1,
    message: r.message, status: r.status, farmer_reply: r.farmer_reply, created_at: r.created_at, updated_at: r.updated_at,
  };
}
