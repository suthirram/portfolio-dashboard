# Claude prompt: make the UI_2.0 Overview match its reference

Use this prompt to implement the remaining Overview visual-fidelity work. It is
an implementation brief for Claude; it is not authorization to change product
requirements or to replace working data behavior with mockup data.

## Goal

Bring the shipped UI_2.0 Overview as close as practical to the visual and
interaction design in
[`docs/visuals/PD-059-ui-2-reference.html`](../visuals/PD-059-ui-2-reference.html).
The design reference is the authority for layout, visual hierarchy, copy,
spacing, and responsive presentation. Keep the application’s real data,
loading, error, missing-value, permissions, and navigation behavior.

Before editing, read `CLAUDE.md`, `AGENTS.md`, PRD-015, DD-015, the PD-059
status board, and the Overview amendment. Inspect the current Overview
components and shared primitives. Reuse the existing UI_2.0 components and
tokens; do not create a parallel design system or restyle Classic/Glass.

## Critical reference rule

The handoff HTML defines some functions more than once. JavaScript uses the
last definition at runtime. Find and follow the final runtime definitions for
the Overview summary, holdings, allocation, and performance. Do not copy an
earlier version just because it appears first in the file. In particular,
inspect the runtime `renderSummary`, `renderHoldings`, `renderAllocation`,
and performance renderer, plus their final event handlers and responsive CSS.

## Current implementation to inspect

Start with:

* `frontend/src/features/dashboard/DashboardPage.tsx`
* `frontend/src/features/holdings/HoldingsByCurrency.tsx`
* `frontend/src/ui2/overview/Ui2SummaryCards.tsx`
* `frontend/src/ui2/overview/Ui2Holdings.tsx`
* `frontend/src/ui2/overview/Ui2Allocation.tsx`
* `frontend/src/ui2/overview/OverallPerformance.tsx`
* `frontend/src/ui2/overview/overview.css`
* `frontend/src/ui2/primitives.css`

The recent implementation has improved the allocation panel, tab styling, and
currency-mix card, and keeps holdings together in one workspace grid child.
Those fixes do not make the whole page 1:1 yet. Treat the points below as
specific comparison areas; confirm each against the reference before changing
it, and report any reference detail that conflicts with a locked product rule.

## Visual comparison and required result

### 1. Overview summary

Compare the context row, four summary cards, typography, card proportions,
currency selector, conversion-rate badge, internal spacing, and breakdown
affordances. Match the reference’s visible hierarchy and copy. Do not combine
metrics that the reference keeps separate, move the currency selector, or
replace unknown values with zero. Preserve native-currency breakdowns and the
existing dialogs and focus behavior.

### 2. Holdings workspace

The reference presents the Holdings content as one bordered panel in the left
workspace column. Inside that panel it has, in order:

1. A search field and currency filter in a compact tools row.
2. “By holding” / “By sector” grouping controls.
3. Currency group headers with holding counts and current-value totals.
4. The holdings table, including its sector headings and per-row details.
5. A footer with the visible/total holding count and the “Open a holding for all
   metrics” cue.

Compare this against the current search field above the panel, the existing
shared `HoldingsByCurrency` controls and summary blocks, the table columns,
sector grouping, empty state, and footer. Make the UI_2.0 layout match the
reference while retaining the existing filtering, position-view selection,
sector navigation, and holding-detail/Edit/Ledger/Delete actions. Do not remove
data or controls silently. Keep Classic and Glass on their existing table and
controls.

### 3. Allocation and Currency mix

Match the final runtime allocation panel: title and grouping selector, donut
with a readable count in its center, a color-matched legend with names and
separate percentages, and the explanatory footer. Match the distinct Currency
mix insight card with its eyebrow, heading, two-color horizontal bar,
side-by-side percentages, and supporting copy. Check that colors use the
existing theme tokens and remain legible in Light, Dark, and Cyber themes.

Keep allocation values derived from live holdings. Preserve the behavior for
unpriced holdings, unsupported currencies, missing INR conversion, and the
approved sector jump. Do not use illustrative reference values as production
data.

### 4. Tabs and Performance

Match the reference’s underline tabs, selected state, spacing, and Holdings
count. Preserve the owner-only Performance tab and hide it in act-as mode. The
reference’s chart data is illustrative; production must continue to mount and
use `OverallPerformance` and its real data, controls, loading/error/empty states,
and accessibility behavior. Make the presentation fit the reference without
copying sample values or replacing the production chart with an SVG mock.

### 5. Responsive and themed states

Compare at 1280 px, 768 px, and 390 px, in Light, Dark, and Cyber. Match the
reference’s breakpoints and order: the allocation column sits beside Holdings
on wide screens and stacks below the Holdings panel on narrow screens. The
mobile table treatment must remain readable and must not create page-level
horizontal scrolling. Check the Performance tab, empty/loading states, and
long holding/sector names at narrow width as well.

## Visual workflow

1. Open the handoff HTML and the running application side by side. Use the same
   viewport, theme, and representative data in both. Compare screenshots, not
   memory or component names.
2. Record the mismatches before editing. Fix the page structure first, then
   card dimensions and alignment, then typography, color, borders, and small
   details. Prefer shared tokens and existing primitives over one-off values.
3. Keep each visual fix scoped under the UI_2.0 root selector. Avoid global
   styles that change Classic or Glass.
4. After each group of changes, capture the same viewport again and compare the
   two images. Do not call a page “1:1” unless the visible structure and
   hierarchy have been checked at every required width and theme.

## Acceptance checklist

* [ ] Every Overview region follows the final runtime handoff’s structure,
      order, copy, and visual hierarchy.
* [ ] The holdings tools, group controls, currency headings, table, and footer
      appear inside one coherent panel.
* [ ] Allocation and Currency mix match the reference in shape, legend, color,
      and spacing while displaying live values.
* [ ] Summary and Performance retain correct real data, conversion, missing
      values, loading/error states, permissions, and dialog/focus behavior.
* [ ] At 1280 px, 768 px, and 390 px, the layout matches the reference and
      creates no page-level horizontal overflow.
* [ ] Light, Dark, and Cyber themes preserve contrast and token-based colors.
* [ ] Classic and Glass screenshots and interactions remain unchanged.
* [ ] Add or update behavioral/browser coverage for user-visible behavior that
      the layout changes affect; do not add tests that only mirror CSS.
* [ ] Run the repository’s prescribed frontend checks and report their actual
      output. Include before/after screenshots for the required viewport/theme
      matrix in the PR description or review artifacts.

## Guardrails

* Do not change backend behavior, API contracts, calculations, or mockup data.
* Do not alter owner decisions recorded in the PRD, DD, plan, or status board.
* Do not hide existing actions or remove useful information just to reduce
  visual density.
* Do not make unrelated Overview logic or Classic/Glass changes.
* If the reference and a locked product rule disagree, preserve the product
  rule and report the exact difference for owner review.
