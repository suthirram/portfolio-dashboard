---
applyTo: '**_test.go'
---

## Test Strategy

### When unit tests add value

* Non-trivial business logic with complex branching hard to exercise through higher-level tests.
* Error paths that are difficult to trigger from controller or service integration tests.
* Pure functions (e.g. ledger replay logic in `services/ledger.go`, XIRR in `services/xirr.go`).

### When unit tests do NOT add value

* DB availability / DB connection errors — except `persistence.ErrNotFound` (the layer wraps `mongo.ErrNoDocuments` into this sentinel; test that, not the driver error).
* Thin delegation or straightforward data mapping.
* Functions fully exercised by an existing integration-tested path.
* Do not duplicate coverage already provided at a higher layer.

### Test setup and isolation

* Each test sets up its own mock expectations explicitly — no default expectations in shared reset helpers.
* `resetAll()` (or equivalent) only resets/clears mock state — never registers new expectations.
* Extract reusable mock setups into named helper functions called per-test, not globally.
* When adding a new mock dependency, add it to `resetAll()` for cleanup only; call the setup helper per-test.

### In tests

* Use `require.NoError(t, err)` — never silently ignore errors.
* `lo.Must` is allowed only in test code.

### Local test order

1. Targeted tests for changed code only.
2. `make lint` + `go build ./...` — static checks and compilation.
3. `make test` (full suite) only when MongoDB and Postgres are running locally.
