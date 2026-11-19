-- 007: server-enforced phone verification, new-device login, trusted devices, recovery codes (simulated SMS in development).
-- Reversible: see server/migrations/down/007_sms_verification.down.sql and `npm run db:migrate:down`.
-- Times in the new tables are integer milliseconds since the epoch so that every state change can be one atomic conditional UPDATE.

ALTER TABLE users ADD COLUMN phone_verified_at TEXT;
ALTER TABLE users ADD COLUMN phone_claim_expires_at TEXT;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Accounts that exist today: their phone was never verified. They get a 30-day grace window to verify it at their next login before the number
-- can be claimed by someone who proves they hold it.
UPDATE users SET phone_claim_expires_at = datetime('now', '+30 days') WHERE phone_verified_at IS NULL;
-- Reserved synthetic demonstration numbers (+23177000xxxx) belong to nobody: treat them as verified so the demo accounts work.
UPDATE users SET phone_verified_at = datetime('now'), phone_claim_expires_at = NULL WHERE phone GLOB '+23177000[0-9][0-9][0-9][0-9]';

CREATE TABLE IF NOT EXISTS verification_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('phone_confirm', 'new_device_login', 'password_reset', 'phone_change', 'phone_change_new', 'phone_claim')),
  phone TEXT NOT NULL,
  target_phone TEXT,
  parent_id INTEGER REFERENCES verification_challenges(id) ON DELETE SET NULL,
  code_digest TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'consumed', 'superseded', 'locked', 'expired', 'send_failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  send_count INTEGER NOT NULL DEFAULT 1,
  created_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  last_sent_ms INTEGER NOT NULL,
  verified_ms INTEGER,
  consumed_ms INTEGER,
  ip_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vc_user_purpose ON verification_challenges (user_id, purpose, status);
CREATE INDEX IF NOT EXISTS idx_vc_phone_purpose ON verification_challenges (phone, purpose, status);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_ms INTEGER NOT NULL,
  last_used_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  revoked_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_td_user ON trusted_devices (user_id, revoked_ms);

CREATE TABLE IF NOT EXISTS otp_rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ore_lookup ON otp_rate_events (bucket, key_hash, created_ms);

CREATE TABLE IF NOT EXISTS phone_claim_holds (
  phone_hash TEXT PRIMARY KEY,
  grant_hash TEXT NOT NULL,
  expires_ms INTEGER NOT NULL
);
