-- Reverses 010_harvest_market.sql. Harvest fields, SELL codes, buyer keys and consent flags are DISCARDED: take a backup first.
DROP INDEX IF EXISTS idx_inquiry_buyer_key;
DROP INDEX IF EXISTS idx_harvest_filter;
DROP INDEX IF EXISTS idx_listing_code;
ALTER TABLE triage_reports DROP COLUMN is_synthetic;
ALTER TABLE marketplace_inquiries DROP COLUMN buyer_phone_consent;
ALTER TABLE marketplace_inquiries DROP COLUMN buyer_key_hash;
ALTER TABLE marketplace_listings DROP COLUMN is_harvest_listing;
ALTER TABLE marketplace_listings DROP COLUMN harvest_date;
ALTER TABLE marketplace_listings DROP COLUMN quantity_kg;
ALTER TABLE marketplace_listings DROP COLUMN crop_slug;
ALTER TABLE marketplace_listings DROP COLUMN listing_code;
DELETE FROM schema_migrations WHERE version = '010_harvest_market.sql';
