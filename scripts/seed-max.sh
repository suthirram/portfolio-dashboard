#!/usr/bin/env bash
#
# seed-max.sh — seed a demo user "Max Mustermann" with INR + EUR stock
# holdings, a physical-gold ledger, per-holding transactions, and ~3 months
# of daily history snapshots.
#
# Drives the running backend over HTTP for everything the API supports
# (signup, holdings, transactions, gold) and writes the history snapshots +
# the gold-enable flag straight into Mongo (there is no self-serve API for
# either). Idempotent: it deletes any existing Max before re-seeding.
#
# Works against local, dev, or prod — point API at the backend and MONGO_URI
# at that environment's MongoDB. Only the Mongo writes need direct DB access;
# everything else goes through the API. Gold is fully API-driven (the backend
# talks to its own Postgres), so no direct Postgres access is needed.
#
# Prerequisites:
#   - jq, and (for remote envs) a local mongosh on PATH
#   - LOCAL: backend on :8080 + the MongoDB dev container (make dev-db)
#   - DEV/PROD: reachable backend URL + a MongoDB connection URI whose network
#     allowlist admits this host (Atlas IP access list)
#
# Usage:
#   # local (defaults: localhost API + docker container Mongo)
#   ./scripts/seed-max.sh
#
#   # dev / prod (API not on localhost ⇒ CONFIRM=yes required)
#   API=https://api.dev.example.com \
#   MONGO_URI='mongodb+srv://user:pass@cluster/portfolio' \
#   CONFIRM=yes ./scripts/seed-max.sh
#
# Env overrides:
#   API=http://localhost:8080            backend base URL
#   MONGO_URI=<connection string>        direct Mongo access for remote envs;
#                                        when unset, uses the docker container
#   MONGO_CONTAINER=portfolio_mongo_dev  local container name (MONGO_URI unset)
#   MONGO_DB=portfolio                   database name
#   HISTORY_DAYS=90                      snapshot backfill length
#   CONFIRM=yes                          required when API is not localhost
set -euo pipefail

# Load config from scripts/seed.env (override path with SEED_ENV_FILE). Values
# in the file win over the built-in defaults below; see scripts/seed.env.example.
ENV_FILE="${SEED_ENV_FILE:-$(dirname "$0")/seed.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

API="${API:-http://localhost:8080}"
MONGO_URI="${MONGO_URI:-}"
MONGO_CONTAINER="${MONGO_CONTAINER:-portfolio_mongo_dev}"
MONGO_DB="${MONGO_DB:-portfolio}"
HISTORY_DAYS="${HISTORY_DAYS:-90}"

USERNAME="maxmustermann"
NAME="Max Mustermann"
PASSWORD="${PASSWORD:-Passw0rd!23}"
REGION="europe"
JAR="$(mktemp)"
CSRF='X-Requested-With: portfolio-dashboard'
JSON='Content-Type: application/json'
trap 'rm -f "$JAR"' EXIT

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Run a mongosh script: against the given URI for remote envs, else the local
# docker container.
mongo_eval() {
  if [ -n "$MONGO_URI" ]; then
    command -v mongosh >/dev/null || die "mongosh is required when MONGO_URI is set"
    mongosh "$MONGO_URI" --quiet --eval "$1"
  else
    docker exec -i "$MONGO_CONTAINER" mongosh "$MONGO_DB" --quiet --eval "$1"
  fi
}

# POST/PUT helpers: $1 method, $2 path, $3 body. Echo the response body.
req() {
  curl -s -b "$JAR" -c "$JAR" -X "$1" "$API$2" -H "$JSON" -H "$CSRF" -d "$3"
}

command -v jq >/dev/null || die "jq is required"

# Guard: writing a demo user into a non-local environment is a real DB write
# against dev/prod — require an explicit CONFIRM=yes.
case "$API" in
  *localhost*|*127.0.0.1*) : ;;
  *)
    [ "${CONFIRM:-}" = "yes" ] || die "API is not localhost ($API). Re-run with CONFIRM=yes to seed this environment."
    say "Seeding NON-LOCAL environment: $API"
    ;;
