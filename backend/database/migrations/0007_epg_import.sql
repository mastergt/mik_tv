BEGIN;
-- Only one running import per feed, across PM2 workers and backend instances.
CREATE UNIQUE INDEX IF NOT EXISTS epg_jobs_one_running_per_source
  ON epg.import_jobs(source_id) WHERE status IN ('running','queued');
-- Mark successfully imported programmes to purge programmes that disappeared from a feed.
ALTER TABLE epg.programmes ADD COLUMN IF NOT EXISTS last_import_job_id bigint;
CREATE INDEX IF NOT EXISTS epg_programmes_last_job_idx ON epg.programmes(last_import_job_id);
-- Add first XMLTV source once, without duplicating user-configured entries.
INSERT INTO epg.sources(name,type,download_uri,visibility,language_code,refresh_interval_seconds,comment)
SELECT 'iptvx.one — основной EPG','xmltv','https://iptvx.one/epg/epg.xml.gz','all','ru',21600,'XMLTV gzip. Исходный каталог используется для автоматического сопоставления.'
WHERE NOT EXISTS (SELECT 1 FROM epg.sources WHERE download_uri='https://iptvx.one/epg/epg.xml.gz');
INSERT INTO core.schema_migrations(version) VALUES ('0007_epg_import');
COMMIT;
