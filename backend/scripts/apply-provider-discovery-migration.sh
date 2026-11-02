#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?DATABASE_URL is required}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0010_provider_discovery.sql
