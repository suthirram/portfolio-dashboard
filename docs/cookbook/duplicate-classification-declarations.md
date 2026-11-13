# Backend build fails on duplicate classification declarations

* Status: Resolved
* Last verified: 2026-11-13
* Environment: local Go backend, `feat/PD-056-sector-backfill`
* Related: [Holding sectors design](../designs/DD-013-holding-sectors.md)

## Problem and trigger

`make backend` fails during compilation, before the HTTP server starts:

```text
internal/services/classification.go:197:5: ErrInvalidClassification redeclared in this block
internal/services/classification.go:201:5: ErrClassificationConflict redeclared in this block
internal/services/classification.go:209:6: ConfirmedClassification redeclared in this block
internal/services/classification.go:242:27: method HoldingsService.ConfirmClassification already declared
```

## Reproduction and diagnostic aids

From the repository root:

```bash
rg -n 'ErrInvalidClassification|ErrClassificationConflict|func ConfirmedClassification|func .* ConfirmClassification' backend/internal/services/classification.go
cd backend
go build -o /tmp/portfolio-backend-classification-fix .
```

Expected: each declaration appears once and the backend builds. Before the
repair, each declaration appeared twice and compilation failed.

## Cause and evidence

The file contained two byte-for-byte identical 97-line blocks defining the
confirmation errors, helper, and service method. The duplicate was present in
the tracked feature-branch source. This is a compile-time declaration conflict.

Origin: `feat/PD-056-sector-backfill` already contained the confirmation code
(from #286 via the #287 landing branch). Merging the feature branch, which
carries the same code as the #287 squash commit, into it auto-merged
without a conflict and appended the block a second time. After merging
stacked branches whose commits were squashed elsewhere, check for duplicate
declarations, e.g. with `go build ./...`, before pushing.

## Solution

Remove the second identical block, preserving the first implementation and
the following `identityChanged` helper. No data or schema changes are needed.
Existing classification tests cover validation, sector naming, owner scoping,
and symbol-change conflicts; preserve their assertions.

## Verification

The backend build passed and the resulting executable's `--help` command
exited successfully. Run the affected suites from `backend/`:

```bash
go test -race -shuffle=on -parallel=4 ./internal/services ./internal/controllers ./internal/persistence
```

The first test attempt hit the sandbox's loopback restriction:
`httptest: failed to listen on a port: bind: operation not permitted`.
The approved rerun outside the sandbox passed all three packages with the race
detector enabled. `golangci-lint run --timeout=1m ./...` also passed with
`0 issues.` HTTP startup and database connectivity were not verified.

## Follow-up

Run `make backend` to resume local development. No additional code changes
are required for the reported compilation error.
