-- Reverses 012. Back up first: consent history and recovery records are lost.
DROP INDEX IF EXISTS idx_password_resets_user;
ALTER TABLE password_resets DROP COLUMN revoked_at;
ALTER TABLE password_resets DROP COLUMN attempts;
ALTER TABLE password_resets DROP COLUMN verification_method;
ALTER TABLE password_resets DROP COLUMN issued_by_user_id;
DROP TABLE IF EXISTS privacy_consents;
