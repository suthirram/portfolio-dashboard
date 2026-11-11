# DD-010: History-first day gain fallback

* **Status**: Draft
* **Owner**: project owner
* **Implements**: [PRD-010](../prds/PRD-010-day-gain-fallback.md)
* **Rollout plan**: [PD-053](../plans/PD-053-day-gain-fallback.md)

## 1. Storage

No migrations or persistent fields. Cache Yahoo previous close with current
price under the existing five-minute symbol TTL.

## 2. Backend

Extend `HoldingWithPrice` in `backend/api/specs/portfolio-api.yaml` with an
optional native-currency `previous_close_price`. Both `/api/prices` and
`/api/admin/users/{id}/prices` use the shared mapper and existing auth gates.
Read `previousClose`, falling back to `chartPreviousClose`, from the existing
one-day Yahoo chart request. Accept only positive finite values. A missing
close does not fail the current-price request. Preserve `GetPrice` behavior
for snapshots, summary, forex, and gold; expose a richer quote to the mapper.

## 3. Computation

Historical per-stock closes override the Yahoo close on matching rows.
Day gain is `(current price - selected close) * current shares`. Remove the
average-cost fallback. No new market-calendar or stale-history filtering.

## 4. Frontend

Regenerate API types. Keep history enrichment for owners, use Yahoo for
unmatched rows and admin act-as. Reuse the selected baseline across rows,
currency cards, and overview; never label purchase-cost gains as daily gains.

## 5. Testing

Mock Yahoo responses to cover field precedence, invalid/missing fields, and
cache reuse. Test owner/admin responses, baseline precedence, unavailable
rows, and unchanged weekend snapshot carry-forward behavior.

## 6. Risks

Yahoo remains unofficial and can omit metadata. History can be older than a
trading session. Current prices can still drift over weekends; this change
does not revise [ADR-0003](../adrs/ADR-0003-per-stock-snapshot-prices.md).
