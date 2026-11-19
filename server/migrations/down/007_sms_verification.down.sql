-- Reverses 007_sms_verification.sql. Sessions issued after 007 carry a version claim; after this down-migration they are rejected only if the
-- application code is also rolled back. Phone numbers released to tombstones ("released:...") are NOT restored.
DROP TABLE IF EXISTS phone_claim_holds;
DROP TABLE IF EXISTS otp_rate_events;
DROP TABLE IF EXISTS trusted_devices;
DROP TABLE IF EXISTS verification_challenges;
ALTER TABLE users DROP COLUMN session_version;
ALTER TABLE users DROP COLUMN phone_claim_expires_at;
ALTER TABLE users DROP COLUMN phone_verified_at;
DELETE FROM schema_migrations WHERE version = '007_sms_verification.sql';
