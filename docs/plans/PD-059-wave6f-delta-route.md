# PD-059: Wave 6f — Investment delta sub-route (slice 27, R33)

* **Status**: Planned; implementation in review on `feat/PD-059-r33-delta-route`.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: In UI_2.0 the investment delta graph moves off the Transactions page to its own page, `/transactions/delta`. Transactions keeps a compact link card to it, so the ledger table sits higher.
* **Architecture**: `Ui2InvestmentDelta.tsx` gains `Ui2InvestmentDeltaLink` (the card) and `Ui2InvestmentDeltaPage` (page intro, back link, the existing graph at full height). A pure dispatcher `InvestmentDeltaRoute` mounts the page for `ui2` accounts and redirects Classic and Glass to `/transactions`, where their graph stays inline. The graph mounts fresh on every visit, so the Transactions page no longer needs its `ledgerVersion` refresh key.
* **Tech stack**: React 18, TypeScript, React Router, Vitest + Testing Library, the Playwright cutover harness. No backend change.
* **Spec links**: [roadmap](PD-059-roadmap.md) R22 and R33, [status board](PD-059-ui-2-status.md) slice 27, [wave 4b](PD-059-wave4b-transactions.md).

---

## 1. Owner decision

PD-059-Q-6f-1, answered 2026-11-20: **move it**. `/transactions` swaps the inline panel for a link card; `/transactions/delta` holds the full graph. Rejected: keeping the graph in both places, or dropping R33.

## 2. Behaviour

* UI_2.0, own ledger: Transactions shows the `Investment delta · View →` card between the currency totals and the filters. The card opens `/transactions/delta`.
* `/transactions/delta`: intro "Money in, month by month.", a `‹ Back to Transactions` link, then the same year and column controls and chart as before, 420 px high (300 px under 760 px).
* Act-as: no card, and no act-as route for the page (the delta reads the signed-in account's own ledger, as in Classic).
* Classic and Glass: `/transactions/delta` redirects to `/transactions`; their inline panel is unchanged.
* The sidebar keeps Transactions active on the sub-route (prefix match in `Ui2Shell`).

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `frontend/src/ui2/transactions/Ui2InvestmentDelta.tsx` (+ test) | `Ui2InvestmentDeltaLink`, `Ui2InvestmentDeltaPage`; graph no longer takes `refreshKey` |
| Modify | `frontend/src/ui2/transactions/Ui2TransactionsPage.tsx` (+ test) | Link card instead of the inline graph; `ledgerVersion` removed |
| Modify | `frontend/src/ui2/transactions/transactions.css` | `.u2-tx-delta-link`; taller chart |
| Create | `frontend/src/features/transactions/InvestmentDeltaRoute.tsx` (+ test) | Dispatcher: UI_2.0 page, else redirect |
| Modify | `frontend/src/App.tsx` | `/transactions/delta` route under `RequireAuth` |
| Modify | `frontend/src/ui2/cutover.browser.test.ts` | Adds the route to the 390 / 1280 px sweep |

## 4. PR sequence

| # | Layer | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- | --- |
| 27 | FE | Sub-route + link card + dispatcher | Classic and Glass keep the inline panel; act-as unchanged; graph data and controls unchanged | The ledger table moves up; the graph gets a full page | `InvestmentDeltaRoute.test`, `investment delta sub-route` in `Ui2InvestmentDelta.test`, cutover on `/transactions/delta` |

## 5. Tasks

### Task 1 — Link card and page

**Files:** `frontend/src/ui2/transactions/Ui2InvestmentDelta.tsx`, `frontend/src/ui2/transactions/transactions.css`

The page reuses the graph component unchanged, so data, controls and chart stay identical to R22. Only the frame around it is new.

* [ ] Add above `Ui2InvestmentDelta`:

```tsx
export const INVESTMENT_DELTA_PATH = '/transactions/delta'

export function Ui2InvestmentDeltaLink() {
  return (
    <Link to={INVESTMENT_DELTA_PATH} className="ui2-panel u2-tx-delta-link" aria-label="Open the investment delta">
      <span>
        <strong>Investment delta</strong>
        <small>Money added or sold each month, and the amount invested, by year</small>
      </span>
      <span className="u2-tx-delta-link-go" aria-hidden="true">View →</span>
    </Link>
  )
}

export function Ui2InvestmentDeltaPage() {
  return (
    <div className="u2-tx-page">
      <Ui2PageIntro
        title="Money in, month by month."
        subtitle="What you added or sold each month, and the amount invested, for one year at a time."
        actions={<Link to="/transactions" className="ui2-btn">‹ Back to Transactions</Link>}
      />
      <Ui2InvestmentDelta />
    </div>
  )
}
```

* [ ] Change `Ui2InvestmentDelta({ refreshKey }: { refreshKey: number })` to `Ui2InvestmentDelta()` and call `useInvestmentDelta({ active: true })`. Nothing on the page writes the ledger.
* [ ] Add `.u2-tx-delta-link` (flex, 14px 18px padding, accent border on hover and focus) and raise `.u2-tx-delta-chart` to 420 px (300 px under 760 px).

### Task 2 — Transactions page

**Files:** `frontend/src/ui2/transactions/Ui2TransactionsPage.tsx` (+ test)

* [ ] Current: `{!actAsUserId && <Ui2InvestmentDelta refreshKey={ledgerVersion} />}` and the `ledgerVersion` state. Replacement: `{!actAsUserId && <Ui2InvestmentDeltaLink />}`, and `const ledgerChanged = () => { void refresh() }`.
* [ ] Page test: the mock exports `Ui2InvestmentDeltaLink`; the card shows on the own ledger and not in act-as.

### Task 3 — Route

**Files:** `frontend/src/features/transactions/InvestmentDeltaRoute.tsx` (+ test), `frontend/src/App.tsx`, `frontend/src/ui2/cutover.browser.test.ts`

The dispatcher follows the pattern of every UI_2.0 page: only `useUiMode()` lives in it.

* [ ] Create:

```tsx
export default function InvestmentDeltaRoute() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2InvestmentDeltaPage />
  return <Navigate to="/transactions" replace />
}
```

* [ ] `App.tsx`: `<Route path="/transactions/delta" element={<RequireAuth><InvestmentDeltaRoute /></RequireAuth>} />` after `/transactions`.
* [ ] Add `'/transactions/delta'` to the cutover `ROUTES`.
* [ ] Verify: `cd frontend && npx vitest run`. Expected: all files pass, including `InvestmentDeltaRoute.test.tsx` and `cutover.browser.test.ts`.
* [ ] Commit: `git add frontend/src/App.tsx frontend/src/features/transactions/InvestmentDeltaRoute.tsx frontend/src/features/transactions/InvestmentDeltaRoute.test.tsx frontend/src/ui2/transactions frontend/src/ui2/cutover.browser.test.ts` → `✨ Move the UI_2.0 investment delta to a sub-route`.

### Task 4 — End-to-end check

* [ ] In UI_2.0, open `/transactions`: the card appears above the filters, and the table starts higher than before.
* [ ] Follow the card: the graph loads; year and column controls work; `‹ Back to Transactions` returns.
* [ ] Edit a backdated transaction, then open the card: the graph shows the healed figures.
* [ ] Act-as `/admin/users/:id/transactions`: no card.
* [ ] As a Classic account, open `/transactions/delta`: lands on `/transactions` with the inline panel.

## Done

* Slice 27 specified.

Next: R23 (owner's production dry run), then R25 → R26 → R27.
