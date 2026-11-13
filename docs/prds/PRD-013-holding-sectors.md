# PRD-013: Holding sectors and portfolio allocation

* **Status**: Design approved in principle (owner, 2026-11-13); adapt to existing dashboard
* **Owner**: project owner
* **Design**: [DD-013](../designs/DD-013-holding-sectors.md)
* **Rollout**: [PD-056](../plans/PD-056-holding-sectors.md)
* **Visual spec**: [PD-056](../visuals/PD-056-holding-sectors.html)

## 1. Problem

Holdings have a script name and asset type but no sector. Owners cannot see
concentration by sector, browse holdings grouped by sector, or distinguish missing
company information from a fund that has no single company sector.

## 2. Goals

* Automatically classify a new stock by sector using Yahoo company metadata.
* Backfill existing holdings without changing their financial positions.
* Show the sector below the script name and offer separate tables by sector.
* Add an on-demand sector allocation view inside the dashboard Charts tab.
* Ask owners to confirm ambiguous stocks, ETFs, and mutual funds.
* Contact Yahoo directly; add no financial-data library or intermediary service.

## 3. Non-goals

Fund look-through (splitting an ETF/MF across its underlying sectors), historical
sector allocations, automatic trading, portfolio recommendations, rewriting
ledger data, and inferring that a missing sector means an ETF or mutual fund.

## 4. Who uses this

Portfolio owners adding holdings or examining concentration; admins using the
existing region-scoped act-as dashboard. Migration operators backfill existing
holdings. Owners retain control of classifications suggested by a provider.

## 5. Add and edit holding

After entering a Yahoo symbol, a lookup preview shows the company sector and
industry, or explains that classification needs review. Saving a new holding
also performs lookup, even when the user skipped the preview. A lookup failure
must not lose form input or prevent adding the holding. Lookup follows symbol
changes; a late response for an old symbol must never appear as the new result.

When Yahoo reports no sector, fails, or suggests a different asset type, ask:
“How should this holding be classified?” Offer Stock, ETF, and Mutual fund.
The user can choose a stock sector or leave a stock unclassified, confirm a fund
type, or choose Review later. Provider suggestions are clearly suggestions.
Do not label a holding “ETF” solely because its sector is absent.

Manual confirmation persists and is not overwritten by later lookups or
migrations. Changing the Yahoo symbol requires a fresh classification; changing
the script display name or notes does not. Confirmed funds display their asset
type rather than a fabricated company sector.

## 6. Existing holdings and review queue

A backfill attempts classification of existing holdings and records unresolved
items for review. It is safe to rerun, skips completed classifications for the
current symbol, and never overwrites an owner's decision. It preserves share
quantities, prices, transactions, opening dates, currencies, and snapshots.

The dashboard shows a compact “N holdings need review” banner with a Review
action. A review panel supports one item at a time, shows symbol and provider
suggestion where available, and allows the same confirmation choices as Add.
Review later leaves the holding visibly pending without blocking the dashboard.

## 7. Holdings table

Extend the existing dashboard rather than replacing it with the simplified
mockup. Preserve PortfolioHero, SummaryCards, currency summary strips and their
converted secondary values, refresh/loading/error behavior, search, existing
chart options, opening-date prompt, and owner/act-as controls. The sector layout
is an additional presentation of the same holdings and prices.

Both layouts retain the existing table columns and meanings: Script (including
symbol/exchange/type), Shares, Cost Price, Avg Cost/Sh, Share Price (and daily
movement), Current Value, Day Gain, Unrealised Gain, Realised Gain, Dividends,
XIRR, and Actions. Keep row sorting, column highlighting, responsive column
visibility, edit/delete confirmations, and ledger access; ledger remains hidden
in act-as as today. Add the sector badge without removing identity information.

Show a small sector label below the script name. Use a consistent sector color
dot alongside readable text; color alone never conveys classification. Confirmed
funds say ETF or Mutual fund. Unresolved rows say Needs review; a confirmed stock
without a sector says Unclassified stock.

