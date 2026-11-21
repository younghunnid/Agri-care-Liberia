/** Browser marketplace projections contain no phone numbers, account IDs or private keys. */
export const USSD_DEMO_MARKER = 'USSD DEMO: synthetic harvest. No payments.';
export const DEMO_TOWNS = ['Demo Town A', 'Demo Town B'] as const;
/** Real-user deployments: listings are real, not synthetic. They carry their own marker and use the county's main market town (no free text on a keypad). */
export const USSD_REAL_MARKER = 'Posted through the Agricare USSD browser simulator. No payments.';
export const REAL_TOWNS: Record<string, string> = {
  'Bomi': 'Tubmanburg', 'Bong': 'Gbarnga', 'Gbarpolu': 'Bopolu', 'Grand Bassa': 'Buchanan', 'Grand Cape Mount': 'Robertsport', 'Grand Gedeh': 'Zwedru', 'Grand Kru': 'Barclayville',
  'Lofa': 'Voinjama', 'Margibi': 'Kakata', 'Maryland': 'Harper', 'Montserrado': 'Paynesville', 'Nimba': 'Sanniquellie', 'River Cess': 'Cestos City', 'River Gee': 'Fish Town', 'Sinoe': 'Greenville',
};
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
  /** 'demo' = protected synthetic demo server; 'real' = real-user deployment with a signed-in account. */
  mode?: 'demo' | 'real'; identityName?: string;
  allowed: boolean; reason: string; loading: boolean; error: string | null;
  source: 'server' | 'saved' | 'none'; asOf: string | null;
  /** Original public read-only snapshot; never narrowed by the interactive demo filter and contains no private/contact fields. */
  legacy?: {source: 'server' | 'saved' | 'none'; asOf: string | null; listings: Array<Pick<DemoListing, 'code' | 'cropSlug' | 'quantityKg' | 'pricePerKgLrd' | 'county' | 'status'>>};
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
export const REAL_INQUIRY_MESSAGES = [
  'Is this harvest still available?',
  'When could I collect this harvest?',
  'May we discuss the asking price?',
] as const;
