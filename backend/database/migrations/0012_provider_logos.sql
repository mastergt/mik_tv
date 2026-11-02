ALTER TABLE core.providers ADD COLUMN IF NOT EXISTS logo_sha varchar(64);
COMMENT ON COLUMN core.providers.logo_sha IS 'SHA-256 of provider logo PNG in PROVIDER_LOGO_DIR';
