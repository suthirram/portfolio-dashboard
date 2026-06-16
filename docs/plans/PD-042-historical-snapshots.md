# PD-042: Rollout plan — daily historical portfolio snapshots

* **Status**: In progress
* **Owner**: project owner
* **Implements**: [PRD-002](../prds/PRD-002-historical-snapshots.md)
* **Design**: [DD-002](../designs/DD-002-historical-snapshots.md)
* **Tests**: [TDD-002](../designs/TDD-002-historical-snapshots.md)

This is the rollout plan for the historical snapshots feature. PR-by-PR
breakdown, environment changes, and follow-up items that surfaced during
implementation.

## 1. PR sequence

All implementation PRs target the feature branch
`feat/PD-042-historical-snapshots`. The feature branch merges into `main`
in one final PR once every step below has landed.

| # | Branch | Scope |
|---|---|---|
| PR1 | `feat/PD-042-historical-snapshots-prd` | PRD-002 doc |
| PR2 | `feat/PD-042-historical-snapshots-dd` | DD-002 doc |
| PR3 | `feat/PD-042-tdd` | TDD-002 doc |
| PR4 | `feat/PD-042-domain-persistence` | snapshot domain types, `SnapshotStore`, indexes |
| PR5 | `feat/PD-042-snapshot-service` | `internal/services/snapshot.go`, `backend snapshot` cobra subcommand |
| PR6 | `feat/PD-042-history-api` | `/api/history` controllers, OpenAPI spec, codegen regen |
| PR7 | `feat/PD-042-history-ui` | `features/history/` UI — table, chart, conflict dialog, paste, nav link |
| PR8 | `feat/PD-042-deploy` | Cloud Scheduler / docker cron wiring, deps doc |
| Final | `feat/PD-042-historical-snapshots` → `main` | Merge after all of the above |

## 1a. Deploy wiring (PR8)

PR8 ships the cron infrastructure that invokes `backend snapshot` at
00:00 UTC. Three deploy paths are documented here; pick the one that
matches the running stack.

### Cloud Run + Cloud Scheduler (prod, mirrors PD-029)

1. Build and push the same container image already used by the web
   service. The `snapshot` subcommand is part of the same binary.
2. Create a Cloud Run **Job** (not Service) that runs
   `backend snapshot` once per invocation:

   ```bash
   gcloud run jobs create pd-snapshot \
     --image="$REGION-docker.pkg.dev/$PROJECT_ID/pd/backend:$TAG" \
     --region="$REGION" \
     --task-timeout=10m \
     --command=/app/backend \
     --args=snapshot \
     --set-env-vars=LOG_FORMAT=json,MONGODB_DATABASE=portfolio \
     --set-secrets=MONGODB_URI=mongodb-uri:latest
   ```

3. Create the Cloud Scheduler job that fires the Run job:

   ```bash
   gcloud scheduler jobs create http pd-snapshot-daily \
     --schedule="0 0 * * *" \
     --time-zone="Etc/UTC" \
     --uri="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/pd-snapshot:run" \
     --http-method=POST \
     --oauth-service-account-email="$RUNNER_SA@$PROJECT_ID.iam.gserviceaccount.com"
   ```

4. Smoke-test by invoking the job manually:

   ```bash
   gcloud run jobs execute pd-snapshot --region="$REGION" --wait
   ```

### Docker Compose (local / single-host)

For someone running the stack on their own server via the compose
file. Add a sidecar service that periodically `docker exec`s into the
backend container — busybox `crond` is enough:

