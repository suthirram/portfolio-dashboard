# PRD-003: Physical gold tracking

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Type**: Product Requirements — the *what* and *why*. The *how* (storage,
  API surface, UI wiring) lives in the companion design doc DD-003 and the
  rollout plan in PD-043. The dev-environment deploy pipeline this feature
  will be tested on is PD-044.

## 1. Problem

The dashboard today tracks stocks and ETFs whose prices come from Yahoo
Finance. Physical gold behaves differently:

* There is **no live price feed**. The owner tracks the local (Chennai)
  per-gram rate by hand, one entry per day.
* A purchase is not "quantity × market price". A jeweler bill carries GST
  (3%), making charges, wastage, and a **billed weight** that can differ
  from the actual weight bought — so a single purchase needs a dozen
  fields to reconcile "what the gold should have cost" against "what was
  actually paid".
* Performance questions are different: XIRR of the physical purchases,
  average cost per gram, and a comparison against the paper-gold position
  (GOLDBEES ETF) already tracked in the stocks table.

PRD-002 §3 explicitly deferred gold as a holding type. This PRD picks it up.

## 2. Goals

1. A **separate Gold page** (not part of the main dashboard) where an
   enabled user can:
   * record **gold purchase transactions** with the full bill-reconciliation
     column set (§5),
   * record the **daily per-gram gold price**, and
   * see a **metrics table** (§6) including XIRR of the physical purchases.
2. **Daily price discipline**: the user is expected to enter the gold price
   every day. When one or more days are missing, the Gold page **prompts
   the user** with the missing dates and lets them fill the gaps in one go.
3. The **History page** gains a **Gold column group** — Amount invested,
   Actual value, Daily volatility, P/L % — computed **only from physical
   gold** (GOLDBEES is excluded here; it already lives in the stock
   history).
4. **Per-user enablement**: gold tracking is off by default. Only the
   **super admin** can enable or disable it per user. Users without the
   flag never see the Gold page, its nav link, or the History gold columns.
5. Gold data is private per user — same multi-tenancy rules as PRD-001.

## 3. Non-goals

* **No automatic gold price feed.** Prices are manual by design (the local
  jeweler rate is what matters, not a global spot price).
