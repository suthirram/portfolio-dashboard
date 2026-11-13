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
curl -s -o /dev/null -w 'fc=%{http_code}\n' -A "$UA" -c /tmp/yahoo.jar https://fc.yahoo.com/
awk '!/^#/ && NF {print $6}' /tmp/yahoo.jar      # cookie names only
curl -s -o /dev/null -w 'crumb=%{http_code}\n' -A "$UA" -b /tmp/yahoo.jar https://query1.finance.yahoo.com/v1/test/getcrumb
rm -f /tmp/yahoo.jar
```

Observed on 2026-11-13: `fc=404` with an **empty cookie jar** on every attempt.
The crumb endpoint answered 406 to the backend and 429 to curl; both minutes
later and earlier in the day, every Yahoo endpoint, including chart,
answered 429 for a while.

## Cause and evidence

Not confirmed. Evidence so far:

* `fc.yahoo.com` does not set the session cookie for this network, so the
  crumb request carries no session.
* Hypothesis A (unverified): from European networks, Yahoo puts a consent
  flow (`guce.yahoo.com`) in front of the session cookie, and `fc.yahoo.com`
  no longer hands it out. DD-013 §3 says to stop this path, rather than run
  a consent page or provider JavaScript, if that is the requirement.
* Hypothesis B (unverified): the 406 comes from the backend's
  `Accept: application/json` header on the plain-text crumb request.
* The 429s show that repeated probes throttle this IP, so diagnosis needs
  spaced-out single requests.

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

1. Check the response headers of `fc.yahoo.com` and the crumb endpoint once each.
2. Retry the crumb request with `Accept: */*` to test hypothesis B.
3. Run the same probe from the deployed dev runtime (a non-EU egress) to test hypothesis A.
