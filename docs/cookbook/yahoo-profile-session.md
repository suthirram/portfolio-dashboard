# Yahoo company profile lookups always unavailable (crumb 406)

* Status: Resolved
* Last verified: 2026-11-13
* Environment: local dev, macOS, a European network; backend
  `CompanyProfileService` (PD-056 / DD-013 §3); Yahoo quoteSummary protocol
* Related: [DD-013](../designs/DD-013-holding-sectors.md),
  [ADR-0004](../adrs/ADR-0004-direct-yahoo-classification.md),
  [cookbook](README.md)

## Problem and trigger

A dry run of `migrate sectors` against the local database classified every
holding as needs-review because every Yahoo profile lookup was unavailable.
Price lookups (`/v8/finance/chart`) were working at the time. No data was written.

```text
{"level":"warn","msg":"company profile lookup failed","symbol":"<redacted>","error":"crumb status 406"}
{"msg":"sector backfill finished","applied":false,"users":6,"eligible":5,"resolved":0,"needs_review":5,"remaining":54,"rate_limited":false}
```

## Reproduction and diagnostic aids

From `backend/`, a dry run writes nothing and logs only counts and symbols:

```bash
go run . migrate sectors --all-users --limit 5
```

Check the session bootstrap directly. Use public tickers only, and never
print the crumb or cookie values:

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
# Session cookie: print the Set-Cookie header, value redacted.
curl -s -D - -o /dev/null -A "$UA" -c /tmp/yahoo.jar https://fc.yahoo.com/ \
  | grep -iE '^HTTP|^set-cookie' | sed -E 's/(=)[^;]{6,}/\1<redacted>/'
sleep 3
# Crumb, once per Accept header; space the requests to avoid a 429.
curl -s -o /dev/null -w 'crumb json=%{http_code}\n' -A "$UA" -H 'Accept: application/json' -b /tmp/yahoo.jar https://query1.finance.yahoo.com/v1/test/getcrumb
sleep 3
curl -s -o /dev/null -w 'crumb any=%{http_code}\n' -A "$UA" -H 'Accept: */*' -b /tmp/yahoo.jar https://query1.finance.yahoo.com/v1/test/getcrumb
rm -f /tmp/yahoo.jar
```

Do not list cookies with `awk '!/^#/'` over the jar: curl writes HttpOnly
cookies as `#HttpOnly_…` lines, so that filter hides them. An earlier version
of this entry made exactly that mistake and wrongly reported no cookie.

Observed on 2026-11-13:

* `fc.yahoo.com` answers 404 **and sets the `A3` session cookie**
  (`Domain=.yahoo.com; Secure; HttpOnly`), as the protocol expects.
* The crumb endpoint answered **406** to the backend on every lookup. At
  the same time, curl (default `Accept: */*`) got 429.
* For stretches of the day every Yahoo endpoint, chart included, answered
  429 to this IP, including both crumb variants above.

## Cause and evidence

Confirmed: the backend sent `Accept: application/json` on every request,
including the crumb request, and the crumb endpoint serves plain text. Yahoo
answers that with 406 Not Acceptable, so every lookup became unavailable.

* The session cookie is issued, so the bootstrap step works. (An earlier
  European-consent hypothesis came from the faulty jar check above and had
  no evidence behind it.)
* With only the Accept header changed and nothing else, the same Go dry run
  went from 406 on every lookup to every lookup found (see Verification).
* curl is not a reliable probe: through most of the day curl got 429 from
  every Yahoo endpoint, chart included, even with the app's headers, while
  the Go client was answered normally (406, then 200). Yahoo appears to
  distinguish clients, e.g. by TLS fingerprint. Diagnose from the Go client.
* Not needed: the cookie-less search endpoint
  (`query2.finance.yahoo.com/v1/finance/search`) was considered as a
  replacement but never answered curl's three requests (429). It remains
  untested.

## Solution

Send `Accept: */*` on the cookie and crumb requests, and
`Accept: application/json` only on quoteSummary (PR #289). The fake Yahoo
server in `company_profile_test.go` now refuses a JSON-only crumb request
like the real one, so the regression is covered offline.

The same PR stopped the httpserver tests calling live Yahoo: they built the
server with the real profile service (via `controllers.New`), so CI made live
lookups. They now use `controllers.NewWithProfiles(…, nil)`.

## Verification

From `backend/`, with the fix:

```bash
go run . migrate sectors --all-users --limit 3
```

Observed: `"eligible":3,"resolved":3,"needs_review":0,"errors":0`; three
lookups logged `"outcome":"found"`; nothing written (dry run). The backend
test suite passes, and 24 profile tests fail without the fix.

## Follow-up

None required. When probing Yahoo by hand, prefer a dry run from the Go
client, and space requests to avoid a 429.
