BEGIN;
-- Fast substring search in potentially large XMLTV channel catalogs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS epg_channels_name_trgm_idx
  ON epg.channels USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS epg_channels_external_id_trgm_idx
  ON epg.channels USING gin (external_channel_id gin_trgm_ops);
INSERT INTO core.schema_migrations(version)
SELECT '0008_epg_manual_search'
WHERE NOT EXISTS (SELECT 1 FROM core.schema_migrations WHERE version='0008_epg_manual_search');
COMMIT;
