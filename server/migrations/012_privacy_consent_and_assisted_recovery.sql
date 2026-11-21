-- Additive only: no existing row is changed or removed.
-- 1. Versioned privacy-notice consent recorded at registration (history is kept; one row per user and notice version).
CREATE TABLE IF NOT EXISTS privacy_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notice_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, notice_version)
);
-- 2. Administrator-assisted password recovery: the existing password_resets table gains who issued the code, how identity was established,
--    a wrong-guess counter and a revocation time. The code itself is never stored (keyed hash only).
ALTER TABLE password_resets ADD COLUMN issued_by_user_id INTEGER;
ALTER TABLE password_resets ADD COLUMN verification_method TEXT;
ALTER TABLE password_resets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE password_resets ADD COLUMN revoked_at TEXT;
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, used_at, revoked_at);
