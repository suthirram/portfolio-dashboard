#!/usr/bin/env bash
#
# delete-max.sh — remove the demo user "Max Mustermann" and all of their
# data: Mongo (user, holdings, transactions, snapshots, sessions) AND the
# Postgres gold ledger (gold_transactions + gold_daily_prices, keyed on the
# Mongo uid hex). Idempotent: a no-op when Max doesn't exist.
#
# The counterpart to scripts/seed-max.sh; seed-max.sh calls this first so a
# re-seed never leaves orphaned gold rows behind.
#
# Works against local, dev, or prod — same knobs as seed-max.sh.
#
# Gold cleanup path:
#   - If psql + POSTGRES_URI can reach the DB, both gold tables are cleared
#     directly (thorough — also removes the price series).
#   - Otherwise it falls back to the API (log in as Max, delete each gold
#     transaction); the price series has no delete endpoint, so it is left
#     with a warning (harmless orphan; a re-seed overwrites the same days).
#
# Usage:
#   ./scripts/delete-max.sh                         # local
#   API=https://api.dev... MONGO_URI='mongodb+srv://...' CONFIRM=yes \
#     ./scripts/delete-max.sh                       # dev / prod
#
# Env overrides (same as seed-max.sh):
#   API, MONGO_URI, MONGO_CONTAINER, MONGO_DB, POSTGRES_URI, CONFIRM
set -euo pipefail

# Load config from scripts/seed.env (override path with SEED_ENV_FILE). Values
# in the file win over the built-in defaults below; see scripts/seed.env.example.
ENV_FILE="${SEED_ENV_FILE:-$(dirname "$0")/seed.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

API="${API:-http://localhost:8080}"
MONGO_URI="${MONGO_URI:-}"
MONGO_CONTAINER="${MONGO_CONTAINER:-portfolio_mongo_dev}"
MONGO_DB="${MONGO_DB:-portfolio}"
POSTGRES_URI="${POSTGRES_URI:-postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable}"
PG_CONTAINER="${PG_CONTAINER:-portfolio_postgres_dev}"
PG_DB="${PG_DB:-portfolio}"
PG_USER="${PG_USER:-portfolio}"

USERNAME="maxmustermann"
NAME="Max Mustermann"
PASSWORD="Passw0rd!23"
JAR="$(mktemp)"
CSRF='X-Requested-With: portfolio-dashboard'
JSON='Content-Type: application/json'
trap 'rm -f "$JAR"' EXIT

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

mongo_eval() {
  if [ -n "$MONGO_URI" ]; then
    command -v mongosh >/dev/null || die "mongosh is required when MONGO_URI is set"
    mongosh "$MONGO_URI" --quiet --eval "$1"
  else
    docker exec -i "$MONGO_CONTAINER" mongosh "$MONGO_DB" --quiet --eval "$1"
  fi
}

# Run SQL against Postgres. Prefers a local psql binary against POSTGRES_URI;
# falls back to the local dev docker container (matches mongo_eval). Returns
# non-zero (without running anything) when neither is reachable, so the caller
# can fall back to the API path.
pg_exec() {
  if command -v psql >/dev/null && psql "$POSTGRES_URI" -c 'SELECT 1' >/dev/null 2>&1; then
    psql "$POSTGRES_URI" -v ON_ERROR_STOP=1 -q -c "$1"
  elif docker exec "$PG_CONTAINER" true >/dev/null 2>&1; then
    docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q -c "$1"
  else
    return 3
  fi
}

command -v jq >/dev/null || die "jq is required"

# Same guard as seed-max.sh: deleting from a non-local environment is a real
# destructive write against dev/prod — require an explicit CONFIRM=yes.
case "$API" in
  *localhost*|*127.0.0.1*) : ;;
  *)
    [ "${CONFIRM:-}" = "yes" ] || die "API is not localhost ($API). Re-run with CONFIRM=yes to delete from this environment."
    say "Deleting from NON-LOCAL environment: $API"
    ;;
esac

# ---------------------------------------------------------------------------
# Resolve Max's uid (needed to key the Postgres gold cleanup). Empty => absent.
UID_HEX="$(mongo_eval 'const u = db.users.findOne({username:"'"$USERNAME"'"}); print(u ? u._id.toHexString() : "");' | tr -d '[:space:]')"

if [ -z "$UID_HEX" ]; then
  say "No $NAME found — nothing to delete."
  exit 0
fi
say "Found $NAME (uid $UID_HEX)"

# ---------------------------------------------------------------------------
say "Clearing gold ledger (Postgres)"
if pg_exec "DELETE FROM gold_transactions WHERE user_id = '$UID_HEX'; DELETE FROM gold_daily_prices WHERE user_id = '$UID_HEX';"; then
  say "  cleared gold_transactions + gold_daily_prices"
else
  warn "no direct Postgres access — falling back to the API for gold transactions"
  if curl -s -c "$JAR" -X POST "$API/api/auth/login" -H "$JSON" -H "$CSRF" \
       -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" -o /dev/null; then
    ids="$(curl -s -b "$JAR" "$API/api/gold/transactions" | jq -r '.[]?.id // empty' 2>/dev/null || true)"
    n=0
    for id in $ids; do
      curl -s -b "$JAR" -X DELETE "$API/api/gold/transactions/$id" -H "$CSRF" -o /dev/null && n=$((n+1))
    done
    say "  deleted $n gold transaction(s) via API"
    warn "gold_daily_prices has no delete endpoint and no direct Postgres access — price rows for this user remain (harmless; re-seed overwrites the same days). Set POSTGRES_URI to clear them."
  else
    warn "could not log in as $USERNAME — skipping gold cleanup"
  fi
fi

# ---------------------------------------------------------------------------
say "Deleting Mongo data (user, holdings, transactions, snapshots, sessions)"
mongo_eval '
  const u = db.users.findOne({username: "'"$USERNAME"'"});
  if (u) {
    const h = db.holdings.deleteMany({user_id: u._id}).deletedCount;
    const t = db.transactions.deleteMany({user_id: u._id}).deletedCount;
    const s = db.portfolio_snapshots.deleteMany({user_id: u._id}).deletedCount;
    db.sessions.deleteMany({user_id: u._id});
    db.users.deleteOne({_id: u._id});
    print("  holdings=" + h + " transactions=" + t + " snapshots=" + s + " user=1");
  } else { print("  user already gone"); }
'

say "Done. $NAME removed."