esac

curl -sf -o /dev/null "$API/api/specs/openapi.yaml" || die "backend not reachable at $API"

# ---------------------------------------------------------------------------
# Clear any existing Max first — via delete-max.sh so the Postgres gold rows
# (keyed on the old uid) are cleared too, not just the Mongo docs. Every run
# mints a fresh uid, so without this the old gold rows would orphan.
say "Removing any existing $NAME"
"$(dirname "$0")/delete-max.sh"

# ---------------------------------------------------------------------------
say "Creating user $NAME ($USERNAME / $PASSWORD)"
SIGNUP=$(req POST /api/auth/signup '{
  "name": "'"$NAME"'", "username": "'"$USERNAME"'", "password": "'"$PASSWORD"'",
  "region": "'"$REGION"'",
  "security_answers": [
    {"question_id": "favourite_movie", "answer": "metropolis"},
    {"question_id": "favourite_book", "answer": "faust"},
    {"question_id": "first_programming_lang", "answer": "pascal"}
  ]
}')
MUID=$(echo "$SIGNUP" | jq -r '.id // empty')
[ -n "$MUID" ] || die "signup failed: $SIGNUP"
say "  user id: $MUID"

# ---------------------------------------------------------------------------
# Opening dates ~3 months ago so history + positions line up.
OPEN_DATE=$(date -u -v-3m +%Y-%m-%d 2>/dev/null || date -u -d '3 months ago' +%Y-%m-%d)

say "Adding stock holdings (opening $OPEN_DATE)"
# INR holdings (NSE) and one EUR holding (SAP on XETRA → exchange OTHER).
add_holding() {
  req POST /api/holdings "{
    \"script\": \"$1\", \"symbol\": \"$2\", \"exchange\": \"$3\", \"type\": \"stock\",
    \"currency\": \"$4\", \"stocks_owned\": $5, \"avg_cost_price\": $6,
    \"opening_date\": \"$OPEN_DATE\"
  }" | jq -r '.id'
}
H_TCS=$(add_holding "TCS"  "TCS.NS"  "NSE"   "INR" 20  3200)
H_INF=$(add_holding "Infosys" "INFY.NS" "NSE" "INR" 40  1450)
H_SAP=$(add_holding "SAP"  "SAP.DE"  "OTHER" "EUR" 15  128)
say "  TCS=$H_TCS  INFY=$H_INF  SAP=$H_SAP"

# ---------------------------------------------------------------------------
say "Adding transactions (buys, a sell, a dividend)"
# Money on each event is the TOTAL cash amount (fees folded in), not per-share.
txn() { req POST "/api/holdings/$1/transactions" "$2" >/dev/null; }
d() { date -u -v-"$1"d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "$1 days ago" +%Y-%m-%dT%H:%M:%SZ; }

# TCS: a top-up buy and a dividend.
txn "$H_TCS" "{\"type\":\"buy\",\"date\":\"$(d 60)\",\"quantity\":5,\"amount\":16800}"
txn "$H_TCS" "{\"type\":\"dividend\",\"date\":\"$(d 30)\",\"amount\":900}"
# Infosys: a top-up buy then a partial sell (realises P&L).
txn "$H_INF" "{\"type\":\"buy\",\"date\":\"$(d 45)\",\"quantity\":10,\"amount\":15200}"
txn "$H_INF" "{\"type\":\"sell\",\"date\":\"$(d 15)\",\"quantity\":8,\"amount\":13600}"
# SAP: a top-up buy.
txn "$H_SAP" "{\"type\":\"buy\",\"date\":\"$(d 50)\",\"quantity\":5,\"amount\":690}"

# ---------------------------------------------------------------------------
say "Enabling gold for $NAME"
mongo_eval 'db.users.updateOne({username:"'"$USERNAME"'"}, {$set:{gold_enabled:true}});' >/dev/null

if curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$API/api/gold/metrics" | grep -q 503; then
  say "  Postgres/gold is 503 — skipping gold ledger"
