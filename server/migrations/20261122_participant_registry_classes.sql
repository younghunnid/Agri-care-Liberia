-- Additive. The registry publication batches get a third class ('anonymous' browser participants) next to 'real' and 'synthetic', and a fourth/fifth
-- for the phone-status split of genuine accounts. The old table had a CHECK limited to two sources, so the rows are copied into a table without it.
-- Nothing in participant_registrations or participant_consents changes.
CREATE TABLE participant_registry_publications_v2 (
  source TEXT PRIMARY KEY,
  participant_count INTEGER NOT NULL,
  payload TEXT NOT NULL
);
INSERT INTO participant_registry_publications_v2 (source, participant_count, payload) SELECT source, participant_count, payload FROM participant_registry_publications;
DROP TABLE participant_registry_publications;
ALTER TABLE participant_registry_publications_v2 RENAME TO participant_registry_publications;
