# Ledger validation after Cancel or a cleared date

* Status: Resolved in the proposed implementation
* Last verified: 2026-11-19
* Environment: Slice 15 applied to a scratch checkout of main at `5c2ab7f`
* Related: [Wave 4 holding ledger plan](../plans/PD-059-wave4-ledger.md)

## Problem and trigger

An invalid UI_2.0 amount left a validation message on the list and the next
editor. Submitting a cleared date in Classic raised an unhandled exception.

## Reproduction and diagnostic aids

1. Open Add event on an empty UI_2.0 ledger. Enter Shares `1` and Total amount
   `1,2,3`, save and cancel. The list still displayed “Enter a valid amount”
   and hid “No transactions yet.”
2. In Classic, clear the date and submit. The test runner reported
   `RangeError: Invalid time value`.

## Cause and evidence

The list and editor read the same error state. Resetting the form left that
state populated. Classic passed an empty date to `toISOString()` before its
mutation error handler. Both regression tests failed against the original
slice 15 proposal.

## Solution

Clear the error when resetting the form. Validate the day with
`normaliseDate` before building the RFC3339 payload. Failed validation
returns false and leaves the editor open.

## Verification

From the scratch frontend with the inline implementation applied, run
`npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`.
All 10 tests passed. The cancel test checks both the empty list and the next
editor. The date test checks the inline message and that no write occurs.

## Follow-up

The fixes ship with the slice 15 implementation after plan approval.
