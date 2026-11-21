-- Reverses 20261121_ussd_440_participant_registry.sql. Removes ONLY the three participant-registry tables (registrations, consents, publication batches).
-- Users, roles, sessions and every other table are untouched. Take a backup first: registry rows are not recoverable once dropped.
DROP TABLE IF EXISTS participant_registry_publications;
DROP TABLE IF EXISTS participant_consents;
DROP TABLE IF EXISTS participant_registrations;
