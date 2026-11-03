# Portfolio model

## Columns tracked

| Column | Description |
|---|---|
| Script | Display name (your label) |
| Shares | Quantity held (derived from the ledger) |
| Avg Cost/Share | Average purchase price (derived, average-cost method) |
| Cost Price | Total invested (shares × avg cost) |
| Share Price | Live price from Yahoo Finance |
| Current Value | shares × live price |
| Unrealised Gain | Unrealised P&L (current − cost) |
| Realised Gain | Realised P&L (from shares already sold) |

Each currency section's table shows amounts in its native currency only; the per-currency summary cards carry the converted equivalent at the live exchange rate.

## Transactions ledger

A holding's position is **not** edited directly — it is a projection of that
holding's trade ledger, recomputed on every write using the **average-cost**
method (PRD/DD: derive-from-ledger). Open the **Transactions** modal on a
holding to add events:

| Type | Effect |
|---|---|
| `opening` | Seeds the starting position (shares + total cost) and an optional realised-P&L carry. One per holding; created from the Add-Holding form's opening fields. |
| `buy` | Adds shares for a total debited amount; raises the running cost basis. |
| `sell` | Removes shares for a total credited amount; realises P&L = proceeds − avg-cost × qty. Overselling is rejected. |
| `dividend` | Records cash income; no quantity change. |
| `split` / `bonus` | Scales quantity by a ratio (basis invariant ⇒ avg cost falls). |
| `merger` | Recorded for audit; the position effect is modelled manually. |

Money is entered as the **total cash amount** (fees folded in), matching a
broker statement. Fractional shares are supported.

### Opening date

The opening event carries an **effective date**. The form doesn't ask for it, so
new/migrated openings start with no date set; the dashboard shows a one-time
**"Set opening dates"** prompt listing those holdings so you can set the real
acquisition date (the date picker defaults to `2026-06-15`). A correct opening
date keeps the historical snapshots valuing that holding from the right day.

### Investment delta chart

The **All transactions** page has an **Investment delta** panel just below
the filters (your own portfolio only; not in admin act-as). Expand it for a
Jan–Dec chart: each month's bar is the money added (green) or the cost
basis sold (red), the same figure as the History month card, and the line
is the invested amount at each month end. ‹ › change the year, and the
INR / EUR / Gold buttons switch the currency
([PRD-007](prds/PRD-007-investment-delta-chart.md)). The panel remembers
whether you left it open, and reloads after you edit or delete a
transaction in a holding's ledger, so it matches History.

### Importing trades from a CSV

**Import CSV** on the All transactions page reads a broker's order history
(Groww's columns: Stock name, Symbol, ISIN, Type, Quantity, Value,
Exchange, Execution date and time, Order status; comma- or tab-separated)
and adds each executed buy and sell to its holding's ledger
([PRD-008](prds/PRD-008-trade-csv-import.md)):

* **Dates are day-first**: `1/11/2024` is 1 November 2024, and
  `17-12-2024 03:30 PM` is 17 December 2024; the time only orders trades on
  the same day.
* **Symbols** match a holding without its exchange suffix (`GOLDBEES`
  finds `GOLDBEES.NS`, also on a BSE row). An unknown symbol asks you to
  pick the holding, create a new INR holding, or leave it out.
* **Nothing is duplicated**: a row with the same holding, day, type,
  quantity and value as a saved trade replaces it, so uploading the same
  file twice changes nothing.
* **Opening balances win**: rows on or before a holding's opening date are
  already in that balance and are skipped.
* **All or nothing**: the preview shows every count first; the import then
  saves the trades, new holdings, positions and History together, or
  nothing at all. An admin can import into a user's ledger from act-as.

## Symbol format (Yahoo Finance)

| Exchange | Format | Example |
|---|---|---|
| NSE | `TICKER.NS` | `TCS.NS`, `GOLDBEES.NS` |
| BSE | `TICKER.BO` | `RELIANCE.BO` |
| US (NYSE/NASDAQ) | Plain ticker | `AAPL`, `SPY` |

Use the **Test** button in the Add/Edit modal to verify a symbol before saving.
