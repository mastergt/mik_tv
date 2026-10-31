BEGIN;

-- The UUID identifies a local application installation, NOT its owner.
-- A random secret issued at first registration must accompany re-registration.
CREATE TABLE subscribers.terminal_credentials (
  terminal_id bigint PRIMARY KEY REFERENCES subscribers.terminals(id) ON DELETE CASCADE,
  secret_hash char(64) NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

-- One active playback lease per device. Expired leases remain until replaced or cleaned.
-- This is separate from optional detailed playback_sessions history.
CREATE TABLE subscribers.playback_leases (
  terminal_id bigint PRIMARY KEY REFERENCES subscribers.terminals(id) ON DELETE CASCADE,
  abonent_id bigint REFERENCES subscribers.abonents(id) ON DELETE CASCADE,
  provider_id integer NOT NULL REFERENCES core.providers(id) ON DELETE CASCADE,
  stream_id bigint NOT NULL REFERENCES catalog.streams(id) ON DELETE CASCADE,
  lease_key_hash char(64) NOT NULL CHECK (lease_key_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  playback_history_id bigint REFERENCES subscribers.playback_sessions(id) ON DELETE SET NULL
);
CREATE INDEX subscribers_playback_leases_abonent_active_idx
  ON subscribers.playback_leases(abonent_id,expires_at)
  WHERE abonent_id IS NOT NULL;
CREATE INDEX subscribers_playback_leases_expiry_idx
  ON subscribers.playback_leases(expires_at);

INSERT INTO core.schema_migrations(version) VALUES ('0009_client_api');
COMMIT;
