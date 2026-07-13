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

## Symbol format (Yahoo Finance)

| Exchange | Format | Example |
|---|---|---|
| NSE | `TICKER.NS` | `TCS.NS`, `GOLDBEES.NS` |
| BSE | `TICKER.BO` | `RELIANCE.BO` |
| US (NYSE/NASDAQ) | Plain ticker | `AAPL`, `SPY` |

Use the **Test** button in the Add/Edit modal to verify a symbol before saving.