* **No stored metrics history.** The metrics table (§6) is always computed
  live from the ledger + latest price ("no need to store history for
  this" — owner). The History-page gold columns are likewise **derived on
  read**, not snapshotted.
* **No gold in the daily snapshot cron.** The `snapshot` subcommand and
  `portfolio_snapshots` rows are untouched.
* **No sell / redemption flow in v1.** The observed workflow is
  accumulate-only. Selling physical gold is a follow-up.
* **No multiple purities** (22k vs 24k) as separate tracks in v1. One
  price series per user.
* **No admin act-as for gold.** The super admin can toggle the flag but
  does not get a view into the user's gold data in v1.

## 4. Who uses this

| Role | What they can do |
|---|---|
| **User (gold-enabled)** | Full Gold page: transactions, daily prices, metrics. History gold columns. |
| **User (not enabled)** | Nothing gold-related is visible. Gold API returns 403/404. |
| **Admin** | Same as user for their own portfolio (if enabled). No gold act-as. |
| **Super admin** | Everything a user gets (if enabled for themselves), plus enable/disable gold per user from the admin user list. |

## 5. The gold transactions table

One row per purchase. Columns as specified by the owner, split into
**entered** (user types) and **computed** (derived, shown read-only):

| # | Column | Kind | Meaning / formula |
|---|---|---|---|
| 1 | DATE | entered | Purchase date |
| 2 | gm Price | entered | Per-gram rate for this purchase |
| 3 | Weight | entered | Grams bought (actual) |
| 4 | Gold cost | computed | `gm Price × Weight` |
| 5 | 3% | computed | `Gold cost × 0.03` (GST on gold cost) |
| 6 | Total expected | computed | `Gold cost + 3%` |
| 7 | Gold price in quote | entered | Per-gram rate the jeweler quoted |
| 8 | 3% (on quote) | computed | `Gold price in quote × Weight × 0.03` **(assumption — confirm)** |
| 9 | Amt according to bill | entered | Amount printed on the bill |
| 10 | Actual amt paid | entered | Cash actually paid |
| 11 | Nett per gram value | computed | `Actual amt paid ÷ Weight` |
| 12 | Nett Reduction | computed | **Formula TBD — owner to confirm** (working assumption: `Total expected − Actual amt paid`) |
| 13 | Billed weight | entered | Grams on the bill (can differ from Weight) |
| 14 | LOSS due to NIMMI | computed | **Formula TBD — owner to confirm** (working assumption: `(Weight − Billed weight) × gm Price`) |
| 15 | Chennai rate | entered | Market reference rate that day |

The two TBD formulas are captured as open questions (§9) and MUST be
confirmed against the owner's spreadsheet before the transactions PR ships.
The owner offered real spreadsheet rows; DD-003 will lock the formulas.

## 6. The metrics table

Computed live on every Gold page load. Reference values from the owner's
sheet shown for shape only:

| Metric | Definition |
|---|---|
| Total Amt invested | Σ `Actual amt paid` over all gold transactions |
| Current value | `Total grams × latest daily price` |
| Profit/Loss from Bees (excluding tax loss) | Realised + unrealised P&L of the user's GOLDBEES holding(s) from the live stocks table |
| Nett Profit/Loss excluding bees | `Current value − Total Amt invested` |
| Nett Profit/Loss including bees | previous row + Bees P/L (realised + unrealised, per owner's note) |
| Total gold in grams | Σ `Weight` **(assumption — or Billed weight; confirm)** |
| Avg cost per gram | `Total Amt invested ÷ Total gold in grams` |
| XIRR of physical | XIRR over cash flows: each transaction's `Actual amt paid` as an outflow on its date, current value as the terminal inflow today |

## 7. Daily price entry and the missing-day prompt

* The user enters **one per-gram price per calendar day** (plus the date it
  belongs to). Editing an existing day's price is allowed.
* **Gap detection**: from the date of the user's first gold transaction (or
  first price entry, whichever is earlier) through today, every calendar
  day should have a price. On opening the Gold page, missing days trigger
  a **blocking prompt** (same pattern as the opening-date prompt on the
  dashboard) listing the gaps with inline inputs and a "Save all" action.
  * **Assumption to confirm**: every calendar day including weekends and
    holidays (gold retail rates exist daily), vs. weekdays only.
* Days before the first transaction never prompt.
* The **latest available** price values the position everywhere (metrics,
  history column). A missing today's price falls back to the most recent
  earlier entry.

## 8. History page — gold columns

For gold-enabled users only, each history row gains four values:

* **Gold invested** — Σ `Actual amt paid` of transactions dated on/before
  the row date.
* **Gold actual value** — grams held on/before the row date × the daily
  price for that date (fallback: nearest earlier price).
* **Daily volatility** — % change of *Gold actual value* vs the previous
  row's.
* **P/L %** — `(actual − invested) ÷ invested × 100`.

Owner's worked example: 72 g, today's price 200/g, invested 100/g →
invested `7200`, actual `14400`, volatility `0.00`, P/L `100%`.

These are **computed on read** from the gold ledger + price series; nothing
gold-related is written into `portfolio_snapshots`. GOLDBEES stays in the
stock buckets and is not double-counted here.

## 9. Open questions (resolve in DD-003 review)

1. **Nett Reduction** exact formula (row 12).
2. **LOSS due to NIMMI** exact formula (row 14) — and what NIMMI stands
   for, for the docs.
3. **3% on quote** (row 8) base: quote × weight, or Amt according to bill?
4. **Total grams**: actual `Weight` or `Billed weight`?
5. **Daily price days**: all calendar days, or weekdays only?
6. **GOLDBEES identification**: symbol match (`GOLDBEES.NS`/`.BO`) or
   user-tagged holdings? v1 assumption: symbol match.
7. **"excluding tax loss"** on the Bees metric: is this simply the raw
   realised+unrealised P&L (no tax adjustment applied), or does a tax
   figure need subtracting?

## 10. Success criteria

1. A gold-enabled user records a purchase and every computed column matches
   the owner's spreadsheet for the same inputs.
2. Skipping a day of price entry produces the prompt on next Gold page
   visit; filling it clears the prompt without a reload.
3. Metrics table matches the owner's sheet (±rounding) for the owner's real
   ledger, including XIRR.
4. History page shows the four gold values for enabled users and nothing
   for others.
5. A non-enabled user probing gold API routes gets 403/404, never data.
