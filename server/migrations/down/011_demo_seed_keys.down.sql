-- Reverses 011_demo_seed_keys.sql. The synthetic records keep existing but lose their stable keys (the next seeding would then adopt them again by order).
DROP INDEX IF EXISTS idx_report_demo_seed_key;
DROP INDEX IF EXISTS idx_listing_demo_seed_key;
ALTER TABLE triage_reports DROP COLUMN demo_seed_key;
ALTER TABLE marketplace_listings DROP COLUMN demo_seed_key;
DELETE FROM schema_migrations WHERE version = '011_demo_seed_keys.sql';
