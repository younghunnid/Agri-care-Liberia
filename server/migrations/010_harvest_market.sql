-- Phase 1B. Harvest listings (crop, kilograms, harvest date), server-issued SELL reference codes for every listing, a private buyer device key and contact
-- consent on inquiries, and a "synthetic" marker on crop-check reports. Additive only: every new column has a default, so existing rows and every existing
-- API response keep working. The SELL code is a lookup number (not blockchain, not a signature).
ALTER TABLE marketplace_listings ADD COLUMN listing_code TEXT;
ALTER TABLE marketplace_listings ADD COLUMN crop_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN quantity_kg INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN harvest_date TEXT;
ALTER TABLE marketplace_listings ADD COLUMN is_harvest_listing INTEGER NOT NULL DEFAULT 0;
UPDATE marketplace_listings SET listing_code = 'SELL-' || substr(created_at, 1, 4) || '-' || printf('%06d', id) WHERE listing_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_code ON marketplace_listings (listing_code);
CREATE INDEX IF NOT EXISTS idx_harvest_filter ON marketplace_listings (is_harvest_listing, moderation_status, crop_slug, county, availability_status);

ALTER TABLE marketplace_inquiries ADD COLUMN buyer_key_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE marketplace_inquiries ADD COLUMN buyer_phone_consent INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_inquiry_buyer_key ON marketplace_inquiries (buyer_key_hash);

ALTER TABLE triage_reports ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;
