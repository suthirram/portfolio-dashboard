# PD-059: Wave 4 holding ledger dialog

* **Status**: Plan amendment for slice 15, ready for review
* **Owner**: Codex
* **Product and design**: [PRD-015 §4](../prds/PRD-015-ui-2.md), [DD-015 §1.4](../designs/DD-015-ui-2.md)
* **Rollout**: [Parent plan](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md)
* **Implementation**: [Complete frontend patch and tests](patches/PD-059-s15-ledger.patch)

## 1. Goal and dependencies

Open the selected holding’s ledger from either Overview or Transactions in
UI_2.0. Show the dated event list first, then open an individual event for
editing or start an empty form. Follow `txLedger` and `txEdit` in the
[handoff](../visuals/PD-059-ui-2-reference.html). Keep production ledger
rules, including the ability to correct an existing opening balance and its
realised P&L seed. An opening cannot be created from the event picker.

Slice 2 supplies the account mode and slice 14 supplies the dialog. Both
are merged. The existing pages already open TransactionsModal. Neither the
new Overview rows nor the Transactions redesign is a dependency.

## 2. PR sequence and file map

| Branch | Scope | Regression boundary | Test anchor |
| --- | --- | --- | --- |
| `docs/PD-059-ledger-dialog` | Review and apply the complete proposed diff in a scratch checkout | Documentation only | `git apply --check docs/plans/patches/PD-059-s15-ledger.patch` |
| `feat/PD-059-ledger-dialog` | Slice 15, per-holding ledger list and editor | Classic and Glass retain the current form and table | Fee-inclusive buy and confirmed owner-scoped deletion through the UI_2.0 dialog |

| Action | Frontend file under `src/` | Responsibility |
| --- | --- | --- |
| Extract | `features/holdings/useHoldingLedger.ts` | Existing form, numeric parsing, running basis, reads, mutations and refresh |
| Modify | `features/holdings/TransactionsModal.tsx` | Dispatch at the shared entry point and keep legacy rendering |
| Add | `ui2/transactions/Ui2HoldingLedger.tsx` | List, add, edit and confirm-delete views inside Ui2Dialog |
| Extend | `features/holdings/TransactionsModal.test.tsx` | Exercise the real entry point in each layout |

## 3. Apply and verify

* [ ] After the amendment merges, branch from current main and claim the
  implementation on the board. Use `git switch -c feat/PD-059-ledger-dialog origin/main`.
* [ ] Apply the linked patch from the repository root. Its removed and
  added lines specify the extraction and both views. Run
  `git apply --check docs/plans/patches/PD-059-s15-ledger.patch` and then
  `git apply docs/plans/patches/PD-059-s15-ledger.patch`.
* [ ] Register the shared hook and UI_2.0 dialog on the board. The hook
  receives the holding and optional target owner. Successful writes reload
  that ledger and call the parent refresh. The entry point remounts the
  editor when either identity changes.
* [ ] From `frontend`, run
  `npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`.
  Expect seven tests to pass, including the decimal, validation, preserved
  precision and act-as regressions.
* [ ] Run `REQUIRE_BROWSER_TESTS=1 npm run test:run` and `npm run build`
  from `frontend`. Expect the suite and production build to pass.
* [ ] In the dev stack, open a UI_2.0 holding ledger from Transactions.
  At desktop and phone widths, check the event list, labels, keyboard
  focus, Escape and scrolling in Light, Dark and Cyber. Add a buy with a
  manual fee adjustment, edit its notes and cancel a deletion. Confirm
  deletion and check the holding refresh. Repeat the ledger entry point
  from Overview. Open an existing split and opening to verify ratio and
  realised-seed fields. Check the inline editor in Classic and Glass.
* [ ] Stage the four frontend files listed above and the status board with
  `git add frontend/src/features/holdings/{useHoldingLedger.ts,TransactionsModal.tsx,TransactionsModal.test.tsx} frontend/src/ui2/transactions/Ui2HoldingLedger.tsx docs/plans/PD-059-ui-2-status.md`.
  Commit with `git commit -m '✨ Add the UI_2.0 holding ledger dialog'`.
  Open the frontend PR against main with the `ui-2.0` label.

## 4. Rollout and rollback

The existing per-account interface selection enables the new ledger view.
The change uses the deployed APIs, fee-inclusive cash amounts and server-side
position recomputation. It needs no environment variables or data migration.
Switch an account to Classic or Glass to restore the inline editor.

## 5. Done and next

* [x] Identify the shared entry point and isolate the UI_2.0 view.
* [x] Prepare the complete patch with behavioral tests and check it against main.
* [ ] Merge the amendment and ship the frontend PR.

Next: slice 16 consumes the ledger from the Transactions page.
