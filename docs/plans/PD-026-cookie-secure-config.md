# PD-026: COOKIE_SECURE config flag

Implements the cookie-hardening follow-up flagged in
[PD-022 §Known follow-ups](./PD-022-user-auth-and-multi-tenancy.md) and
in the final review of #23. Today
`handlers.SetSessionCookie` / `ClearSessionCookie` toggle `Secure` /
`SameSite=None` purely on `c.Scheme() == "https"`. That works only as
long as the proxy chain (Cloudflare → Fly) keeps forwarding
`X-Forwarded-Proto`. The day it stops — wrong proxy header config, a
hop added or replaced — the cookie silently downgrades to
`SameSite=Lax` without `Secure`, and the SPA on Pages can no longer send
it cross-origin. The failure mode is a quiet auth break, not a clear
error.

## Goals

* Add `Config.CookieSecure` (bool) sourced from the `COOKIE_SECURE` env
  var (defaults `false` so local dev keeps working). Truthy values:
  `1`, `true`, `yes`, `on`, case-insensitive.
* Plumb the flag through `handlers.New` and `httpserver.New` so
  `SetSessionCookie` and `ClearSessionCookie` decide hardening from the
  config, not from `c.Scheme()`.
* Document the flag in `README.md` and `CLAUDE.md`. The Fly machine sets
  `COOKIE_SECURE=true`; local dev leaves it unset.
* Test that the cookie is emitted with `Secure; SameSite=None` when the
  flag is on and with `SameSite=Lax` (no `Secure`) when off, regardless
  of the request URL scheme.

## Non-goals

* Reading the flag from `c.Scheme()` as a fallback. Whole point of the
  flag is to stop trusting it. The cookie behaviour is fully driven by
  config.
* Other cookie attributes (`Domain`, `Partitioned`, `__Host-` prefix).
  Out of scope; track separately if needed.
* The other PD-022 backend follow-up (single-round-trip holdings
  update). Own PR.

## Build order (each step = test-first)

1. **Config + env wiring** — add `CookieSecure bool` to `Config`, parse
   `COOKIE_SECURE` in `ApplyEnv` via a `parseBool` helper. Tests in
   `config_test.go` cover truthy strings, falsy strings, and missing
   env.
2. **Handler stores it** — `handlers.New(db, logger, cookieSecure)` (one
   extra positional arg; all callers updated). `Handler.cookieSecure`
   read at every cookie write. `SetSessionCookie` /
   `ClearSessionCookie` accept a `secure bool` parameter (no more
   `c.Scheme()`). Existing call sites pass `h.cookieSecure`.
3. **httpserver wires it through** — `httpserver.New(..., cookieSecure
   bool)` and `AuthGate(st, logger, cookieSecure)`; the package's own
   `loadSession` / `refreshSession` pass it to the free cookie
   functions. Update `cmd/serve.go` to pass `cfg.CookieSecure`.
4. **Behaviour test** — in `handlers` (where the cookie functions
   live), drive an HTTP response recorder through `SetSessionCookie`
   with `secure=true` over a plain-HTTP request and assert
   `Secure; SameSite=None`; then with `secure=false` over an HTTPS
   request and assert `SameSite=Lax` with no `Secure`. Both prove the
   decision is config-driven, not scheme-driven.

## Verification run

* `go test ./...` — all packages `ok`.
* `golangci-lint run ./...` — 0 issues.
* `pre-commit run --all-files` — passes.
* Manual smoke (post-deploy): `COOKIE_SECURE=true flyctl deploy`, log in
  from the Pages app, inspect `Set-Cookie` for `Secure` and
  `SameSite=None`.

## Deviations from the design doc

DD-001 §5 says "cookies are `HttpOnly; Secure; SameSite=None` in
production". This PR encodes that as a config decision instead of an
implicit scheme sniff. Same outcome on the prod stack, more robust to
proxy config drift.

## Known follow-ups

* `Domain` attribute (so the cookie scopes to the apex domain, not just
  the API origin). Open question, defer.
* `__Host-pd_session` prefix once we drop the `Domain` attribute idea.
  Defer.

## Rollout

Default for `Config.CookieSecure` is `false`, so dev environments and
the test suite carry on unchanged. Production rollout = set
`COOKIE_SECURE=true` on the Fly app, deploy. Rollback: unset the env,
redeploy.
