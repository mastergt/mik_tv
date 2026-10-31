#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:=$(node --env-file="$ROOT/.env" -e 'process.stdout.write(process.env.DATABASE_URL||"")')}"
if [[ -z "$DATABASE_URL" ]]; then
  echo "Missing DATABASE_URL in backend/.env" >&2
  exit 1
fi
TARGET_DB="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
if [[ "$TARGET_DB" != 'iptv_front' ]]; then
  echo "Refusing to migrate database: $TARGET_DB (expected iptv_front)" >&2
  exit 1
fi
CURRENT="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM core.schema_migrations WHERE version='0007_epg_import'")"
if [[ "$CURRENT" == "1" ]]; then
  echo 'SKIP 0007_epg_import — already applied'
else
  echo 'APPLY 0007_epg_import to the database from backend/.env'
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/database/migrations/0007_epg_import.sql"
fi
