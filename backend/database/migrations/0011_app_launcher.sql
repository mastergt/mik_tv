BEGIN;

-- Tile ordering and icon for the client application launcher.
ALTER TABLE catalog.app_types
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS icon text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_types_sort_order_positive'
    AND conrelid = 'catalog.app_types'::regclass) THEN
    ALTER TABLE catalog.app_types ADD CONSTRAINT app_types_sort_order_positive CHECK (sort_order >= 0);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS catalog_app_types_enabled_order
  ON catalog.app_types(enabled,sort_order,id);

INSERT INTO core.schema_migrations(version)
VALUES('0011_app_launcher') ON CONFLICT(version) DO NOTHING;
COMMIT;
