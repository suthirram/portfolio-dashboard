# PRD-006: Month performance card on History

* **Status**: Draft v2 (PRD), owner decisions of 2026-10-31 applied (v2: the baseline is the latest earlier row, however far back)
* **Owner**: project owner
* **Type**: Product Requirements: the *what* and *why*. The *how* lives in
  [DD-006](../designs/DD-006-month-performance.md); the rollout in
  [PD-049](../plans/PD-049-month-performance.md).
* **Visuals**: [PD-049 visual spec](../visuals/PD-049-month-performance.html) ([published](https://claude.ai/artifact/UFs22YQtmgsJYMcQXCoGkD))
* **Builds on**: [PRD-002](PRD-002-historical-snapshots.md) History rows
  (per-currency invested / current), [PRD-003](PRD-003-physical-gold-tracking.md)
  gold overlay on History.

## 1. Problem

Each History row shows a P/L %, but comparing two P/L %s does not show how
the investments performed over a month. New money changes the P/L % without
any market move. The owner works this out by hand at month end:

| Metric | 🇮🇳 India | 🇪🇺 Europe | 🥇 Gold |
|---|---|---|---|
| Opening P/L | 23.44% | 19.75% | 37.79% |
| Closing P/L | 24.40% | 15.68% | 31.05% |
| P/L change | 🟢 +0.96 pp | 🔴 −4.07 pp | 🔴 −6.74 pp |
| Approx. investment performance* | +1.20% | −2.52% | −4.89% |

These figures come from the History rows of 30-09-2026 and 30-10-2026
(October 2026).

## 2. Goals

1. History shows this card for the selected month, computed automatically,
   with no manual entry.
2. The figures equal the owner's hand calculation (§1) to two decimals.
3. Money added during the month is not counted as performance.

## 3. Non-goals (v1)

* **No custom date range.** The card follows the month picker.
* **No dividends** in performance, matching the owner's table.
* **No USD column.** History has only INR and EUR buckets today; the card
  follows them, so a future USD bucket picks it up automatically.
* **No time-weighted or money-weighted return** (TWR / XIRR). The figure is
  an approximation and is labelled one.
* **No new endpoint.** One optional parameter on the existing History list
  supplies the earlier row (§4); everything else is computed in the page.

## 4. Definitions

For each column (each currency bucket, plus gold when the user tracks it):

* **Opening row**: the latest row *before* the month, however far back. This
  is normally the previous month's last day, but a missing snapshot there
  must not move the baseline into the month: with rows on 29-09, 01-10 and
  30-10, October opens on 29-09. Only when no earlier row exists at all
  (the first month of data) does the card open on the month's first row.
* **Closing row**: the month's last row. For the current month this is
  today's live row while no snapshot exists for today, so the card updates
  with the table.
* **Opening / Closing P/L** = (current − invested) ÷ invested on that row.
* **P/L change** = Closing P/L − Opening P/L as displayed (2 dp), in
  percentage points (pp), with 🟢 up / 🔴 down / ⚪ flat.
* **Approx. investment performance** = (closing value − opening value −
  money added) ÷ opening value, where money added = closing invested −
  opening invested. A drop in invested (a sale) is valued at the bucket's
  current-to-cost ratio, the same rule the table's Daily volatlity column
  already uses.

Worked example (India, October 2026): (11,18,139.13 − 10,86,274.39 −
18,826.38) ÷ 10,86,274.39 = **+1.20%**.

## 5. Behaviour

* The card sits above the month table (and above the charts when they are
  moved on top), titled "‹Mon YYYY› performance".
* Each column header shows its two dates, e.g. `30-09 → 30-10`, with
  `(live)` when the closing row is today's live row.
* A column with fewer than two rows that have money invested is left out.
  If no column qualifies, the card is hidden.
* The footnote explains the approximation (new money counted at month end,
  sales at the current-to-cost ratio, dividends excluded).

## 6. Success criteria

1. October 2026 shows exactly the §1 table.
2. A month with a single row shows no card.
3. Selecting another month recomputes the card for that month.
4. Light, dark and cyberpunk themes render the card legibly.

## 7. Owner decisions (2026-10-31)

| # | Question | Decision |
|---|---|---|
| 1 | Performance formula | Flow-adjusted: (ΔValue − ΔInvested) ÷ opening value (§4); verified against the owner's October numbers |
| 2 | Opening baseline | Previous month's last row |
| 3 | USD column | Only when held; History has no USD bucket today, so none |
| 4 | Placement | Card above the month table |
| 5 | Dividends | Excluded |
| 6 | Baseline after a gap | Latest earlier row, fetched by the backend (`include_previous` on `GET /history`); the first-row fallback only with no earlier history |
