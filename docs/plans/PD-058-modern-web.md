# PD-058: Modern web guidance fixes

* **Status**: planned
* **Owner**: project owner
* **Goal**: fix the 16 findings from the `modern-web-guidance` audit of
  `frontend/src` (2026-11-17): keyboard and screen-reader access to modals,
  tables, cards and menus; theme-aware native controls; IST-correct date
  defaults; text scaling, font stability and forced-colors focus; ES2023
  copying array methods.
* **Architecture**: frontend only. Each finding is one PR into
  `feat/PD-058-modern-web`; the feature branch merges to `main` once all
  slices land. Shared behaviour goes into `src/lib` hooks that already exist
  (`useDialogFocus`, `todayIST`) or one new hook extracted from existing code
  (`useLightDismiss`, lifted out of `MonthNavigator`).
* **Tech stack**: React 18, TypeScript, Vite, Vitest + Testing Library. No
  new dependencies. Native `<dialog>`, `popover` and `interestfor` are
  deliberately **not** adopted: popover and anchor positioning are not
  Baseline widely available yet and the guides then mandate a polyfill
  dependency. The fixes below get the same user-visible behaviour with code
  the app already has.
* **Spec**: audit list from `modern-web-guidance` (guides `dialog`,
  `prevent-page-scroll-under-modal-dialog`, `sortable-table`,
  `responsive-table`, `dark-mode`, `customize-scrollbar-color-and-thickness`,
  `menu`, `interest-triggered-tooltips`, `color`, `respect-os-text-scale`,
  `visually-stable-font-fallbacks`, `js`). No new UI, so no visual spec.

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | every modal reuses `useDialogFocus`; date defaults reuse `todayIST`; menus share one extracted `useLightDismiss` |
| Branch → PR | CLAUDE.md, memory | one feature branch, one PR per finding targeting it |
| Frontend only | CLAUDE.md | no backend change in any slice |
| Three gates | `task-breakdown` | see PR sequence |
| Behaviour tests | CLAUDE.md | Testing Library interaction tests; CSS slices assert the stylesheet rule like `pageArt.test.ts` |
| Descriptive names | CLAUDE.md | `npm run lint:changed` passes on every slice |

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | 10 modal components (Task 1) | call `useDialogFocus` |
| Modify | `TransactionsModal`, `OpeningDateModal`, `HistoryModals`, `GoldTxnModal`, `MissingPricesModal` | `role="dialog"` + `aria-modal` + name |
| Modify | `src/styles/components.css` | overlay scroll containment (Task 3) |
| Modify | `TransactionsModal`, `GoldTxnModal`, `HistoryModals`, `HistoryChartPage` | `todayIST()` defaults |
| Modify | `HoldingsTable.tsx` | button-in-`th` sort headers + `aria-sort` |
| Modify | `SummaryCards.tsx` | clickable cards become buttons |
| Modify | `TransactionsAllTable.tsx`, `HistoryTable.tsx` | `aria-sort` only on active column |
| Modify | remaining `<table>` components | `scope` on header cells |
| Modify | `src/styles/tokens.css`, `index.html`, `src/lib/useTheme.ts` | `color-scheme` + `theme-color` per theme |
| Modify | `src/styles/base.css` | standard scrollbar properties; forced-colors focus outline; font-size-adjust |
| Create | `src/lib/useLightDismiss.ts` | Esc + outside-press close, shared by menus |
| Modify | `MonthNavigator.tsx`, `DashboardPage.tsx`, `ThemePicker.tsx` | use `useLightDismiss` |
| Modify | icon buttons / hint spans with `title` only | accessible names + screen-reader text |
| Modify | `index.html`, stylesheets | `meta text-scale`, rem font sizes |
| Modify | `tsconfig.json` + 13 sort/reverse sites | ES2023 lib; `toSorted` / `toReversed` |

## PR sequence

Every PR targets `feat/PD-058-modern-web` except PR 2, which builds on
PR 1's branch (both touch the same dialog root lines).

