#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(node --env-file="$ROOT/.env" -e 'process.stdout.write(process.env.DATABASE_URL||"")')
fi
: "${DATABASE_URL:?Missing DATABASE_URL in backend/.env}"
DB=$(psql "$DATABASE_URL" -Atq -c 'SELECT current_database()')
if [ "$DB" != 'iptv_front' ]; then
  echo "ERROR: refusing to migrate DB '$DB'; expected iptv_front" >&2
  exit 1
fi
VERSION=$(psql "$DATABASE_URL" -Atq -c "SELECT count(*) FROM core.schema_migrations WHERE version='0008_epg_manual_search'")
if [ "$VERSION" != '0' ]; then
  echo 'SKIP: 0008_epg_manual_search already applied'
  exit 0
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/database/migrations/0008_epg_manual_search.sql"
echo 'OK: 0008_epg_manual_search applied'
