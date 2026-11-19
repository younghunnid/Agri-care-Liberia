-- Phase 0 follow-up. (1) users.is_shared_demo permanently marks the seeded demonstration accounts whose passwords are PUBLISHED in the project
-- documents. The flag is set when they are seeded (or found at start-up) and is never cleared by a password change, so taking over such an account
-- cannot make it a trusted responder. (2) An index on rate_limit_attempts.created_at lets old rows be pruned in small indexed batches instead of a
-- full-table scan that blocks the Node.js thread. Additive only.
ALTER TABLE users ADD COLUMN is_shared_demo INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_rate_limit_created ON rate_limit_attempts (created_at);
