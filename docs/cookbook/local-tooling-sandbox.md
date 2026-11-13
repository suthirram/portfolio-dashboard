# Local Go and GitHub checks fail inside the sandbox

* Status: Resolved
* Last verified: 2026-11-13
* Environment: macOS, Go 1.26.4, isolated Git worktree, agent sandbox
* Related: [Backend test concurrency](../../backend/TESTING.md)

## Problem and trigger

Local PR verification in an isolated worktree returned misleading errors from
the Go linter and GitHub CLI while running inside the agent sandbox.

## Reproduction and diagnostic aids

From `backend/`, the linter failed even though Go tests compiled and passed:

```bash
golangci-lint run --timeout=2m ./...
```

```text
context loading failed: no go files to analyze: running `go mod tidy` may solve the problem
```

`gh auth status` also reported that the default account token was invalid.
Do not copy authentication output or credentials into issue reports.

## Cause and evidence

Observed: rerunning each command outside the sandbox, with owner approval,
succeeded without changing source files, dependencies, or authentication.
The linter returned `0 issues.` and the CLI confirmed authentication through
the system keyring. The exact denied filesystem/keyring operation was not
traced; restricted cache/keyring access is a hypothesis.

## Solution

Request permission to rerun the failing command outside the sandbox. This
does not authorize unrelated commands, dependency changes, or login changes.
Do not run `go mod tidy` or replace the GitHub token based on these errors alone.

## Verification

The same linter command passed outside the sandbox with `0 issues.` and exit
status 0. `gh auth status` also exited 0 outside the sandbox. No dependency or
credential changes were made.

## Follow-up

If the commands also fail outside the sandbox, investigate their actual
configuration and authentication separately; this workaround is then unverified.
