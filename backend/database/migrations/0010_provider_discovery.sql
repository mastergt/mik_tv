BEGIN;

-- Source-IP discovery: one optional default, multiple IPv4/IPv6 CIDRs per provider.
ALTER TABLE core.providers ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS core_providers_one_default_idx
  ON core.providers (is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS core.provider_ip_ranges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id integer NOT NULL REFERENCES core.providers(id) ON DELETE CASCADE,
  network cidr NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS core_provider_ip_ranges_provider_idx
  ON core.provider_ip_ranges (provider_id);
COMMENT ON TABLE core.provider_ip_ranges IS
  'IPv4/IPv6 CIDR networks used for terminal provider discovery; longest prefix wins.';

INSERT INTO core.schema_migrations(version)
VALUES ('0010_provider_discovery') ON CONFLICT (version) DO NOTHING;
COMMIT;
