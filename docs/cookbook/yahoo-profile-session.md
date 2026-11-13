# Yahoo company profile lookups always unavailable

* Status: Investigating
* Last verified: not yet verified (observations from 2026-11-13)
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

Not confirmed. Evidence so far:

* The session cookie is issued, so the bootstrap step works. (The earlier
  European-consent hypothesis came from the faulty jar check above and has
  no evidence behind it.)
* Hypothesis (unverified, leading): the 406 comes from the backend sending
  `Accept: application/json` to the crumb endpoint, which serves plain text.
  The backend and curl differ mainly in that header, and 406 means Not
  Acceptable.
* The 429s show that repeated probes throttle this IP, so diagnosis needs
  spaced-out single requests.
* Alternative under test: Yahoo's search endpoint
  (`query2.finance.yahoo.com/v1/finance/search?q=<symbol>&quotesCount=1&newsCount=0`)
  may return `sector`, `industry` and `quoteType` without any cookie or
  crumb, i.e. one request per symbol and no session. At 14:05 on 2026-11-13,
  three spaced requests (TCS.NS, NIFTYBEES.NS, VFIAX) all answered 429 while
  the IP was throttled, so this is still unverified.

## Solution

None yet. Lookups correctly degrade to unavailable, so holding saves keep
working and the dry run wrote nothing. Do **not** run `migrate sectors
--apply` while every lookup is unavailable: each holding would be recorded
as needs-review and need `--retry-unresolved` later.

## Verification

Pending. A fix is verified when the curl steps above show a session cookie
and `crumb=200`, and a `--limit 5` dry run reports resolved holdings.

## Follow-up

Blocker: Yahoo throttling (429) on this IP. Next step, once unthrottled:

1. When the chart endpoint answers 200, first send the three search requests
   above. If they return sector and type, the session flow can be replaced
   (DD-013 §3 and ADR-0004 update first) and the crumb probes are moot.
2. Otherwise run the two crumb probes above.
   `crumb json=406` with `crumb any=200` confirms the Accept hypothesis.
3. If confirmed, send `Accept: application/json` only on the quoteSummary
   request (the crumb gets `*/*`), then repeat a `--limit 5` dry run.
