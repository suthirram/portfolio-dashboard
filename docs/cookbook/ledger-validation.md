# Classic ledger date validation

* Status: Resolved in the proposed implementation
* Last verified: 2026-11-19
* Environment: Slice 15 applied to a scratch checkout of main at `5c2ab7f`
* Related: [Wave 4 holding ledger plan](../plans/PD-059-wave4-ledger.md)

## Problem and trigger

Submitting a cleared date in Classic raised an unhandled exception.

## Reproduction and diagnostic aids

In Classic, clear the date and submit. The test runner reported
`RangeError: Invalid time value`.

## Cause and evidence

Classic passed an empty date to `toISOString()` before its mutation error
handler. The regression test failed against the original slice 15 proposal.

## Solution

Validate the day with `normaliseDate` before building the RFC3339 payload.
Failed validation returns false and leaves the editor open.

## Verification

From the scratch frontend with the inline implementation applied, run
`npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`.
The focused ledger tests passed. The date test checks the inline message
and that no write occurs.

## Follow-up

The fixes ship with the slice 15 implementation after plan approval.
