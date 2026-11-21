-- Reverses 20261122: restores the two-source CHECK. Publication batches for the 'anonymous' source are dropped (they are recomputed on demand).
CREATE TABLE participant_registry_publications_v1 (
  source TEXT PRIMARY KEY CHECK(source IN ('real','synthetic')),
  participant_count INTEGER NOT NULL,
  payload TEXT NOT NULL
);
INSERT INTO participant_registry_publications_v1 (source, participant_count, payload) SELECT source, participant_count, payload FROM participant_registry_publications WHERE source IN ('real','synthetic');
DROP TABLE participant_registry_publications;
ALTER TABLE participant_registry_publications_v1 RENAME TO participant_registry_publications;
