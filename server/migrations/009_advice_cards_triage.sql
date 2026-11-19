-- Phase 1A. Versioned advice cards with unique reference codes, and PII-free crop-check ("triage") reports.
-- Additive only. Advice card versions are immutable (a trigger refuses to change their content), so a card can never be overwritten silently: a change
-- is a new version. A version can be marked `verified` only with a named reviewer, an organisation and a review date (CHECK constraint); the seed never does.
CREATE TABLE IF NOT EXISTS advice_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advice_code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  crop TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS advice_card_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  ask_when TEXT NOT NULL,
  source_note TEXT NOT NULL DEFAULT '',
  verification_level TEXT NOT NULL DEFAULT 'demo_sample' CHECK (verification_level IN ('demo_sample', 'team_draft', 'pending_review', 'verified')),
  reviewer_name TEXT,
  reviewer_org TEXT,
  reviewer_note TEXT,
  reviewed_at TEXT,
  content_hash TEXT NOT NULL,
  change_note TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (card_id, version),
  FOREIGN KEY (card_id) REFERENCES advice_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (verification_level <> 'verified' OR (
    reviewer_name IS NOT NULL AND length(trim(reviewer_name)) >= 3 AND
    reviewer_org IS NOT NULL AND length(trim(reviewer_org)) >= 2 AND
    reviewed_at IS NOT NULL))
);

CREATE TRIGGER IF NOT EXISTS advice_card_versions_immutable
BEFORE UPDATE OF card_id, version, title, summary, steps_json, ask_when, source_note, content_hash, change_note, created_by, created_at ON advice_card_versions
BEGIN
  SELECT RAISE(ABORT, 'advice card versions are immutable: create a new version instead');
END;

CREATE TABLE IF NOT EXISTS triage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_ref TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  requester_key_hash TEXT NOT NULL DEFAULT '',
  case_id TEXT NOT NULL,
  crop TEXT NOT NULL,
  county TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('green', 'yellow', 'red')),
  advice_code TEXT NOT NULL,
  advice_version INTEGER NOT NULL,
  is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated = 1),
  escalated INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_triage_owner ON triage_reports (user_id, requester_key_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_triage_county_band ON triage_reports (county, crop, band);
