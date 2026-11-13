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

## Rebased backfill branch diverges after pulling

On 2026-11-13, after #289 was squash-merged into the holding-sectors feature
branch, the backfill branch (#288) was rebased onto that updated base. Its
remote still contained the original commits and two merges. Pulling the old
remote history left an unfinished merge, even though both tips had identical
tracked file contents.

Diagnose from the repository root:

```bash
git status
git log --graph --oneline HEAD origin/feat/PD-056-sector-backfill
git diff HEAD origin/feat/PD-056-sector-backfill --stat
git diff --cached --stat
git ls-files -u
```

Observed: the local branch was five commits ahead and eight behind; Git
reported all conflicts fixed but still merging. Both diffs and the unmerged
index listing were empty. This was a history mismatch after rebase, with no
pending content changes.

For this verified empty merge, preserve both histories with backup branches,
then clear the merge state with `git merge --quit`. Publish the rebased branch
using `git push --force-with-lease`, specifying the remote SHA verified after
fetching. The lease must reject an intervening remote update; investigate
instead of retrying with an unconditional force push. This repairs only the
PR branch, leaves the feature base unchanged, and preserves untracked files.

Local backup refs created for this repair:

* `backup/PD-056-backfill-local-20261113` — rebased tip `fdd5f18`.
* `backup/PD-056-backfill-remote-20261113` — remote tip `0ff1a21`.

Verification: clearing the merge state succeeded. The rebased tip's tracked
tree matched the saved remote tip exactly before this documentation update.
Check publication with `git status --short --branch` and
`git rev-list --left-right --count HEAD...origin/feat/PD-056-sector-backfill`;
the expected divergence after publication is `0 0`.