```yaml
# docker-compose.yml (excerpt)
services:
  pd-cron:
    image: alpine:3.20
    depends_on: [backend]
    command: >
      sh -c "echo '0 0 * * * docker exec backend /app/backend snapshot'
      | crontab - && crond -f -L /dev/stdout"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

Tradeoffs documented inline: this image needs the docker socket
mounted, which is a privileged surface. A safer alternative is a host
cron line:

```cron
0 0 * * * docker exec backend /app/backend snapshot
```

### k8s CronJob (out of v1)

If we move off Cloud Run / single-host docker to a k8s cluster, a
CronJob is the equivalent. Same image, same args. Manifest skeleton
lives in PD-029 follow-ups; defer until the move happens.

### Dev — empty-state and one-shot

Local development does not run any cron. Manual one-shot:

```bash
cd backend
go run . snapshot --date $(date -u +%Y-%m-%d)
```

For testing the catch-up story without waiting for midnight:

```bash
go run . snapshot --date 2026-06-16 --dry-run
```

## 2. Environment changes

* New Mongo collection: `portfolio_snapshots` (created on first index
  ensure via `db.EnsureIndexes`; no manual provisioning).
* New cron schedule in prod: `0 0 * * *` UTC, invoking
  `backend snapshot`.
* No new env vars in v1. v2 (NATS JetStream) will add `NATS_URL` and
  `NATS_STREAM_NAME`.

## 3. Follow-ups (deferred during impl PRs)

This section tracks issues we acknowledged but chose not to fix in the
PR they were spotted in. Each item names the PR it came from so the
next person can see the trail.

### 3.1 `SnapshotStore.Upsert` is FindOne-then-write (race) — from PR4

`SnapshotStore.Upsert` currently does `FindOne` then either `UpdateOne`
or `InsertOne`. Between the two calls, a concurrent caller for the same
`(user_id, date)` can insert the row first, making the second caller's
`InsertOne` fail on the unique compound index.

In the v1 cron-only world this is **theoretical**: only one process
(the `backend snapshot` subcommand) writes cron rows, and a single
user's manual writes go through one HTTP handler, so the window only
opens if the user double-clicks faster than Mongo round-trips. We
intentionally shipped the simple two-step shape so the merge logic
(preserve manual regions, rewrite cron-sourced regions) is readable.

The correct fix is an **aggregation-pipeline update** with `upsert: true`
so the conditional region merge is one atomic command:

```js
db.portfolio_snapshots.updateOne(
  {user_id, date},
  [{$set: {regions: {/* $cond per region: keep if manual, else incoming */}}}],
  {upsert: true},
)
```

**Trigger to do this:** before v2 ships the NATS consumer (which can
deliver the same tick to multiple replicas), or as soon as anyone reports
a duplicate-key error from `Upsert` in logs. Tracked here, not as a
separate ticket.

### 3.2 Sequential per-symbol price fetch — from PR5

`SnapshotService.BuildSnapshot` calls `prices.GetPrice` for every holding
in series. With the 5-minute Yahoo cache shared across users in a single
job run the first user pays the latency, every subsequent user with the
same symbols is a memory hit, so for a small user base this is fine.

For a user with ~50 holdings on a cold cache it is up to ~50 sequential
HTTP calls. If the run starts taking longer than the cron interval can
absorb, parallelise inside `BuildSnapshot` with `errgroup` (per-user)
and keep the cache as the synchronisation point. Tracked here, not as a
separate ticket.

### 3.3 Audit trail on override — from DD-002 §10

When a user overrides a cron region, the original cron value is lost.
DD-002 leaned destructive in v1 for simplicity. Revisit if anyone asks
"can I see what the snapshot said before I edited it?".

### 3.4 Manual-row currency on display-currency change — from DD-002 §10

Manual rows store the currency they were entered in. If the app later
adds a per-user display currency switch, decide whether manual rows
convert or stay frozen.

### 3.6 OpenAPI strict-server migration for /api/history — from PR6

PR6 shipped the `/api/history` endpoints as plain Echo handlers rather
than going through the OpenAPI strict-server scaffolding that the rest
of the API uses. Reason: the request/response shapes were still
churning during the implementation (see PR7's conflict-modal UX), and
locking them into `openapi.yaml` mid-flight would have meant two
codegen round-trips per shape tweak.

Once PR7 is merged and the shapes are stable, migrate the routes:

1. Add `api/specs/history/history.yaml` and component schemas in
   `api/specs/portfolio-api.yaml`.
2. Reference the path file from `api/specs/openapi.yaml`.
3. Regenerate (`go generate -tags tools ./...`, then
   `npm run gen:api`).
4. Move handlers from `controllers/history.go` to strict-server method
   bodies and drop `RegisterHistoryRoutes` from `httpserver/server.go`.

The frontend `lib/api/client.ts` already exists; no FE change is
required for the migration itself, only for any shape tweak.

### 3.7 Snapshot bucketing switched from region to currency — from PR7

The PR7 design-review (Screenshot 2026-06-16 at 13.34.05) revealed
that the region-based bucketing in PR4-6 was wrong: a holding's
invested/current amount is naturally in the holding's currency, but
the snapshot was summing per-region (india/europe/us) without
converting. India happened to be all INR, Europe all EUR and US all
USD only by lucky coincidence of how holdings get created.

This commit (PR7 follow-up) renames the bucket dimension everywhere:

* `domain.Region{India,Europe,US}` → `domain.Currency{INR,EUR,USD}`.
* `domain.AllRegions` → `domain.AllCurrencies`.
* `services.RegionOf(holding)` → `services.CurrencyOf(holding)`.
  Rules: Exchange NSE/BSE → INR; NYSE/NASDAQ/AMEX → USD;
  LSE/XETRA/EURONEXT/FWB/MIL/SIX/AMS/PAR → EUR; otherwise
  `Holding.Currency` wins when it is one of INR/EUR/USD; else
  excluded as `unknown`.
* `PortfolioSnapshot.Regions` field stays named "Regions" for
  storage-shape backwards-compat with PR4-era documents (the field
  is a generic `map[string]RegionSnapshot`), but the **keys** are
  currency codes from now on.
* Frontend `REGIONS`, `RegionKey`, `REGION_LABELS`, `REGION_COLOURS`
  rekeyed to `INR`/`EUR`/`USD`. `CURRENCY_BY_REGION` is now identity
  but kept as a named export so the call sites do not assume the
  key equals the currency code.
* Frontend paste parser now writes `INR`/`EUR`/`USD` rather than
  `india`/`europe`/`us`.

**Migration of dev data:** any existing dev snapshots in the local
Mongo with `regions: {india, europe, us}` are now stale shape. They
will not be read by the new UI but won't cause errors either; drop
the collection or wait for new midnight rows to overwrite. Document
this when PR8 ships the deploy.

**v2 schema follow-up:** when we revisit, rename the field from
`Regions` → `Buckets` (or `Currencies`) and migrate the existing
documents. Pure cosmetic at the data layer but worth doing once the
shape is touched again.

### 3.8 Paste parser — residual real-world edge cases — from PR7

PR7 hardened the paste parser for the most common spreadsheet-copy
output (dd/mm/yyyy dates, ₹/€/$ symbols, thousands commas, trailing
derived columns). User-reported follow-up: the parser still does not
fully handle every clipboard variant seen in practice (specific
breakages not yet enumerated by the reporter).

Investigate in a follow-up PR. Likely candidates:

* Locale-specific decimal commas (e.g. `1.057.757,67`).
* Multi-line cells (newlines inside quoted CSV cells).
* Excess whitespace / non-breaking spaces.
* Mixed delimiters (some cells separated by tab, others by comma).
* Currency symbols other than ₹/€/$/£ (CHF, JPY ¥).
* Rows where a region is left blank vs explicit 0 — currently both
  collapse to "absent"; consider distinguishing.

When the next reporter shares a failing paste, add a regression
fixture to `HistoryPage.test.tsx > describe('parsePasteText')` and
extend `parseAmount` / `normaliseDate` accordingly.

### 3.9 Paste schema strictness — from DD-002 §10

The exact column order, header-row requirement, and date format for
pasted blocks will be fixed in PR7 against real Google Sheets / Excel
output. Lock the decision there.

## 4. Rollback

The feature is additive: a new collection, a new cobra subcommand, a
new route under `/api/history`, and a new frontend page. Rolling back
is:

1. Revert the feature → main merge.
2. Stop the prod cron / Cloud Scheduler job.
3. The `portfolio_snapshots` collection can be dropped or kept; nothing
   else depends on it.

## 5. v2 sketch (informational)

Per DD-002 §7, v2 replaces the external cron with a small
`scheduler-svc` that publishes `portfolio.snapshot.tick` to NATS
JetStream. The backend grows a durable consumer on that subject; the
per-user loop already in v1's snapshot subcommand becomes the consumer
body. JetStream gives us redelivery for free, killing the "missed days
are skipped" behaviour from PRD-002 §5.

v1's `SnapshotStore.Upsert` is already keyed on `(user_id, date)` and
already tolerates re-runs idempotently — so no schema change should be
needed between v1 and v2. The race in §3.1 above is the one place
where v1 will need to harden first.