| PR | Finding | No regression | Adds value | Test that fails without it |
|---|---|---|---|---|
| 0 | this plan | docs only | reviewable plan | n/a (docs) |
| 1 | modals trap focus + Esc | hook already proven in `AddEditModal` | keyboard users stay inside modals, Esc closes | Tab wraps, Esc calls `onClose`, focus restored |
| 2 | dialog roles | attribute-only | screen readers announce dialogs | `getByRole('dialog', { name })` |
| 3 | page scroll under modals | CSS only | page no longer scrolls behind modals | stylesheet asserts containment |
| 4 | UTC "today" | same value outside 00:00–05:30 IST | correct default date at night | fake clock 01:00 IST → today's IST date |
| 5 | holdings sort headers | same sort logic | keyboard sort + `aria-sort` | header button sorts; `aria-sort` set |
| 6 | clickable cards | same click handler | keyboard opens cards | card is a button, Enter fires |
| 7 | `aria-sort="none"` / missing | attribute-only | correct announcements | inactive headers have no `aria-sort` |
| 8 | header `scope` | attribute-only | header/cell association | headers carry `scope` |
| 9 | `color-scheme` | dark stays dark | native pickers/scrollbars match theme | tokens assert scheme per theme; meta updates |
| 10 | WebKit-only scrollbar | WebKit fallback kept | Firefox/Safari get themed scrollbar | stylesheet asserts standard props |
| 11 | hand-built menus | same open/close triggers | Esc + outside click close every menu | Esc closes user menu |
| 12 | `title`-only names/hints | titles stay | names for icon buttons, hints for AT | `getByRole('button', { name })` |
| 13 | focus ring in forced colors | shadow ring unchanged | ring visible in High Contrast | stylesheet asserts transparent outline |
| 14 | fixed px text | same rendered size at 16px root | text follows OS scale | meta present; no px font-size in stylesheets |
| 15 | font swap shift | same fonts | stable layout on swap | stylesheet asserts `font-size-adjust` |
| 16 | copy-then-sort | identical results | idiomatic ES2023 | existing sort tests + `lib` assertion |

## Tasks

Each task: branch `fix/PD-058-NN-slug` from `feat/PD-058-modern-web`.

### Task 1: Trap focus in every modal

**Files:** `NameConfirmDialog`, `TransactionsModal`, `OpeningDateModal`,
`MissingPricesModal`, `GoldTxnModal`, `TradeImportModal`, `HistoryModals`,
`DividendModal`, `DeleteAllDialog`, `DividendImportModal` (+ tests).

WHY: `useDialogFocus` already gives focus-in, Tab wrap, Esc and focus
restore; only two modals call it.

* [ ] Add `const root = useRef<HTMLDivElement>(null)` and
      `useDialogFocus(root, onClose)` to each modal; put `ref={root}` and
      `tabIndex={-1}` on the card.
* [ ] Busy states (saving/importing) pass a close that is a no-op while busy,
      as `AddEditModal` does.
* [ ] Test per modal family: Esc calls `onClose`; Tab from the last control
      lands on the first.
* [ ] Verify: `npx vitest run src/features` → Expected: all pass.
* [ ] Commit: `git add <modal files> <tests>`.

### Task 2: Name every modal as a dialog

**Files:** `TransactionsModal`, `OpeningDateModal`, `HistoryModals`,
`GoldTxnModal`, `MissingPricesModal` (+ tests).

* [ ] Put `role="dialog" aria-modal="true" aria-label=…` on the card (the
      element that holds focus), not the overlay.
* [ ] Test: `getByRole('dialog', { name })` finds each.
* [ ] Verify + commit as Task 1.

### Task 3: Stop the page scrolling behind modals

**Files:** `src/styles/components.css`, new `src/styles/modal.test.ts`.

WHY: the guide forbids `overflow: hidden` on `body`; containment on the
overlay and card is the CSS-only equivalent of its `dialog::backdrop` rule.

* [ ] `.modal-overlay { overflow: hidden; overscroll-behavior: contain; }`
      and `.modal-overlay [role="dialog"], .modal-card { overscroll-behavior: contain; }`.
* [ ] Give the `modalBackdrop`-styled overlays the `modal-overlay` class.
* [ ] Test reads the stylesheet and asserts both rules.

### Task 4: Default dates to today in IST

**Files:** `TransactionsModal`, `GoldTxnModal`, `HistoryModals`,
`HistoryChartPage` (+ tests).

* [ ] Replace `new Date().toISOString().slice(0, 10)` with `todayIST()`.
* [ ] Test with `vi.setSystemTime('2026-11-17T20:00:00Z')` (01:30 IST on
      the 18th) → default `2026-11-18`.

### Task 5: Keyboard sortable holdings headers

**Files:** `HoldingsTable.tsx` (+ test).

* [ ] `colHead` renders `<th scope="col" aria-sort=…>` (active column only)
      wrapping `<button type="button">`; same for the avg-cost header.
* [ ] Test: clicking/Enter on the header button toggles `aria-sort`.

### Task 6: Clickable summary cards as buttons

**Files:** `SummaryCards.tsx` (+ test).

* [ ] Clickable cards render `<button type="button" className="card …">`
      with reset styles; non-clickable stay `div`.
