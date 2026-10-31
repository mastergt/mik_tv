#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a PostgreSQL connection string}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIRM="${CONFIRM_DESTROY:-no}"
if [[ "$CONFIRM" != "yes" ]]; then
  echo 'Refusing destructive rollback. Set CONFIRM_DESTROY=yes ONLY for empty DEV installations.' >&2
  exit 1
fi
for file in "$ROOT"/rollback/*.sql; do
  echo "ROLLBACK $(basename "$file")"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$file"
done
