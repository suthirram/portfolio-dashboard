# DD-013: Holding sector classification

* **Status**: Design direction approved; dashboard compatibility specified
* **Owner**: project owner
* **Implements**: [PRD-013](../prds/PRD-013-holding-sectors.md)
* **Rollout plan**: [PD-056](../plans/PD-056-holding-sectors.md)
* **Decision**: [ADR-0004](../adrs/ADR-0004-direct-yahoo-classification.md)
* **Dependencies**: [PD-056 manifest](../feature-deps/PD-056-holding-sectors.md)

## 1. Storage and migration

Extend `domain.Holding.Type` and the OpenAPI Holding/HoldingInput type enum with
`mutual_fund`, alongside `stock` and `etf`. Preserve existing values. Add an
optional embedded `classification` object on the holding:

| Field | Meaning |
| --- | --- |
| `symbol` | Trimmed canonical symbol the classification belongs to |
| `status` | `resolved` or `needs_review` |
| `source` | `yahoo` or `user`; omitted for failed lookup without metadata |
| `sector` | Canonical sector key, nullable; stocks only |
| `industry` | Optional provider text, length-limited and rendered as text |
| `suggested_type` | Optional `stock`, `etf`, or `mutual_fund`; never silently applied |
| `checked_at` | UTC timestamp for the attempted lookup or manual decision |

Sector keys are `basic_materials`, `communication_services`, `consumer_cyclical`,
`consumer_defensive`, `energy`, `financial_services`, `healthcare`, `industrials`,
`real_estate`, `technology`, and `utilities`. Keep a backend catalogue of keys,
labels, and accepted Yahoo aliases. Unknown provider sector values require review
rather than expanding the taxonomy automatically. Return the catalogue from the
profile lookup endpoint so the UI does not invent accepted values.

Absent classification or a mismatch between its symbol and the current symbol
is read as needs-review. Source `user` with status `resolved` can represent a
confirmed fund or an explicitly unclassified stock (null sector). For stocks,
a recognized sector plus compatible Yahoo quote type resolves automatically;
ETF/MF suggestions and type mismatches always require confirmation. Funds never
store a company sector. Missing quote type alone does not prove a fund.

All Mongo access stays in `internal/persistence/`. Add typed classification
write methods there rather than leaking `bson` into new service or CLI code.
Backfill writes use owner, holding id, symbol, and the originally read
classification as compare-and-set predicates. A concurrent symbol change or
manual confirmation causes a skip, preventing stale lookup overwrites. No
position field, ledger collection, or snapshot is modified.

Add a Go Cobra command `migrate sectors`, reusing `cliConnect` and store/user
enumeration. Require exactly one of `--user <object-id>` and `--all-users`.
Default to dry-run; only `--apply` writes. Support `--retry-unresolved` to
retry needs-review records; otherwise skip any classification already attempted
for the current symbol. Always skip resolved current-symbol records, including
manual records. Dry-run may contact Yahoo but makes no DB writes. A configurable
`--limit` caps holdings per invocation. Default limit: 100; explicitly selecting
`--limit 0` processes all candidates. Print aggregate counts: eligible, resolved,
needs-review, skipped, conflicts, and errors. Continue after per-symbol provider
failure, but stop the batch after a rate-limit response and report incomplete
work with a nonzero exit. Reruns resume by skipping processed records.

## 2. Backend layout and API

Create a Go `CompanyProfileService` using only standard-library HTTP, cookie,
URL, and JSON packages plus existing logger/OTel dependencies. An injected
`ProfileFetcher` interface keeps holding behavior and migration tests offline.
Wire the same service into `HoldingsService` and the profile preview handler.

Add these routes in `backend/api/specs/openapi.yaml`, with domain operations in
`market/market.yaml`, `holdings/holdings.yaml`, and `admin/admin.yaml`, and
components in `portfolio-api.yaml`:

| Route | Behavior |
| --- | --- |
| `GET /market/profile?symbol=...` | Authenticated symbol lookup; returns profile, catalogue, lookup status |
| `PUT /holdings/{id}/classification` | Owner confirms type and optional sector; returns updated Holding |
| `PUT /admin/users/{id}/holdings/{holdingId}/classification` | Existing admin role/region/onboarding rules, target owner scoped |

`ProfileLookup` returns normalized symbol, `lookup_status` (`found`, `missing`,
`unavailable`), optional sector/industry/suggested type, and the sector catalogue.
Invalid symbol returns 400. Provider failures return an unavailable result with
200, so UI confirmation remains possible. Auth failures retain standard 401/403.
Do not return cookies, crumbs, raw provider error bodies, or private account data.

