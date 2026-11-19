# PD-059: Wave 2 amendment — Overview (slices 4–7)

* **Status**: Draft; slice implementation starts after this amendment merges
* **Owner**: Codex; product decisions remain with the project owner
* **Updated**: 2026-11-19
* **Implements**: [PRD-015 §4.3](../prds/PRD-015-ui-2.md#43-overview)
* **Technical design**: [DD-015 §1.4, §3](../designs/DD-015-ui-2.md#14-code-layout-and-isolation)
* **Parent plan**: [PD-059](PD-059-ui-2.md)
* **Coordination**: [status board](PD-059-ui-2-status.md)
* **Visual authority**: [owner reference](../visuals/PD-059-ui-2-reference.html)
* **Review companion**: [frames 01–02](../visuals/PD-059-ui-2.html#frame-title)

## 1. Goal and boundaries

Implement the Overview surfaces shown in reference frames 01 and 02 for
UI_2.0: summary cards and detail dialogs, currency/sector grouped holdings,
the Holding details dialog and existing holding actions, and allocation by
holding, sector or currency. The reference is the exact authority for layout,
copy, component order, spacing, colors and responsive behavior. The retained
sidebar and mobile drawer do not move or change.

This amendment unlocks slices 4–7 after it merges. It does not include the
overall performance chart (slice 10), API/schema work, new financial
calculations, or Classic/Glass redesign. Each UI_2.0 page must continue to
use the existing data hooks and services. Existing Add/Edit, transaction
ledger, classification review, opening-date prompt and delete flows remain
the source of truth for their behavior.

## 2. Shared implementation rules

* Put new presentation components in `frontend/src/ui2/overview/`. Keep
  rules in `frontend/src/ui2/overview/overview.css`, imported by that area,
  and scope every selector under `:root[data-ui="ui2"]`. Reuse the Branding
  font token and current theme tokens; do not add fonts, libraries, APIs or
  stored UI state.
* `DashboardPage` remains the data owner for `useHoldings`, `summary`, XIRR,
  prices, gold metrics and mutations. Add a UI_2.0 branch that passes these
  values and callbacks into UI_2.0 components. Classic and Glass keep the
  existing `SummaryCards`, `HoldingsByCurrency`, `Charts`, and modal paths.
  No UI_2.0 component starts a second fetch or copies business calculations.
* Keep existing currency and ledger semantics. UI_2.0 shows the mockup's
  supported INR and EUR figures; it does not create a USD display or infer
  missing financial values. Conversion uses the already returned `eur_rate`
  and preserves its existing inverse display convention. Dividend and Gold
  values come from the current ledger-derived dividend totals and existing
  Gold metrics.
* Breakdown cards open dialogs, never flip or expand inline. A dialog has a
  labelled heading, a visible close control, Escape/backdrop close, focus
  containment and focus restoration. Use the existing `useDialogFocus`
  policy for custom portaled dialogs. If the reference is implemented with a
  native `<dialog>`, use `showModal()` and close it through the native
  lifecycle; do not emulate a modal with a focusable card.
* Holding rows are the single action target. No row action buttons appear in
  the table. The details dialog offers Edit, ledger and Delete actions, and
  invokes the existing callbacks. Missing ledger permission in act-as mode
  hides that action exactly as it does today. Keep owner-scoped protections.
* Sector is an optional grouping, never a filter. Switching grouping keeps
  the same visible holdings and search; currency groups remain distinct.
  Price tone compares the displayed share price with that holding's existing
  previous-close value: above = green, below = red, equal or unavailable =
  blue/neutral exactly as the mockup specifies. Do not substitute intraday
  gain logic or fetch new prices.
* Preserve the current classification review queue, sector badge/navigation
  behavior, opening-date prompt, Add/Edit fields, validation, transaction
  modal and delete confirmation. Restyle these only in the UI_2.0 scope.
  Do not make a second implementation of those forms or rules.
* Allocation view toggles among holding, sector and currency. It uses the
  existing allocation inputs and excludes unpriced or unsupported values
  according to the current `sectorAllocation`/`groupByCurrency` semantics.
  Grouping and selection navigate to the matching holdings; they never
  rewrite filters or classification.

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/ui2/overview/Ui2Overview.tsx` | UI_2.0-only Overview composition and typed props |
| Create | `frontend/src/ui2/overview/Ui2SummaryCards.tsx` | Reference cards and dialog entry points |
| Create | `frontend/src/ui2/overview/Ui2BreakdownDialog.tsx` | Reusable accessible summary breakdown dialog |
| Create | `frontend/src/ui2/overview/Ui2Holdings.tsx` | Currency/sector grouped rows, search, grouping and click handling |
| Create | `frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx` | Holding metrics and Edit / ledger / Delete actions |
| Create | `frontend/src/ui2/overview/Ui2Allocation.tsx` | Holding / sector / currency allocation views |
| Create | `frontend/src/ui2/overview/overview.css` | UI_2.0 scoped layout and theme styles from the reference |
| Create | `frontend/src/ui2/overview/Ui2SummaryCards.test.tsx` | Card values, conversion, dialogs and keyboard behavior |
| Create | `frontend/src/ui2/overview/Ui2Holdings.test.tsx` | Grouping, search, colors, row actions and responsive semantics |
| Create | `frontend/src/ui2/overview/Ui2HoldingDetailsDialog.test.tsx` | Metrics, permissions, actions and dialog lifecycle |
| Create | `frontend/src/ui2/overview/Ui2Allocation.test.tsx` | View switching, totals and selection navigation |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | Pass existing data/actions into UI_2.0 branch; keep legacy branch intact |
| Modify | `frontend/src/features/dashboard/DashboardPage.test.tsx` | UI_2.0 integration and Classic/Glass regression coverage |
| Modify | `frontend/src/ui2/ui2.css` | Only shared Overview layout hooks if the reference requires them |
| Modify | `docs/plans/PD-059-ui-2-status.md` | Slice states and registry entries after each merge |

Before coding, confirm exact props and fields against these existing sources;
they remain authoritative and are reused rather than copied:

* Summary and breakdown values: `components/SummaryCards.tsx` and
  `features/dashboard/DashboardPage.tsx` (`dividendIncome`, invested/current
  totals, day-change inputs and `goldMetrics`).
* Holdings: `features/holdings/useHoldings.ts`, `HoldingsByCurrency.tsx`,
  `HoldingsTable.tsx`, `groupByCurrency.ts`, `groupBySector`,
  `dashboardPriceMovement.ts`, `sectorColors.ts`, and current XIRR helpers.
* Mutations and existing dialogs: `AddEditModal.tsx`, `TransactionsModal.tsx`,
  `ClassificationReview.tsx`, `OpeningDateModal.tsx`, and the existing
  `handleDelete` confirmation in `DashboardPage`.
* Allocation: `SectorAllocation.tsx`, `sectorAllocationData.ts`, and
  existing currency grouping helpers.

No item above authorizes changes to API definitions, code generation,
backend behavior or financial formulas.

## 4. Slice sequence

All implementation branches start from merged `main`, carry `ui-2.0`, and
contain only frontend changes. Every slice stays behind `ui_mode === "ui2"`.

| Order | Branch | Scope | No regression | Adds value | Test anchor |
| --- | --- | --- | --- | --- | --- |
| Amendment | `docs/PD-059-wave2-overview` | This plan and ownership record | Docs only | Unlocks the Overview UI work | markdownlint |
| Slice 4 | `feat/PD-059-overview-cards` | Cards, conversion rate and summary dialogs | Existing summary math and legacy cards unchanged | Clear Overview totals with inspectable breakdowns | `Ui2SummaryCards.test.tsx` |
| Slice 5 | `feat/PD-059-overview-holdings` | Currency and optional sector grouping, searchable rows, price colors | Same holdings and native currency totals; grouping does not filter | Scan the portfolio by currency or sector | `Ui2Holdings.test.tsx` |
| Slice 6 | `feat/PD-059-holding-details` | Click row → details dialog; existing edit, ledger, delete; preserved review/opening flows | Existing forms, auth and ledger actions reused | One details surface exposes holding metrics and actions | `Ui2HoldingDetailsDialog.test.tsx`, `DashboardPage.test.tsx` |
| Slice 7 | `feat/PD-059-overview-allocation` | Holding / sector / currency allocation | Existing allocation semantics reused | Compare portfolio allocation across three groupings | `Ui2Allocation.test.tsx` |

Each implementation PR adds its component to the registry and updates its
row to `merged` only when the PR actually merges. Slice 6 depends on slice 5;
the other slices depend only on the merged shell (slice 2). This sequence
keeps each PR reviewable and gives each slice a user-visible result.

## 5. Slice 4 — summary cards and dialogs

Create `Ui2SummaryCards` with required props typed from the existing `Summary`
and UI data types. Pass values from `DashboardPage`; do not recompute totals
inside the component. Render the reference's cards in its order: invested,
current value, daily change, unrealised/realised P&L, combined P&L and
dividends. Render the single bold `1 EUR = ₹…` conversion rate once in the
reference location, from the existing `summary.eur_rate`. Do not show a
conversion rate per card or show USD.

Each card that has a reference breakdown is a real button. Activating it by
pointer, Enter or Space opens a labelled dialog showing the same card's
underlying INR/EUR stock amounts and any applicable Gold amount. Dialog close
returns focus to its opener. A hidden amount stays unavailable according to
the source data; never coerce `null` into a plausible zero. Do not change the
current gain/loss sign and percent rules. Keep the daily change line's
existing previous-close date and missing-close behavior.

Behavioral tests cover the exact card set and order, formatted INR/EUR and
conversion values, positive/negative/null daily change, each breakdown's
constituents, keyboard activation, Escape/backdrop close and focus return.
The test should fail if a card is omitted, its value is wired to the wrong
source, or the modal fails to open/close.

## 6. Slice 5 — grouped holdings and price tone

Create `Ui2Holdings` as a presentation layer receiving the already filtered
and enriched `HoldingWithPrice[]`, view/grouping state, colors, XIRR and
callbacks from `DashboardPage`. Reuse `groupByCurrency`, `groupBySector`,
`classificationBucket`, `SectorBadge`, `sectorColorsByCurrency`, the existing
day-change helpers and the reference's share-price comparison field. Do not
put `fetchPrices`, summary math, or API calls in this component.

The initial grouping and order match frame 01. Currency is always the outer
group; sector grouping is an optional nested grouping. Search is applied once
to holdings and remains the same on grouping change. The sector badge and
review affordance remain visible and preserve the existing navigation to
classification review. Row selection calls `onSelectHolding(holding)`; do
not render Edit, Delete or Ledger buttons in rows. Style each displayed price
with a non-color label or accessible text alternative so gain/loss is not
communicated by color alone.

Tests prove INR and EUR remain separate, grouping leaves the selected set
unchanged, search stays active, sector colors are stable, above/below/equal/
missing previous-close cases render their required tone and accessible cue,
and clicking a row selects only that holding. Include a narrow viewport
browser case that checks the mockup's column/order behavior without
horizontal page overflow.

## 7. Slice 6 — details and existing workflows

Create `Ui2HoldingDetailsDialog` and open it from a holding row. Show the
mockup's holding identity and the existing values for cost, realised P&L,
dividends and XIRR. Reuse the same number/date formatters and XIRR result
already supplied by `useHoldings`; do not calculate XIRR in the dialog.
Missing XIRR or dividends remain absent/marked as the existing source
requires, not fabricated as a number.

Actions call the page callbacks: Edit opens the existing `AddEditModal`
without changing its fields or validation; ledger opens `TransactionsModal`
only where `onTransactions` is available; Delete uses the existing
confirmation and `remove` flow. After any save, ledger write or delete, close
or refresh exactly as the current page does. Closing the details dialog
restores focus to its triggering row. Opening another holding replaces the
current details content and identity.

Restyle `ClassificationReview` and `OpeningDateModal` through UI_2.0 scoped
CSS or UI_2.0 wrappers only. Keep queue order, Review later, confirmed
classification, skip, opening-date save, prompt suppression during another
modal, owner-only prompt visibility, and act-as behavior. Keep `AddEditModal`
as the single form implementation; add CSS hooks only where required and
prove its existing tests still pass.

Tests cover all visible metrics, absent ledger action when permission is
absent, Edit/Ledger/Delete callback routing, close and focus restoration,
queue advancement, opening prompt close/save and unchanged Add/Edit fields.
Dashboard integration tests verify Classic and Glass still render their
existing detail/action path.

## 8. Slice 7 — allocation views

Create `Ui2Allocation` with the reference's three view choices: holding,
sector and currency. Keep the view control keyboard operable and clearly
indicate the active choice. The active chart/list and legend match the
reference. Reuse the existing allocation calculation for positive priced
holdings and the established exclusion messaging for unsupported or
unpriced values. Currency totals remain separate; do not combine INR and
EUR using a new implicit rate.

Selecting a holding or sector calls the existing page navigation callback
and opens the corresponding holdings grouping. Selecting a currency changes
the displayed allocation only. The allocation component must not mutate
sector classification or the user's holdings filter.

Tests cover each view's data and total, empty/unpriced/unsupported cases,
switching without changing holdings, accessible active state, and selection
callbacks. A browser test compares the component's ordering and responsive
layout with frame 01 at the reference widths 1280, 768 and 390 px.

## 9. Verification and rollout

For each frontend slice, run the focused Vitest file and the existing
component suites it reuses, followed by `npx tsc -b`. Run the required real
browser tests for dialog focus, keyboard access, row interactions and the
three reference widths. Compare Light, Dark and Cyber against the original
mockup; keep the existing branding font, original sidebar, and exact
reference layout. Use the project dev-stack verification flow before
presenting the complete Overview for acceptance.

The amendment itself is docs only. It does not deploy, alter stored data,
merge a slice or start production work. No troubleshooting entry is needed
unless a troubleshooting investigation is performed.
