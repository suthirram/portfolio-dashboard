# Reopening review restores a cleared stock sector

* Status: Resolved
* Last verified: 2026-11-13
* Environment: PD-056 frontend, offline Vitest fixtures
* Related: [PRD-013](../prds/PRD-013-holding-sectors.md),
  [DD-013](../designs/DD-013-holding-sectors.md)

## Problem and trigger

An owner explicitly confirms a stock with no sector, then reopens its
classification with Save and review classification. The form used to restore
Yahoo's sector; confirming without edits would replace the owner's choice.

## Reproduction and diagnostic aids

Use a resolved, user-sourced classification with absent or null `sector`, and
nonempty `provider_sector`. Reopen review: the Sector input must remain empty.

```bash
cd frontend
npx vitest run src/features/holdings/ClassificationReview.test.tsx -t 'explicitly unclassified'
```

## Cause and evidence

The backend retains `provider_sector` for provenance while omitting an empty
saved sector. The frontend initializer used `sector ?? provider_sector`,
mistaking an explicit unclassified choice for missing provider data. PR #293's
review identified the mismatch with PRD-013's manual-choice persistence rule.

## Solution

Only suggest `provider_sector` for unresolved classifications. A resolved
classification with no saved sector initializes the field to an empty string.
Confirming it sends `sector: null`, preserving the owner's choice.

## Verification

Both absent and null saved-sector cases pass. The full frontend suite passes
566 tests, with typecheck, ESLint and build also passing. This verification used
fixtures; it did not write a database or exercise a deployed environment.

## Follow-up

Retain the regression cases when changing form defaults or provider suggestions.