`HoldingClassificationInput` requires `type` and nullable `sector`; optional
`industry` is not accepted from the user in this slice. Stock accepts a catalogue
sector or null; fund types require null sector. Reject incompatible values with
400. Confirmation requires CSRF and returns 404 for wrong owner or missing id.
Reuse `loadTargetUser` in act-as. Add the admin operation to the tier table.
Expose classification on Holding and HoldingWithPrice via existing mappers,
including all own and act-as list/get/create/update/prices responses.

On create, derive classification before inserting the holding, with a bounded
lookup context; input creation does not depend on preview. Lookup unavailable
becomes needs-review and the existing create flow proceeds. On identity update,
fetch a fresh classification only if canonical symbol or type changes. Do not
overwrite a manual record for notes/name edits. The confirmation endpoint is the
only way to set source `user`; reject attempts to submit provider provenance.

## 3. Provider protocol and safeguards

Use Yahoo-hosted HTTPS endpoints only:

* Cookie bootstrap: `https://fc.yahoo.com/` (accept HTTP error status if the
  response still sets the expected cookie; never execute returned content).
* Session token: `https://query1.finance.yahoo.com/v1/test/getcrumb`.
* Company metadata: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}`
  with `modules=assetProfile,quoteType` and a matching crumb.

This describes an unofficial protocol, not a guaranteed public contract. The
[quote implementation](https://github.com/ranaroussi/yfinance/blob/main/yfinance/scrapers/quote.py)
and [session implementation](https://github.com/ranaroussi/yfinance/blob/main/yfinance/data.py)
are protocol evidence only; do not install, import, or copy a finance wrapper.
Validate this direct Go flow against Yahoo during backend verification. If it
requires browser challenges or executing provider JavaScript, stop that path and
return unavailable; record the evidence in the troubleshooting cookbook.

Use an in-memory cookie jar and crumb, a shared timeout budget of 5 seconds per
lookup including session refresh, a 1 MiB JSON body limit, and 4 KiB crumb limit.
Restrict every request and redirect to the exact HTTPS hostname allowlist above;
disallow cross-host redirects to any other hostname and never disable TLS
verification. Ignore process proxy settings for this client so requests are sent
directly to Yahoo. Reject symbol control characters and URL delimiters; accept
only 1–64 characters from ASCII letters/digits and `.`, `-`, `^`, `=`, `_`.
Use URL path/query encoding even after validation.

Cache successful profiles per normalized symbol for 24 hours, missing profiles
for 1 hour, and unavailable results for 1 minute; cap cache at 1,000 entries.
Deduplicate in-flight lookups and serialize session refresh. On 401/403, discard
session and retry once within the original deadline. On 429, do not retry and
pause outbound lookup attempts for at least 60 seconds (honor longer bounded
Retry-After values); holding creation continues with needs-review. Migration
uses one lookup at a time, at most one new uncached symbol per second.

Only public symbols are sent. Do not log request URLs containing crumbs, cookie
headers, raw response bodies, user portfolio contents, or account credentials.
Log operation, provider status, and outcome using the existing bound request
logger. New service methods use the existing tracer/endSpan convention.

## 4. Computation and frontend

Build a shared `classificationBucket(holding)` helper for badge, grouping, and
chart. A missing/stale/pending classification maps to needs-review. Resolved
funds map to ETF/MF buckets; resolved stocks use sector key or unclassified.
This single helper prevents disagreements between the table and chart.

Reuse `AddEditModal`, `useHoldings`, the act-as routing helpers, and existing
API client. Preview follows symbol edits with debounce and AbortController or
a request-generation guard; submission uses the created/updated holding's
persisted status. After a pending save, keep the classification panel open with
Confirm and Review later, then refresh the holdings. Do not resubmit creation
when confirming, avoiding duplicate holdings.

Add `ClassificationReview` for both post-save and the dashboard review queue.
Use a semantic dialog, labelled type/sector controls, focus trap and restoration,
Escape/Review later dismissal, disabled Confirm while saving, and inline error
feedback that preserves selection. Review all position views, including nil
holdings. Admin act-as confirmation uses the target owner route.

Extend `HoldingsByCurrency` with a By holding / By sector layout selection.
Apply `filterByView`, then existing currency grouping, then classification
grouping within each currency. By sector renders every nonempty category with
a labelled heading, holding count, native current-value subtotal, and separate
rounded `HoldingsTable`, matching the owner's grouped-table reference. Preserve
consistent column widths across sections. Do not add sector-filter chips or
hide sibling categories. Keep currency summaries over all rows in the position
view; distinguish each sector table's own subtotal from the currency summary.
Badges use theme tokens and readable labels; stable catalogue colors accompany,
never replace, text. Layout buttons use `aria-pressed`; tables scroll within
their cards on narrow screens, without forcing page-wide overflow.
Make the first header/body/footer cell sticky at `left: 0` within each table's
scroll wrapper in both layouts and at all viewport sizes. Use opaque theme
surface backgrounds, layered header/footer cells, and a subtle right divider.
Narrow layouts constrain the identity column and wrap script/symbol text;
reserve enough scrollable space for Actions. Verify actual pinned-cell geometry
at the start, middle, and end of horizontal scroll on desktop and mobile.

Reuse `sumTotals` and native currency formatting for each sector table footer.
Do not render a separate overall total beneath sector sections. Preserve the
existing currency summary above those sections and the flat layout's overall
table footer. Include invested, current value, unrealised P&L and aggregate P&L
percentage; no summed quantity. Calculate the percentage from
the aggregate money amounts with a zero-cost guard. Subtotals must sum to the
overall figures including pending and fund buckets; never sum percentages.

Keep the existing `HoldingsTable` column order, formatters, row interactions,
sorting, column highlighting and mobile hidden columns. Use the same component
for each sector rather than implementing a reduced alternative table. Extend its
footer contract with a total label and an explicit optional total XIRR: sector
tables pass no aggregate rate, while the flat table's overall total uses the
existing `xirr.byCurrency` result. Never repeat the currency rate for each sector
or average holding XIRRs. Preserve per-row rates/caveats. Unit-price and quantity
subtotal cells remain blank. Move/extract the existing footer summation into a
shared typed helper if needed so flat, sector, and overall rows cannot diverge;
include native cost/value/unrealised/realised/dividends and existing
`computeGroupDayGain`/`computeGroupDayChange` missing-data semantics. Fix footer
alignment as part of reuse: cost must align with Cost Price, never Avg Cost/Sh.

Retain PortfolioHero, SummaryCards, currency summaries with FX secondary values,
search, refresh, price warnings/loading, opening-date prompting, and owner/act-as
action guards. Search keeps its existing semantics: it filters the table before
position/currency/sector grouping, while top portfolio cards remain portfolio-wide.
Label table totals as the visible selection when search is active. Layout
switching changes no values, scopes, or the existing dashboard theme/shell.

Add `SectorAllocation` inside `Charts` behind the Sectors selector. Reuse
Recharts and current currency formatters. Derive positive native current values
from existing prices; a failed/missing quote stays unpriced and never falls
back to cost basis. Separate currencies, reuse `groupByCurrency` and
`nativeView` where appropriate. Compute category sum / sum of all priced
positive buckets in that currency, including fund and unresolved buckets.
Display percentage to one decimal (rounding may sum to 99.9/100.1); legend values
remain the source of truth. Clicking a category switches to Holdings → By sector,
scrolls to and focuses the matching currency/category section, keeping sibling
groups visible and the position view unchanged. A nonvisual legend exposes
all chart values to keyboard and screen-reader users. Mount only on selection.

Reuse the existing glass UI and theme tokens; no new UI framework or font CDN.
The [visual spec](../visuals/PD-056-holding-sectors.html) illustrates all surfaces
with fictional data and is not the production implementation.

## 5. Testing

Provider tests use `httptest` and injected transport: session cookie/crumb
exchange, recognized sector mapping, missing sector, ETF/MF suggestions,
unsupported taxonomy, invalid symbol, JSON/body limits, timeout, 401 bounded
refresh, 429 cooldown, redirected-host rejection, caching and concurrent lookup.
Never call the live provider from CI.

Behavior tests: automatic create, provider failure preserving creation, stored
classification in prices/list/get/act-as, manual confirmation, validation,
cross-owner 404, out-of-region 404, CSRF, symbol change invalidation and unchanged
metadata edits, missing legacy fields. Migration tests cover dry-run no writes,
scope, idempotence, manual preservation, compare-and-set conflicts, resume, and
financial fields untouched. Use mtest query assertions or pure fake store tests,
not DB-availability error tests.

Frontend: one bucket implementation, sector grouping combined with active/all/
nil, currency isolation, known/unclassified/pending/fund denominators, unpriced
warning, empty state, text labels, review later, explicit fund confirmation,
preserved form on error, stale preview suppression, no duplicate creation,
act-as target, and chart-to-table navigation. Test requests are mocked.

Add regression coverage for all existing table columns and row actions in both
layouts, search scope versus portfolio-wide cards, converted currency stats,
realised/dividends/day-gain subtotals, incomplete day data, footer column
alignment, per-row XIRR caveats and currency XIRR only on the overall footer.

## 6. Risks

Yahoo can restrict metadata access independently of price access. Session
bootstrap may be blocked in some environments; unavailable classification must
remain usable. Slow provider calls add up to 5 seconds to a first creation.
Funds remain asset-type buckets and do not describe underlying sector exposure.
Adding an enum value requires auditing existing type-dependent views/imports;
the frontend receives the new enum only in its separate UI PR. A transient
provider outage can leave a backfill incomplete; use explicit retry-unresolved
after recovery, never erase manual classifications.
