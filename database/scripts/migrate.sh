#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a PostgreSQL connection string}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for file in "$ROOT"/migrations/*.sql; do
  version="$(basename "$file" .sql)"
  if ! [[ "$version" =~ ^[0-9]{4}_[a-z0-9_]+$ ]]; then
    echo "Unexpected migration name: $version" >&2
    exit 1
  fi
  has_registry="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "SELECT to_regclass('core.schema_migrations') IS NOT NULL" 2>/dev/null || true)"
  if [[ "$has_registry" == "t" ]]; then
    applied="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM core.schema_migrations WHERE version = '$version'")"
    if [[ "$applied" == "1" ]]; then
      echo "SKIP $version"
      continue
    fi
  fi
  echo "APPLY $version"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file"
done
