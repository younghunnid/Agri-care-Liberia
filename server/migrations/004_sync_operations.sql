-- Idempotency records for offline-first synchronisation (Stage 4).
-- A client generates one random operation key per queued write and sends it as the
-- `Idempotency-Key` header. If the same actor repeats the key, the stored response is
-- replayed instead of creating a second row. Additive only; no existing table is changed.
CREATE TABLE IF NOT EXISTS sync_operations (
  actor TEXT NOT NULL,
  op_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor, op_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_created ON sync_operations (created_at);
