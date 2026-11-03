# PRD-009: Investment delta from the transactions ledger

* **Status**: Draft v1 (PRD), owner decisions of 2026-11-03 applied
* **Owner**: project owner
* **Type**: Product Requirements: the *what* and *why*. The *how* lives in
  [DD-009](../designs/DD-009-investment-delta-from-transactions.md); the
  rollout in [PD-052](../plans/PD-052-investment-delta-from-transactions.md).
* **Visuals**: [PD-052 visual spec](../visuals/PD-052-investment-delta-from-transactions.html) ([published](https://claude.ai/artifact/PXcEJhW656MgPrhmNDKhUs))
* **Builds on**: [PRD-007](PRD-007-investment-delta-chart.md) (the
  investment delta panel on All transactions), the ledger conventions in
  `CLAUDE.md`.

## 1. Problem

The investment delta panel (PRD-007) reads History rows: each month's
figure is the invested amount on the month's last snapshot minus the one
before. History is a daily snapshot, so the panel inherits its gaps: a
month with no snapshot shows no bar, a backdated trade shows only after the
snapshots are healed, and a day the snapshot job missed is missing from the
chart. The ledger already holds every buy and sell, so the chart can be
computed from it directly.

## 2. Goals

1. The panel's figures come from the transactions ledger by default: per
   currency, the cost basis at each month end and its change from the
   previous month end.
2. The super admin can switch an account back to the current History-based
   version (a per-user switch, like gold and premium).
3. Nothing else changes: same panel, same chart, same columns, same years.

## 3. Non-goals (v1)

* Admin act-as: the panel stays on the user's own page only (as PRD-007).
* A switch the user can flip themselves.
* Current (market) value or P&L: the chart is about money invested.

## 4. Definitions

* **Cost basis** of a holding on a day: shares held at the end of that day ×
  their average cost, replayed from the holding's ledger with the
  average-cost method (a buy adds its amount; a sell removes its shares at
  the average cost). This is the figure History stores as *invested*.
* **Month end**: the month's last day; for the current month, today (IST).
  January opens from 31 December of the previous year.
* **Investment delta** of a month: month-end cost basis minus the previous
  month end's. Positive = money added; negative = cost basis sold.
* **Columns**: INR and EUR holdings (by the holding's currency), and Gold
  from the physical-gold purchases, for gold-enabled users, as today.

## 5. Behaviour

* **Default (from the ledger).** Opening the panel loads the year's twelve
  months from the ledger. Every month up to the current one has a bar and a
  line point, even when History has no row for it; months after today are
  empty. A column appears when money was invested at some month end of the
  year.
* **Opening balances.** An opening counts from its declared opening date;
  one with no date set counts from the start, as History does.
* **Gold.** The invested amount of the gold purchases up to each month end.
  If the gold store is unavailable, the Gold column is left out and the
  rest of the chart still shows.
* **Refresh.** After a ledger edit on the page, an open panel reloads, as
  today.
* **Switched to History.** For an account the super admin switched, the
  panel behaves exactly as PRD-007: History rows plus today's live row.
* **The switch.** Admin → Users shows **Delta from History** (or **Delta
  from ledger** when on) to the super admin, on every account including
  their own. It takes effect on the user's next page load.
* **Errors.** A year before 2020 or after the current year is rejected; a
  load failure shows its message in the panel, as today.

## 6. Success criteria

1. With no History rows for a month, the panel still shows that month's bar
   from the ledger.
2. A backdated buy shows in its month immediately after it is saved.
3. For a month whose History rows are complete and healed, both versions
   show the same invested amount.
4. Switching an account to History restores the PRD-007 panel for it, and
   switching back returns to the ledger version.
5. Gold matches the History Gold column at each month end.

## 7. Owner decisions (2026-11-03)

| # | Question | Decision |
|---|---|---|
| 1 | What switches back to the History version? | A per-user flag set by the super admin |
| 2 | What is a month's delta from transactions? | Change in cost basis (the History *invested* figure) |
| 3 | Where is it computed? | A backend endpoint reusing the ledger replay |
| 4 | Gold in the transactions version? | From the gold purchases ledger |