else
  say "Adding gold purchases + monthly prices"
  gold_txn() { req POST /api/gold/transactions "$1" >/dev/null; }
  gd() { date -u -v-"$1"d +%Y-%m-%d 2>/dev/null || date -u -d "$1 days ago" +%Y-%m-%d; }
  gold_txn "{\"date\":\"$(gd 85)\",\"gm_price\":6100,\"grams_bought\":10,\"actual_paid\":62830,\"quote_price\":6100}"
  gold_txn "{\"date\":\"$(gd 55)\",\"gm_price\":6250,\"grams_bought\":8, \"actual_paid\":51500,\"quote_price\":6250}"
  gold_txn "{\"date\":\"$(gd 20)\",\"gm_price\":6480,\"grams_bought\":12,\"actual_paid\":80100,\"quote_price\":6480}"
  # Monthly jeweler price series + a current price (bulk upsert).
  req PUT /api/gold/prices "[
    {\"date\":\"$(gd 85)\",\"price_per_gram\":6100},
    {\"date\":\"$(gd 55)\",\"price_per_gram\":6250},
    {\"date\":\"$(gd 20)\",\"price_per_gram\":6480},
    {\"date\":\"$(gd 1)\", \"price_per_gram\":6560}
  ]" >/dev/null
fi

# ---------------------------------------------------------------------------
say "Backfilling $HISTORY_DAYS days of history snapshots"
# Synthesise a rising-with-noise trend per currency. Invested is roughly flat
# (positions were opened at the start); current oscillates around a gentle
# uptrend. Written as cron rows with per-stock lines so the History page's
# per-currency breakdown modal has data.
mongo_eval '
  const uid = ObjectId("'"$MUID"'");
  const days = '"$HISTORY_DAYS"';
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = [];
  // Base positions (match the opening balances above; current drifts).
  const inrInvested = 20*3200 + 40*1450;      // TCS + Infosys opening cost
  const eurInvested = 15*128;                  // SAP opening cost
  for (let i = days; i >= 0; i--) {
    const dt = new Date(midnight.getTime() - i*86400000);
    const t = (days - i) / days;               // 0..1 across the window
    const wobble = Math.sin(i/9) * 0.035;
    const inrCur = Math.round(inrInvested * (1 + 0.12*t + wobble));
    const eurCur = Math.round(eurInvested * (1 + 0.09*t + wobble*0.8));
    const tcsClose = 3200 * (1 + 0.14*t + wobble);
    const infClose = 1450 * (1 + 0.08*t + wobble);
    const sapClose = 128  * (1 + 0.09*t + wobble*0.8);
    rows.push({
      user_id: uid, date: dt, currency: "INR",
      regions: {
        INR: { invested: inrInvested, current: inrCur, source: "cron" },
        EUR: { invested: eurInvested, current: eurCur, source: "cron" },
      },
      holdings: [
        { symbol: "TCS.NS", script: "TCS", currency: "INR", quantity: 20, avg_cost: 3200,
          close_price: Math.round(tcsClose*100)/100, price_date: dt.toISOString().slice(0,10),
          invested: 20*3200, current: Math.round(20*tcsClose) },
        { symbol: "INFY.NS", script: "Infosys", currency: "INR", quantity: 40, avg_cost: 1450,
          close_price: Math.round(infClose*100)/100, price_date: dt.toISOString().slice(0,10),
          invested: 40*1450, current: Math.round(40*infClose) },
        { symbol: "SAP.DE", script: "SAP", currency: "EUR", quantity: 15, avg_cost: 128,
          close_price: Math.round(sapClose*100)/100, price_date: dt.toISOString().slice(0,10),
          invested: 15*128, current: Math.round(15*sapClose) },
      ],
      totals: { invested_total: inrInvested, current_total: inrCur, pnl_pct: 0 },
      created_at: dt, updated_at: dt,
    });
  }
  db.portfolio_snapshots.insertMany(rows);
  print("  inserted " + db.portfolio_snapshots.countDocuments({user_id: uid}) + " snapshot rows");
'

say "Done. Log in as $USERNAME / $PASSWORD"
