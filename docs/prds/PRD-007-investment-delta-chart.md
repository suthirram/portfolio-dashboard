# PRD-007: Investment delta chart on Transactions

* **Status**: Draft v2 (PRD), owner decisions of 2026-11-02 applied (v2: the
  live row and empty years, from the plan review)
* **Superseded in part by** [PRD-009](PRD-009-investment-delta-from-transactions.md)
  (2026-11-03): the panel now computes its figures from the ledger by
  default; the History-based calculation below remains for accounts the
  super admin switches to it (`delta_from_history`).
* **Owner**: project owner
* **Type**: Product Requirements: the *what* and *why*. The *how* lives in
  [DD-007](../designs/DD-007-investment-delta-chart.md); the rollout in
  [PD-050](../plans/PD-050-investment-delta-chart.md).
* **Visuals**: [PD-050 visual spec](../visuals/PD-050-investment-delta-chart.html) ([published](https://claude.ai/artifact/Q4prvDBoa4Woq55Nu4ndM3))
* **Builds on**: [PRD-006](PRD-006-month-performance.md) investment delta
  (the month card on History), [PRD-004](PRD-004-all-transactions-view.md)
  the all-transactions page.

## 1. Problem

The History month card shows how much money went in during one month
(PRD-006 §4, "Investment delta"). Seeing the pattern across a year means
opening twelve months one by one. The owner wants the year at a glance on
the Transactions page, where the money movements themselves are listed.

## 2. Goals

1. The Transactions page shows a chart of each month's investment delta,
   January to December, for one year at a time.
2. Each bar equals the investment delta the History card shows for that
   month, to the cent.
3. Previous and next arrows move between years.
4. The chart stays out of the way: a collapsible panel just below the
   filters that the user expands when they want it.

## 3. Non-goals (v1)

* **No admin act-as view.** The chart is for the user's own portfolio only;
  on the admin act-as Transactions page the panel is not shown (owner,
  2026-11-02). History has no act-as endpoint, and none is added.
* **No backend change.** The chart is computed in the browser from
  `GET /history` rows.
* **No combined-currency view.** INR, EUR and gold amounts never share an
  axis.
* **No custom range.** Calendar years only.

## 4. Definitions

For the selected column (INR, EUR, or Gold when the user tracks gold) and
each month of the selected year:

* **Investment delta** = the month's closing invested − its opening
  invested, exactly as the History card computes it (PRD-006 §4–§5): the
  opening row is the latest History row before the month, however far back
  (the first row of the month only with no earlier history); the closing
  row is the month's last row. A currency empty on the opening row counts
  as 0.
* **Invested** (the line) = the invested amount on the month's closing row.
* **Today's live row.** During the live window, before today's snapshot
  lands, History adds a tentative row from live prices; the chart uses the
  same row, so the current month includes today's buys and sells and
  still equals the History card.

Worked example (INR, October 2026): 8,98,847.70 − 8,80,021.32 =
**+₹18,826.38**, invested ₹8,98,847.70.

## 5. Behaviour

* **Placement.** A panel just below the Transactions filters (the search
  section), above the subtotals and the table, collapsed by default to a
  handle bar: "▼ Investment delta · 2026". Clicking the bar expands the
  panel; clicking it again (▲) collapses it. The page remembers open /
  closed per browser.
* **After a ledger edit.** Adding, editing or deleting a transaction through
  the page's ledger editor reloads an open panel's year (the backend has
  healed the affected snapshots by then) and today's live row, keeping the
  current chart on screen while it reloads. A collapsed panel fetches
  nothing; it loads fresh rows when next opened.
* **Chart.** Twelve bars, Jan to Dec, one per month: green above zero
  (money added), red below (cost basis sold). A line on its own right-hand
  axis shows invested at each month end. The tooltip shows the month, the
  delta and the invested amount with the currency symbol.
* **Year.** ‹ and › around the year. › is disabled on the current year;
  ‹ is disabled at 2020, History's first year.
* **Currency.** An INR / EUR / Gold switch; only columns with money invested
  on a row dated in that year are offered, Gold only for a gold-tracking
  user. Defaults to the first offered. The latest row before 1 Jan counts
  as January's opening but not as data for the year.
* **Missing months.** A month with no History row has no bar and no line
  point (future months, gaps). A month whose only rows have nothing to
  compare (the first month of data with one row) shows the line point but
  no bar.
* **Loading.** The year is fetched when the panel is first opened and again
  on each year change, not while collapsed. A failed fetch shows the error
  in the panel; an empty year says "No History rows for 2026", including a
  year whose only row is the earlier baseline.
* **Act-as.** Not rendered on `/admin/users/:id/transactions`.

## 6. Success criteria

1. October 2026 (INR) shows a +₹18,826.38 bar and ₹8,98,847.70 on the line,
   the same figures as the History card for that month.
2. ‹ and › change the year and refetch it; › is disabled on the current year.
3. The panel opens and closes, and stays as left after a reload.
4. The admin act-as Transactions page shows no panel.
5. Collapsed, the page makes no History request.
6. Inside the live window, a buy made today shows in the current month's
   bar and line, matching the History card.
7. A year with no History rows of its own shows the empty message, even
   when an earlier row exists.

## 7. Owner decisions (2026-11-02)

| # | Question | Decision |
|---|---|---|
| 1 | What a month's delta is | The History card's investment delta (PRD-006), from History rows |
| 2 | Currencies | One chart with an INR / EUR / Gold switch |
| 3 | The line | Invested at each month end |
| 4 | Placement | Collapsible panel just below the filters (moved from the bottom, 2026-11-03), collapsed by default, state remembered |
| 5 | Admin act-as | Not shown; only the user sees their own |
| 6 | Today's live row | Included, through History's own live-row logic shared with the panel (plan review) |
| 7 | A year with only the earlier baseline row | Empty (plan review) |
