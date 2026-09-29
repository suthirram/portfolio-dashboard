#!/usr/bin/env bash
#
# copy-prod-to-local.sh — clone prod data (Mongo + Postgres) into the local
# dev stack. Mongo holds stocks/holdings/history/users; Postgres holds the
# gold ledger (DD-003). The gold tables are keyed on the Mongo user ObjectID
# hex, so BOTH must come from the same prod snapshot or uids won't line up —
# this script dumps them back-to-back to keep them consistent.
#
# Prerequisites:
#   - mongodump/mongorestore  (brew install mongodb-database-tools)
#   - pg_dump/psql            (brew install libpq  — then add its bin to PATH)
#   - local dev DBs running:  make dev-db
#
# Usage (env vars):
#   PROD_MONGO_URI='mongodb+srv://USER:PASS@foliocluster-0.fqu4lgx.mongodb.net/portfolio?appName=folioCluster-0' \
#   PROD_POSTGRES_URI='postgres://USER:PASS@PROD_HOST:5432/portfolio?sslmode=require' \
#   ./scripts/copy-prod-to-local.sh
#
# Usage (flags, same effect — flags win when both are set):
#   ./scripts/copy-prod-to-local.sh \
#     --prod-mongo-uri 'mongodb+srv://USER:PASS@.../portfolio' \
#     --prod-postgres-uri 'postgres://USER:PASS@PROD_HOST:5432/portfolio?sslmode=require'
#
# Flags / env overrides:
#   --prod-mongo-uri      PROD_MONGO_URI       required — prod Mongo connection string (incl. /portfolio)
#   --prod-postgres-uri   PROD_POSTGRES_URI    required — prod Postgres connection string
#   --local-mongo-uri     LOCAL_MONGO_URI      default mongodb://localhost:27017
#   --local-postgres-uri  LOCAL_POSTGRES_URI   default postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable
#   --db-name             DB_NAME              default portfolio  (Mongo db name)
#   --dump-dir            DUMP_DIR             default a fresh mktemp -d
#   -h, --help            show this usage and exit
set -euo pipefail

PROD_MONGO_URI="${PROD_MONGO_URI:-}"
PROD_POSTGRES_URI="${PROD_POSTGRES_URI:-}"
LOCAL_MONGO_URI="${LOCAL_MONGO_URI:-mongodb://localhost:27017}"
LOCAL_POSTGRES_URI="${LOCAL_POSTGRES_URI:-postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable}"
DB_NAME="${DB_NAME:-portfolio}"
DUMP_DIR="${DUMP_DIR:-$(mktemp -d)}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,31p' "$0" | sed 's/^#//; s/^ //'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --prod-mongo-uri)      PROD_MONGO_URI="$2"; shift 2 ;;
    --prod-postgres-uri)   PROD_POSTGRES_URI="$2"; shift 2 ;;
    --local-mongo-uri)     LOCAL_MONGO_URI="$2"; shift 2 ;;
    --local-postgres-uri)  LOCAL_POSTGRES_URI="$2"; shift 2 ;;
    --db-name)             DB_NAME="$2"; shift 2 ;;
    --dump-dir)            DUMP_DIR="$2"; shift 2 ;;
    -h|--help)             usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -n "$PROD_MONGO_URI" ]    || die "PROD_MONGO_URI is required"
[ -n "$PROD_POSTGRES_URI" ] || die "PROD_POSTGRES_URI is required"
for bin in mongodump mongorestore pg_dump psql; do
  command -v "$bin" >/dev/null || die "$bin not on PATH"
done

# Refuse to point 'local' restore at anything non-local — this script only
# ever writes to the dev stack. Overwriting prod would be catastrophic.
# Validate each URI INDEPENDENTLY: concatenating them lets one localhost URI
# mask a remote one, so a remote LOCAL_MONGO_URI would still reach --drop.
require_local() {
  case "$2" in
    *localhost*|*127.0.0.1*) : ;;
    *) die "$1 must target localhost (got $2)" ;;
  esac
}
require_local LOCAL_MONGO_URI    "$LOCAL_MONGO_URI"
require_local LOCAL_POSTGRES_URI "$LOCAL_POSTGRES_URI"

say "Dump dir: $DUMP_DIR"

# ---------------------------------------------------------------------------
say "1/4  Dumping prod Mongo"
mongodump --uri="$PROD_MONGO_URI" --out="$DUMP_DIR/mongo"

say "2/4  Dumping prod Postgres (gold)"
pg_dump "$PROD_POSTGRES_URI" --no-owner --no-privileges --clean --if-exists \
  -f "$DUMP_DIR/gold.sql"

# ---------------------------------------------------------------------------
say "3/4  Restoring Mongo → local (--drop)"
mongorestore --uri="$LOCAL_MONGO_URI" --drop \
  --nsFrom="$DB_NAME.*" --nsTo="$DB_NAME.*" \
  "$DUMP_DIR/mongo"

say "4/4  Restoring Postgres → local"
psql "$LOCAL_POSTGRES_URI" -v ON_ERROR_STOP=1 -f "$DUMP_DIR/gold.sql"

say "Done. Prod data now in local dev stack."
say "  Mongo:    $LOCAL_MONGO_URI/$DB_NAME"
say "  Postgres: $LOCAL_POSTGRES_URI"
