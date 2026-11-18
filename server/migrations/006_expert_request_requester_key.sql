-- Expert request privacy (security fix). Requests created from a device are now tied to a secret that only that device knows;
-- the server stores only a keyed hash and never returns it. The legacy `requester_token` column is no longer read for access
-- decisions or returned; new rows store an empty value there. Existing rows are left untouched (not deleted or rewritten).
ALTER TABLE demo_expert_requests ADD COLUMN requester_key_hash TEXT NOT NULL DEFAULT '';