* [ ] Test: `getByRole('button', { name: /…/ })` fires `onClick`.

### Task 7: Correct `aria-sort`

**Files:** `TransactionsAllTable.tsx`, `HistoryTable.tsx` (+ tests).

* [ ] Omit `aria-sort` on inactive columns; add it to the history date `th`;
      add `scope="col"` on these sortable headers.
* [ ] Test: exactly one header has `aria-sort`.

### Task 8: `scope` on remaining table headers

**Files:** `DividendsTable`, `DividendsAnalytics`, `GoldPage`,
`GoldMetricsPanel`, `AdminUserList`, `AdminManageAdmins`, `ImportTables`,
`PeriodPerformanceCard`, `TransactionsModal`, `HistoryModals`,
`DividendImportModal`, `HoldingsTable` (`TH` helper) (+ test).

* [ ] `scope="col"` on column headers, `scope="row"` on row headers.
* [ ] Test asserts every `th` in a rendered table has a `scope`.

### Task 9: Theme native controls

**Files:** `src/styles/tokens.css`, `index.html`, `src/lib/useTheme.ts` (+ tests).

* [ ] `:root { color-scheme: dark; }`, `[data-theme="light"] { color-scheme: light; }`,
      cyberpunk dark; `<meta name="color-scheme" content="dark light">`.
* [ ] `useTheme` updates `meta[name="theme-color"]` from `--bg-primary`.
* [ ] Tests: stylesheet rules; meta updates on theme change.

### Task 10: Standard scrollbar properties

**Files:** `src/styles/base.css` (+ test).

* [ ] `:root { scrollbar-color: var(--border-light) transparent; }`; WebKit
      rules move into `@supports not (scrollbar-color: auto)`.

### Task 11: Esc and outside-click close for menus

**Files:** create `src/lib/useLightDismiss.ts` (+ test); modify
`MonthNavigator`, `DashboardPage`, `ThemePicker`.

* [ ] Lift `MonthNavigator`'s effect into `useLightDismiss(rootRef, open, close)`.
* [ ] Dashboard user menu: replace `onMouseLeave` with the hook; add
      `aria-haspopup`/`aria-expanded`. ThemePicker inline: use the hook.
* [ ] Tests: hook (Esc, outside press, inside press ignored); user menu Esc.

### Task 12: Accessible names and hints beyond `title`

**Files:** `TransactionsModal`, `HistoryTable`, `HoldingsTable`,
`SummaryCards`, `HoldingsByCurrency` (+ test); `src/styles/base.css` (`.sr-only`).

* [ ] Icon-only buttons named only by `title` get `aria-label`.
* [ ] Information shown only in a `title` on a non-focusable element gets a
      `.sr-only` copy.

### Task 13: Focus ring in forced colors

**Files:** `src/styles/base.css` (+ test).

* [ ] `:focus-visible { outline: 2px solid transparent; outline-offset: 2px; }`
      keeps the box-shadow ring and shows a system-coloured outline in
      Forced Colors Mode.

### Task 14: Follow OS text scale

**Files:** `index.html`, `src/styles/*.css` (+ test).

* [ ] `<meta name="text-scale" content="scale">`; no root `font-size`.
* [ ] Stylesheet `font-size: Npx` → `rem` (N/16). Inline TSX `fontSize`
      numbers are out of scope for this slice (273 sites) and listed under
      Next.
* [ ] Test: meta present; stylesheets contain no `font-size: …px`.

### Task 15: Stable font fallback

**Files:** `src/styles/base.css` (+ test).

* [ ] `body { font-size-adjust: from-font; }`; `.mono` / code use
      `font-size-adjust: ch-width from-font`.

### Task 16: ES2023 copying array methods

**Files:** `tsconfig.json` + 13 sites from the scan (+ test).

* [ ] `lib: ["ES2023", "DOM", "DOM.Iterable"]`; `[...x].sort(f)` →
      `x.toSorted(f)`, `[...x].reverse()` → `x.toReversed()`.
* [ ] Existing sort tests pass; typecheck passes.

### Task 17: End-to-end verification

* [ ] `npm run typecheck && npm run lint:changed && npx vitest run`.
* [ ] Keyboard pass over Dashboard, History, Gold, Dividends: every modal
      opens with focus inside, Tab wraps, Esc closes; sort headers reachable;
      light theme shows light date pickers.

## Done

* 16 audit findings fixed on `feat/PD-058-modern-web`.

## Next

* Inline TSX `fontSize` px → rem sweep (Task 14 follow-up).
* Native `<dialog>` / `popover` once Baseline widely available (no polyfill).
