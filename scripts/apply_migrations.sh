#!/usr/bin/env bash
set -euo pipefail

# Docker-aware migration runner for the Settle backend.
# Applies all SQL files in database/migrations in lexical order
# against the same Postgres service the API uses.

: "${DB_HOST:=postgres}"
: "${DB_USER:=settle_user}"
: "${DB_PASSWORD:=settle_password}"
: "${DB_NAME:=settle_booking}"

PSQL_CMD=(docker compose exec -T -e "PGPASSWORD=${DB_PASSWORD}" postgres \
  psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1)

echo "Applying migrations to ${DB_USER}@${DB_HOST}/${DB_NAME}"

# Ensure pgcrypto exists (safe to run repeatedly)
"${PSQL_CMD[@]}" < database/migrations/001_enable_pgcrypto.sql || true

# Apply migrations in order
for file in $(ls -1 database/migrations/*.sql | sort); do
  echo "==> Running ${file}"
  "${PSQL_CMD[@]}" < "${file}"
done

echo "✅ Migrations complete."