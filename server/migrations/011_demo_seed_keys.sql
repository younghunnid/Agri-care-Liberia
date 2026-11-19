-- Phase 1B hardening. A stable identity for every SYNTHETIC demonstration record, so that restarting the app can add what is missing and leave everything
-- else (inquiries, replies, status changes made while presenting) exactly as it is. Additive: both columns are NULL for every real record.
ALTER TABLE marketplace_listings ADD COLUMN demo_seed_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_demo_seed_key ON marketplace_listings (demo_seed_key) WHERE demo_seed_key IS NOT NULL;
ALTER TABLE triage_reports ADD COLUMN demo_seed_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_demo_seed_key ON triage_reports (demo_seed_key) WHERE demo_seed_key IS NOT NULL;
