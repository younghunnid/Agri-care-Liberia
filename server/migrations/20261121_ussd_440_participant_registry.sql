-- Additive registry in the existing application database. No existing identities or roles change.
CREATE TABLE participant_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  requester_hash TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN ('Farmer','Buyer','Agricultural Expert','Cooperative','Other')),
  county TEXT NOT NULL,
  registration_channel TEXT NOT NULL DEFAULT 'ussd-browser' CHECK(registration_channel = 'ussd-browser'),
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK(is_synthetic IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE participant_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participant_registrations(id) ON DELETE RESTRICT,
  consent_version TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK(identity_kind IN ('account','device')),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(participant_id, consent_version, identity_kind)
);
-- Durable publication batches prevent a process restart exposing a single new registration.
CREATE TABLE participant_registry_publications (
  source TEXT PRIMARY KEY CHECK(source IN ('real','synthetic')),
  participant_count INTEGER NOT NULL,
  payload TEXT NOT NULL
);
