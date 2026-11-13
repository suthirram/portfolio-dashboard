# Holding table Actions overlapping XIRR

* Status: Resolved in design preview
* Last verified: 2026-11-13
* Environment: PD-056 HTML preview; Chrome at 1440 px, 390 px, and 320 px viewport widths
* Related: [Visual spec](../visuals/PD-056-holding-sectors.html),
  [rollout plan](../plans/PD-056-holding-sectors.md)

## Problem and trigger

After expanding the preview to retain all 12 existing dashboard columns, the
Actions buttons overlapped the neighboring XIRR values. This affected the
layout reference, not the running application's source.

## Reproduction and diagnostic aids

Open the visual spec, switch between By holding and By sector, and scroll each
table horizontally to the Actions column. Check the Edit/Review, Ledger, and
Delete buttons against their own cell's boundaries and the adjacent XIRR cell.

The original fixed-layout table had a 1700 px minimum width, an 8% Actions
column, and 22 px horizontal cell padding. At that width, approximately 92 px
of content space remained for three buttons, which required more space. The
nonwrapping flex container allowed them to overflow to the left.

## Cause and evidence

The column percentage did not reserve sufficient content width after cell
padding. The buttons' intrinsic widths exceeded the available space, and
right-aligned flex content painted into the previous column. DOM-only checks
could confirm column count and totals but could not detect rendered overlap.

## Solution

Use the same explicit pixel-based column widths in both layouts. Reserve 230 px
for Actions and 110 px for XIRR; the complete table has an 1860 px minimum width
and remains inside a horizontally scrollable wrapper. Reduce Actions horizontal
padding to 12 px, allow its flex container to wrap, and keep each button intact.
A subtle divider separates the action cell from XIRR. No data or monetary
calculation changes are involved.

## Verification

Headless Chrome was authorized after the owner's design review. Using an
isolated temporary browser profile, checks at 1440 px and 390 px passed in both
By sector and By holding:

* Five holdings remained present.
* Every action button's rectangle stayed within its action cell and to the
  right of the XIRR cell.
* The document had no horizontal overflow; only table wrappers scrolled.
* No page script errors occurred.

Desktop and mobile screenshots were also inspected after scrolling tables to
their right edge. This verifies the preview layout, not production UI code.

## Follow-up

Preserve action-column sizing and contained table scrolling when adapting the
approved grouping to the existing React table. Include rendered overlap checks;
jsdom alone cannot validate cell geometry.

## Pinned script identity during horizontal scrolling

Problem: both desktop and mobile tables lost the holding identity when scrolled
toward prices or Actions. The first column was an ordinary scrolling cell.

Solution: pin first-column header/body/footer cells to `left: 0` inside each
table wrapper, using opaque surfaces, a higher stacking order and a divider.
Wrap identity text on mobile. Narrow layouts use a 160 px identity column and
148 px Actions column; below 360 px, identity narrows to 128 px so actions remain
reachable. The first 320 px browser run caught buttons obscured by the pinned
column; reducing that identity width corrected it.

Verification: approved isolated Chrome checks passed at 1440 px, 390 px, and
320 px in both layouts at start, midpoint, and end of horizontal scroll. Header,
all five identities, and footer labels stayed at the wrapper's left edge with
opaque backgrounds. All action buttons remained reachable at the right edge;
no page-wide horizontal overflow occurred. Mobile screenshot inspected. The
production React adaptation still needs the same scrolling regression checks.