Keep the existing Holdings / All / Nil navigation and currency groups. Add a
By holding / By sector layout switch. By holding retains the existing flat
table. By sector displays all nonempty sectors as separate sections, each with
a heading above its own rounded table, following the owner's grouped-table
screenshot (2026-11-03). No row of sector-filter chips. Fund types, Unclassified
stocks, and Needs review have their own sections. Each section shows its count
and current value in the enclosing currency. Sorting applies within each group.
Position-view selection still applies before grouping; switching layout does
not hide categories or change portfolio-level totals. Desktop column widths
align across sections; narrow screens scroll each table within its card.

Each sector table ends with a subtotal row for invested amount, current value,
and unrealised P&L, plus day gain, realised gain and dividends as in the existing
table footer. Do not add an overall total below the sector sections; the existing
currency summary above the groups remains. The flat By holding layout keeps
its overall total in the table footer, including funds and needs-review holdings
within that currency. Compute aggregate return as total unrealised
P&L divided by total invested, never as a sum or mean of row percentages; show
“—” when total invested is zero. Do not add share quantities across instruments.
Totals follow the selected Holdings / All / Nil view and reconcile across the
two layouts, regardless of how rows are sorted.

Reuse the existing day-gain missing-data behavior: any active holding lacking
the required price/previous close makes that group's day gain unavailable,
rather than showing a partial sum. Keep per-holding XIRR and the existing
currency-level XIRR with their caveats. A sector subtotal shows “—” for XIRR
because no sector-level rate is computed in this feature; do not repeat the
currency rate on every sector or sum/average holding rates. Unit prices and
average cost per share are not additive and have blank subtotal cells.

## 8. Charts tab

Add a Sectors option to the existing chart navigation. Render this view only
when selected; opening it does not trigger another Yahoo lookup. Offer currency
selection and show allocation within the selected currency, avoiding addition
of unlike monetary units. Use current market value as the proposed default.

Show a donut and a ranked legend with category, native value, share, and holding
count. Positive active positions contribute. ETFs and mutual funds are separate
asset-type buckets, labelled as funds without underlying sector breakdown.
Needs review and Unclassified stocks remain visible buckets so missing data
does not inflate known-sector percentages. All positive displayed buckets
share the same denominator. A holding with a missing/failed price is excluded
from value percentages and explicitly counted as unpriced. Empty portfolios
and zero priced value show an explanatory empty state, never NaN or Infinity.
Selecting a legend category opens By sector, scrolls to that category's section,
and moves focus to its heading without hiding the other groups.

## 9. Privacy and resilience

Only ticker symbols and ordinary HTTP session information go to Yahoo. Do not
send quantities, cost bases, account identities, transactions, or passwords.
No downloaded scripts or provider HTML are executed. Provider failure leaves
holdings, prices, ledger operations, and previously saved classifications usable.

## 10. Open questions

The following defaults were proposed to the owner on 2026-11-13 and remain open
for review; they are not recorded as owner-confirmed decisions:

* Review later is available rather than making fund confirmation a blocking step.
* Allocation uses current market value per currency rather than invested cost.
* Funds use separate ETF/MF buckets; look-through allocation is deferred.

RESOLVED (owner, 2026-11-13): replace the sector-filter chip proposal with
separate tables under group headings, based on the owner's sample screenshot.
The By holding / By sector switch and exact styling remain in visual review.

RESOLVED (owner, 2026-11-13): grouped tables need summation and an overall total.
Updated by the owner's subsequent correction: retain sector subtotals, remove
the bottom overall total from By sector, and keep the existing overall table
footer in By holding. Currency summaries remain above the groups (§7).

RESOLVED (owner, 2026-11-13): the grouped design is approved in principle, with
the requirement to adapt it to the existing dashboard and retain its existing
values and controls. The mockup is a layout reference, not a reduced replacement
dashboard. Review later and current-value allocation remain proposed defaults
unless separately confirmed; layout approval alone does not resolve them.

## 11. Success criteria

* A Yahoo-classified stock retains its sector after reload and displays it in
  both the holdings and prices responses, including act-as.
* Failed lookup or missing sector produces a reviewable holding, never automatic
  conversion into a fund. Confirming an ETF or MF survives reload and backfill.
* Migration dry-run changes nothing; applying twice changes no completed row on
  the second run and preserves every financial field.
* For stocks valued at 60 and 20 plus a fund at 20 in one currency, the chart
  reports 60%, 20%, and 20%; another currency does not affect those percentages.
* Sector navigation and confirmation work with keyboard and narrow screens in
  the existing themes and both dashboard UI modes.
