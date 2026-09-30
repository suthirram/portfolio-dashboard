# Local setup

## Prerequisites

* [Docker](https://docker.com) (for MongoDB + Postgres)
* [Go 1.25+](https://go.dev/dl/)
* [Node.js 20+](https://nodejs.org)

## Quick start (local dev)

### 1. Start the databases

MongoDB (portfolio) and Postgres (gold tracking):

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Start the backend

```bash
cd backend
go mod tidy          # first time only
go run . serve
# API runs on http://localhost:8080
```

### 3. Start the frontend

```bash
cd frontend
npm install          # first time only
npm run dev
# App runs on http://localhost:3000
```

Open <http://localhost:3000>

### 4. Seed data (optional)

```bash
cd backend && go run . migrate transactions   # seed opening ledger events for existing holdings
```

### 5. Copy prod data into local/dev DBs (optional)

Clones real data from prod Mongo + Postgres into the local dev stack (Mongo holds stocks/holdings/history/users; Postgres holds the gold ledger — both are dumped together so user ids stay in sync).

Prereqs: `brew install mongodb-database-tools libpq` (for `mongodump`/`mongorestore`/`pg_dump`/`psql`), local dev DBs running (step 1 above).

```bash
./scripts/copy-prod-to-local.sh \
  --prod-mongo-uri 'mongodb+srv://USER:PASS@your-cluster/portfolio' \
  --prod-postgres-uri 'postgres://USER:PASS@PROD_HOST:5432/portfolio?sslmode=require'
```

Restores into `mongodb://localhost:27017/portfolio` and the local Postgres by default — same stack `docker compose -f docker-compose.dev.yml up -d` starts. Override target/source with more flags (`--local-mongo-uri`, `--local-postgres-uri`, `--db-name`, `--dump-dir`) or run `--help` for the full list. The script refuses to restore anywhere that isn't `localhost`/`127.0.0.1`, so it can't accidentally overwrite prod.

## Full stack (Docker)

Builds and runs everything (MongoDB + Postgres + backend + frontend) in Docker:

```bash
docker compose up --build
```

App → <http://localhost:3000>
API → <http://localhost:8080>
OpenAPI spec → <http://localhost:8080/api/specs/openapi.yaml>

After first boot, see [First run & operations](operations.md) to complete the
super-admin onboarding.
