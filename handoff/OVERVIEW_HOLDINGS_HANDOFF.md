# Overview holdings split handoff

## Status

Implemented in UI_2.0 on the homepage overview.

## Decision

The holdings table is split into two currency-specific panels: INR (Indian
Rupee) and EUR (Euro). Each panel has its own heading, holding count, and
independent collapse button. This preserves a single consistent table schema
while making the two markets visually distinct.

## Interaction and accessibility

* The collapse control is a native button with `aria-expanded` and
  `aria-controls`.
* Each table has a currency-specific accessible name and caption.
* The existing responsive stacked table layout remains active on small
  screens.

## Verification

Run `npx vitest run src/ui2/overview/Ui2Holdings.test.tsx` from `frontend`.
