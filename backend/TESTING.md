# Backend test concurrency

Go already runs packages in separate processes. Tests within a package run
concurrently only when they opt in with `t.Parallel()`. CI caps that concurrency
at four tests per package and retains the race detector. Frontend Vitest files
already run in parallel with isolated environments; this change is backend-only.

## Parallel tests

The following suites opt in at the start of each top-level test, before creating
fixtures:

* `internal/auth/{password,bootstrap,catalogues}_test.go`: independent bcrypt
  inputs, random session IDs, copied catalogues, and per-test Mongo mock clients.
* `internal/controllers/{auth,admin}_test.go`: per-test Mongo mock clients,
  response queues, handlers, request contexts, users, and cookie recorders.
* `internal/services/{ledger,xirr,stock_xirr}_test.go`: in-memory inputs built
  by each test; no shared mutable fixtures, external APIs, or databases.
* `internal/{services,domain,controllers}/classification_test.go` and
  `internal/persistence/holdings_classification_test.go`: pure inputs and
  per-test Mongo mock clients, handlers and profile stubs.
* `internal/services/company_profile_test.go`: each test owns its fake Yahoo TLS
  server, profile service and fake clock. The timeout and caller-cancellation
  tests stay serial because they assert wall-clock bounds.

Subtests stay sequential within these tests. In particular, do not add
`mt.Parallel()` inside an existing `mtest.Run`: parent fixtures and mock response
queues must remain alive and ordered. To parallelize subcases, create the Mongo
mock client inside each parallel `t.Run`, after calling `t.Parallel()`.

## Serial tests

Other tests retain their existing execution model pending individual review.
In particular:

* Configuration and CLI tests use `t.Setenv`, which changes process-wide state.
* Telemetry tests install a global OTel provider and change exporter environment
  variables. Their package runs in a separate process from other packages.
* Postgres persistence tests share `portfolio_test` and truncate gold tables.
  Do not run multiple test processes against that same database simultaneously.

Go runs serial top-level tests before resuming parallel top-level tests. Keep
all fixtures local, avoid package-level mutable caches in tests, and use
`t.Cleanup` for resources needed by parallel descendants. Never shorten bcrypt
costs, add sleeps, or loosen assertions to accommodate concurrency.

## Verification

From `backend/`, run the same command as CI:

```bash
go test -race -shuffle=on -parallel=4 -v ./...
```

Before widening parallel execution, stress the affected packages without the
test cache. Exercise a serial scheduler as well as higher concurrency:

```bash
go test -race -shuffle=on -parallel=1 -count=1 ./internal/auth ./internal/controllers ./internal/services
go test -race -shuffle=on -parallel=8 -count=5 ./internal/auth ./internal/controllers ./internal/services
```

For failures, replace `-shuffle=on` with the printed shuffle seed and select the
affected package/test with `-run`. Passing stress runs are evidence against
interference, not a guarantee that a suite can never be flaky. Postgres tests
skip when no database is reachable; mock-based suites require no database.
