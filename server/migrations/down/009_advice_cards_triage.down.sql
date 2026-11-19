-- Reverses 009_advice_cards_triage.sql. Advice cards, their version history and all crop-check reports are DISCARDED: take a backup first.
DROP INDEX IF EXISTS idx_triage_county_band;
DROP INDEX IF EXISTS idx_triage_owner;
DROP TABLE IF EXISTS triage_reports;
DROP TRIGGER IF EXISTS advice_card_versions_immutable;
DROP TABLE IF EXISTS advice_card_versions;
DROP TABLE IF EXISTS advice_cards;
DELETE FROM schema_migrations WHERE version = '009_advice_cards_triage.sql';
