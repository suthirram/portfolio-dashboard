# CodeQL flags Yahoo profile requests for request forgery

* Status: Investigating — hardening tested locally; GitHub scanner confirmation pending
* Last verified: 2026-11-13
* Environment: PD-056 backend, Go profile client, offline TLS fixtures
* Related: [DD-013](../designs/DD-013-holding-sectors.md),
  [feature PR #296](https://github.com/suthirram/portfolio-dashboard/pull/296),
  [CodeQL alert #5](https://github.com/suthirram/portfolio-dashboard/security/code-scanning/5)

## Problem and trigger

CodeQL reported `go/request-forgery` at `client.Do(req)` in
`backend/internal/services/company_profile.go` (original lines 459–461).
The PR annotation states: `The URL of this request depends on a user-provided value`.

## Reproduction and diagnostic aids

Inspect the alert's paths from profile lookup and holding input to the outbound
request. Previously, the client assembled the quoteSummary URL by concatenating
the configured base, escaped symbol and encoded query before constructing the
request. Run offline request and provider regressions:

```bash
cd backend
go test -race ./internal/services -run 'TestProfileRequest|TestProfileRedirect|TestLookupProfile' -count=1
go test -race -shuffle=on -parallel=4 ./...
golangci-lint run --timeout=1m ./...
```

## Cause and evidence

Observed: user-derived symbol data flowed through the full URL string into the
request constructor. Runtime HTTPS/host allowlisting and redirect checks were
already present; no arbitrary-host bypass was reproduced. The CodeQL annotation
alone does not establish such a bypass. Its upstream
[query guidance](https://codeql.github.com/codeql-query-help/go/go-request-forgery/)
recommends server-owned request targets.

A separate validation gap was found: `.` and `..` matched the ticker alphabet
despite being special path segments. Both are now explicitly rejected.

## Solution

Build the HTTP request using only the configured endpoint. Append the validated
symbol through parsed `URL.Path`, clear stale `RawPath`, and encode query values
through `url.Values.Encode` into `URL.RawQuery`. This keeps scheme and authority
independent of symbol/session data. Retain the exact HTTPS host/port allowlist,
redirect limit, timeout, response limits, pacing and per-request Accept headers.
Reject URL userinfo and opaque URLs for initial requests and redirects.

No alert dismissal, suppression, dependency change, live Yahoo request, or
database write is part of this fix. The change is isolated on
`fix/PD-056-profile-request-safety`; the feature PR remains unmerged.

## Verification

Targeted race-enabled tests passed. TLS fixtures prove that encoded ticker and
query values preserve the configured authority, unsafe targets/symbols send no
request, and redirects carrying URL credentials are rejected before a second
request. Existing provider tests cover the normal cookie/crumb/summary flow and
cross-host redirect rejection.

The full race/shuffle suite also passed, and golangci-lint reported zero issues.
The local CodeQL CLI is not installed;
the GitHub alert must be rechecked against the fix
before claiming the scanner finding is cleared.

## Follow-up

Open the backend fix PR against the feature branch. Leave it and #296 unmerged
pending owner instruction. After the fix lands, inspect CodeQL's fresh analysis
on #296 and confirm alert #5 is resolved; if it persists, inspect the remaining
data-flow path. Do not dismiss it merely because behavioral tests pass.
