# Run Locally — Step by Step

## 0. Prereqs

* Go 1.2x+, Node 18+, Docker Desktop running.

## 1. Clone + install deps

```bash
git clone <repo-url> && cd Portfolio_dashboard
make tidy      # backend: go mod tidy
make install   # frontend: npm install
```

## 2. Start databases

MongoDB (required) + Postgres (gold tracking, optional):

```bash
make dev-db
# or: docker compose -f docker-compose.dev.yml up -d
```

Skip Postgres and gold features disable themselves at boot (503 on `/api/gold/*`) — no config needed.

## 3. (Optional) Tracing stack

Only if debugging with Grafana Tempo:

```bash
make dev-trace
# then run backend with: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 make backend
```

## 4. Start backend (terminal 1)

```bash
make backend
# or: cd backend && go run . serve
```

Runs on `:8080`. Defaults: `MONGODB_URI=mongodb://localhost:27017/portfolio`, `POSTGRES_URI=postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable`, `COOKIE_SECURE=false`. First run bootstraps super admin `admin`/`admin` (must-change-password flow at `/onboarding`).

## 5. Start frontend (terminal 2)

```bash
make frontend
# or: cd frontend && npm run dev
```

Runs on `:3000`. Vite proxies `/api` → `localhost:8080`, no `.env` needed for local dev.

## 6. Log in

* Open `http://localhost:3000`
* Username `admin`, password `admin` → forced onboarding: set real password + 3 security questions.

## 7. Seed data (optional)

```bash
cd backend && go run . migrate transactions   # seed opening ledger events for existing holdings
```

## 8. Copy prod data into local/dev DBs (optional)

Clones real data from prod Mongo + Postgres into the local dev stack (Mongo holds stocks/holdings/history/users; Postgres holds the gold ledger — both are dumped together so user ids stay in sync).

Prereqs: `brew install mongodb-database-tools libpq` (for `mongodump`/`mongorestore`/`pg_dump`/`psql`), local dev DBs running (`make dev-db`).

```bash
./scripts/copy-prod-to-local.sh \
  --prod-mongo-uri 'mongodb+srv://USER:PASS@your-cluster/portfolio' \
  --prod-postgres-uri 'postgres://USER:PASS@PROD_HOST:5432/portfolio?sslmode=require'
```

Restores into `mongodb://localhost:27017/portfolio` and the local Postgres by default — same stack `make dev-db` starts, so this works for local or dev use interchangeably. Override target/source with more flags (`--local-mongo-uri`, `--local-postgres-uri`, `--db-name`, `--dump-dir`) or run `--help` for the full list. The script refuses to restore anywhere that isn't `localhost`/`127.0.0.1`, so it can't accidentally overwrite prod.

## One-shot alternative: full Docker stack

```bash
make prod   # builds + runs Mongo + backend + frontend together
make down   # stop everything (dev-db + prod stacks)
```

## Gotchas

* Postgres down → gold endpoints 503, rest of app fine.
* Changed `backend/api/specs/*` → regen types: `cd backend && go generate -tags tools ./...` and `cd frontend && npm run gen:api`.
