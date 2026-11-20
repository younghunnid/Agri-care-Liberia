/** Browser marketplace projections contain no phone numbers, account IDs or private keys. */
export const USSD_DEMO_MARKER = 'USSD DEMO: synthetic harvest. No payments.';
export const DEMO_TOWNS = ['Demo Town A', 'Demo Town B'] as const;
export interface DemoListing {
  id: number; code: string | null; cropSlug: string; quantityKg: number | null; pricePerKgLrd: number;
  county: string; town: string; status: string;
}
export interface OwnDemoListing {
  localId: string; code: string | null; cropSlug: string; quantityKg: number; price: number; county: string; town: string;
  status: 'draft' | 'pending' | 'failed' | 'published'; error?: string;
}
export interface DemoInquiry {
  id: number; listingId: number; listingCode: string | null; cropLabel: string; role: 'buyer' | 'seller';
  message: string; reply: string; status: string;
}
export interface MarketplaceEnv {
  allowed: boolean; reason: string; loading: boolean; error: string | null;
  source: 'server' | 'saved' | 'none'; asOf: string | null;
  listings: DemoListing[]; own: OwnDemoListing[]; inquiries: DemoInquiry[];
}
export type MarketAction =
  | {kind: 'sell'; crop: string; kg: number; price: number; county: string; town: string; harvestDate: string}
  | {kind: 'inquiry'; listingId: number; county: string; message: string}
  | {kind: 'retry'; localId: string};
export type MarketCommand = MarketAction & {token: string};
export interface MarketResult {
  status: 'pending' | 'synced' | 'failed' | 'unconfirmed'; message: string; code?: string; localId?: string;
}
export const EMPTY_MARKETPLACE: MarketplaceEnv = {
  allowed: false, reason: 'Demo submissions are disabled on this server.', loading: false, error: null,
  source: 'none', asOf: null, listings: [], own: [], inquiries: [],
};
export const INQUIRY_MESSAGES = [
  'Synthetic demo inquiry: is this harvest still available?',
  'Synthetic demo inquiry: when could I collect this harvest?',
  'Synthetic demo inquiry: may we discuss the asking price?',
] as const;
