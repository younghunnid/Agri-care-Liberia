-- Listing ownership (security fix). Ownership is now proven with a per-listing secret that only the creator knows.
-- The server stores only a keyed hash of it (never the secret) and never returns it or the hash in any response.
-- The legacy `owner_token` column is no longer read for authorisation; it is left untouched (not deleted) and must never be exposed.
-- Rows created before this migration have an empty hash and can be managed only by their signed-in seller or an administrator.
ALTER TABLE marketplace_listings ADD COLUMN owner_key_hash TEXT NOT NULL DEFAULT '';
