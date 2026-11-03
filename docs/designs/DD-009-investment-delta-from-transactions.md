# DD-009: Investment delta from the transactions ledger

* **Status**: Draft v1, owner decisions of 2026-11-03 applied
* **Implements**: [PRD-009](../prds/PRD-009-investment-delta-from-transactions.md)
* **Rollout**: [PD-052](../plans/PD-052-investment-delta-from-transactions.md)
* **Visuals**: [PD-052 visual spec](../visuals/PD-052-investment-delta-from-transactions.html) ([published](https://claude.ai/artifact/PXcEJhW656MgPrhmNDKhUs))

## 1. Approach

One read-only endpoint computes the panel's twelve months on the server,
reusing the replay the History heal already uses, so a month end reads the
cost basis a healed History row on that day would hold. The frontend keeps
its chart and switches only where the months come from. A per-user flag on
the shared super-admin switch path selects the PD-050 version.

| Need | Reused | New |
|---|---|---|
| A holding's position on a day | `asOfLedger` + `RecomputePosition` (History heal) | `investedOn` sums shares × average cost per currency |
| Currency of a holding | `CurrencyOf` | — |
| Gold invested per date | the gold store's `ListTransactions` | `GoldService.InvestedOn` + pure `goldInvestedOn` (purchases only, no price); `GoldInvested` interface (nil = no gold) |
| IST "today" | `istToday` | `istDayOf(instant)`, so tests pin the day |
| Money rounding | `round` (history.go) | — |
| Super-admin per-user switch | gold / premium handlers | `setUserFlag`, shared by all three |
| Chart and its month shape | `InvestmentDeltaChart`, `MonthlyInvestment` | the panel maps the API months onto it |

## 2. API

* `GET /transactions/investment-delta?year=YYYY` → `InvestmentDelta`
  (`getInvestmentDelta`), own portfolio. 400 when `year` is before 2020 or
  after the current IST year.
* `InvestmentDelta { year, columns: InvestmentDeltaColumn[] }`;
  `InvestmentDeltaColumn { column: INR|EUR|GOLD, months: InvestmentDeltaMonth[12] }`;
  `InvestmentDeltaMonth { month0, invested, delta }`: all three required;
  `invested` and `delta` are `null` after today (an explicit null, not a
  missing key).
* `User.delta_from_history: boolean` (required in the schema; omitted in
  Mongo = false).
* `PUT /admin/users/{id}/delta-from-history` with `UserFlagToggleRequest
  { enabled }` → 204 / 403 (not the super admin) / 404
  (`adminSetUserDeltaFromHistory`); route tier `tierSuperAdmin`.

## 3. Computation (`TransactionsService.InvestmentDelta`)

1. `today = istDayOf(now)`; validate the year.
2. `HoldingStore.ListByUser`, `TransactionStore.ListByUser`; group the
   events by holding.
3. `monthEnds(year, today)`: 31 Dec of the year before, then each month's
   last day (today for the current month); later months have no day.
4. For each day, `investedOn(holdings, ledgers, day)`: per holding,
   `asOfLedger(events, day + 1)` (events dated on or before the day, the
   opening gated on its declared date), `RecomputePosition`, then
   `StocksOwned × AvgCostPrice` added to the holding's `CurrencyOf` bucket.
   An oversold as-of ledger counts at its clamped position, as the heal
   values it.
5. Gold, when `gold` is non-nil: `InvestedOn(userId, days)`, the cash
   paid for the purchases dated on or before each day, from the purchases
   alone. `HistoryOverlay` is not used: it has no value for a date until a
   gold price exists, which would move a purchase into the month of the
   first price and hide Gold for a user with no prices. An error is logged
   and the Gold column left out.
6. `deltaColumns`: per column in chart order (INR, EUR, GOLD), month `m`
   reads `invested = values[m+1]`, `delta = values[m+1] − values[m]`, both
   rounded to cents; a column whose month ends are all zero is left out.

Cost: (months ≤ 12 + 1) × holdings ledger replays per request, in memory,
for one user. No new index or collection.

The controller passes `h.gold` only when the caller has `gold_enabled` and
the gold store is attached (as `attachGoldOverlay` does for History), and
maps `ErrValidation` to 400.

## 4. The switch

`setUserFlag(ctx, userIdHex, field, enabled)` is the body the gold and
premium handlers shared: super-admin check, `loadTargetUser` in the
caller's scope, `Users.Update(field, updated_at)`, one log line with the
flag name. The three handlers map its `(allowed, found, err)` to their
403 / 404 / 204 responses. No behaviour change for gold or premium.

## 5. Frontend

* `lib/api/client.ts`: `getInvestmentDelta(year)`,
  `adminSetUserDeltaFromHistory(id, body)`, the `InvestmentDelta` and
  `UserFlagToggleRequest` types.
* `InvestmentDeltaPanel`: `fromHistory = user.delta_from_history`. When
  true, everything is PD-050 (History rows, today's live row). Otherwise it
  loads `getInvestmentDelta(year)` on open, year change and `refreshKey`;
  the columns are the response's; the chart months map `null`s through.
  The live-row hook is inactive; the empty state reads "Nothing invested in
  YYYY".
* `AdminUserList`: a super-admin button **Delta from History** / **Delta
  from ledger** next to premium. Its short local names are renamed, since
  the file is now under `lint:changed`.
* User doc: `docs/portfolio-model.md` "Investment delta chart".

## 6. Testing

* Go (behaviour, mtest): `monthEnds` (a past year, the current year ends
  today); `investedOn` (average cost through a sell, the day inclusive, an
  opening from its declared date); `deltaColumns` (delta from the previous
  month end, a column with nothing invested left out, months after today
  empty); `InvestmentDelta` end to end with a pinned clock (INR from the
  ledger and GOLD from a gold source; a gold failure leaves GOLD out; years
  out of range are `ErrValidation`); `goldInvestedOn` (a purchase counts
  from its own day with no price at all, and before a first price entered
  months later); the admin switch (204 writes
  `delta_from_history`, 403 for a region admin, 404 for an unknown user).
  The gold and premium handler tests pass unchanged.
* Vitest: the panel from the ledger (charts the API months, never reads
  History or prices, offers the returned columns, asks for the year shown
  and reloads on `refreshKey`, empty state); the existing PD-050 tests run
  with the switch on; the page reloads the ledger figures after an edit;
  the admin button calls the endpoint.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Ledger and History disagree for a month | expected where History has gaps or unhealed rows; both use the same replay, so healed months match (PRD-009 §6) |
| Gold differs from History's Gold column | only before the first gold price, where History has no value; the ledger version counts the purchases (PRD-009 §5) |
| A large ledger slows the panel | one user's ledger, ≤ 13 in-memory replays per holding, two reads; revisit with a per-request cache if a ledger grows past thousands of events |
| The switch is set and forgotten | the admin list shows its state on every account |
