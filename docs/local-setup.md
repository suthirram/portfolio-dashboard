# Local setup

## Prerequisites

* [Docker](https://docker.com) (for MongoDB + Postgres)
* [Go 1.25+](https://go.dev/dl/)
* [Node.js 20+](https://nodejs.org)

For startup failures, consult the [troubleshooting cookbook](cookbook/README.md),
including [Docker tracing recovery](cookbook/docker-tracing-startup.md).

## Quick start (local dev)

### 1. Start the databases

MongoDB (portfolio) and Postgres (gold tracking):

```bash
docker compose -f docker-compose.dev.yml up -d
```

MongoDB runs as a single-node replica set (`rs0`) because dividend imports
use multi-document transactions; the container's healthcheck initiates the
set on first boot. The backend's default URI is
`mongodb://localhost:27017/portfolio?replicaSet=rs0&directConnection=true`.
An existing dev volume from before the switch: run
`docker compose -f docker-compose.dev.yml up -d --force-recreate mongodb`
once; data is kept.

### 2. Start the backend

```bash
cd backend
go mod tidy          # first time only
go run . serve
# API runs on http://localhost:8080
```

For local tracing, run `make backend-trace` from the repository root instead.
It starts MongoDB, Postgres, Tempo, and Grafana, then runs the backend in the
foreground with tracing enabled against local Tempo. Open Grafana at
<http://localhost:3001>. Stop the backend with Ctrl-C; containers stay running.
This command overrides inherited OTLP endpoints and clears OTLP authentication
headers for the local exporter. `make dev-trace` starts only the containers.

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

### 6. Backfill holding sectors (PD-056)

Use the backend's existing `MONGODB_URI` and `MONGO_DB` configuration for the
intended local/dev database. Verify the target without printing secrets. This
command contacts Yahoo; it writes only holding classification metadata, never
positions, transactions, or snapshots. See [PD-056](plans/PD-056-holding-sectors.md)
for rollout and production approval requirements.

1. Inspect help and preview one owner's small batch. Substitute the owner's
   Mongo ObjectId; a username is not accepted.

   ```bash
   cd backend
   go run . migrate sectors --help
   go run . migrate sectors --user '<owner-object-id>' --limit 10
   ```

2. Inspect the final `sector backfill finished` report: `applied` must be false.
   Check `eligible`, `resolved`, `needs_review`, `skipped`, `conflicts`, `errors`,
   `remaining`, and `rate_limited`. `remaining` counts candidates beyond the
   limit on a completed scan; an early stop does not count unscanned holdings.
   ETF/MF matches remain needs-review until explicitly confirmed by the user.

3. For the approved local/dev target, apply the same bounded scope, inspect the
   report, and repeat until no candidates remain.

   ```bash
   go run . migrate sectors --user '<owner-object-id>' --limit 10 --apply
   ```

   Dry run is the default; only `--apply` writes. Require exactly one of
   `--user` and `--all-users`. The default limit is 100 holdings across the
   selected owners; `--limit 0` explicitly removes that cap. To preview all users:

   ```bash
   go run . migrate sectors --all-users --limit 100
   ```

4. If Yahoo rate-limits lookups or cannot establish a session, the command exits
   nonzero before writing the failed holding. Completed writes remain. Wait for
   recovery and rerun the same command; no retry flag is needed for untouched
   holdings. Ctrl-C also stops before the next write. An isolated symbol failure
   can still be recorded as needs-review while the batch continues.

5. Previously attempted needs-review records are skipped by default. After
   diagnosing the provider problem, deliberately preview a retry before applying:

   ```bash
   go run . migrate sectors --user '<owner-object-id>' --limit 10 --retry-unresolved
   go run . migrate sectors --user '<owner-object-id>' --limit 10 --retry-unresolved --apply
   ```

   Resolved records, including user confirmations, are always skipped. A holding
   edited or confirmed concurrently is counted as a conflict and left untouched.
   Repeating a dry run previews the same candidates because it saves nothing.
   Repeating an apply skips completed attempts. See the
   [Yahoo session cookbook](cookbook/yahoo-profile-session.md) for diagnostics.

Production requires a backup and explicit owner approval before backfill writes;
these local/dev instructions do not authorize a production apply.

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
