# PD-058: Modern web guidance fixes

* **Status**: implemented. Slices #305–#320 are merged into their stack
  branches (squash). Backend counterparts #323 and #324 are merged to `main`.
  `fix/PD-058-15-font-fallback` carries every slice and goes into
  `feat/PD-058-modern-web` in one collapse PR, then the feature branch merges
  to `main`.
* **Owner**: project owner
* **Goal**: fix the 16 findings from the `modern-web-guidance` audit of
  `frontend/src` (2026-11-17): keyboard and screen-reader access to modals,
  tables, cards and menus; theme-aware native controls; IST-correct date
  defaults; text scaling, font stability and forced-colors focus; ES2023
  copying array methods.
* **Architecture**: frontend slices in a linear stack inside
  `feat/PD-058-modern-web` (see "Why a linear stack"). Two slices need a server
  change; per the frontend/backend split rule those went to `main` as their
  own PRs (Tasks 4a and 15a). Shared behaviour goes into `src/lib` hooks that
  already existed (`useDialogFocus`, `todayIST`) or one extracted from
  existing code (`useLightDismiss`, lifted out of `MonthNavigator`).
  Behaviour that jsdom can't render (scrolling, layout, forced colors, text
  size, font loading) is tested in real Chromium through one shared harness
  (`src/test/browser/harness.ts`).
* **Tech stack**: React 18, TypeScript, Vite, Vitest + Testing Library;
  Playwright (already a dependency) drives Chromium from Vitest for the
  `*.browser.test.ts` files. Go + `mtest` for the two backend PRs. Native
  `<dialog>`, `popover` and `interestfor` are deliberately **not** adopted:
  popover and anchor positioning aren't Baseline widely available yet, and the
  guides then require a polyfill dependency.
* **Spec**: audit list from `modern-web-guidance` (guides `dialog`,
  `prevent-page-scroll-under-modal-dialog`, `sortable-table`,
  `responsive-table`, `dark-mode`, `customize-scrollbar-color-and-thickness`,
  `menu`, `interest-triggered-tooltips`, `color`, `respect-os-text-scale`,
  `visually-stable-font-fallbacks`, `js`). No new UI, so no visual spec.

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | every modal reuses `useDialogFocus`; date defaults reuse `todayIST`; menus share the extracted `useLightDismiss`; browser tests share `harness.ts` |
| Branch → PR | CLAUDE.md | one branch and PR per finding, inside the feature branch |
| Frontend and backend apart | CLAUDE.md | the IST date check (#323) and the font stacks (#324) went to `main` alone |
| Three gates | `task-breakdown` | see PR sequence |
| Behaviour tests | CLAUDE.md | interaction tests in jsdom; CSS behaviour measured in real Chromium (computed styles, scroll position, text geometry), never stylesheet text |
| Descriptive names | CLAUDE.md | `npm run lint:changed` passes on every slice, so touched files rename short identifiers |

## Why a linear stack

The first draft targeted every PR at `feat/PD-058-modern-web` except PR 2.
CI's `lint:changed` lints whole touched files, so every slice also renames that
file's short identifiers, and the same files recur across findings
(`HistoryModals`, `TransactionsModal`, `base.css`, …). Independent branches off
the feature branch would conflict on those renames. Each slice therefore
branches from the previous one and its PR targets it, as the owner allows for
task PRs inside a feature branch: they may build on an unmerged task branch,
because only `main` must never break. Every slice still passes the three gates
on its own, and nothing reaches `main` until the whole stack has landed on the
feature branch.

Running browser tests: `cd frontend && npx playwright install
chromium-headless-shell` once. They skip when Chromium can't launch;
`REQUIRE_BROWSER_TESTS=1` makes that a failure (CI install is issue #321).

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `backend/internal/controllers/branding.go` | T15a: Each stack lists `"<font> Fallback"` second |
| Modify | `backend/internal/controllers/branding_test.go` | T15a: Each stack returned by `GetBranding` starts with the web font, then its fallback face, then a system font |
| Modify | `backend/internal/services/history.go` | T4a: Takes `now` as a parameter so tests can fix the clock, and compares against the IST day |
| Modify | `backend/internal/services/history_test.go` | T4a: Add accepts the IST day before the UTC date rolls over, and a table test pins `parseDateNotFuture` to the IST calendar on both sides of midnight |
| Modify | `frontend/index.html` | T9: `<meta name="color-scheme" content="dark light">` so the first paint, before the stored theme applies, is never a white flash<br>T14: Opts into OS text scaling, with a comment never to set a root font-size |
| Create | `frontend/src/components/SummaryCards.keyboard.test.tsx` | T6: Each flippable card is a focusable button, Enter and Space start the flip, and a card without a handler stays static |
| Modify | `frontend/src/components/SummaryCards.tsx` | T6: Adds `clickableCard` and uses it for each card that has an `onClick`<br>T12: The "—" shown when a holding has no previous close is voiced with its reason |
| Create | `frontend/src/components/ThemePicker.dismiss.test.tsx` | T11: Escape closes the inline theme picker's open options |
| Modify | `frontend/src/components/ThemePicker.tsx` | T11: The inline picker uses the hook |
| Modify | `frontend/src/features/admin/AdminManageAdmins.tsx` | T8: Column headers |
| Modify | `frontend/src/features/admin/AdminUserList.tsx` | T8: Column headers |
| Modify | `frontend/src/features/dashboard/DashboardPage.test.tsx` | T11: The account menu closes on Escape and on a press outside it |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | T11: The account menu uses the hook instead of `onMouseLeave` and exposes `aria-haspopup` / `aria-expanded` |
| Modify | `frontend/src/features/dividends/DeleteAllDialog.tsx` | T1: Ref the card, mark it focusable (`tabIndex={-1}`) and call the hook |
| Modify | `frontend/src/features/dividends/DividendImportModal.tsx` | T1: Same wiring<br>T8: Preview table headers |
| Modify | `frontend/src/features/dividends/DividendModal.tsx` | T1: Both the add/edit modal and the delete confirmation in this file get the hook, each blocked while busy |
| Modify | `frontend/src/features/dividends/DividendsAnalytics.tsx` | T8: Per-year and per-holding tables<br>T16: Newest year first |
| Modify | `frontend/src/features/dividends/DividendsTable.tsx` | T8: Column headers |
| Modify | `frontend/src/features/gold/GoldPage.tsx` | T8: Transactions table headers |
| Modify | `frontend/src/features/gold/GoldPricesPanel.tsx` | T16: Newest price first |
| Modify | `frontend/src/features/gold/GoldTxnModal.tsx` | T1: Same wiring<br>T2: The role and name move from the overlay to the focused card, and `aria-modal` is added |
| Modify | `frontend/src/features/gold/MissingPricesModal.tsx` | T1: Escape skips, the same as the Skip button, unless a save is running<br>T2: Same move from overlay to card |
| Modify | `frontend/src/features/history/HistoryChartPage.tsx` | T4: The chart's range ends at the IST day, so a late-night visit still includes today's row<br>T16: Oldest-first series |
| Modify | `frontend/src/features/history/HistoryModals.tsx` | T1: All four History modals (add, edit, paste, conflict) get the hook<br>T2: Each of the four cards gets a role and a name that says which row or month it edits<br>T4: The Add row date; `useState(todayIST)` computes it once, on open<br>T8: The holdings breakdown table |
| Modify | `frontend/src/features/history/HistoryPage.test.tsx` | T7: The date header carries its current sort direction |
| Modify | `frontend/src/features/history/HistoryPage.tsx` | T16: Conflicts in date order |
| Modify | `frontend/src/features/history/HistoryTable.tsx` | T7: The date header announces its direction<br>T8: Both header rows: `scope="colgroup"` on the currency group headers, `scope="col"` on the columns under them<br>T12: A day's dividend receipt, shown only on hover, is voiced in the cell<br>T16: Descending rows and the ascending view |
| Modify | `frontend/src/features/history/MonthNavigator.tsx` | T11: Replaces its own effect with the hook; behaviour unchanged |
| Modify | `frontend/src/features/history/PeriodPerformanceCard.tsx` | T8: Row headers name each period |
| Modify | `frontend/src/features/history/historyShared.ts` | T3: The inline-style path: modals built on `modalBackdrop` / `modalCard` don't use the classes, so the shared style objects carry the same two properties<br>T16: Chart series and row stats |
| Modify | `frontend/src/features/holdings/HoldingsByCurrency.tsx` | T12: A `title` hint gets its `.sr-only` copy |
| Create | `frontend/src/features/holdings/HoldingsTable.sort.test.tsx` | T5: A header button sorts by its column and only that column carries `aria-sort`; average cost sorts the same way; every header cell has `scope` |
| Modify | `frontend/src/features/holdings/HoldingsTable.tsx` | T5: `colHead` and the average-cost header render `<th scope="col" aria-sort>` around a reset-styled button that calls the same sort handler<br>T12: Row action buttons are named after their holding, and the price error is voiced<br>T16: The sorted holdings view |
| Modify | `frontend/src/features/holdings/OpeningDateModal.tsx` | T1: Escape skips the prompt, the same as Skip, unless saving<br>T2: The card is named "Set opening dates" |
| Modify | `frontend/src/features/holdings/TransactionsModal.tsx` | T1: Same wiring<br>T2: The card is named after the holding<br>T4: The new-transaction form's default date<br>T8: Ledger table headers<br>T12: Ledger row actions name the event they act on<br>T16: Ledger in date order |
| Modify | `frontend/src/features/imports/ImportTables.tsx` | T8: The shared import preview tables |
| Modify | `frontend/src/features/imports/NameConfirmDialog.tsx` | T1: Escape goes Back, the dialog's own cancel action |
| Create | `frontend/src/features/istToday.test.tsx` | T4: Fixes the clock at 20:00 UTC on 17 Nov (01:30 IST on the 18th) and expects each default to be 2026-11-18 |
| Create | `frontend/src/features/modalFocus.test.tsx` | T1: One table over all 15 modals, so a new modal is one more row<br>T2: The Task 1 table gains each modal's accessible name, and every row must be found by `getByRole('dialog', { name })` with `aria-modal="true"` |
| Create | `frontend/src/features/tableHeaderScope.test.tsx` | T8: Renders each table and requires every column header to carry a `scope` |
| Create | `frontend/src/features/titleHints.test.tsx` | T12: Holding row actions and ledger row actions are found by their specific names; the price error and a day's dividend receipt are read as text, not just hover titles |
| Modify | `frontend/src/features/transactions/TradeImportModal.tsx` | T1: Same as the dividend import: Escape on the result step acts like Done |
| Modify | `frontend/src/features/transactions/TransactionsAllTable.tsx` | T7: Inactive headers drop the attribute; the sortable headers gain `scope="col"` |
| Modify | `frontend/src/features/transactions/TransactionsPage.test.tsx` | T7: Only the active column's header carries `aria-sort` |
| Modify | `frontend/src/features/transactions/transactionFilters.ts` | T16: The all-transactions sort |
| Create | `frontend/src/lib/es2023.test.ts` | T16: The app is typed against the ES2023 library, and a rewritten sort returns a sorted copy while leaving the fetched array in place |
| Modify | `frontend/src/lib/useBranding.tsx` | T15: The client catalog used until `/branding` answers |
| Create | `frontend/src/lib/useDialogFocus.test.tsx` | T1: Proves the stack: with two dialogs open, Escape closes only the top one, then the next Escape closes the one underneath |
| Modify | `frontend/src/lib/useDialogFocus.ts` | T1: History opens the conflict dialog over the paste dialog, and both now call the hook |
| Create | `frontend/src/lib/useLightDismiss.test.tsx` | T11: Escape and an outside press close; a press inside doesn't; nothing fires while closed |
| Create | `frontend/src/lib/useLightDismiss.ts` | T11: The extracted effect: while open, a `mousedown` outside the root or Escape calls the latest `onClose` |
| Modify | `frontend/src/lib/useTheme.ts` | T9: `applyTheme` also sets `<meta name="theme-color">` from `THEME_COLOR`, which mirrors each theme's `--bg-primary` |
| Modify | `frontend/src/styles/base.css` | T10: `scrollbar-color` inherits, so one root rule themes every scroller; `scrollbar-width` doesn't, hence `*`<br>T12: Adds the standard visually-hidden `.sr-only` class<br>T13: A transparent `2px` outline under the shadow ring, and a forced-colors rule that paints it `CanvasText`<br>T14: Body, button and input sizes<br>T15: Four faces, regular and bold for each brand font |
| Create | `frontend/src/styles/colorScheme.test.ts` | T9: Checks each theme block's `color-scheme`, the meta in `index.html`, and that switching themes updates `theme-color` |
| Modify | `frontend/src/styles/components.css` | T3: The class path: `.modal-overlay`, `.classification-overlay` and `.palette-overlay` become contained scroll containers, and the cards contain their own overscroll<br>T14: Component sizes, px ÷ 16 |
| Create | `frontend/src/styles/focusRing.browser.test.ts` | T13: Reaches each control with real Tab presses |
| Create | `frontend/src/styles/fontFallback.browser.test.ts` | T15: On an uncached visit, holds back the `fonts.gstatic.com` files, measures the text in the fallback, releases them and measures again in the web font, for both brand fonts |
| Modify | `frontend/src/styles/glass.css` | T14: Glass-UI sizes, px ÷ 16 |
| Create | `frontend/src/styles/modalScroll.browser.test.ts` | T3: Scrolls the page to 1000px, wheels over the backdrop, past a scrolled card's end, and over a card that doesn't overflow, then checks that the page is still at 1000px |
| Create | `frontend/src/styles/scrollbar.browser.test.ts` | T10: Reads the computed width and colour of `<html>` and the nested box in all three themes, with and without the glass UI |
| Create | `frontend/src/styles/textScale.browser.test.ts` | T14: At the default 16px text size each element keeps its px size; at 24px (Chromium's `Page.setFontSizes`, the setting behind Settings → Font size) each grows exactly 1.5×, in both UIs |
| Modify | `frontend/src/styles/tokens.css` | T9: Dark and cyberpunk declare `color-scheme: dark`, light declares `light`<br>T15: The default stack before branding applies |
| Create | `frontend/src/test/browser/focusRing.fixture.html` | T13: A button, a plain input and an input with inline `outline: none`, after a `#tab-start` anchor so every Tab sequence starts at the same place |
| Create | `frontend/src/test/browser/focusRing.fixture.ts` | T13: Loads the real stylesheet |
| Create | `frontend/src/test/browser/fontFallback.fixture.html` | T15: A wrapping regular paragraph, a bold paragraph and a `line-height: normal` line, at large sizes so a mismatch shows in whole pixels |
| Create | `frontend/src/test/browser/fontFallback.fixture.ts` | T15: Loads the real stylesheet and the real Google Fonts `<link>` read from `index.html`, then applies the brand font with the app's `applyBrandFont` |
| Create | `frontend/src/test/browser/harness.ts` | T10: Tasks 3 and 10 both need "launch Chromium + serve a fixture through Vite" |
| Create | `frontend/src/test/browser/modalScroll.fixture.html` | T3: jsdom has no layout or wheel scrolling, so the test drives real Chromium against this page |
| Create | `frontend/src/test/browser/modalScroll.fixture.tsx` | T3: A 4000px page with one real app modal on top |
| Create | `frontend/src/test/browser/scrollbar.fixture.html` | T10: A page that scrolls, with a nested scroll container |
| Create | `frontend/src/test/browser/scrollbar.fixture.ts` | T10: Loads the real stylesheet |
| Create | `frontend/src/test/browser/textScale.fixture.html` | T14: Representative stylesheet-sized text from each file: body, button, input, a card heading and two glass-UI elements |
| Create | `frontend/src/test/browser/textScale.fixture.ts` | T14: Loads the real stylesheet |
| Modify | `frontend/tsconfig.json` | T16: Moves `lib` to ES2023 |

## PR sequence

Each slice's PR targets the previous slice's branch (Task 1 targets the feature branch). Tasks 4a and 15a target `main`.

| Task | PR | Finding | No regression | Adds value | Test that fails without it |
|---|---|---|---|---|---|
| 0 | #304 | this plan | docs only | reviewable plan | n/a (docs) |
| 1 | #305 | modals trap focus + Esc | hook already proven in `AddEditModal` | keyboard users stay inside modals, Esc closes | focus moves in, Tab wraps, Esc closes; stacked dialogs |
| 2 | #306 | dialog roles | attribute-only | screen readers announce dialogs | `getByRole('dialog', { name })` per modal |
| 3 | #307 | page scroll under modals | layout and backdrop click unchanged | page stays put behind modals | Chromium: page scroll unchanged after wheeling over backdrop and card |
| 4 | #308 | UTC "today" | same value outside 00:00–05:30 IST | correct default date at night | clock at 01:30 IST → IST date |
| 4a | #323 (main) | server judges future on UTC | same outside 00:00–05:30 IST | late-night History rows save | IST today accepted before UTC rollover |
| 5 | #309 | holdings sort headers | same sort logic | keyboard sort + `aria-sort` | header button sorts; `aria-sort` on that column |
| 6 | #310 | clickable cards | same click handler | keyboard flips cards | card is a button; Enter/Space flip |
| 7 | #311 | `aria-sort="none"` / missing | attribute-only | correct announcements | only the active header has `aria-sort` |
| 8 | #312 | header `scope` | attribute-only | header/cell association | every column header has `scope` |
| 9 | #313 | `color-scheme` | dark stays dark | native pickers match theme | scheme per theme; `theme-color` follows theme |
| 10 | #314 | WebKit-only scrollbar | WebKit fallback kept | Firefox gets themed scrollbars | Chromium: computed width/colour per theme |
| 11 | #315 | hand-built menus | same open/close triggers | Esc + outside press close menus | hook + account menu + theme picker |
| 12 | #316 | `title`-only names/hints | titles stay | names and hints for AT | `getByRole('button', { name })`, voiced hints |
| 13 | #317 | focus ring in forced colors | shadow ring unchanged | ring visible in High Contrast | Chromium: Tab + emulated forced colors → `CanvasText` outline |
| 14 | #318 | fixed px text | same size at 16px default | text follows the text-size setting | Chromium: text grows 1.5× at 24px |
| 15 | #319 | font swap shift | loaded text unchanged | stable layout on swap | Chromium: same geometry before/after font load |
| 15a | #324 (main) | server stacks lack fallback | unknown family is skipped | server stacks name the faces | each stack lists its fallback second |
| 16 | #320 | copy-then-sort | identical results | idiomatic ES2023 | ES2023 lib; sorted copy, input untouched |

## Tasks

### Task 1: Trap focus and close on Escape in every modal (#305)

**Files:**

* Create: `frontend/src/features/modalFocus.test.tsx`, `frontend/src/lib/useDialogFocus.test.tsx`
* Modify: `frontend/src/features/dividends/DeleteAllDialog.tsx`, `frontend/src/features/dividends/DividendImportModal.tsx`, `frontend/src/features/dividends/DividendModal.tsx`, `frontend/src/features/gold/GoldTxnModal.tsx`, `frontend/src/features/gold/MissingPricesModal.tsx`, `frontend/src/features/history/HistoryModals.tsx`, `frontend/src/features/holdings/OpeningDateModal.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `frontend/src/features/imports/NameConfirmDialog.tsx`, `frontend/src/features/transactions/TradeImportModal.tsx`, `frontend/src/lib/useDialogFocus.ts`

`useDialogFocus` already moves focus in, wraps Tab, closes on Escape and restores focus, but only `AddEditModal` and the palette called it. Ten modals let Tab walk out into the page behind them.

Branch `fix/PD-058-01-modal-focus` from `feat/PD-058-modern-web`.

* [ ] **Step 1: Modify `frontend/src/features/dividends/DeleteAllDialog.tsx` (Edit)**

WHY: Ref the card, mark it focusable (`tabIndex={-1}`) and call the hook. Escape is ignored while the delete runs, as `AddEditModal` does while saving.

Current:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import type { DividendCurrency } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { DividendCurrency } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
```

Current:

```tsx
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const confirm = async () => {
    setBusy(true)
    try {
```

Replacement:

```tsx
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onClose() })
  const confirm = async () => {
    setBusy(true)
    try {
```

| File:line | Current | Replacement |
|---|---|---|
| `DeleteAllDialog.tsx:33` | `<div style={{ ...modalCard, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` |

* [ ] **Step 2: Modify `frontend/src/features/dividends/DividendImportModal.tsx` (Edit)**

WHY: Same wiring. Escape on the result step acts like Done so the page refreshes; the names step renders its own dialog, which owns the keys meanwhile.

Current:

```tsx
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate, todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
```

Replacement:

```tsx
import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate, todayIST } from '../../lib/formDates'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
```

Current:

```tsx
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inTab = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === currency), [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`
```

Replacement:

```tsx
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  // Escape on the result step behaves like Done so the page refreshes. The
  // names step renders its own dialog, which owns the keys meanwhile.
  useDialogFocus(root, () => {
    if (busy) return
    if (step === 'result') onImported()
    onClose()
  }, step !== 'names' || !preview)
  const inTab = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === currency), [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`
```

| File:line | Current | Replacement |
|---|---|---|
| `DividendImportModal.tsx:112` | `<div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` |

* [ ] **Step 3: Modify `frontend/src/features/dividends/DividendModal.tsx` (Edit)**

WHY: Both the add/edit modal and the delete confirmation in this file get the hook, each blocked while busy.

Current:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseSeededDecimal } from '../../lib/formNumbers'
import { canonicalCurrency, formatMoney } from '../../lib/currency'
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { parseSeededDecimal } from '../../lib/formNumbers'
import { canonicalCurrency, formatMoney } from '../../lib/currency'
```

Current:

```tsx
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const value = parseSeededDecimal(amount, editing?.amount)
```

Replacement:

```tsx
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onClose() })

  const save = async () => {
    const value = parseSeededDecimal(amount, editing?.amount)
```

Current:

```tsx
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const remove = async () => {
    setBusy(true)
    try {
```

Replacement:

```tsx
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onClose() })
  const remove = async () => {
    setBusy(true)
    try {
```

| File:line | Current | Replacement |
|---|---|---|
| `DividendModal.tsx:60` | `<div style={{ ...modalCard, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` |
| `DividendModal.tsx:105` | `<div style={{ ...modalCard, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>` |

* [ ] **Step 4: Modify `frontend/src/features/gold/GoldTxnModal.tsx` (Edit)**

WHY: Same wiring. Touching the file runs `lint:changed` on all of it, so its short callback names are renamed too.

Current:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldTransaction, type GoldTransactionInput } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldTransaction, type GoldTransactionInput } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
```

Current:

```tsx
  const [form, setForm] = useState<FormState>(() => initialForm(txn))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const invalid = validateGoldForm(form)
```

Replacement:

```tsx
  const [form, setForm] = useState<FormState>(() => initialForm(txn))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onClose() })

  const set = (key: keyof FormState) => (value: string) => setForm(previousForm => ({ ...previousForm, [key]: value }))

  const save = async () => {
    const invalid = validateGoldForm(form)
```

| File:line | Current | Replacement |
|---|---|---|
| `GoldTxnModal.tsx:137` | `<div className="modal-card" style={{` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` |

Rename-only lines elsewhere in the file (for `lint:changed`): `f` → `form`, `v` → `value`.

* [ ] **Step 5: Modify `frontend/src/features/gold/MissingPricesModal.tsx` (Edit)**

WHY: Escape skips, the same as the Skip button, unless a save is running.

Current:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'
```

Current:

```tsx
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (date: string, v: string) => setPrices(p => ({ ...p, [date]: v }))

  // Only the days the user actually filled are sent; blanks are left for a
  // later visit rather than rejected, so a long gap can be closed piecemeal.
```

Replacement:

```tsx
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onSkip() })

  const set = (date: string, value: string) => setPrices(previousPrices => ({ ...previousPrices, [date]: value }))

  // Only the days the user actually filled are sent; blanks are left for a
  // later visit rather than rejected, so a long gap can be closed piecemeal.
```

| File:line | Current | Replacement |
|---|---|---|
| `MissingPricesModal.tsx:77` | `<div className="modal-card" style={{` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` |

Rename-only lines elsewhere in the file (for `lint:changed`): `p` → `price`, `v` → `value`.

* [ ] **Step 6: Modify `frontend/src/features/history/HistoryModals.tsx` (Edit)**

WHY: All four History modals (add, edit, paste, conflict) get the hook. The id-length renames in this file are folded into the same hunks.

Current:

```tsx
} from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, REGION_LABELS,
  changedRegions, emptyForm, fmt,
```

Replacement:

```tsx
} from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { useDialogFocus } from '../../lib/useDialogFocus'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, REGION_LABELS,
  changedRegions, emptyForm, fmt,
```

Current:

```tsx
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Add manual row</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}/>
        </label>
        {REGIONS.map(r => (
          <fieldset key={r} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <legend style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{REGION_LABELS[r]}</legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Invested
                <DecimalInput value={form[r].invested}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], invested: value } }))}
                  onBlur={regroup(r, 'invested')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <DecimalInput value={form[r].current}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], current: value } }))}
                  onBlur={regroup(r, 'current')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
```

Replacement:

```tsx
      setBusy(false)
    }
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onCancel() })

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Add manual row</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}/>
        </label>
        {REGIONS.map(region => (
          <fieldset key={region} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <legend style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{REGION_LABELS[region]}</legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Invested
                <DecimalInput value={form[region].invested}
                  onValueChange={value => setForm(previousForm => ({ ...previousForm, [region]: { ...previousForm[region], invested: value } }))}
                  onBlur={regroup(region, 'invested')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <DecimalInput value={form[region].current}
                  onValueChange={value => setForm(previousForm => ({ ...previousForm, [region]: { ...previousForm[region], current: value } }))}
                  onBlur={regroup(region, 'current')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
```

Current:

```tsx
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Edit row — {formatDate(row.date)}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Saving overrides any cron-written value with the manual value below.
```

Replacement:

```tsx
      setBusy(false)
    }
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onCancel() })

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Edit row — {formatDate(row.date)}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Saving overrides any cron-written value with the manual value below.
```

Current:

```tsx
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Paste month — {monthLabel}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Paste tab-separated rows (Google Sheets / Excel). Columns:
```

Replacement:

```tsx
      setBusy(false)
    }
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onCancel() })

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Paste month — {monthLabel}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Paste tab-separated rows (Google Sheets / Excel). Columns:
```

Current:

```tsx
    INR: false, EUR: false,
  })

  const toggle = (r: RegionKey) => setPicks(p => ({ ...p, [r]: !p[r] }))

  const submit = async () => {
    const chosen: Record<string, { invested: number; current: number }> = {}
    for (const r of REGIONS) {
      if (picks[r] && conflict.incoming[r]) {
        chosen[r] = conflict.incoming[r]
      }
    }
    await onResolve(conflict.date, chosen)
  }

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Conflict — {formatDate(conflict.date)}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          For each region, tick to keep the incoming value (override). Leave unticked to keep what's already there.
```

Replacement:

```tsx
    INR: false, EUR: false,
  })

  const toggle = (region: RegionKey) => setPicks(previousPicks => ({ ...previousPicks, [region]: !previousPicks[region] }))

  const submit = async () => {
    const chosen: Record<string, { invested: number; current: number }> = {}
    for (const region of REGIONS) {
      if (picks[region] && conflict.incoming[region]) {
        chosen[region] = conflict.incoming[region]
      }
    }
    await onResolve(conflict.date, chosen)
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onSkip)

  return (
    <div className="modal-overlay" style={modalBackdrop}>
      <div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Conflict — {formatDate(conflict.date)}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          For each region, tick to keep the incoming value (override). Leave unticked to keep what's already there.
```

Current:

```tsx
  onClose: () => void
}) {
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const inRegion = (h: HistoryHolding) => holdingRegion(h) === region
  // Key by symbol+script so two holdings that share a symbol (e.g. a dual
  // listing) don't collide on the React key or the yesterday-price lookup.
  const keyFor = (h: HistoryHolding) => `${h.symbol} ${h.script}`
  // Only real (positive-quantity) holdings in this currency.
  const holdings = (row.holdings ?? []).filter(h => inRegion(h) && h.quantity > 0)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(h => [keyFor(h), h]),
  )
  const priceFmt = (n: number) => fmtCurrency(n, sym)

  return (
    <div className="modal-overlay" style={modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={modalCard} role="dialog" aria-modal="true" aria-label="Holdings">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Holdings</h2>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(row.date)} · {region}</span>
```

Replacement:

```tsx
  onClose: () => void
}) {
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const inRegion = (holding: HistoryHolding) => holdingRegion(holding) === region
  // Key by symbol+script so two holdings that share a symbol (e.g. a dual
  // listing) don't collide on the React key or the yesterday-price lookup.
  const keyFor = (holding: HistoryHolding) => `${holding.symbol} ${holding.script}`
  // Only real (positive-quantity) holdings in this currency.
  const holdings = (row.holdings ?? []).filter(holding => inRegion(holding) && holding.quantity > 0)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(holding => [keyFor(holding), holding]),
  )
  const priceFmt = (value: number) => fmtCurrency(value, sym)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onClose)

  return (
    <div className="modal-overlay" style={modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={root} tabIndex={-1} className="modal-card" style={modalCard} role="dialog" aria-modal="true" aria-label="Holdings">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Holdings</h2>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(row.date)} · {region}</span>
```

Current:

```tsx
                </tr>
              </thead>
              <tbody>
                {holdings.map(h => {
                  const cur = h.close_price
                  const y = prevByKey.get(keyFor(h))?.close_price
                  const yesterday = y ?? null
                  const change = yesterday === null ? null : cur - yesterday
                  const pct = yesterday === null || yesterday === 0 ? null : ((cur - yesterday) / yesterday) * 100
                  // Green up, red down, blue unchanged; neutral only when there
```

Replacement:

```tsx
                </tr>
              </thead>
              <tbody>
                {holdings.map(holding => {
                  const cur = holding.close_price
                  const yesterday = prevByKey.get(keyFor(holding))?.close_price ?? null
                  const change = yesterday === null ? null : cur - yesterday
                  const pct = yesterday === null || yesterday === 0 ? null : ((cur - yesterday) / yesterday) * 100
                  // Green up, red down, blue unchanged; neutral only when there
```

| File:line | Current | Replacement |
|---|---|---|
| `HistoryModals.tsx:4` | `import { useState } from 'react'` | `import { useRef, useState } from 'react'` |

Rename-only lines elsewhere in the file (for `lint:changed`): `f` → `previousForm`, `h` → `holding`, `l` → `line`, `r` → `region`, `r` → `rejected`, `r` → `submitted`.

* [ ] **Step 7: Modify `frontend/src/features/holdings/OpeningDateModal.tsx` (Edit)**

WHY: Escape skips the prompt, the same as Skip, unless saving.

Current:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, HoldingInput } from '../../types'

// The inception baseline shown as the default when a holding has no opening date.
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { Holding, HoldingInput } from '../../types'

// The inception baseline shown as the default when a holding has no opening date.
```

Current:

```tsx

export default function OpeningDateModal({ holdings, userId, onSkip, onSaved }: Props) {
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map(h => [h.id ?? '', h.opening_date || DEFAULT_OPENING_DATE])),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setDate = (id: string, value: string) => setDates(d => ({ ...d, [id]: value }))

  const saveAll = async () => {
    setErr('')
    setSaving(true)
    try {
      for (const h of holdings) {
        const id = h.id ?? ''
        const date = dates[id]
        if (!date) { setErr('Set a date for every holding'); setSaving(false); return }
        await api.updateHolding(id, holdingInput(h, date), userId)
      }
      onSaved()
    } catch (e) {
```

Replacement:

```tsx

export default function OpeningDateModal({ holdings, userId, onSkip, onSaved }: Props) {
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map(holding => [holding.id ?? '', holding.opening_date || DEFAULT_OPENING_DATE])),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onSkip() })

  const setDate = (id: string, value: string) => setDates(previousDates => ({ ...previousDates, [id]: value }))

  const saveAll = async () => {
    setErr('')
    setSaving(true)
    try {
      for (const holding of holdings) {
        const id = holding.id ?? ''
        const date = dates[id]
        if (!date) { setErr('Set a date for every holding'); setSaving(false); return }
        await api.updateHolding(id, holdingInput(holding, date), userId)
      }
      onSaved()
    } catch (e) {
```

| File:line | Current | Replacement |
|---|---|---|
| `OpeningDateModal.tsx:81` | `<div className="modal-card" style={{` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` |

Rename-only lines elsewhere in the file (for `lint:changed`): `h` → `holding`.

* [ ] **Step 8: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: Same wiring. The rest of the file's diff is id-length renames.

Current:

```tsx
import { parseDecimalInput, parseSeededDecimal } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'
import { currencySymbol } from '../../lib/currency'

// Ordered for the type picker; opening is managed via the holding's opening
// balance, but is shown read-only in the list when present.
```

Replacement:

```tsx
import { parseDecimalInput, parseSeededDecimal } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'
import { currencySymbol } from '../../lib/currency'
import { useDialogFocus } from '../../lib/useDialogFocus'

// Ordered for the type picker; opening is managed via the holding's opening
// balance, but is shown read-only in the list when present.
```

Current:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!holding.id) return
```

Replacement:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onClose() })

  const load = useCallback(async () => {
    if (!holding.id) return
```

| File:line | Current | Replacement |
|---|---|---|
| `TransactionsModal.tsx:1` | `import { useState, useEffect, useCallback } from 'react'` | `import { useState, useEffect, useCallback, useRef } from 'react'` |
| `TransactionsModal.tsx:234` | `<div className="modal-card" style={{` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` |

Rename-only lines elsewhere in the file (for `lint:changed`): `a` → `left`, `ao` → `leftOpening`, `b` → `right`, `bo` → `rightOpening`, `f` → `previousForm`, `m` → `avgCostById`, `n` → `value`, `t` → `txn`, `t` → `txnType`, `v` → `avgCost`.

* [ ] **Step 9: Modify `frontend/src/features/imports/NameConfirmDialog.tsx` (Edit)**

WHY: Escape goes Back, the dialog's own cancel action.

Current:

```tsx
// imports (PRD-005 §6, PRD-008 §5). Answers are a holding id or null
// (unresolved); `created` lists the names the user chose to create a new
// holding for, offered only when the import supports it (createLabel).
import { useState } from 'react'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
```

Replacement:

```tsx
// imports (PRD-005 §6, PRD-008 §5). Answers are a holding id or null
// (unresolved); `created` lists the names the user chose to create a new
// holding for, offered only when the import supports it (createLabel).
import { useRef, useState } from 'react'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
```

Current:

```tsx
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(name => [name.sheet_name, name.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})

  const answered = names.every(name => {
    const chosen = choice[name.sheet_name]
```

Replacement:

```tsx
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(name => [name.sheet_name, name.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onBack)

  const answered = names.every(name => {
    const chosen = choice[name.sheet_name]
```

| File:line | Current | Replacement |
|---|---|---|
| `NameConfirmDialog.tsx:51` | `<div style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` |

* [ ] **Step 10: Modify `frontend/src/features/transactions/TradeImportModal.tsx` (Edit)**

WHY: Same as the dividend import: Escape on the result step acts like Done.

Current:

```tsx
// The trades CSV import (PD-051): choose a broker export → confirm unknown
// symbols (map, create or leave) → preview → one atomic commit. Built from
// the dividend import's shared pieces (features/imports).
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { ImportCounts, InvalidLines, type InvalidLine } from '../imports/ImportTables'
```

Replacement:

```tsx
// The trades CSV import (PD-051): choose a broker export → confirm unknown
// symbols (map, create or leave) → preview → one atomic commit. Built from
// the dividend import's shared pieces (features/imports).
import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { ImportCounts, InvalidLines, type InvalidLine } from '../imports/ImportTables'
```

Current:

```tsx
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Trades import into INR holdings only (NSE / BSE).
  const inrHoldings = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'), [holdings])
```

Replacement:

```tsx
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useRef<HTMLDivElement>(null)
  // Escape on the result step behaves like Done so the page refreshes. The
  // names step renders its own dialog, which owns the keys meanwhile.
  useDialogFocus(root, () => {
    if (busy) return
    if (step === 'result') onImported()
    onClose()
  }, step !== 'names' || !preview)
  // Trades import into INR holdings only (NSE / BSE).
  const inrHoldings = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'), [holdings])
```

| File:line | Current | Replacement |
|---|---|---|
| `TradeImportModal.tsx:121` | `<div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` | `<div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>` |

* [ ] **Step 11: Modify `frontend/src/lib/useDialogFocus.ts` (Edit)**

WHY: History opens the conflict dialog over the paste dialog, and both now call the hook. Without a stack both handle Tab and Escape, so one key closes two dialogs. A module-level `openDialogs` list lets only the top one react.

Current:

```ts
import { useEffect, useRef, type RefObject } from 'react'

/** Keep keyboard focus inside a modal and restore the invoking control. */
export function useDialogFocus(root: RefObject<HTMLElement>, onClose: () => void, active = true, restoreFocusTo?: HTMLElement | null) {
  const close = useRef(onClose)
```

Replacement:

```ts
import { useEffect, useRef, type RefObject } from 'react'

// Open dialogs in opening order. Only the last one (the one on top) handles
// keys, so a dialog stacked over another (History's conflict over paste)
// owns Tab and Escape until it closes.
const openDialogs: HTMLElement[] = []

/** Keep keyboard focus inside a modal and restore the invoking control. */
export function useDialogFocus(root: RefObject<HTMLElement>, onClose: () => void, active = true, restoreFocusTo?: HTMLElement | null) {
  const close = useRef(onClose)
```

Current:

```ts
  useEffect(() => {
    if (!active || !root.current) return
    const dialog = root.current
    const previous = restoreFocusTo ?? document.activeElement as HTMLElement | null
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter(element => !element.closest('[hidden]'))
    ;(controls()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = controls()
```

Replacement:

```ts
  useEffect(() => {
    if (!active || !root.current) return
    const dialog = root.current
    openDialogs.push(dialog)
    const previous = restoreFocusTo ?? document.activeElement as HTMLElement | null
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter(element => !element.closest('[hidden]'))
    ;(controls()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialog) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = controls()
```

Current:

```ts
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [root, active, restoreFocusTo])
```

Replacement:

```ts
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      openDialogs.splice(openDialogs.indexOf(dialog), 1)
      if (previous?.isConnected) previous.focus()
    }
  }, [root, active, restoreFocusTo])
```

* [ ] **Step 12: Create `frontend/src/features/modalFocus.test.tsx`**

WHY: One table over all 15 modals, so a new modal is one more row. Each must move focus inside on open, call its close on Escape, and wrap Tab from the last control back to the first.

```tsx
// Every modal keeps keyboard focus inside itself and closes on Escape
// (PD-058 Task 1). One table so a new modal is one more row.
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DividendRow, Holding, HoldingWithPrice } from '../types'
import type { HistoryRow } from '../lib/api/client'
import { AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal } from './history/HistoryModals'
import TransactionsModal from './holdings/TransactionsModal'
import OpeningDateModal from './holdings/OpeningDateModal'
import GoldTxnModal from './gold/GoldTxnModal'
import MissingPricesModal from './gold/MissingPricesModal'
import DividendModal, { DeleteDividendDialog } from './dividends/DividendModal'
import DeleteAllDialog from './dividends/DeleteAllDialog'
import DividendImportModal from './dividends/DividendImportModal'
import TradeImportModal from './transactions/TradeImportModal'
import NameConfirmDialog from './imports/NameConfirmDialog'

vi.mock('../lib/api/client', () => ({
  api: { listTransactions: vi.fn().mockResolvedValue([]) },
  ApiError: class extends Error {},
}))

const historyRow = { date: '2026-11-03', regions: {}, holdings: [] } as unknown as HistoryRow
const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as Holding
const dividendRow = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1' } as DividendRow

const modals: Array<[string, (close: () => void) => ReactElement]> = [
  ['AddRowModal', close => <AddRowModal onSubmit={async () => {}} onCancel={close} />],
  ['EditRowModal', close => <EditRowModal row={historyRow} onSubmit={async () => {}} onCancel={close} />],
  ['PasteModal', close => <PasteModal monthLabel="2026-11" onSubmit={async () => ({ applied: [], conflicts: [], rejected: [] })} onCancel={close} />],
  ['ConflictDialog', close => <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={close} />],
  ['HoldingsModal', close => <HoldingsModal row={historyRow} prev={null} region="INR" onClose={close} />],
  ['TransactionsModal', close => <TransactionsModal holding={holding as HoldingWithPrice} onClose={close} onChanged={() => {}} />],
  ['OpeningDateModal', close => <OpeningDateModal holdings={[holding]} onSkip={close} onSaved={() => {}} />],
  ['GoldTxnModal', close => <GoldTxnModal txn={null} onClose={close} onSaved={() => {}} />],
  ['MissingPricesModal', close => <MissingPricesModal missing={['2026-11-01']} onSkip={close} onSaved={() => {}} />],
  ['DividendModal', close => <DividendModal currency="INR" holdings={[]} editing={null} onClose={close} onSaved={() => {}} />],
  ['DeleteDividendDialog', close => <DeleteDividendDialog row={dividendRow} currency="INR" onClose={close} onDeleted={() => {}} />],
  ['DeleteAllDialog', close => <DeleteAllDialog currency="INR" count={2} onClose={close} onDeleted={() => {}} />],
  ['DividendImportModal', close => <DividendImportModal currency="INR" holdings={[]} onClose={close} onImported={() => {}} />],
  ['TradeImportModal', close => <TradeImportModal holdings={[]} onClose={close} onImported={() => {}} />],
  ['NameConfirmDialog', close => <NameConfirmDialog names={[]} holdings={[]} heading="Confirm names" intro="" onBack={close} onConfirm={() => {}} />],
]

// The focusable controls of the dialog that currently holds focus.
const dialogControls = () => {
  const dialog = (document.activeElement as HTMLElement).closest('[tabindex="-1"]')!
  return Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
}

describe.each(modals)('%s', (_, renderModal) => {
  it('moves focus inside on open and closes on Escape', async () => {
    const close = vi.fn()
    render(renderModal(close))
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last control back to the first', async () => {
    render(renderModal(() => {}))
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    const controls = dialogControls()
    controls[controls.length - 1].focus()

    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(controls[0]).toHaveFocus()
  })
})
```

* [ ] **Step 13: Create `frontend/src/lib/useDialogFocus.test.tsx`**

WHY: Proves the stack: with two dialogs open, Escape closes only the top one, then the next Escape closes the one underneath.

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

function Dialog({ name, onClose }: { name: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onClose)
  return (
    <div ref={root} tabIndex={-1} data-testid={name}>
      <button type="button">{name} first</button>
      <button type="button">{name} last</button>
    </div>
  )
}

describe('useDialogFocus', () => {
  it('lets only the dialog on top handle Escape and Tab when two are open', () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    render(<><Dialog name="bottom" onClose={closeBottom} /><Dialog name="top" onClose={closeTop} /></>)

    expect(screen.getByText('top first')).toHaveFocus()
    screen.getByText('top last').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.getByText('top first')).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(closeBottom).not.toHaveBeenCalled()
  })

  it('hands the keys back to the lower dialog once the top one closes', () => {
    const closeBottom = vi.fn()
    const { rerender } = render(<><Dialog name="bottom" onClose={closeBottom} /><Dialog name="top" onClose={() => {}} /></>)
    rerender(<Dialog name="bottom" onClose={closeBottom} />)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(closeBottom).toHaveBeenCalledTimes(1)
  })
})
```

* [ ] **Step 14: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/modalFocus.test.tsx src/lib/useDialogFocus.test.tsx && npm run typecheck && npm run lint:changed -- origin/feat/PD-058-modern-web
```

Expected: `Test Files  2 passed (2)` and `Tests  32 passed (32)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 15: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/dividends/DeleteAllDialog.tsx frontend/src/features/dividends/DividendImportModal.tsx frontend/src/features/dividends/DividendModal.tsx frontend/src/features/gold/GoldTxnModal.tsx frontend/src/features/gold/MissingPricesModal.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/holdings/OpeningDateModal.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/imports/NameConfirmDialog.tsx frontend/src/features/modalFocus.test.tsx frontend/src/features/transactions/TradeImportModal.tsx frontend/src/lib/useDialogFocus.test.tsx frontend/src/lib/useDialogFocus.ts
git commit -m "🐛 Trap focus and close on Escape in modals"
```

---

### Task 2: Name every modal as a dialog (#306)

**Files:**

* Modify: `frontend/src/features/gold/GoldTxnModal.tsx`, `frontend/src/features/gold/MissingPricesModal.tsx`, `frontend/src/features/history/HistoryModals.tsx`, `frontend/src/features/holdings/OpeningDateModal.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `frontend/src/features/modalFocus.test.tsx`

Screen readers announced these modals as plain groups of controls, or the role sat on the overlay instead of the element that holds focus. `role="dialog"`, `aria-modal` and a name go on the card from Task 1.

Branch `fix/PD-058-02-dialog-roles` from `fix/PD-058-01-modal-focus`.

* [ ] **Step 1: Modify `frontend/src/features/gold/GoldTxnModal.tsx` (Edit)**

WHY: The role and name move from the overlay to the focused card, and `aria-modal` is added.

Current:

```tsx
  )

  return (
    <div className="modal-overlay" role="dialog" aria-label={txn ? 'Edit gold purchase' : 'Add gold purchase'} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={root} tabIndex={-1} className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 520, maxWidth: '100%',
        maxHeight: '90dvh', overflowY: 'auto',
```

Replacement:

```tsx
  )

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={txn ? 'Edit gold purchase' : 'Add gold purchase'} className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 520, maxWidth: '100%',
        maxHeight: '90dvh', overflowY: 'auto',
```

* [ ] **Step 2: Modify `frontend/src/features/gold/MissingPricesModal.tsx` (Edit)**

WHY: Same move from overlay to card.

Current:

```tsx
  }

  return (
    <div className="modal-overlay" role="dialog" aria-label="Fill missing gold prices" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={root} tabIndex={-1} className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 440, maxWidth: '100%',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
```

Replacement:

```tsx
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Fill missing gold prices" className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 440, maxWidth: '100%',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
```

* [ ] **Step 3: Modify `frontend/src/features/history/HistoryModals.tsx` (Edit)**

WHY: Each of the four cards gets a role and a name that says which row or month it edits.

| File:line | Current | Replacement |
|---|---|---|
| `HistoryModals.tsx:49` | `<div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>` | `<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add manual row" className="modal-card" style={modalCard}>` |
| `HistoryModals.tsx:125` | `<div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>` | `` <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Edit row — ${formatDate(row.date)}`} className="modal-card" style={modalCard}> `` |
| `HistoryModals.tsx:209` | `<div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>` | `` <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Paste month — ${monthLabel}`} className="modal-card" style={modalCard}> `` |
| `HistoryModals.tsx:272` | `<div ref={root} tabIndex={-1} className="modal-card" style={modalCard}>` | `` <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Conflict — ${formatDate(conflict.date)}`} className="modal-card" style={modalCard}> `` |

* [ ] **Step 4: Modify `frontend/src/features/holdings/OpeningDateModal.tsx` (Edit)**

WHY: The card is named "Set opening dates".

| File:line | Current | Replacement |
|---|---|---|
| `OpeningDateModal.tsx:81` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` | `<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Set opening dates" className="modal-card" style={{` |

* [ ] **Step 5: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: The card is named after the holding.

| File:line | Current | Replacement |
|---|---|---|
| `TransactionsModal.tsx:234` | `<div ref={root} tabIndex={-1} className="modal-card" style={{` | `` <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Transactions — ${holding.script}`} className="modal-card" style={{ `` |

* [ ] **Step 6: Modify `frontend/src/features/modalFocus.test.tsx` (Edit)**

WHY: The Task 1 table gains each modal's accessible name, and every row must be found by `getByRole('dialog', { name })` with `aria-modal="true"`.

Current:

```tsx
// Every modal keeps keyboard focus inside itself and closes on Escape
// (PD-058 Task 1). One table so a new modal is one more row.
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DividendRow, Holding, HoldingWithPrice } from '../types'
```

Replacement:

```tsx
// Every modal keeps keyboard focus inside itself, closes on Escape (PD-058
// Task 1) and is announced as a named modal dialog (Task 2). One table so a
// new modal is one more row.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DividendRow, Holding, HoldingWithPrice } from '../types'
```

Current:

```tsx
const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as Holding
const dividendRow = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1' } as DividendRow

const modals: Array<[string, (close: () => void) => ReactElement]> = [
  ['AddRowModal', close => <AddRowModal onSubmit={async () => {}} onCancel={close} />],
  ['EditRowModal', close => <EditRowModal row={historyRow} onSubmit={async () => {}} onCancel={close} />],
  ['PasteModal', close => <PasteModal monthLabel="2026-11" onSubmit={async () => ({ applied: [], conflicts: [], rejected: [] })} onCancel={close} />],
  ['ConflictDialog', close => <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={close} />],
  ['HoldingsModal', close => <HoldingsModal row={historyRow} prev={null} region="INR" onClose={close} />],
  ['TransactionsModal', close => <TransactionsModal holding={holding as HoldingWithPrice} onClose={close} onChanged={() => {}} />],
  ['OpeningDateModal', close => <OpeningDateModal holdings={[holding]} onSkip={close} onSaved={() => {}} />],
  ['GoldTxnModal', close => <GoldTxnModal txn={null} onClose={close} onSaved={() => {}} />],
  ['MissingPricesModal', close => <MissingPricesModal missing={['2026-11-01']} onSkip={close} onSaved={() => {}} />],
  ['DividendModal', close => <DividendModal currency="INR" holdings={[]} editing={null} onClose={close} onSaved={() => {}} />],
  ['DeleteDividendDialog', close => <DeleteDividendDialog row={dividendRow} currency="INR" onClose={close} onDeleted={() => {}} />],
  ['DeleteAllDialog', close => <DeleteAllDialog currency="INR" count={2} onClose={close} onDeleted={() => {}} />],
  ['DividendImportModal', close => <DividendImportModal currency="INR" holdings={[]} onClose={close} onImported={() => {}} />],
  ['TradeImportModal', close => <TradeImportModal holdings={[]} onClose={close} onImported={() => {}} />],
  ['NameConfirmDialog', close => <NameConfirmDialog names={[]} holdings={[]} heading="Confirm names" intro="" onBack={close} onConfirm={() => {}} />],
]

// The focusable controls of the dialog that currently holds focus.
```

Replacement:

```tsx
const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as Holding
const dividendRow = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1' } as DividendRow

const modals: Array<[string, RegExp, (close: () => void) => ReactElement]> = [
  ['AddRowModal', /Add manual row/, close => <AddRowModal onSubmit={async () => {}} onCancel={close} />],
  ['EditRowModal', /Edit row/, close => <EditRowModal row={historyRow} onSubmit={async () => {}} onCancel={close} />],
  ['PasteModal', /Paste month — 2026-11/, close => <PasteModal monthLabel="2026-11" onSubmit={async () => ({ applied: [], conflicts: [], rejected: [] })} onCancel={close} />],
  ['ConflictDialog', /Conflict/, close => <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={close} />],
  ['HoldingsModal', /Holdings/, close => <HoldingsModal row={historyRow} prev={null} region="INR" onClose={close} />],
  ['TransactionsModal', /Transactions — VWCE/, close => <TransactionsModal holding={holding as HoldingWithPrice} onClose={close} onChanged={() => {}} />],
  ['OpeningDateModal', /Set opening dates/, close => <OpeningDateModal holdings={[holding]} onSkip={close} onSaved={() => {}} />],
  ['GoldTxnModal', /Add gold purchase/, close => <GoldTxnModal txn={null} onClose={close} onSaved={() => {}} />],
  ['MissingPricesModal', /Fill missing gold prices/, close => <MissingPricesModal missing={['2026-11-01']} onSkip={close} onSaved={() => {}} />],
  ['DividendModal', /Add dividend/, close => <DividendModal currency="INR" holdings={[]} editing={null} onClose={close} onSaved={() => {}} />],
  ['DeleteDividendDialog', /Delete dividend/, close => <DeleteDividendDialog row={dividendRow} currency="INR" onClose={close} onDeleted={() => {}} />],
  ['DeleteAllDialog', /Delete all INR dividends/, close => <DeleteAllDialog currency="INR" count={2} onClose={close} onDeleted={() => {}} />],
  ['DividendImportModal', /Import dividends/, close => <DividendImportModal currency="INR" holdings={[]} onClose={close} onImported={() => {}} />],
  ['TradeImportModal', /Import trades/, close => <TradeImportModal holdings={[]} onClose={close} onImported={() => {}} />],
  ['NameConfirmDialog', /Confirm names/, close => <NameConfirmDialog names={[]} holdings={[]} heading="Confirm names" intro="" onBack={close} onConfirm={() => {}} />],
]

// The focusable controls of the dialog that currently holds focus.
```

Current:

```tsx
  return Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
}

describe.each(modals)('%s', (_, renderModal) => {
  it('moves focus inside on open and closes on Escape', async () => {
    const close = vi.fn()
    render(renderModal(close))
```

Replacement:

```tsx
  return Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
}

describe.each(modals)('%s', (_, name, renderModal) => {
  it('is announced as a named modal dialog', () => {
    render(renderModal(() => {}))
    expect(screen.getByRole('dialog', { name })).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus inside on open and closes on Escape', async () => {
    const close = vi.fn()
    render(renderModal(close))
```

* [ ] **Step 7: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/modalFocus.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-01-modal-focus
```

Expected: `Tests  45 passed (45)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 8: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/gold/GoldTxnModal.tsx frontend/src/features/gold/MissingPricesModal.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/holdings/OpeningDateModal.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/modalFocus.test.tsx
git commit -m "🐛 Name every modal as a dialog"
```

---

### Task 3: Stop the page scrolling behind modals (#307)

**Files:**

* Create: `frontend/src/styles/modalScroll.browser.test.ts`, `frontend/src/test/browser/modalScroll.fixture.html`, `frontend/src/test/browser/modalScroll.fixture.tsx`
* Modify: `frontend/src/features/history/historyShared.ts`, `frontend/src/styles/components.css`

Wheel or touch scrolling over a modal's backdrop, or past the end of its card, scrolled the page behind it. The guide (`prevent-page-scroll-under-modal-dialog`) rules out locking `body`. The first draft of this plan proposed `overflow: hidden` on the overlay, but that makes the overlay non-scrollable, so scroll chaining still reaches the page. Every overlay instead becomes its own scroll container (`overflow: auto`) with `overscroll-behavior: contain`, and so does every card, including one too short to overflow.

Branch `fix/PD-058-03-modal-scroll` from `fix/PD-058-02-dialog-roles`.

* [ ] **Step 1: Modify `frontend/src/features/history/historyShared.ts` (Edit)**

WHY: The inline-style path: modals built on `modalBackdrop` / `modalCard` don't use the classes, so the shared style objects carry the same two properties.

Current:

```ts
  labelStyle: { color: 'var(--text-secondary)' } as CSSProperties,
  itemStyle: { color: 'var(--text-primary)' } as CSSProperties,
}
export const modalBackdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
export const modalCard: CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 24,
  width: '90%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
}
```

Replacement:

```ts
  labelStyle: { color: 'var(--text-secondary)' } as CSSProperties,
  itemStyle: { color: 'var(--text-primary)' } as CSSProperties,
}
// Scroll containment matches the .modal-overlay / .modal-card rules in
// components.css: gestures over the backdrop or card never scroll the page.
export const modalBackdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  overflow: 'auto', overscrollBehavior: 'contain',
}
export const modalCard: CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 24,
  width: '90%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
  overscrollBehavior: 'contain',
}
```

* [ ] **Step 2: Modify `frontend/src/styles/components.css` (Edit)**

WHY: The class path: `.modal-overlay`, `.classification-overlay` and `.palette-overlay` become contained scroll containers, and the cards contain their own overscroll.

Current:

```css
  animation: fade-in var(--speed) var(--ease);
}

.modal-card {
  animation: scale-in var(--speed-slow) var(--ease);
  box-shadow: var(--shadow-lg);
```

Replacement:

```css
  animation: fade-in var(--speed) var(--ease);
}

/* Scroll containment: wheel and touch gestures over a modal's backdrop or
 * inside its card must not scroll the page behind. Each overlay and card is
 * a scroll container (overflow: auto) so overscroll-behavior applies even
 * when nothing overflows. Never lock <body> overflow instead: that drops the
 * page scrollbar and shifts the layout. The modalBackdrop / modalCard inline
 * styles in historyShared carry the same two declarations. */
.modal-overlay,
.classification-overlay,
.palette-overlay {
  overflow: auto;
  overscroll-behavior: contain;
}

.modal-card,
.classification-card {
  overscroll-behavior: contain;
}

.modal-card {
  animation: scale-in var(--speed-slow) var(--ease);
  box-shadow: var(--shadow-lg);
```

* [ ] **Step 3: Create `frontend/src/test/browser/modalScroll.fixture.html`**

WHY: jsdom has no layout or wheel scrolling, so the test drives real Chromium against this page.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Modal scroll fixture</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./modalScroll.fixture.tsx"></script>
  </body>
</html>
```

* [ ] **Step 4: Create `frontend/src/test/browser/modalScroll.fixture.tsx`**

WHY: A 4000px page with one real app modal on top. `?modal=` picks one modal per styling path: inline only (`delete-all`), class only (`opening-date`), both (`add-row`) and the glass palette (`palette`).

```tsx
// Browser fixture for modalScroll.browser.test.ts: a page tall enough to
// scroll, with one real app modal open on top. ?modal= picks the modal so
// each way a modal gets its containment is covered on its own:
//   delete-all    the shared modalBackdrop / modalCard inline styles only
//   opening-date  the .modal-overlay / .modal-card classes only
//   add-row       both (the class and the inline styles)
//   palette       the .palette-overlay class (glass shell, data-ui="v2")
// Loads the real app stylesheet.
import ReactDOM from 'react-dom/client'
import '../../index.css'
import { AddRowModal } from '../../features/history/HistoryModals'
import OpeningDateModal from '../../features/holdings/OpeningDateModal'
import DeleteAllDialog from '../../features/dividends/DeleteAllDialog'
import { CommandPalette } from '../../components/shell/CommandPalette'
import type { Holding } from '../../types'

const modals = {
  'add-row': <AddRowModal onSubmit={async () => {}} onCancel={() => {}} />,
  'opening-date': <OpeningDateModal holdings={[{ id: 'holding-1', script: 'TCS' } as Holding]} onSkip={() => {}} onSaved={() => {}} />,
  'delete-all': <DeleteAllDialog currency="INR" count={3} onClose={() => {}} onDeleted={() => {}} />,
  'palette': <CommandPalette open onClose={() => {}} commands={[]} />,
}
const chosen = new URLSearchParams(window.location.search).get('modal') as keyof typeof modals
// The palette overlay is styled only inside the glass shell.
if (chosen === 'palette') document.documentElement.dataset.ui = 'v2'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <div data-testid="page" style={{ height: 4000 }}>Background page</div>
    {modals[chosen]}
  </>,
)
```

* [ ] **Step 5: Create `frontend/src/styles/modalScroll.browser.test.ts`**

WHY: Scrolls the page to 1000px, wheels over the backdrop, past a scrolled card's end, and over a card that doesn't overflow, then checks that the page is still at 1000px. Undoing either half of the fix fails only that path's modals. It skips when Chromium can't launch; `REQUIRE_BROWSER_TESTS=1` makes that a failure.

```ts
// @vitest-environment node
/// <reference types="node" />

// An open modal never scrolls the page behind it (PD-058 Task 3). jsdom has
// no layout or wheel scrolling, so this drives real Chromium: a scrolled
// page, a real app modal on top, real wheel input over the backdrop and at
// the card's scroll boundary, then the page's scroll position is checked.
//
// Skips when Playwright's Chromium cannot launch. Set REQUIRE_BROWSER_TESTS=1
// to fail instead (CI will, once it installs the browser — issue #321).
// Install locally: npx playwright install chromium-headless-shell
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const PAGE_SCROLL = 1000

// One launch serves as both the availability probe and the test browser.
const browser = await chromium.launch().catch((error: unknown) => {
  if (process.env.REQUIRE_BROWSER_TESTS === '1') throw error
  return null
})

let server: ViteDevServer
let baseUrl: string

// Resolves once the page has stopped scrolling: its scroll position held
// steady for 10 consecutive frames (about 160ms), capped at 2s. A wheel's
// scroll (smooth or not) starts within a frame or two, so a page that is
// still at rest after this has not been scrolled.
const settle = (page: Page) => page.evaluate(() => new Promise<void>(done => {
  let last = window.scrollY
  let steadyFrames = 0
  const deadline = performance.now() + 2000
  const tick = () => {
    steadyFrames = window.scrollY === last ? steadyFrames + 1 : 0
    last = window.scrollY
    if (steadyFrames >= 10 || performance.now() > deadline) done()
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}))

async function openOverScrolledPage(modal: string, height = 420) {
  const page = await browser!.newPage({ viewport: { width: 1000, height } })
  await page.goto(`${baseUrl}/src/test/browser/modalScroll.fixture.html?modal=${modal}`)
  await page.getByRole('dialog').waitFor()
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), PAGE_SCROLL)
  expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
  return page
}

// Wheels down over a point and reports where the page ended up.
async function wheelAt(page: Page, left: number, top: number) {
  await page.mouse.move(left, top)
  await page.mouse.wheel(0, 600)
  await settle(page)
  return page.evaluate(() => window.scrollY)
}

// The card is the modal's focus-trap root (tabindex="-1"). It is not always
// the role="dialog" element: some modals put the role on the backdrop.
const card = (page: Page) => page.locator('[tabindex="-1"]').first()

async function cardCentre(page: Page) {
  const box = (await card(page).boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2] as const
}

const cardOverflows = (page: Page) =>
  card(page).evaluate(element => element.scrollHeight > element.clientHeight)

describe.skipIf(!browser)('modal scroll containment in a real browser', () => {
  beforeAll(async () => {
    server = await createServer({
      root: resolve(process.cwd()),
      configFile: false,
      plugins: [react()],
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
    })
    await server.listen()
    baseUrl = server.resolvedUrls!.local[0].replace(/\/$/, '')
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(['delete-all', 'opening-date', 'add-row', 'palette'])(
    '%s: wheeling over the backdrop leaves the page where it was', async modal => {
      const page = await openOverScrolledPage(modal)
      expect(await wheelAt(page, 4, 4)).toBe(PAGE_SCROLL) // the backdrop corner, outside the card
      await page.close()
    })

  it.each([['delete-all', 220], ['add-row', 420]] as const)(
    '%s: wheeling past the end of a scrolled card leaves the page where it was', async (modal, height) => {
      const page = await openOverScrolledPage(modal, height)
      expect(await cardOverflows(page)).toBe(true) // the short viewport makes this card scroll
      await card(page).evaluate(element => { element.scrollTop = element.scrollHeight })

      const [left, top] = await cardCentre(page)
      expect(await wheelAt(page, left, top)).toBe(PAGE_SCROLL)
      await page.close()
    })

  it.each(['delete-all', 'opening-date'])(
    '%s: wheeling over a card that does not overflow leaves the page where it was', async modal => {
      const page = await openOverScrolledPage(modal)
      expect(await cardOverflows(page)).toBe(false)

      const [left, top] = await cardCentre(page)
      expect(await wheelAt(page, left, top)).toBe(PAGE_SCROLL)
      await page.close()
    })
}, 60_000)
```

* [ ] **Step 6: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run src/styles/modalScroll.browser.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-02-dialog-roles
```

Expected: `Tests  8 passed (8)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 7: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/history/historyShared.ts frontend/src/styles/components.css frontend/src/styles/modalScroll.browser.test.ts frontend/src/test/browser/modalScroll.fixture.html frontend/src/test/browser/modalScroll.fixture.tsx
git commit -m "🐛 Contain scroll in modal overlays and cards"
```

---

### Task 4: Default dates to today in IST (#308)

**Files:**

* Create: `frontend/src/features/istToday.test.tsx`
* Modify: `frontend/src/features/history/HistoryChartPage.tsx`, `frontend/src/features/history/HistoryModals.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`

`new Date().toISOString().slice(0, 10)` is the UTC date, which is still yesterday between 00:00 and 05:30 IST. `todayIST()` in `lib/formDates` already returns the IST day; these defaults switch to it.

With this default, History would reject today's row at night: the server judged "future" on the UTC date. That backend fix is Task 4a.

Branch `fix/PD-058-04-ist-today` from `fix/PD-058-03-modal-scroll`.

* [ ] **Step 1: Modify `frontend/src/features/history/HistoryChartPage.tsx` (Edit)**

WHY: The chart's range ends at the IST day, so a late-night visit still includes today's row. The rest of the diff is id-length renames.

Current:

```tsx
    let cancelled = false
    setLoading(true)
    setError(null)
    const today = new Date().toISOString().slice(0, 10)
    api.listHistory(HISTORY_START, today)
      .then(list => { if (!cancelled) setRows(list.rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
```

Replacement:

```tsx
    let cancelled = false
    setLoading(true)
    setError(null)
    // Up to the IST day so a late-night visit still includes today's row.
    api.listHistory(HISTORY_START, todayIST())
      .then(list => { if (!cancelled) setRows(list.rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
```

| File:line | Current | Replacement |
|---|---|---|
| `HistoryChartPage.tsx:8` | `import { formatDate } from '../../lib/formDates'` | `import { formatDate, todayIST } from '../../lib/formDates'` |

Rename-only lines elsewhere in the file (for `lint:changed`): `a` → `left`, `b` → `right`, `d` → `day`, `d` → `point`, `g` → `option`, `p` → `point`, `r` → `row`, `s` → `value`, `v` → `value`, `z` → `previousZoom`.

* [ ] **Step 2: Modify `frontend/src/features/history/HistoryModals.tsx` (Edit)**

WHY: The Add row date; `useState(todayIST)` computes it once, on open.

Current:

```tsx
  onSubmit: (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => Promise<void>
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [form, setForm] = useState<RegionFormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
```

Replacement:

```tsx
  onSubmit: (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => Promise<void>
  onCancel: () => void
}) {
  const [date, setDate] = useState(todayIST)
  const [form, setForm] = useState<RegionFormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
```

| File:line | Current | Replacement |
|---|---|---|
| `HistoryModals.tsx:12` | `import { formatDate } from '../../lib/formDates'` | `import { formatDate, todayIST } from '../../lib/formDates'` |

* [ ] **Step 3: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: The new-transaction form's default date.

Current:

```tsx
  notes: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const emptyForm = (): FormState => ({ type: 'buy', date: todayISO(), quantity: '', price: '', amount: '', ratio: '', realized: '', notes: '' })

interface Props {
  // Holding, not HoldingWithPrice: every field this editor reads
```

Replacement:

```tsx
  notes: string
}

// Dates default to the IST calendar day: a UTC slice shows yesterday between
// 00:00 and 05:30 IST.
const emptyForm = (): FormState => ({ type: 'buy', date: todayIST(), quantity: '', price: '', amount: '', ratio: '', realized: '', notes: '' })

interface Props {
  // Holding, not HoldingWithPrice: every field this editor reads
```

| File:line | Current | Replacement |
|---|---|---|
| `TransactionsModal.tsx:8` | `import { formatDate } from '../../lib/formDates'` | `import { formatDate, todayIST } from '../../lib/formDates'` |

Rename-only lines elsewhere in the file (for `lint:changed`): `todayISO` → `todayIST`.

* [ ] **Step 4: Create `frontend/src/features/istToday.test.tsx`**

WHY: Fixes the clock at 20:00 UTC on 17 Nov (01:30 IST on the 18th) and expects each default to be 2026-11-18.

```tsx
// Date defaults follow the IST calendar day (PD-058 Task 4): at 01:30 IST the
// UTC date is still yesterday, and a UTC slice used to prefill it.
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../types'

const mockApi = vi.hoisted(() => ({
  listTransactions: vi.fn().mockResolvedValue([]),
  listHistory: vi.fn().mockResolvedValue({ rows: [] }),
}))
vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client')
  return { ...actual, api: mockApi }
})

import TransactionsModal from './holdings/TransactionsModal'
import { AddRowModal } from './history/HistoryModals'
import HistoryChartPage from './history/HistoryChartPage'

// 2026-11-17 20:00 UTC is 2026-11-18 01:30 IST.
const LATE_NIGHT_IST = new Date('2026-11-17T20:00:00Z')

describe('date defaults at 01:30 IST', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(LATE_NIGHT_IST)
  })
  afterEach(() => vi.useRealTimers())

  it('prefills a new ledger transaction with the IST day', async () => {
    const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as HoldingWithPrice
    const { container } = render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    await waitFor(() => expect(mockApi.listTransactions).toHaveBeenCalled())
    expect(container.querySelector('input[type="date"]')).toHaveValue('2026-11-18')
  })

  it('prefills a manual History row with the IST day', () => {
    render(<AddRowModal onSubmit={async () => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-18')
  })

  it('loads the full-history chart up to the IST day', async () => {
    render(
      <MemoryRouter initialEntries={['/history/chart/INR']}>
        <Routes><Route path="/history/chart/:region" element={<HistoryChartPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith(expect.any(String), '2026-11-18'))
  })
})
```

* [ ] **Step 5: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/istToday.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-03-modal-scroll
```

Expected: `Tests  3 passed (3)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 6: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/history/HistoryChartPage.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/istToday.test.tsx
git commit -m "🐛 Default new dates to the IST day"
```

---

### Task 4a: Judge History future dates on the IST calendar (backend, PR to main) (#323)

**Files:**

* Modify: `backend/internal/services/history.go`, `backend/internal/services/history_test.go`

Add, edit and paste share `parseDateNotFuture`, which compared against the UTC date. It now uses `istDayOf`, the same IST calendar the snapshot job keys on. Backend changes never share a PR with frontend ones, so this went to `main` on its own. The copy first committed on the stack was reverted there.

Branch `fix/history-ist-future-date` from `main`.

* [ ] **Step 1: Modify `backend/internal/services/history.go` (Edit)**

WHY: Takes `now` as a parameter so tests can fix the clock, and compares against the IST day.

Current:

```go
 return math.Round(v*100) / 100
}

func parseDateNotFuture(s string, now func() time.Time) (time.Time, error) {
 d, err := time.Parse("2006-01-02", s)
 if err != nil {
  return time.Time{}, fmt.Errorf("%w: parse %q", ErrInvalidDate, s)
 }
 d = domain.UTCDate(d)
 today := domain.UTCDate(now())
 if d.After(today) {
  return time.Time{}, fmt.Errorf("%w: %s is in the future", ErrInvalidDate, s)
 }
 return d, nil
}

func validateRegions(in map[string]domain.RegionSnapshot) error {
```

Replacement:

```go
 return math.Round(v*100) / 100
}

func parseDateNotFuture(raw string, now func() time.Time) (time.Time, error) {
 date, err := time.Parse("2006-01-02", raw)
 if err != nil {
  return time.Time{}, fmt.Errorf("%w: parse %q", ErrInvalidDate, raw)
 }
 date = domain.UTCDate(date)
 // "Future" is judged on the IST calendar the UI defaults to: between
 // 00:00 and 05:30 IST the UTC date still lags a day behind.
 today := istDayOf(now())
 if date.After(today) {
  return time.Time{}, fmt.Errorf("%w: %s is in the future", ErrInvalidDate, raw)
 }
 return date, nil
}

func validateRegions(in map[string]domain.RegionSnapshot) error {
```

* [ ] **Step 2: Modify `backend/internal/services/history_test.go` (Edit)**

WHY: Add accepts the IST day before the UTC date rolls over, and a table test pins `parseDateNotFuture` to the IST calendar on both sides of midnight.

Current:

```go
 })
}

func TestHistoryService_Add_RejectsUnknownRegion(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("bad region", func(mt *mtest.T) {
```

Replacement:

```go
 })
}

func TestHistoryService_Add_AcceptsISTTodayBeforeUTCRollover(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("ist today", func(mt *mtest.T) {
  svc := newHistorySvc(mt)
  // 20:00Z on 17 Nov is 01:30 IST on 18 Nov.
  svc.Now = func() time.Time { return time.Date(2026, 11, 17, 20, 0, 0, 0, time.UTC) }
  // Get (no row) → Upsert's FindOne (no row) → insert.
  mt.AddMockResponses(
   mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch),
   mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch),
   mtest.CreateSuccessResponse(),
  )
  row, err := svc.Add(context.Background(), primitive.NewObjectID(), AddRowInput{
   Date: "2026-11-18",
   Regions: map[string]domain.RegionSnapshot{
    "INR": {Invested: 1, Current: 1},
   },
  })
  if err != nil {
   t.Fatalf("err = %v, want IST today accepted", err)
  }
  if row.Date != "2026-11-18" {
   t.Errorf("row.Date = %q, want 2026-11-18", row.Date)
  }
 })
}

func TestParseDateNotFuture_UsesISTCalendar(t *testing.T) {
 cases := []struct {
  name    string
  now     time.Time
  date    string
  wantErr bool
 }{
  {"ist today after utc lag", time.Date(2026, 11, 17, 20, 0, 0, 0, time.UTC), "2026-11-18", false},
  {"ist tomorrow after utc lag", time.Date(2026, 11, 17, 20, 0, 0, 0, time.UTC), "2026-11-19", true},
  {"before ist rollover", time.Date(2026, 11, 17, 18, 29, 0, 0, time.UTC), "2026-11-18", true},
  {"utc today", time.Date(2026, 11, 17, 18, 29, 0, 0, time.UTC), "2026-11-17", false},
 }
 for _, testCase := range cases {
  t.Run(testCase.name, func(t *testing.T) {
   _, err := parseDateNotFuture(testCase.date, func() time.Time { return testCase.now })
   if gotErr := errors.Is(err, ErrInvalidDate); gotErr != testCase.wantErr {
    t.Errorf("parseDateNotFuture(%q) err = %v, wantErr %v", testCase.date, err, testCase.wantErr)
   }
  })
 }
}

func TestHistoryService_Add_RejectsUnknownRegion(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("bad region", func(mt *mtest.T) {
```

* [ ] **Step 3: Verify**

WHY: the new test fails on the old code and passes on the new.

```bash
cd backend && go test ./internal/services/ -run 'ParseDateNotFuture|AcceptsISTToday|RejectsFutureDate'
```

Expected: `ok  portfolio-dashboard/internal/services`.

* [ ] **Step 4: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add backend/internal/services/history.go backend/internal/services/history_test.go
git commit -m "🐛 Judge history future dates on IST"
```

---

### Task 5: Keyboard-sortable holdings headers (#309)

**Files:**

* Create: `frontend/src/features/holdings/HoldingsTable.sort.test.tsx`
* Modify: `frontend/src/features/holdings/HoldingsTable.tsx`

The holdings headers sorted on a click handler on `<th>`, which keyboards can't reach and which doesn't tell screen readers the sort state (`sortable-table`). Each header now wraps a real `<button>`, and only the active column carries `aria-sort`.

Branch `fix/PD-058-05-holdings-sort` from `fix/PD-058-04-ist-today`.

* [ ] **Step 1: Modify `frontend/src/features/holdings/HoldingsTable.tsx` (Edit)**

WHY: `colHead` and the average-cost header render `<th scope="col" aria-sort>` around a reset-styled button that calls the same sort handler.

Current:

```tsx
  type HoldingWithPreviousClose,
} from './dashboardPriceMovement'
import { currencySymbol } from '../../lib/currency'
import { formatRate, rateTone } from '../../lib/rate'
import { xirrNote, type XirrIndex } from './stockXirr'
```

Replacement:

```tsx
  type HoldingWithPreviousClose,
} from './dashboardPriceMovement'
import { currencySymbol } from '../../lib/currency'
import { sortHeaderBtn } from '../history/historyShared'
import { formatRate, rateTone } from '../../lib/rate'
import { xirrNote, type XirrIndex } from './stockXirr'
```

Current:

```tsx
  className?: string
}

const TH = ({ children, style, className }: CellProps) => (
  <th className={className} style={{
    padding: '10px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
```

Replacement:

```tsx
  className?: string
}

// Every header names a column (scope="col"); a sortable one carries aria-sort
// only while it is the active sort column.
const TH = ({ children, style, className, ariaSort }: CellProps & { ariaSort?: 'ascending' | 'descending' }) => (
  <th scope="col" aria-sort={ariaSort} className={className} style={{
    padding: '10px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
```

Current:

```tsx

  const SortIcon = ({ k }: { k: keyof HoldingWithPrice }) => <>{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</>

  const colHead = (label: string, key: keyof HoldingWithPrice) => (
    <TH style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => toggleSort(key)} style={{ color: sortKey === key ? 'var(--text-primary)' : undefined }}>
        {label}<SortIcon k={key} />
      </span>
    </TH>
  )
```

Replacement:

```tsx

  const SortIcon = ({ k }: { k: keyof HoldingWithPrice }) => <>{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</>

  // A real button inside the header so the sort is reachable by keyboard and
  // operable by screen readers; the th itself is not clickable.
  const colHead = (label: string, key: keyof HoldingWithPrice) => (
    <TH ariaSort={sortKey === key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => toggleSort(key)} style={{
        ...sortHeaderBtn, fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
        userSelect: 'none', color: sortKey === key ? 'var(--text-primary)' : 'inherit',
      }}>
        {label}<SortIcon k={key} />
      </button>
    </TH>
  )
```

| File:line | Current | Replacement |
|---|---|---|
| `HoldingsTable.tsx:215` | `<TH>{(<span onClick={() => toggleSort('avg_cost_price')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'avg_cost_price' ? 'var(--text-primary)' : undefined }}>Avg Cost/Sh<SortIcon k="avg_cost_price" /></span>)}</TH>` | `{colHead('Avg Cost/Sh', 'avg_cost_price')}` |

* [ ] **Step 2: Create `frontend/src/features/holdings/HoldingsTable.sort.test.tsx`**

WHY: A header button sorts by its column and only that column carries `aria-sort`; average cost sorts the same way; every header cell has `scope`.

```tsx
// Sortable holdings headers are keyboard buttons inside scoped th cells, and
// only the active column carries aria-sort (PD-058 Task 5).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import HoldingsTable from './HoldingsTable'

const holding = (id: string, script: string, shares: number) => ({
  id, script, symbol: `${script}.NS`, currency: 'INR', stocks_owned: shares,
  avg_cost_price: 10, current_price: 12,
}) as HoldingWithPrice

const renderTable = () => render(
  <HoldingsTable holdings={[holding('one', 'ALPHA', 5), holding('two', 'BETA', 1)]} loading={false}
    onEdit={() => {}} onDelete={() => {}} />,
)

const header = (name: RegExp) => screen.getByRole('button', { name }).closest('th')!
const firstScript = () => within(screen.getAllByRole('row')[1]).getAllByText(/^(ALPHA|BETA)$/)[0].textContent

describe('HoldingsTable sort headers', () => {
  it('sorts by a column from a header button and marks only that column', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: /^Shares/ }))

    expect(header(/^Shares/)).toHaveAttribute('aria-sort', 'ascending')
    expect(firstScript()).toBe('BETA')
    expect(header(/^Avg Cost/)).not.toHaveAttribute('aria-sort')

    fireEvent.click(screen.getByRole('button', { name: /^Shares/ }))
    expect(header(/^Shares/)).toHaveAttribute('aria-sort', 'descending')
    expect(firstScript()).toBe('ALPHA')
  })

  it('makes avg cost sortable the same way', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: /^Avg Cost\/Sh/ }))
    expect(header(/^Avg Cost/)).toHaveAttribute('aria-sort', 'ascending')
  })

  it('scopes every header cell to its column', () => {
    renderTable()
    for (const cell of screen.getAllByRole('columnheader')) expect(cell).toHaveAttribute('scope', 'col')
  })
})
```

* [ ] **Step 3: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/holdings/HoldingsTable.sort.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-04-ist-today
```

Expected: `Tests  3 passed (3)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 4: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/holdings/HoldingsTable.sort.test.tsx frontend/src/features/holdings/HoldingsTable.tsx
git commit -m "🐛 Make holdings sort headers buttons"
```

---

### Task 6: Clickable summary cards as buttons (#310)

**Files:**

* Create: `frontend/src/components/SummaryCards.keyboard.test.tsx`
* Modify: `frontend/src/components/SummaryCards.tsx`

The summary cards flip on click, but they were `div`s with `onClick`: no keyboard access and no role. The `clickableCard` helper gives a card with a handler a button role, focus and Enter/Space; a card without one stays static.

Branch `fix/PD-058-06-summary-cards` from `fix/PD-058-05-holdings-sort`.

* [ ] **Step 1: Modify `frontend/src/components/SummaryCards.tsx` (Edit)**

WHY: Adds `clickableCard` and uses it for each card that has an `onClick`.

Current:

```tsx
    )
}

interface CardProps {
    label: string
    inr: number
```

Replacement:

```tsx
    )
}

// clickableCard makes a card that reacts to clicks reachable and operable by
// keyboard: focusable, announced as a button, activated by Enter or Space.
// The cards stay divs because their stacked block content is not allowed
// inside a native <button>. No handler, no props: the card stays static.
export function clickableCard(onClick?: () => void) {
    if (!onClick) return {}
    return {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            onClick()
        },
    }
}

interface CardProps {
    label: string
    inr: number
```

| File:line | Current | Replacement |
|---|---|---|
| `SummaryCards.tsx:114` | `onClick={onClick}>` | `{...clickableCard(onClick)}>` |
| `SummaryCards.tsx:283` | `<div className="card" style={{...cardStyle, ...(onClick ? {cursor: 'pointer'} : {})}} onClick={onClick}>` | `<div className="card" style={{...cardStyle, ...(onClick ? {cursor: 'pointer'} : {})}} {...clickableCard(onClick)}>` |
| `SummaryCards.tsx:339` | `onClick={handleClick}>` | `{...clickableCard(handleClick)}>` |

* [ ] **Step 2: Create `frontend/src/components/SummaryCards.keyboard.test.tsx`**

WHY: Each flippable card is a focusable button, Enter and Space start the flip, and a card without a handler stays static.

```tsx
// Flippable summary cards are keyboard buttons (PD-058 Task 6): focusable,
// announced as buttons, flipped by Enter or Space like a click.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SummaryCards, { clickableCard } from './SummaryCards'
import type { Summary } from '../types'

const summary: Summary = {
  total_cost: 30000,
  total_current_value: 35000,
  total_unrealized: 5000,
  total_realized: 0,
  total_cost_eur: 330,
  total_current_value_eur: 385,
  total_unrealized_eur: 55,
  total_realized_eur: 0,
  eur_rate: 0.011,
}

describe('SummaryCards keyboard access', () => {
  it('exposes each flippable card as a focusable button', () => {
    render(<SummaryCards summary={summary} loading={false} />)
    const invested = screen.getByRole('button', { name: /Total Invested/ })
    expect(invested).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: /Current Value/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Profit & Loss/ })).toBeInTheDocument()
  })

  it.each(['Enter', ' '])('starts the flip on %j', key => {
    render(<SummaryCards summary={summary} loading={false} />)
    const invested = screen.getByRole('button', { name: /Total Invested/ })
    fireEvent.keyDown(invested, { key })
    expect(invested).toHaveClass('card-flipping-out')
  })

  it('leaves a card without a handler static', () => {
    expect(clickableCard(undefined)).toEqual({})
  })
})
```

* [ ] **Step 3: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/components/SummaryCards.keyboard.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-05-holdings-sort
```

Expected: `Tests  4 passed (4)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 4: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/components/SummaryCards.keyboard.test.tsx frontend/src/components/SummaryCards.tsx
git commit -m "🐛 Render clickable summary cards as buttons"
```

---

### Task 7: `aria-sort` on the active column only (#311)

**Files:**

* Modify: `frontend/src/features/history/HistoryPage.test.tsx`, `frontend/src/features/history/HistoryTable.tsx`, `frontend/src/features/transactions/TransactionsAllTable.tsx`, `frontend/src/features/transactions/TransactionsPage.test.tsx`

The guide puts `aria-sort` on the sorted column only. The transactions table set `aria-sort="none"` on every other header, and the History date header (the only sortable column) had none at all.

Branch `fix/PD-058-07-aria-sort` from `fix/PD-058-06-summary-cards`.

* [ ] **Step 1: Modify `frontend/src/features/history/HistoryTable.tsx` (Edit)**

WHY: The date header announces its direction. The rest of the diff is id-length renames.

Current:

```tsx
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, borderRight: '2px solid var(--border)' }}>
              <button onClick={() => setSortAsc(s => !s)} style={sortHeaderBtn}
                aria-label="Sort by date"
                title={sortAsc ? 'Oldest first — click for newest' : 'Newest first — click for oldest'}>
                Date {sortAsc ? '▲' : '▼'}
              </button>
            </th>
            {REGIONS.map((r, idx) => (
              <CurrencyHeaderGroup key={r} region={r} last={idx === REGIONS.length - 1} theme={theme} />
            ))}
            {hasGold && <GoldHeaderGroup />}
            <th style={actionTh}></th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => {
            const i = indexOfDate.get(r.date)!
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            const prev = byDateDesc[i + 1] ?? null
            return (
              <tr key={r.date}
                className={r.tentative ? 'history-row-tentative' : undefined}
                title={r.tentative ? 'Live — not yet snapshotted' : `Source: ${sourceLabel}`}>
                <td style={{ ...td, borderRight: '2px solid var(--border)', fontWeight: 600 }}>
                  {formatDate(r.date)}{r.tentative && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>(live)</span>}
                </td>
                {REGIONS.map((region, idx) => (
                  <CurrencyRowCells
```

Replacement:

```tsx
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            {/* The date is always the sort column, so its th always carries aria-sort. */}
            <th scope="col" aria-sort={sortAsc ? 'ascending' : 'descending'}
              style={{ ...th, borderRight: '2px solid var(--border)' }}>
              <button type="button" onClick={() => setSortAsc(ascending => !ascending)} style={sortHeaderBtn}
                aria-label="Sort by date"
                title={sortAsc ? 'Oldest first — click for newest' : 'Newest first — click for oldest'}>
                Date {sortAsc ? '▲' : '▼'}
              </button>
            </th>
            {REGIONS.map((region, idx) => (
              <CurrencyHeaderGroup key={region} region={region} last={idx === REGIONS.length - 1} theme={theme} />
            ))}
            {hasGold && <GoldHeaderGroup />}
            <th style={actionTh}></th>
          </tr>
        </thead>
        <tbody>
          {display.map((row) => {
            const i = indexOfDate.get(row.date)!
            const sources = new Set(Object.values(row.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            const prev = byDateDesc[i + 1] ?? null
            return (
              <tr key={row.date}
                className={row.tentative ? 'history-row-tentative' : undefined}
                title={row.tentative ? 'Live — not yet snapshotted' : `Source: ${sourceLabel}`}>
                <td style={{ ...td, borderRight: '2px solid var(--border)', fontWeight: 600 }}>
                  {formatDate(row.date)}{row.tentative && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>(live)</span>}
                </td>
                {REGIONS.map((region, idx) => (
                  <CurrencyRowCells
```

Rename-only lines elsewhere in the file (for `lint:changed`): `a` → `left`, `b` → `right`, `h` → `holding`, `m` → `positionByDate`, `r` → `row`, `r` → `snapshot`.

* [ ] **Step 2: Modify `frontend/src/features/transactions/TransactionsAllTable.tsx` (Edit)**

WHY: Inactive headers drop the attribute; the sortable headers gain `scope="col"`.

Current:

```tsx
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th style={{ ...TH_BASE, ...style }}>{children}</th>
)

// A sortable header carries aria-sort so the active column and its direction
// are announced, not just tinted.
function SortTh({ col, sort, onSort, align, children }: {
  col: SortKey
  sort: Sort
```

Replacement:

```tsx
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th scope="col" style={{ ...TH_BASE, ...style }}>{children}</th>
)

// Only the active sort column carries aria-sort (with its direction), so the
// sorted column is announced, not just tinted. Inactive columns omit it:
// aria-sort="none" on every other header is noise the guide rules out.
function SortTh({ col, sort, onSort, align, children }: {
  col: SortKey
  sort: Sort
```

Current:

```tsx
}) {
  const active = sort.key === col
  return (
    <th style={{ ...TH_BASE, textAlign: align ?? 'right' }}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(col)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
        color: active ? 'var(--blue)' : 'inherit',
```

Replacement:

```tsx
}) {
  const active = sort.key === col
  return (
    <th scope="col" style={{ ...TH_BASE, textAlign: align ?? 'right' }}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => onSort(col)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
        color: active ? 'var(--blue)' : 'inherit',
```

* [ ] **Step 3: Modify `frontend/src/features/history/HistoryPage.test.tsx` (Edit)**

WHY: The date header carries its current sort direction.

Current:

```tsx
// ---- HistoryTable (TDD §7.3) ----

describe('HistoryTable', () => {
  it('renders currency-prefixed values per group (₹/€/$) with absent regions at 0', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({
```

Replacement:

```tsx
// ---- HistoryTable (TDD §7.3) ----

describe('HistoryTable', () => {
  // PD-058 Task 7: the date header announces its sort direction.
  it('marks the date header with its current sort direction', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } })]} />)
    const sortButton = screen.getByRole('button', { name: 'Sort by date' })
    const dateHeader = sortButton.closest('th')!
    expect(dateHeader).toHaveAttribute('scope', 'col')
    expect(dateHeader).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(sortButton)
    expect(dateHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('renders currency-prefixed values per group (₹/€/$) with absent regions at 0', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({
```

* [ ] **Step 4: Modify `frontend/src/features/transactions/TransactionsPage.test.tsx` (Edit)**

WHY: Only the active column's header carries `aria-sort`.

Current:

```tsx
    await waitFor(() => expect(dateHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending'))
  })

  it('opens the owning holding\'s ledger editor from a row', async () => {
    renderPage()
    await screen.findByText('SIP tranche')
```

Replacement:

```tsx
    await waitFor(() => expect(dateHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending'))
  })

  // PD-058 Task 7: aria-sort marks only the active column; the rest omit it.
  it('puts aria-sort on the active column only', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    const sorted = screen.getAllByRole('columnheader').filter(header => header.hasAttribute('aria-sort'))
    expect(sorted).toHaveLength(1)
    expect(sorted[0]).toHaveTextContent(/^Date/)
    for (const header of screen.getAllByRole('columnheader')) expect(header).toHaveAttribute('scope', 'col')
  })

  it('opens the owning holding\'s ledger editor from a row', async () => {
    renderPage()
    await screen.findByText('SIP tranche')
```

* [ ] **Step 5: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/history/HistoryPage.test.tsx src/features/transactions/TransactionsPage.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-06-summary-cards
```

Expected: `Test Files  2 passed (2)` and `Tests  133 passed (133)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 6: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/history/HistoryPage.test.tsx frontend/src/features/history/HistoryTable.tsx frontend/src/features/transactions/TransactionsAllTable.tsx frontend/src/features/transactions/TransactionsPage.test.tsx
git commit -m "🐛 Set aria-sort on the active column only"
```

---

### Task 8: `scope` on every table header (#312)

**Files:**

* Create: `frontend/src/features/tableHeaderScope.test.tsx`
* Modify: `frontend/src/features/admin/AdminManageAdmins.tsx`, `frontend/src/features/admin/AdminUserList.tsx`, `frontend/src/features/dividends/DividendImportModal.tsx`, `frontend/src/features/dividends/DividendsAnalytics.tsx`, `frontend/src/features/dividends/DividendsTable.tsx`, `frontend/src/features/gold/GoldPage.tsx`, `frontend/src/features/history/HistoryModals.tsx`, `frontend/src/features/history/HistoryTable.tsx`, `frontend/src/features/history/PeriodPerformanceCard.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `frontend/src/features/imports/ImportTables.tsx`

Without `scope`, screen readers guess which header a cell belongs to and often guess wrong in grouped tables like History's (`responsive-table`). Column headers get `scope="col"`, row headers `scope="row"`.

Branch `fix/PD-058-08-th-scope` from `fix/PD-058-07-aria-sort`.

* [ ] **Step 1: Modify `frontend/src/features/admin/AdminManageAdmins.tsx` (Edit)**

WHY: Column headers.

Current:

```tsx
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Region</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
```

Replacement:

```tsx
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Username</th>
                <th scope="col" style={th}>Name</th>
                <th scope="col" style={th}>Role</th>
                <th scope="col" style={th}>Region</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
```

* [ ] **Step 2: Modify `frontend/src/features/admin/AdminUserList.tsx` (Edit)**

WHY: Column headers.

Current:

```tsx
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Region</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
```

Replacement:

```tsx
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={th}>Username</th>
                <th scope="col" style={th}>Name</th>
                <th scope="col" style={th}>Role</th>
                <th scope="col" style={th}>Region</th>
                <th scope="col" style={th}>Status</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
```

* [ ] **Step 3: Modify `frontend/src/features/dividends/DividendImportModal.tsx` (Edit)**

WHY: Preview table headers.

| File:line | Current | Replacement |
|---|---|---|
| `DividendImportModal.tsx:151` | `<thead><tr><th style={th}>Line</th><th style={th}>Date</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>` | `<thead><tr><th scope="col" style={th}>Line</th><th scope="col" style={th}>Date</th><th scope="col" style={th}>Share</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>` |

* [ ] **Step 4: Modify `frontend/src/features/dividends/DividendsAnalytics.tsx` (Edit)**

WHY: Per-year and per-holding tables.

| File:line | Current | Replacement |
|---|---|---|
| `DividendsAnalytics.tsx:41` | `<thead><tr><th style={th}>Year</th><th style={{ ...th, textAlign: 'right' }}>Dividends</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>` | `<thead><tr><th scope="col" style={th}>Year</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Dividends</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>` |
| `DividendsAnalytics.tsx:56` | `<thead><tr><th style={th}>Holding</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>` | `<thead><tr><th scope="col" style={th}>Holding</th><th scope="col" style={th}>Share</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>` |

* [ ] **Step 5: Modify `frontend/src/features/dividends/DividendsTable.tsx` (Edit)**

WHY: Column headers.

Current:

```tsx
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, width: 48 }}>#</th>
            <th style={th}>Date</th>
            <th style={th}>Holding</th>
            <th style={numberTh}>Dividend</th>
            <th style={numberTh}>Cumulative</th>
            <th style={numberTh}>Holding cumulative</th>
            {(onEdit || onDelete) && <th style={actionTh}>Actions</th>}
          </tr>
        </thead>
        <tbody>
```

Replacement:

```tsx
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th scope="col" style={{ ...th, width: 48 }}>#</th>
            <th scope="col" style={th}>Date</th>
            <th scope="col" style={th}>Holding</th>
            <th scope="col" style={numberTh}>Dividend</th>
            <th scope="col" style={numberTh}>Cumulative</th>
            <th scope="col" style={numberTh}>Holding cumulative</th>
            {(onEdit || onDelete) && <th scope="col" style={actionTh}>Actions</th>}
          </tr>
        </thead>
        <tbody>
```

* [ ] **Step 6: Modify `frontend/src/features/gold/GoldPage.tsx` (Edit)**

WHY: Transactions table headers. The rest of the diff is id-length renames.

Current:

```tsx
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Date</th>
                  <th style={th}>gm Price</th>
                  <th style={th}>Weight</th>
                  <th style={{ ...th, ...computed }}>Gold cost</th>
                  <th style={{ ...th, ...computed }}>3%</th>
                  <th style={{ ...th, ...computed }}>Total expected</th>
                  <th style={th}>Price in quote</th>
                  <th style={{ ...th, ...computed }}>3% (quote)</th>
                  <th style={th}>Amt per bill</th>
                  <th style={th}>Actual paid</th>
                  <th style={{ ...th, ...computed }}>Nett per gram</th>
                  <th style={{ ...th, ...computed }}>Nett reduction</th>
                  <th style={th}>Billed weight</th>
                  <th style={{ ...th, ...computed }}>LOSS due to NIMMI</th>
                  <th style={th}>Chennai rate</th>
                  <th style={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, textAlign: 'left' }}>{formatDate(t.date)}</td>
                    <td style={td}>{fmt(t.gm_price)}</td>
                    <td style={td}>{fmt(t.grams_bought, 3)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gold_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gst_on_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.total_expected)}</td>
                    <td style={td}>{fmt(t.quote_price)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gst_on_quote)}</td>
                    <td style={td}>{fmt(t.bill_amount)}</td>
                    <td style={td}>{fmt(t.actual_paid)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.nett_per_gram)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.nett_reduction)}</td>
                    <td style={td}>{fmt(t.billed_weight, 3)}</td>
                    <td style={{ ...td, ...computed, color: t.nimmi_loss > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmt(t.nimmi_loss)}
                    </td>
                    <td style={td}>{t.chennai_rate || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button aria-label={`Edit ${formatDate(t.date)}`} disabled={busy === t.id}
                          onClick={() => setModal({ open: true, txn: t })}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}>
                          <EditIcon size={14} />
                        </button>
                        <button aria-label={`Delete ${formatDate(t.date)}`} disabled={busy === t.id}
                          onClick={() => void remove(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}>
                          <TrashIcon size={14} />
                        </button>
```

Replacement:

```tsx
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>Date</th>
                  <th scope="col" style={th}>gm Price</th>
                  <th scope="col" style={th}>Weight</th>
                  <th scope="col" style={{ ...th, ...computed }}>Gold cost</th>
                  <th scope="col" style={{ ...th, ...computed }}>3%</th>
                  <th scope="col" style={{ ...th, ...computed }}>Total expected</th>
                  <th scope="col" style={th}>Price in quote</th>
                  <th scope="col" style={{ ...th, ...computed }}>3% (quote)</th>
                  <th scope="col" style={th}>Amt per bill</th>
                  <th scope="col" style={th}>Actual paid</th>
                  <th scope="col" style={{ ...th, ...computed }}>Nett per gram</th>
                  <th scope="col" style={{ ...th, ...computed }}>Nett reduction</th>
                  <th scope="col" style={th}>Billed weight</th>
                  <th scope="col" style={{ ...th, ...computed }}>LOSS due to NIMMI</th>
                  <th scope="col" style={th}>Chennai rate</th>
                  <th scope="col" style={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map(txn => (
                  <tr key={txn.id}>
                    <td style={{ ...td, textAlign: 'left' }}>{formatDate(txn.date)}</td>
                    <td style={td}>{fmt(txn.gm_price)}</td>
                    <td style={td}>{fmt(txn.grams_bought, 3)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gold_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gst_on_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.total_expected)}</td>
                    <td style={td}>{fmt(txn.quote_price)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gst_on_quote)}</td>
                    <td style={td}>{fmt(txn.bill_amount)}</td>
                    <td style={td}>{fmt(txn.actual_paid)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.nett_per_gram)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.nett_reduction)}</td>
                    <td style={td}>{fmt(txn.billed_weight, 3)}</td>
                    <td style={{ ...td, ...computed, color: txn.nimmi_loss > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmt(txn.nimmi_loss)}
                    </td>
                    <td style={td}>{txn.chennai_rate || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button aria-label={`Edit ${formatDate(txn.date)}`} disabled={busy === txn.id}
                          onClick={() => setModal({ open: true, txn })}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}>
                          <EditIcon size={14} />
                        </button>
                        <button aria-label={`Delete ${formatDate(txn.date)}`} disabled={busy === txn.id}
                          onClick={() => void remove(txn)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}>
                          <TrashIcon size={14} />
                        </button>
```

Rename-only lines elsewhere in the file (for `lint:changed`): `m` → `goldMetrics`, `t` → `txn`, `v` → `value`.

* [ ] **Step 7: Modify `frontend/src/features/history/HistoryModals.tsx` (Edit)**

WHY: The holdings breakdown table.

Current:

```tsx
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Script name</th>
                  <th style={{ ...th, textAlign: 'right' }}>Yesterday price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Current price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Change value</th>
                  <th style={{ ...th, textAlign: 'right' }}>Daily change</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dividends to date</th>
                </tr>
              </thead>
              <tbody>
```

Replacement:

```tsx
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={th}>Script name</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Yesterday price</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Current price</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Change value</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Daily change</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Dividends to date</th>
                </tr>
              </thead>
              <tbody>
```

| File:line | Current | Replacement |
|---|---|---|
| `HistoryModals.tsx:278` | `<tr><th style={th}>Region</th><th style={th}>Existing</th><th style={th}>Incoming</th><th style={th}>Keep incoming?</th></tr>` | `<tr><th scope="col" style={th}>Region</th><th scope="col" style={th}>Existing</th><th scope="col" style={th}>Incoming</th><th scope="col" style={th}>Keep incoming?</th></tr>` |

* [ ] **Step 8: Modify `frontend/src/features/history/HistoryTable.tsx` (Edit)**

WHY: Both header rows: `scope="colgroup"` on the currency group headers, `scope="col"` on the columns under them.

Current:

```tsx
  const hdr: React.CSSProperties = { ...th, background: tint }
  return (
    <>
      <th style={hdr}>Amount invested</th>
      <th style={hdr}>Actual value</th>
      <th style={hdr}>Daily volatlity</th>
      <th style={hdr}>P/L%</th>
      <th style={{ ...hdr, ...sep }}>Dividends</th>
    </>
  )
}
```

Replacement:

```tsx
  const hdr: React.CSSProperties = { ...th, background: tint }
  return (
    <>
      <th scope="col" style={hdr}>Amount invested</th>
      <th scope="col" style={hdr}>Actual value</th>
      <th scope="col" style={hdr}>Daily volatlity</th>
      <th scope="col" style={hdr}>P/L%</th>
      <th scope="col" style={{ ...hdr, ...sep }}>Dividends</th>
    </>
  )
}
```

Current:

```tsx
  const hdr: React.CSSProperties = { ...th, background: GOLD_TINT }
  return (
    <>
      <th style={{ ...hdr, borderLeft: '2px solid var(--border)' }}>Gold invested</th>
      <th style={hdr}>Gold value</th>
      <th style={hdr}>Daily volatility</th>
      <th style={hdr}>P/L%</th>
    </>
  )
}
```

Replacement:

```tsx
  const hdr: React.CSSProperties = { ...th, background: GOLD_TINT }
  return (
    <>
      <th scope="col" style={{ ...hdr, borderLeft: '2px solid var(--border)' }}>Gold invested</th>
      <th scope="col" style={hdr}>Gold value</th>
      <th scope="col" style={hdr}>Daily volatility</th>
      <th scope="col" style={hdr}>P/L%</th>
    </>
  )
}
```

| File:line | Current | Replacement |
|---|---|---|
| `HistoryTable.tsx:89` | `<th style={actionTh}></th>` | `<th scope="col" style={actionTh}></th>` |

* [ ] **Step 9: Modify `frontend/src/features/history/PeriodPerformanceCard.tsx` (Edit)**

WHY: Row headers name each period.

Current:

```tsx
        }}>
          <thead>
            <tr>
              <th style={{ ...cellBase, width: '26%', textAlign: 'left', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metric</th>
              {columns.map(perf => (
                <th key={perf.column} style={{
                  ...cellBase, ...blockEdges, borderTop: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
                  textAlign: 'center', background: columnTint(theme, perf.column).header,
                }}>
```

Replacement:

```tsx
        }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...cellBase, width: '26%', textAlign: 'left', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metric</th>
              {columns.map(perf => (
                <th key={perf.column} scope="col" style={{
                  ...cellBase, ...blockEdges, borderTop: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
                  textAlign: 'center', background: columnTint(theme, perf.column).header,
                }}>
```

* [ ] **Step 10: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: Ledger table headers.

| File:line | Current | Replacement |
|---|---|---|
| `TransactionsModal.tsx:425` | `<th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>{children}</th>` | `<th scope="col" style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>{children}</th>` |

* [ ] **Step 11: Modify `frontend/src/features/imports/ImportTables.tsx` (Edit)**

WHY: The shared import preview tables.

| File:line | Current | Replacement |
|---|---|---|
| `ImportTables.tsx:11` | `<thead><tr><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>` | `<thead><tr><th scope="col" style={th}>Status</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>` |
| `ImportTables.tsx:29` | `<thead><tr><th style={th}>Line</th><th style={th}>Problem</th></tr></thead>` | `<thead><tr><th scope="col" style={th}>Line</th><th scope="col" style={th}>Problem</th></tr></thead>` |

* [ ] **Step 12: Create `frontend/src/features/tableHeaderScope.test.tsx`**

WHY: Renders each table and requires every column header to carry a `scope`.

```tsx
// Every data-table column header names its column with scope="col", so
// screen readers pair each cell with its header (PD-058 Task 8).
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { DividendRow } from '../types'
import type { HistoryRow } from '../lib/api/client'
import DividendsTable from './dividends/DividendsTable'
import { ImportCounts, InvalidLines } from './imports/ImportTables'
import { ConflictDialog, HoldingsModal } from './history/HistoryModals'
import { HistoryTable } from './history/HistoryTable'

const dividend = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1', script: 'TCS' } as DividendRow
const historyRow = {
  date: '2026-11-03',
  regions: { INR: { invested: 100, current: 110, source: 'cron' } },
  totals: { invested_total: 100, current_total: 110, pnl_pct: 10 },
  holdings: [{ symbol: 'TCS.NS', script: 'TCS', quantity: 1, close_price: 110, currency: 'INR' }],
} as unknown as HistoryRow

const tables: Array<[string, ReactElement]> = [
  ['DividendsTable', <DividendsTable rows={[dividend]} currency="INR" onEdit={() => {}} />],
  ['ImportCounts', <ImportCounts counts={[['Ready', 1]]} total={1} />],
  ['InvalidLines', <InvalidLines lines={[{ line: 2, reason: 'bad date' }]} />],
  ['ConflictDialog', <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={() => {}} />],
  ['HoldingsModal', <HoldingsModal row={historyRow} prev={null} region="INR" onClose={() => {}} />],
  ['HistoryTable', <HistoryTable rows={[historyRow]} currency="INR" onDelete={() => {}} />],
]

describe.each(tables)('%s', (_, table) => {
  it('scopes every column header', () => {
    render(table)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col')
  })
})
```

* [ ] **Step 13: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/tableHeaderScope.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-07-aria-sort
```

Expected: `Tests  6 passed (6)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 14: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/admin/AdminManageAdmins.tsx frontend/src/features/admin/AdminUserList.tsx frontend/src/features/dividends/DividendImportModal.tsx frontend/src/features/dividends/DividendsAnalytics.tsx frontend/src/features/dividends/DividendsTable.tsx frontend/src/features/gold/GoldPage.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/history/HistoryTable.tsx frontend/src/features/history/PeriodPerformanceCard.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/imports/ImportTables.tsx frontend/src/features/tableHeaderScope.test.tsx
git commit -m "🐛 Add scope to table header cells"
```

---

### Task 9: Theme native controls with `color-scheme` (#313)

**Files:**

* Create: `frontend/src/styles/colorScheme.test.ts`
* Modify: `frontend/index.html`, `frontend/src/lib/useTheme.ts`, `frontend/src/styles/tokens.css`

Date pickers, selects and scrollbars rendered in the browser's light default on the dark themes, because the page never declared `color-scheme` (`dark-mode`). Each theme now declares its scheme, and the browser chrome colour follows the theme.

Branch `fix/PD-058-09-color-scheme` from `fix/PD-058-08-th-scope`.

* [ ] **Step 1: Modify `frontend/index.html` (Edit)**

WHY: `<meta name="color-scheme" content="dark light">` so the first paint, before the stored theme applies, is never a white flash.

Current:

```html
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0a0c16" />
    <title>Portfolio Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

Replacement:

```html
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Both schemes are supported; dark is the default before the stored
         theme applies, so the first paint never flashes white. -->
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" content="#0a0c16" />
    <title>Portfolio Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
```

* [ ] **Step 2: Modify `frontend/src/lib/useTheme.ts` (Edit)**

WHY: `applyTheme` also sets `<meta name="theme-color">` from `THEME_COLOR`, which mirrors each theme's `--bg-primary`.

Current:

```ts
  }
}

function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

// In-memory shadow of the chosen marker so an explicit pick still sticks
```

Replacement:

```ts
  }
}

// Browser chrome colour per theme (the mobile address bar, the PWA title
// bar). Mirrors each theme's --bg-primary in styles/tokens.css.
export const THEME_COLOR: Record<ThemeName, string> = {
  dark: '#0a0c16',
  light: '#f5f7fb',
  cyberpunk: '#06010f',
}

function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

// In-memory shadow of the chosen marker so an explicit pick still sticks
```

* [ ] **Step 3: Modify `frontend/src/styles/tokens.css` (Edit)**

WHY: Dark and cyberpunk declare `color-scheme: dark`, light declares `light`.

Current:

```css
 * inline style={{}} objects across the app reference them — only values
 * change. New tokens are additive and suffixed below the legacy block. */

:root {
  --bg-primary: #0a0c16;
  --brand-font-family: Roboto, Arial, sans-serif;
  --bg-secondary: #121524;
```

Replacement:

```css
 * inline style={{}} objects across the app reference them — only values
 * change. New tokens are additive and suffixed below the legacy block. */

/* color-scheme tells the browser which palette its own UI uses — date
 * pickers, <select> menus, checkboxes, scrollbars and the canvas behind the
 * page. It must sit on :root so viewport-wide controls follow it; each
 * theme block below sets its own. */
:root {
  color-scheme: dark;
  --bg-primary: #0a0c16;
  --brand-font-family: Roboto, Arial, sans-serif;
  --bg-secondary: #121524;
```

Current:

```css
/* Cyberpunk theme — premium-only (PD-046), opt-in via
 * <html data-theme="cyberpunk">. Neon magenta/cyan on violet-black. */
:root[data-theme="cyberpunk"] {
  --bg-primary: #06010f;
  --bg-secondary: #0d0519;
  --bg-card: #120826;
```

Replacement:

```css
/* Cyberpunk theme — premium-only (PD-046), opt-in via
 * <html data-theme="cyberpunk">. Neon magenta/cyan on violet-black. */
:root[data-theme="cyberpunk"] {
  color-scheme: dark;
  --bg-primary: #06010f;
  --bg-secondary: #0d0519;
  --bg-card: #120826;
```

Current:

```css

/* Light theme — opt-in via <html data-theme="light"> (PD-042 PR7). */
:root[data-theme="light"] {
  --bg-primary: #f5f7fb;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
```

Replacement:

```css

/* Light theme — opt-in via <html data-theme="light"> (PD-042 PR7). */
:root[data-theme="light"] {
  color-scheme: light;
  --bg-primary: #f5f7fb;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
```

* [ ] **Step 4: Create `frontend/src/styles/colorScheme.test.ts`**

WHY: Checks each theme block's `color-scheme`, the meta in `index.html`, and that switching themes updates `theme-color`. The first two read source text; replacing them with computed-style checks is listed under Next.

```ts
/// <reference types="node" />

// Native controls follow the app theme (PD-058 Task 9): every theme block
// declares its color-scheme on :root, index.html announces both schemes, and
// the browser-chrome theme-color tracks the active theme.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { THEME_COLOR, __resetThemeChoiceForTests, useTheme } from '../lib/useTheme'

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tokensCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('color-scheme per theme', () => {
  it.each([
    [':root', 'dark'],
    [':root[data-theme="cyberpunk"]', 'dark'],
    [':root[data-theme="light"]', 'light'],
  ])('%s uses the %s scheme', (selector, scheme) => {
    expect(declarationsFor(selector)).toContain(`color-scheme: ${scheme};`)
  })

  it('announces both schemes before the stylesheet loads', () => {
    expect(indexHtml).toContain('<meta name="color-scheme" content="dark light" />')
  })
})

describe('theme-color meta', () => {
  beforeEach(() => {
    __resetThemeChoiceForTests()
    document.head.innerHTML = '<meta name="theme-color" content="#0a0c16" />'
  })

  it('switches the browser chrome colour with the theme', () => {
    const { result } = renderHook(() => useTheme({ premium: false }))
    act(() => result.current.set('light'))
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR.light)

    act(() => result.current.set('dark'))
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR.dark)
  })
})
```

* [ ] **Step 5: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/styles/colorScheme.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-08-th-scope
```

Expected: `Tests  5 passed (5)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 6: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/index.html frontend/src/lib/useTheme.ts frontend/src/styles/colorScheme.test.ts frontend/src/styles/tokens.css
git commit -m "🐛 Declare color-scheme per theme"
```

---

### Task 10: Standard scrollbar properties (#314)

**Files:**

* Create: `frontend/src/styles/scrollbar.browser.test.ts`, `frontend/src/test/browser/harness.ts`, `frontend/src/test/browser/scrollbar.fixture.html`, `frontend/src/test/browser/scrollbar.fixture.ts`
* Modify: `frontend/src/styles/base.css`

The themed scrollbar used only `::-webkit-scrollbar`, which Firefox ignores (`customize-scrollbar-color-and-thickness`). `scrollbar-color` and `scrollbar-width` theme every scroller; the WebKit rules remain as a fallback for browsers without them. This task also creates the shared browser-test harness.

Branch `fix/PD-058-10-scrollbar` from `fix/PD-058-09-color-scheme`.

* [ ] **Step 1: Modify `frontend/src/styles/base.css` (Edit)**

WHY: `scrollbar-color` inherits, so one root rule themes every scroller; `scrollbar-width` doesn't, hence `*`. The fallback block resets `scrollbar-width: auto` so browsers with only that property still apply the WebKit styling.

Current:

```css
}

/* Scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 4px; border: 2px solid var(--bg-primary); }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Utility */
.pos { color: var(--green); }
```

Replacement:

```css
}

/* Scrollbar */
/* Standard properties first: scrollbar-color inherits, so the root rule
 * themes every scroller; scrollbar-width does not inherit, hence `*`. */
:root {
  --scrollbar-thumb: var(--border-light);
  --scrollbar-track: transparent;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
* { scrollbar-width: thin; }

/* WebKit fallback only where scrollbar-color is missing. scrollbar-width is
 * reset there because a browser that knows scrollbar-width but not
 * scrollbar-color would otherwise ignore the ::-webkit-scrollbar styling. */
@supports not (scrollbar-color: auto) {
  * { scrollbar-width: auto; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
  ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; border: 2px solid var(--bg-primary); }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
}

/* Utility */
.pos { color: var(--green); }
```

* [ ] **Step 2: Create `frontend/src/test/browser/harness.ts`**

WHY: Tasks 3 and 10 both need "launch Chromium + serve a fixture through Vite". The shared helper keeps that in one place (the reuse rule); later browser tests import it.

```ts
/// <reference types="node" />

// Shared setup for the real-browser tests (*.browser.test.ts): a Chromium
// from Playwright and a Vite dev server that serves the fixture pages under
// src/test/browser with the real app stylesheet.
//
// The browser is null when Chromium cannot launch, so a test file can skip
// with describe.skipIf(!browser). Set REQUIRE_BROWSER_TESTS=1 to fail
// instead (CI will, once it installs the browser — issue #321).
// Install locally: npx playwright install chromium-headless-shell
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

// One launch serves as both the availability probe and the test browser.
export const launchBrowser = () => chromium.launch().catch((error: unknown) => {
  if (process.env.REQUIRE_BROWSER_TESTS === '1') throw error
  return null
})

// Starts a dev server on a free port; baseUrl has no trailing slash.
export async function startFixtureServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({
    root: resolve(process.cwd()),
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
  })
  await server.listen()
  return { server, baseUrl: server.resolvedUrls!.local[0].replace(/\/$/, '') }
}
```

* [ ] **Step 3: Create `frontend/src/test/browser/scrollbar.fixture.html`**

WHY: A page that scrolls, with a nested scroll container.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Scrollbar fixture</title>
  </head>
  <body>
    <!-- Browser fixture for scrollbar.browser.test.ts: a page that scrolls,
         with a nested scroll container inside it. -->
    <div id="nested" style="overflow: auto; height: 120px">
      <div style="height: 1000px"></div>
    </div>
    <div style="height: 3000px"></div>
    <script type="module" src="./scrollbar.fixture.ts"></script>
  </body>
</html>
```

* [ ] **Step 4: Create `frontend/src/test/browser/scrollbar.fixture.ts`**

WHY: Loads the real stylesheet.

```ts
// Loads the real app stylesheet into scrollbar.fixture.html.
import '../../index.css'
```

* [ ] **Step 5: Create `frontend/src/styles/scrollbar.browser.test.ts`**

WHY: Reads the computed width and colour of `<html>` and the nested box in all three themes, with and without the glass UI. An undefined token or an overriding later rule fails it; reformatting the CSS doesn't.

```ts
// @vitest-environment node
/// <reference types="node" />

// Every scroller gets the theme's thin scrollbar (PD-058 Task 10). Checked
// on the styles Chromium computes, for the root and a nested scroll
// container, in every theme: an undefined token, a later overriding rule or
// a theme that doesn't reach the scrollbar fails, a reformatted stylesheet
// doesn't.
//
// The ::-webkit-scrollbar fallback is not covered: it applies only where
// scrollbar-color is unsupported, and Playwright's Chromium supports it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// Each theme, in the current UI and the glass UI (data-ui="v2"), which
// redefines the token the thumb uses.
const THEMES = ['dark', 'light', 'cyberpunk'].flatMap(theme => [[theme, false], [theme, true]] as const)

let server: ViteDevServer
let page: Page

// Switches the theme the way useTheme and applyUiMode do: attributes on <html>.
const applyTheme = (theme: string, glass: boolean) => page.evaluate(([themeName, glassUi]) => {
  document.documentElement.dataset.theme = themeName
  if (glassUi) document.documentElement.dataset.ui = 'v2'
  else delete document.documentElement.dataset.ui
}, [theme, glass] as const)

// The scrollbar styles Chromium computes for the root and the nested container.
const scrollbarStyles = () => page.evaluate(() =>
  [document.documentElement, document.getElementById('nested')!].map(element => {
    const style = getComputedStyle(element)
    return { width: style.scrollbarWidth, color: style.scrollbarColor }
  }))

// The current theme's thumb token, resolved by the browser to rgb(). An
// undefined token leaves scrollbar-color at auto, so it still fails.
const thumbColor = () => page.evaluate(() => {
  const probe = document.createElement('span')
  probe.style.color = 'var(--scrollbar-thumb)'
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
})

describe.skipIf(!browser)('scrollbar styling in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage({ viewport: { width: 800, height: 400 } })
    await page.goto(`${fixture.baseUrl}/src/test/browser/scrollbar.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.documentElement).scrollbarWidth === 'thin')
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('the root and the nested container both scroll', async () => {
    const overflows = await page.evaluate(() =>
      [document.documentElement, document.getElementById('nested')!].map(element => element.scrollHeight > element.clientHeight))
    expect(overflows).toEqual([true, true])
  })

  it.each(THEMES)('%s theme (glass UI: %s): thin, with the theme\'s thumb on a transparent track', async (theme, glass) => {
    await applyTheme(theme, glass)
    const expected = { width: 'thin', color: `${await thumbColor()} rgba(0, 0, 0, 0)` }
    expect(await scrollbarStyles()).toEqual([expected, expected])
  })

  // Guards the per-theme cases: a theme switch that did nothing would leave
  // both sides of their comparison unchanged and still pass.
  it('switching between dark and light changes the scrollbar colour', async () => {
    await applyTheme('dark', false)
    const dark = (await scrollbarStyles())[0].color
    await applyTheme('light', false)
    expect((await scrollbarStyles())[0].color).not.toBe(dark)
  })
})
```

* [ ] **Step 6: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run src/styles/scrollbar.browser.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-09-color-scheme
```

Expected: `Tests  8 passed (8)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 7: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/styles/base.css frontend/src/styles/scrollbar.browser.test.ts frontend/src/test/browser/harness.ts frontend/src/test/browser/scrollbar.fixture.html frontend/src/test/browser/scrollbar.fixture.ts
git commit -m "🐛 Theme scrollbars with standard properties"
```

---

### Task 11: Escape and outside-press close for menus (#315)

**Files:**

* Create: `frontend/src/components/ThemePicker.dismiss.test.tsx`, `frontend/src/lib/useLightDismiss.test.tsx`, `frontend/src/lib/useLightDismiss.ts`
* Modify: `frontend/src/components/ThemePicker.tsx`, `frontend/src/features/dashboard/DashboardPage.test.tsx`, `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/features/history/MonthNavigator.tsx`

Only `MonthNavigator` closed on Escape or a press outside; the account menu closed on mouse-leave (useless to keyboards) and the theme picker not at all (`menu`). Its effect is lifted into `useLightDismiss` and shared.

Branch `fix/PD-058-11-menu-dismiss` from `fix/PD-058-10-scrollbar`.

* [ ] **Step 1: Modify `frontend/src/components/ThemePicker.tsx` (Edit)**

WHY: The inline picker uses the hook.

Current:

```tsx
import { useState } from 'react'
import type { ThemeName } from '../lib/useTheme'

// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu. Page headers use the inline variant,
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { ThemeName } from '../lib/useTheme'
import { useLightDismiss } from '../lib/useLightDismiss'

// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu. Page headers use the inline variant,
```

Current:

```tsx
  variant?: 'menu' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const options = OPTIONS.filter(option => !option.premiumOnly || premium)
  const current = OPTIONS.find(option => option.id === theme) ?? OPTIONS[0]
  const buttons = (
```

Replacement:

```tsx
  variant?: 'menu' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const inlineRoot = useRef<HTMLDivElement>(null)
  useLightDismiss(inlineRoot, open, () => setOpen(false))
  const options = OPTIONS.filter(option => !option.premiumOnly || premium)
  const current = OPTIONS.find(option => option.id === theme) ?? OPTIONS[0]
  const buttons = (
```

Current:

```tsx
  if (variant === 'inline') {
    return (
      <div
        className="theme-picker-inline"
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
```

Replacement:

```tsx
  if (variant === 'inline') {
    return (
      <div
        ref={inlineRoot}
        className="theme-picker-inline"
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
```

* [ ] **Step 2: Modify `frontend/src/features/dashboard/DashboardPage.tsx` (Edit)**

WHY: The account menu uses the hook instead of `onMouseLeave` and exposes `aria-haspopup` / `aria-expanded`.

Current:

```tsx
import { api, type Region } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import type { Holding, HoldingWithPrice } from '../../types'
import ClassificationReview from '../holdings/ClassificationReview'
import { classificationBucket, type SectorSelection } from '../holdings/classification'
```

Replacement:

```tsx
import { api, type Region } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { useLightDismiss } from '../../lib/useLightDismiss'
import type { Holding, HoldingWithPrice } from '../../types'
import ClassificationReview from '../holdings/ClassificationReview'
import { classificationBucket, type SectorSelection } from '../holdings/classification'
```

Current:

```tsx
  const clearSectorTarget = useCallback(() => setSectorTarget(null), [])
  const [filter, setFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [regionLabel, setRegionLabel] = useState<string>('')
  const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)
  const revamp = useUiRevamp()
```

Replacement:

```tsx
  const clearSectorTarget = useCallback(() => setSectorTarget(null), [])
  const [filter, setFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  // Escape and a press outside close the user menu, so keyboard and touch
  // users are not left with it open (mouse users also close it on leave).
  const userMenuRoot = useRef<HTMLDivElement>(null)
  useLightDismiss(userMenuRoot, menuOpen, () => setMenuOpen(false))
  const [regionLabel, setRegionLabel] = useState<string>('')
  const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)
  const revamp = useUiRevamp()
```

Current:

```tsx
          <button onClick={() => setModal('add')} aria-label="Add Holding" className="btn-primary dash-nav-btn">
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div className="dash-nav-user shell-dup" style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(wasOpen => !wasOpen)} className="btn dash-nav-btn"
              style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
            </button>
```

Replacement:

```tsx
          <button onClick={() => setModal('add')} aria-label="Add Holding" className="btn-primary dash-nav-btn">
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div ref={userMenuRoot} className="dash-nav-user shell-dup" style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(wasOpen => !wasOpen)} className="btn dash-nav-btn"
              aria-expanded={menuOpen}
              style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
            </button>
```

* [ ] **Step 3: Modify `frontend/src/features/history/MonthNavigator.tsx` (Edit)**

WHY: Replaces its own effect with the hook; behaviour unchanged.

Current:

```tsx
import { useEffect, useRef, useState } from 'react'
import { MONTHS } from './historyShared'

// The History page's month navigator: ‹ / › step one month, the label opens
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import { useLightDismiss } from '../../lib/useLightDismiss'
import { MONTHS } from './historyShared'

// The History page's month navigator: ‹ / › step one month, the label opens
```

Current:

```tsx
  // The year the grid shows; it follows the selection each time it opens.
  const [gridYear, setGridYear] = useState(value.year)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const atMin = index(value) <= index(min)
  const atMax = index(value) >= index(max)
```

Replacement:

```tsx
  // The year the grid shows; it follows the selection each time it opens.
  const [gridYear, setGridYear] = useState(value.year)
  const rootRef = useRef<HTMLDivElement>(null)
  useLightDismiss(rootRef, open, () => setOpen(false))

  const atMin = index(value) <= index(min)
  const atMax = index(value) >= index(max)
```

* [ ] **Step 4: Create `frontend/src/lib/useLightDismiss.ts`**

WHY: The extracted effect: while open, a `mousedown` outside the root or Escape calls the latest `onClose`.

```ts
import { useEffect, useRef, type RefObject } from 'react'

/** Close an open popup (menu, picker) on Escape or a press outside root.
 * root wraps both the trigger and the popup, so pressing the trigger is an
 * inside press and its own toggle decides. */
export function useLightDismiss(root: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close.current()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current() }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [root, open])
}
```

* [ ] **Step 5: Create `frontend/src/components/ThemePicker.dismiss.test.tsx`**

WHY: Escape closes the inline theme picker's open options.

```tsx
// The inline theme picker closes on Escape (PD-058 Task 11).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ThemePicker from './ThemePicker'

describe('ThemePicker inline dismissal', () => {
  it('closes the open options on Escape', () => {
    render(<ThemePicker variant="inline" theme="dark" onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Theme:/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
```

* [ ] **Step 6: Modify `frontend/src/features/dashboard/DashboardPage.test.tsx` (Edit)**

WHY: The account menu closes on Escape and on a press outside it.

Current:

```tsx
    expect(dividendIncome(holdings)).toEqual({ inr: 350, eur: 40 })
  })
})
```

Replacement:

```tsx
    expect(dividendIncome(holdings)).toEqual({ inr: 350, eur: 40 })
  })
})

// PD-058 Task 11: the account menu closes for keyboard and touch users too.
describe('DashboardPage account menu', () => {
  const openMenu = () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: /Alice/ })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Account settings/ })).toBeInTheDocument()
    return trigger
  }

  it('closes on Escape', () => {
    const trigger = openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: /Account settings/ })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on a press outside the menu', () => {
    openMenu()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('link', { name: /Account settings/ })).not.toBeInTheDocument()
  })
})
```

* [ ] **Step 7: Create `frontend/src/lib/useLightDismiss.test.tsx`**

WHY: Escape and an outside press close; a press inside doesn't; nothing fires while closed.

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useLightDismiss } from './useLightDismiss'

function Popup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useLightDismiss(root, open, onClose)
  return <><div ref={root}><button type="button">inside</button></div><button type="button">outside</button></>
}

describe('useLightDismiss', () => {
  it('closes an open popup on Escape and on a press outside', () => {
    const onClose = vi.fn()
    render(<Popup open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores presses inside and does nothing while closed', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Popup open onClose={onClose} />)
    fireEvent.mouseDown(screen.getByText('inside'))
    rerender(<Popup open={false} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

* [ ] **Step 8: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/lib/useLightDismiss.test.tsx src/components/ThemePicker.dismiss.test.tsx src/features/dashboard/DashboardPage.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-10-scrollbar
```

Expected: `Test Files  3 passed (3)` and `Tests  18 passed (18)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 9: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/components/ThemePicker.dismiss.test.tsx frontend/src/components/ThemePicker.tsx frontend/src/features/dashboard/DashboardPage.test.tsx frontend/src/features/dashboard/DashboardPage.tsx frontend/src/features/history/MonthNavigator.tsx frontend/src/lib/useLightDismiss.test.tsx frontend/src/lib/useLightDismiss.ts
git commit -m "🐛 Close menus on Escape and outside press"
```

---

### Task 12: Names and hints beyond `title` (#316)

**Files:**

* Create: `frontend/src/features/titleHints.test.tsx`
* Modify: `frontend/src/components/SummaryCards.tsx`, `frontend/src/features/history/HistoryTable.tsx`, `frontend/src/features/holdings/HoldingsByCurrency.tsx`, `frontend/src/features/holdings/HoldingsTable.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `frontend/src/styles/base.css`

Some icon buttons were named only by `title`, which not every screen reader reads, and some hints lived only in `title` on non-focusable text (`interest-triggered-tooltips`). Buttons get `aria-label`; the hints get a `.sr-only` copy. The `title`s stay for mouse users.

Branch `fix/PD-058-12-title-names` from `fix/PD-058-11-menu-dismiss`.

* [ ] **Step 1: Modify `frontend/src/components/SummaryCards.tsx` (Edit)**

WHY: The "—" shown when a holding has no previous close is voiced with its reason.

| File:line | Current | Replacement |
|---|---|---|
| `SummaryCards.tsx:41` | `style={{fontSize: 15, fontWeight: 700, color: 'var(--text-muted)'}}>—</span>` | `style={{fontSize: 15, fontWeight: 700, color: 'var(--text-muted)'}}>—<span className="sr-only">: a holding has no previous close yet</span></span>` |

* [ ] **Step 2: Modify `frontend/src/features/history/HistoryTable.tsx` (Edit)**

WHY: A day's dividend receipt, shown only on hover, is voiced in the cell.

Current:

```tsx
      <td {...mouseProps} style={divStyle}
        title={dividends && dividends.on_day > 0 ? `+${fmtCurrency(dividends.on_day, sym)} received this day` : undefined}>
        {dividends ? fmtCurrency(dividends.to_date, sym) : '—'}
      </td>
    </>
  )
```

Replacement:

```tsx
      <td {...mouseProps} style={divStyle}
        title={dividends && dividends.on_day > 0 ? `+${fmtCurrency(dividends.on_day, sym)} received this day` : undefined}>
        {dividends ? fmtCurrency(dividends.to_date, sym) : '—'}
        {dividends && dividends.on_day > 0 && (
          <span className="sr-only"> (+{fmtCurrency(dividends.on_day, sym)} received this day)</span>
        )}
      </td>
    </>
  )
```

* [ ] **Step 3: Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx` (Edit)**

WHY: A `title` hint gets its `.sr-only` copy.

Current:

```tsx
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
        ({secondary})
      </div>
    </div>
  )
}
```

Replacement:

```tsx
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
        ({secondary})
      </div>
      {title && <span className="sr-only">{title}</span>}
    </div>
  )
}
```

* [ ] **Step 4: Modify `frontend/src/features/holdings/HoldingsTable.tsx` (Edit)**

WHY: Row action buttons are named after their holding, and the price error is voiced.

Current:

```tsx
  return (
    <TD className={`mono ${rateTone(rate)}${className ? ` ${className}` : ''}`}>
      <span title={note || undefined}>{formatRate(rate)}{note && rate != null ? '*' : ''}</span>
    </TD>
  )
}
```

Replacement:

```tsx
  return (
    <TD className={`mono ${rateTone(rate)}${className ? ` ${className}` : ''}`}>
      <span title={note || undefined}>{formatRate(rate)}{note && rate != null ? '*' : ''}</span>
      {note && <span className="sr-only"> ({note})</span>}
    </TD>
  )
}
```

Current:

```tsx
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {onTransactions && (
                        <button onClick={() => onTransactions(holding)} disabled={!holding.id}
                          title="Transactions (ledger)" className="btn-row">
                          <ListIcon size={13} />
                        </button>
                      )}
                      <button onClick={() => onEdit(holding)} disabled={!holding.id}
                        title="Edit holding" className="btn-row btn-row-accent">
                        <EditIcon size={13} />
                      </button>
                      <button onClick={() => holding.id && setConfirm(holding.id)} disabled={!holding.id}
                        title="Delete holding" className="btn-row btn-row-danger">
                        <TrashIcon size={13} />
                      </button>
                    </span>
```

Replacement:

```tsx
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {onTransactions && (
                        <button onClick={() => onTransactions(holding)} disabled={!holding.id}
                          title="Transactions (ledger)" aria-label={`Transactions for ${holding.script}`} className="btn-row">
                          <ListIcon size={13} />
                        </button>
                      )}
                      <button onClick={() => onEdit(holding)} disabled={!holding.id}
                        title="Edit holding" aria-label={`Edit ${holding.script}`} className="btn-row btn-row-accent">
                        <EditIcon size={13} />
                      </button>
                      <button onClick={() => holding.id && setConfirm(holding.id)} disabled={!holding.id}
                        title="Delete holding" aria-label={`Delete ${holding.script}`} className="btn-row btn-row-danger">
                        <TrashIcon size={13} />
                      </button>
                    </span>
```

| File:line | Current | Replacement |
|---|---|---|
| `HoldingsTable.tsx:270` | `<div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={holding.price_error}><AlertTriangleIcon size={10} /> price unavail.</div>` | `<div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={holding.price_error}><AlertTriangleIcon size={10} /> price unavail.<span className="sr-only">: {holding.price_error}</span></div>` |

* [ ] **Step 5: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: Ledger row actions name the event they act on.

Current:

```tsx
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(txn)} title="Edit" className="btn-row btn-row-accent">
                          <EditIcon size={12} />
                        </button>
                        <button onClick={() => txn.id && setConfirm(txn.id)} title="Delete" className="btn-row btn-row-danger">
                          <TrashIcon size={12} />
                        </button>
                      </span>
```

Replacement:

```tsx
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(txn)} title="Edit"
                          aria-label={`Edit ${TYPE_LABEL[txn.type || ''] || txn.type} on ${txn.date ? formatDate(txn.date) : 'no date'}`}
                          className="btn-row btn-row-accent">
                          <EditIcon size={12} />
                        </button>
                        <button onClick={() => txn.id && setConfirm(txn.id)} title="Delete"
                          aria-label={`Delete ${TYPE_LABEL[txn.type || ''] || txn.type} on ${txn.date ? formatDate(txn.date) : 'no date'}`}
                          className="btn-row btn-row-danger">
                          <TrashIcon size={12} />
                        </button>
                      </span>
```

* [ ] **Step 6: Modify `frontend/src/styles/base.css` (Edit)**

WHY: Adds the standard visually-hidden `.sr-only` class.

Current:

```css
}
* { scrollbar-width: thin; }

/* WebKit fallback only where scrollbar-color is missing. scrollbar-width is
 * reset there because a browser that knows scrollbar-width but not
 * scrollbar-color would otherwise ignore the ::-webkit-scrollbar styling. */
```

Replacement:

```css
}
* { scrollbar-width: thin; }

/* Screen-reader-only text: read aloud, never painted. Carries hints that the
 * UI otherwise shows only in a hover `title`, which keyboard, touch and
 * screen-reader users never get. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* WebKit fallback only where scrollbar-color is missing. scrollbar-width is
 * reset there because a browser that knows scrollbar-width but not
 * scrollbar-color would otherwise ignore the ::-webkit-scrollbar styling. */
```

* [ ] **Step 7: Create `frontend/src/features/titleHints.test.tsx`**

WHY: Holding row actions and ledger row actions are found by their specific names; the price error and a day's dividend receipt are read as text, not just hover titles.

```tsx
// Names and hints no longer live only in a hover `title` (PD-058 Task 12):
// icon buttons name their target, and caveats are in screen-reader text.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../types'
import type { HistoryRow } from '../lib/api/client'
import HoldingsTable from './holdings/HoldingsTable'
import TransactionsModal from './holdings/TransactionsModal'
import { HistoryTable } from './history/HistoryTable'

vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client')
  return {
    ...actual,
    api: { listTransactions: vi.fn().mockResolvedValue([{ id: 'txn-1', type: 'buy', date: '2026-11-03', quantity: 1, amount: 100 }]) },
  }
})

const holding = {
  id: 'holding-1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', stocks_owned: 1,
  price_error: 'Yahoo returned no quote',
} as HoldingWithPrice

describe('accessible names beyond title', () => {
  it('names each holding row action after its holding', () => {
    render(<HoldingsTable holdings={[holding]} loading={false} onEdit={() => {}} onDelete={() => {}} onTransactions={() => {}} />)
    expect(screen.getByRole('button', { name: 'Edit TCS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete TCS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transactions for TCS' })).toBeInTheDocument()
  })

  it('reads the price error, not just its hover title', () => {
    render(<HoldingsTable holdings={[holding]} loading={false} onEdit={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(': Yahoo returned no quote')).toHaveClass('sr-only')
  })

  it('names ledger row actions after the event', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByRole('button', { name: /^Edit Buy on/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Delete Buy on/ })).toBeInTheDocument()
  })

  it('reads a day’s dividend receipt in the History table', () => {
    const row = {
      date: '2026-11-03',
      regions: { INR: { invested: 100, current: 110, source: 'cron' } },
      totals: { invested_total: 100, current_total: 110, pnl_pct: 10 },
      dividends: { INR: { on_day: 25, to_date: 25 } },
    } as unknown as HistoryRow
    render(<HistoryTable rows={[row]} currency="INR" onDelete={() => {}} />)
    expect(screen.getByText(/received this day/)).toHaveClass('sr-only')
  })
})
```

* [ ] **Step 8: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/features/titleHints.test.tsx && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-11-menu-dismiss
```

Expected: `Tests  4 passed (4)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 9: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/components/SummaryCards.tsx frontend/src/features/history/HistoryTable.tsx frontend/src/features/holdings/HoldingsByCurrency.tsx frontend/src/features/holdings/HoldingsTable.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/titleHints.test.tsx frontend/src/styles/base.css
git commit -m "🐛 Name icon buttons and voice title hints"
```

---

### Task 13: Focus ring in forced colors (#317)

**Files:**

* Create: `frontend/src/styles/focusRing.browser.test.ts`, `frontend/src/test/browser/focusRing.fixture.html`, `frontend/src/test/browser/focusRing.fixture.ts`
* Modify: `frontend/src/styles/base.css`

The focus ring was only a `box-shadow` over `outline: none`. Forced Colors Mode (Windows High Contrast) removes box-shadows, so focus vanished (`color`). A transparent outline behind the ring is repainted there; `!important` beats the inline `outline: none` many inputs set.

The PR also added a byte-identical `harness.ts`: its branch didn't have Task 10's copy yet, and identical files merge cleanly. Building in order, Task 10 has already created it.

Branch `fix/PD-058-13-forced-colors-focus` from `fix/PD-058-12-title-names`.

* [ ] **Step 1: Modify `frontend/src/styles/base.css` (Edit)**

WHY: A transparent `2px` outline under the shadow ring, and a forced-colors rule that paints it `CanvasText`.

Current:

```css
}

/* Visible keyboard-focus ring; box-shadow is never set inline on inputs or
 * buttons, so this applies app-wide without component edits. */
:focus-visible {
  outline: none;
  box-shadow: var(--ring);
  border-radius: var(--radius-sm);
}

/* Scrollbar */
/* Standard properties first: scrollbar-color inherits, so the root rule
 * themes every scroller; scrollbar-width does not inherit, hence `*`. */
```

Replacement:

```css
}

/* Visible keyboard-focus ring; box-shadow is never set inline on inputs or
 * buttons, so this applies app-wide without component edits. The outline is
 * transparent so it is invisible next to the shadow ring, but Forced Colors
 * Mode (Windows High Contrast) drops box-shadows and repaints outlines in a
 * system colour, so the ring still shows there. */
:focus-visible {
  outline: 2px solid transparent;
  outline-offset: 1px;
  box-shadow: var(--ring);
  border-radius: var(--radius-sm);
}

/* Several inputs set `outline: none` inline; inline styles beat the rule
 * above, so forced-colors mode needs !important to win them back. */
@media (forced-colors: active) {
  :focus-visible {
    outline: 2px solid CanvasText !important;
  }
}

/* Scrollbar */
/* Standard properties first: scrollbar-color inherits, so the root rule
 * themes every scroller; scrollbar-width does not inherit, hence `*`. */
```

* [ ] **Step 2: Create `frontend/src/test/browser/focusRing.fixture.html`**

WHY: A button, a plain input and an input with inline `outline: none`, after a `#tab-start` anchor so every Tab sequence starts at the same place.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Focus ring fixture</title>
  </head>
  <body>
    <!-- Browser fixture for focusRing.browser.test.ts: controls in tab order.
         The last input sets outline: none inline, as many app inputs do.
         #tab-start is where each Tab sequence begins. -->
    <span id="tab-start" tabindex="-1"></span>
    <button id="button" class="btn">Button</button>
    <input id="plain-input" aria-label="Plain input" />
    <input id="inline-none-input" aria-label="Input with inline outline none" style="outline: none" />
    <script type="module" src="./focusRing.fixture.ts"></script>
  </body>
</html>
```

* [ ] **Step 3: Create `frontend/src/test/browser/focusRing.fixture.ts`**

WHY: Loads the real stylesheet.

```ts
// Loads the real app stylesheet into focusRing.fixture.html.
import '../../index.css'
```

* [ ] **Step 4: Create `frontend/src/styles/focusRing.browser.test.ts`**

WHY: Reaches each control with real Tab presses. Normally the shadow ring shows; with forced colors emulated, each control computes a `2px solid` `CanvasText` outline. Dropping `!important`, adding a later suppressing rule, or reverting the fix fails it.

```ts
// @vitest-environment node
/// <reference types="node" />

// The keyboard focus ring survives Forced Colors Mode (PD-058 Task 13).
// Real Chromium, real Tab presses, then the computed ring of the focused
// control is checked, with forced colors off and emulated on. Covers an
// input with inline `outline: none`, which many app inputs set.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// The fixture's controls, in tab order.
const CONTROLS = ['button', 'plain-input', 'inline-none-input']

let server: ViteDevServer
let page: Page

// Tabs from the top of the page to the control and reports its focus ring.
async function tabTo(control: string) {
  await page.evaluate(() => document.getElementById('tab-start')!.focus())
  for (let presses = 0; presses <= CONTROLS.indexOf(control); presses++) await page.keyboard.press('Tab')
  return page.evaluate(() => {
    const focused = document.activeElement!
    const style = getComputedStyle(focused)
    return {
      id: focused.id,
      focusVisible: focused.matches(':focus-visible'),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      boxShadow: style.boxShadow,
    }
  })
}

// A system colour as the browser resolves it to rgb() right now.
const systemColor = (keyword: string) => page.evaluate(colorKeyword => {
  const probe = document.createElement('span')
  probe.style.color = colorKeyword
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}, keyword)

describe.skipIf(!browser)('keyboard focus ring in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    await page.goto(`${fixture.baseUrl}/src/test/browser/focusRing.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  // Outside forced colors the shadow is the visible ring (the outline is
  // transparent, or removed inline).
  it.each(CONTROLS)('%s: the shadow ring shows', async control => {
    await page.emulateMedia({ forcedColors: 'none' })
    const ring = await tabTo(control)
    expect(ring).toMatchObject({ id: control, focusVisible: true })
    expect(ring.boxShadow).not.toBe('none')
  })

  it.each(CONTROLS)('%s: forced colors paints a CanvasText outline', async control => {
    await page.emulateMedia({ forcedColors: 'active' })
    const ring = await tabTo(control)
    expect(ring).toMatchObject({ id: control, focusVisible: true, outline: `2px solid ${await systemColor('CanvasText')}` })
  })

  // Guards the forced-colors cases: their expected colour must be a visible
  // one, not the transparent outline the normal ring uses.
  it('CanvasText is not transparent under forced colors', async () => {
    await page.emulateMedia({ forcedColors: 'active' })
    expect(await systemColor('CanvasText')).not.toBe('rgba(0, 0, 0, 0)')
  })
})
```

* [ ] **Step 5: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run src/styles/focusRing.browser.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-12-title-names
```

Expected: `Tests  7 passed (7)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 6: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/styles/base.css frontend/src/styles/focusRing.browser.test.ts frontend/src/test/browser/focusRing.fixture.html frontend/src/test/browser/focusRing.fixture.ts
git commit -m "🐛 Keep the focus ring in forced colors"
```

---

### Task 14: Follow the user's text size (#318)

**Files:**

* Create: `frontend/src/styles/textScale.browser.test.ts`, `frontend/src/test/browser/textScale.fixture.html`, `frontend/src/test/browser/textScale.fixture.ts`
* Modify: `frontend/index.html`, `frontend/src/styles/base.css`, `frontend/src/styles/components.css`, `frontend/src/styles/glass.css`

Every stylesheet `font-size` was in px, so text ignored the user's text-size setting (`respect-os-text-scale`). The page opts in with `<meta name="text-scale">`, stylesheet sizes move to rem (px ÷ 16), and the root font-size stays with the browser. Inline TSX `fontSize` numbers are out of scope here (see Next).

Branch `fix/PD-058-14-text-scale` from `fix/PD-058-13-forced-colors-focus`.

* [ ] **Step 1: Modify `frontend/index.html` (Edit)**

WHY: Opts into OS text scaling, with a comment never to set a root font-size.

Current:

```html
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Both schemes are supported; dark is the default before the stored
         theme applies, so the first paint never flashes white. -->
    <meta name="color-scheme" content="dark light" />
```

Replacement:

```html
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Opt into the OS text-size setting: supporting browsers scale 1rem
         with it, so rem-sized stylesheet text follows. Never set a root
         font-size, or the scaling is overridden. -->
    <meta name="text-scale" content="scale" />
    <!-- Both schemes are supported; dark is the default before the stored
         theme applies, so the first paint never flashes white. -->
    <meta name="color-scheme" content="dark light" />
```

* [ ] **Step 2: Modify `frontend/src/styles/base.css` (Edit)**

WHY: Body, button and input sizes.

| File:line | Current | Replacement |
|---|---|---|
| `base.css:17` | `font-size: 14px;` | `font-size: 0.875rem;` |
| `base.css:114` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `base.css:130` | `font-size: 13px;` | `font-size: 0.8125rem;` |

* [ ] **Step 3: Modify `frontend/src/styles/components.css` (Edit)**

WHY: Component sizes, px ÷ 16.

Current:

```css
.holding-form-card { max-height: calc(100dvh - 24px); overflow-y: auto; }
.classification-overlay { position: fixed; inset: 0; z-index: 150; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(0,0,0,.65); }
.classification-card { width: 100%; max-width: 500px; max-height: calc(100dvh - 24px); overflow-y: auto; padding: 24px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius); }
.classification-card h2 { font-size: 20px; margin-bottom: 8px; }
.classification-card p, .classification-identity, .profile-preview { font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
.classification-identity { padding: 14px; margin: 18px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
.classification-card label { display: block; font-size: 12px; margin: 12px 0 6px; }
.classification-card input, .classification-card select { width: 100%; min-width: 0; padding: 10px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.classification-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.classification-error { color: var(--red); font-size: 12px; margin-top: 12px; }
.classification-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--border); background: var(--bg-card); border-radius: var(--radius); padding: 12px 16px; margin-top: 20px; color: var(--text-primary); }
.profile-preview { border-left: 2px solid var(--blue); padding-left: 10px; }
```

Replacement:

```css
.holding-form-card { max-height: calc(100dvh - 24px); overflow-y: auto; }
.classification-overlay { position: fixed; inset: 0; z-index: 150; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(0,0,0,.65); }
.classification-card { width: 100%; max-width: 500px; max-height: calc(100dvh - 24px); overflow-y: auto; padding: 24px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius); }
.classification-card h2 { font-size: 1.25rem; margin-bottom: 8px; }
.classification-card p, .classification-identity, .profile-preview { font-size: 0.75rem; line-height: 1.6; color: var(--text-secondary); }
.classification-identity { padding: 14px; margin: 18px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow-wrap: anywhere; }
.classification-card label { display: block; font-size: 0.75rem; margin: 12px 0 6px; }
.classification-card input, .classification-card select { width: 100%; min-width: 0; padding: 10px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.classification-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.classification-error { color: var(--red); font-size: 0.75rem; margin-top: 12px; }
.classification-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--border); background: var(--bg-card); border-radius: var(--radius); padding: 12px 16px; margin-top: 20px; color: var(--text-primary); }
.profile-preview { border-left: 2px solid var(--blue); padding-left: 10px; }
```

Current:

```css
}
.holdings-table-wrap thead th:first-child { z-index: 3 !important; }
.holdings-table-wrap th { top: 0 !important; }
.sector-badge { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.sector-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; flex-shrink: 0; }
.sector-provider { color: var(--text-muted); }
.sector-group { margin-top: 24px; }
.sector-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; margin-bottom: 10px; scroll-margin-top: 100px; }
.sector-group-meta { font-weight: 400; color: var(--text-secondary); font-size: 12px; }
.sector-allocation-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 12px; }
.sector-allocation-header h3 { font-size: 18px; margin-bottom: 6px; }
.sector-allocation-header p, .sector-allocation-note, .sector-allocation-total { color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.sector-allocation-header select { margin-left: 6px; padding: 8px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.sector-allocation-layout { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: center; gap: 24px; margin: 16px 0; }
.sector-allocation-total { text-align: center; }
.sector-allocation-legend { list-style: none; padding: 0; min-width: 0; }
.sector-allocation-legend button { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 14px 0; text-align: left; background: transparent; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.sector-legend-label { min-width: 0; overflow-wrap: anywhere; }
.sector-allocation-legend small { display: block; font-size: 12px; margin-top: 4px; color: var(--text-secondary); }
.sector-legend-value { text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sector-allocation-note { border-top: 1px solid var(--border); padding-top: 14px; }
.sector-allocation-empty { padding: 32px 0; color: var(--text-secondary); }
```

Replacement:

```css
}
.holdings-table-wrap thead th:first-child { z-index: 3 !important; }
.holdings-table-wrap th { top: 0 !important; }
.sector-badge { font-size: 0.6875rem; color: var(--text-secondary); margin-top: 4px; }
.sector-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; flex-shrink: 0; }
.sector-provider { color: var(--text-muted); }
.sector-group { margin-top: 24px; }
.sector-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 0.875rem; margin-bottom: 10px; scroll-margin-top: 100px; }
.sector-group-meta { font-weight: 400; color: var(--text-secondary); font-size: 0.75rem; }
.sector-allocation-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 12px; }
.sector-allocation-header h3 { font-size: 1.125rem; margin-bottom: 6px; }
.sector-allocation-header p, .sector-allocation-note, .sector-allocation-total { color: var(--text-secondary); font-size: 0.75rem; line-height: 1.6; }
.sector-allocation-header select { margin-left: 6px; padding: 8px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.sector-allocation-layout { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: center; gap: 24px; margin: 16px 0; }
.sector-allocation-total { text-align: center; }
.sector-allocation-legend { list-style: none; padding: 0; min-width: 0; }
.sector-allocation-legend button { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 14px 0; text-align: left; background: transparent; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.sector-legend-label { min-width: 0; overflow-wrap: anywhere; }
.sector-allocation-legend small { display: block; font-size: 0.75rem; margin-top: 4px; color: var(--text-secondary); }
.sector-legend-value { text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sector-allocation-note { border-top: 1px solid var(--border); padding-top: 14px; }
.sector-allocation-empty { padding: 32px 0; color: var(--text-secondary); }
```

| File:line | Current | Replacement |
|---|---|---|
| `components.css:253` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `components.css:280` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `components.css:297` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `components.css:311` | `font-size: 12px;` | `font-size: 0.75rem;` |
| `components.css:370` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `components.css:392` | `font-size: 12px;` | `font-size: 0.75rem;` |

* [ ] **Step 4: Modify `frontend/src/styles/glass.css` (Edit)**

WHY: Glass-UI sizes, px ÷ 16.

Current:

```css
:root[data-ui="v2"] .hero-chip.neg .hero-chip-label { color: var(--text-secondary); }
:root[data-ui="v2"] .hero-chip.pos .hero-chip-value { color: var(--green); }
:root[data-ui="v2"] .hero-chip.neg .hero-chip-value { color: var(--red); }
:root[data-ui="v2"] .hero-chip-value { font-size: 17px; font-weight: 700; }
:root[data-ui="v2"] .hero-chip-value small { font-size: 12px; font-weight: 600; opacity: 0.85; }

/* The Unrealised chip is a button that flips to the next currency. */
:root[data-ui="v2"] .hero-chip-cycle {
```

Replacement:

```css
:root[data-ui="v2"] .hero-chip.neg .hero-chip-label { color: var(--text-secondary); }
:root[data-ui="v2"] .hero-chip.pos .hero-chip-value { color: var(--green); }
:root[data-ui="v2"] .hero-chip.neg .hero-chip-value { color: var(--red); }
:root[data-ui="v2"] .hero-chip-value { font-size: 1.0625rem; font-weight: 700; }
:root[data-ui="v2"] .hero-chip-value small { font-size: 0.75rem; font-weight: 600; opacity: 0.85; }

/* The Unrealised chip is a button that flips to the next currency. */
:root[data-ui="v2"] .hero-chip-cycle {
```

Current:

```css
  border-color: rgba(120, 150, 255, 0.25);
}
:root[data-ui="v2"] .admin-md-who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
:root[data-ui="v2"] .admin-md-name { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:root[data-ui="v2"] .admin-md-meta { font-size: 12px; color: var(--text-muted); }
:root[data-ui="v2"] .admin-md-empty { padding: 18px; text-align: center; color: var(--text-muted); font-size: 13px; }

:root[data-ui="v2"] .admin-avatar {
  flex-shrink: 0;
```

Replacement:

```css
  border-color: rgba(120, 150, 255, 0.25);
}
:root[data-ui="v2"] .admin-md-who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
:root[data-ui="v2"] .admin-md-name { font-size: 0.84375rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:root[data-ui="v2"] .admin-md-meta { font-size: 0.75rem; color: var(--text-muted); }
:root[data-ui="v2"] .admin-md-empty { padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8125rem; }

:root[data-ui="v2"] .admin-avatar {
  flex-shrink: 0;
```

Current:

```css
  border-radius: 50%;
  background: var(--gradient-brand);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
:root[data-ui="v2"] .admin-avatar-lg { width: 52px; height: 52px; font-size: 17px; }
:root[data-ui="v2"] .admin-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
:root[data-ui="v2"] .admin-dot-ok { background: var(--green); box-shadow: 0 0 8px var(--green); }
:root[data-ui="v2"] .admin-dot-warn { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
```

Replacement:

```css
  border-radius: 50%;
  background: var(--gradient-brand);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}
:root[data-ui="v2"] .admin-avatar-lg { width: 52px; height: 52px; font-size: 1.0625rem; }
:root[data-ui="v2"] .admin-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
:root[data-ui="v2"] .admin-dot-ok { background: var(--green); box-shadow: 0 0 8px var(--green); }
:root[data-ui="v2"] .admin-dot-warn { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
```

Current:

```css
}
:root[data-ui="v2"] .admin-section-title + .admin-row { border-top: none; }
:root[data-ui="v2"] .admin-row-text { flex: 1; min-width: 0; }
:root[data-ui="v2"] .admin-row-label { font-size: 14px; font-weight: 600; }
:root[data-ui="v2"] .admin-row-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
:root[data-ui="v2"] .admin-row-control { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
:root[data-ui="v2"] .admin-select {
  padding: 7px 10px;
```

Replacement:

```css
}
:root[data-ui="v2"] .admin-section-title + .admin-row { border-top: none; }
:root[data-ui="v2"] .admin-row-text { flex: 1; min-width: 0; }
:root[data-ui="v2"] .admin-row-label { font-size: 0.875rem; font-weight: 600; }
:root[data-ui="v2"] .admin-row-desc { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
:root[data-ui="v2"] .admin-row-control { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
:root[data-ui="v2"] .admin-select {
  padding: 7px 10px;
```

Current:

```css
  background: linear-gradient(135deg, rgba(91, 147, 255, 0.18), rgba(139, 92, 246, 0.08)), var(--bg-input);
  box-shadow: 0 0 0 1px var(--blue), 0 10px 30px -12px rgba(91, 147, 255, 0.7);
}
:root[data-ui="v2"] .font-tile-sample { font-size: 34px; font-weight: 700; line-height: 1.1; }
:root[data-ui="v2"] .font-tile-name { font-size: 14px; font-weight: 600; }
:root[data-ui="v2"] .font-tile-text { font-size: 12px; color: var(--text-muted); }
:root[data-ui="v2"] .font-tile-mark {
  position: absolute;
  top: 12px;
```

Replacement:

```css
  background: linear-gradient(135deg, rgba(91, 147, 255, 0.18), rgba(139, 92, 246, 0.08)), var(--bg-input);
  box-shadow: 0 0 0 1px var(--blue), 0 10px 30px -12px rgba(91, 147, 255, 0.7);
}
:root[data-ui="v2"] .font-tile-sample { font-size: 2.125rem; font-weight: 700; line-height: 1.1; }
:root[data-ui="v2"] .font-tile-name { font-size: 0.875rem; font-weight: 600; }
:root[data-ui="v2"] .font-tile-text { font-size: 0.75rem; color: var(--text-muted); }
:root[data-ui="v2"] .font-tile-mark {
  position: absolute;
  top: 12px;
```

Current:

```css
  color: var(--text-secondary);
}
:root[data-ui="v2"] .palette-option[aria-selected="true"] { background: var(--bg-card-hover); color: var(--text-primary); }
:root[data-ui="v2"] .palette-group { min-width: 64px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
:root[data-ui="v2"] .palette-label { flex: 1; font-size: 14px; }
:root[data-ui="v2"] .palette-empty { padding: 18px; text-align: center; color: var(--text-muted); font-size: 13px; }

/* --- Toasts ------------------------------------------------------------------- */
```

Replacement:

```css
  color: var(--text-secondary);
}
:root[data-ui="v2"] .palette-option[aria-selected="true"] { background: var(--bg-card-hover); color: var(--text-primary); }
:root[data-ui="v2"] .palette-group { min-width: 64px; font-size: 0.65625rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
:root[data-ui="v2"] .palette-label { flex: 1; font-size: 0.875rem; }
:root[data-ui="v2"] .palette-empty { padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8125rem; }

/* --- Toasts ------------------------------------------------------------------- */
```

Current:

```css
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  animation: glass-pop var(--speed-slow) var(--ease);
}
:root[data-ui="v2"] .toast-success .toast-icon { color: var(--green); }
:root[data-ui="v2"] .toast-error .toast-icon { color: var(--red); }
:root[data-ui="v2"] .toast-info .toast-icon { color: var(--blue); }
:root[data-ui="v2"] .toast-message { flex: 1; }
:root[data-ui="v2"] .toast-close { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; line-height: 1; }

@media (max-width: 860px) {
  :root[data-ui="v2"] .toaster { left: 18px; right: 18px; bottom: 96px; width: auto; }
```

Replacement:

```css
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
  box-shadow: var(--shadow-lg);
  font-size: 0.8125rem;
  animation: glass-pop var(--speed-slow) var(--ease);
}
:root[data-ui="v2"] .toast-success .toast-icon { color: var(--green); }
:root[data-ui="v2"] .toast-error .toast-icon { color: var(--red); }
:root[data-ui="v2"] .toast-info .toast-icon { color: var(--blue); }
:root[data-ui="v2"] .toast-message { flex: 1; }
:root[data-ui="v2"] .toast-close { background: none; border: none; color: var(--text-muted); font-size: 1.125rem; cursor: pointer; line-height: 1; }

@media (max-width: 860px) {
  :root[data-ui="v2"] .toaster { left: 18px; right: 18px; bottom: 96px; width: auto; }
```

| File:line | Current | Replacement |
|---|---|---|
| `glass.css:289` | `font-size: 16px;` | `font-size: 1rem;` |
| `glass.css:304` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `glass.css:312` | `font-size: 10px;` | `font-size: 0.625rem;` |
| `glass.css:332` | `font-size: 13.5px;` | `font-size: 0.84375rem;` |
| `glass.css:429` | `font-size: 18px;` | `font-size: 1.125rem;` |
| `glass.css:482` | `font-size: 10px;` | `font-size: 0.625rem;` |
| `glass.css:504` | `font-size: 11px;` | `font-size: 0.6875rem;` |
| `glass.css:521` | `:root[data-ui="v2"] .hero-sub { color: var(--text-secondary); font-size: 14px; margin-top: 2px; }` | `:root[data-ui="v2"] .hero-sub { color: var(--text-secondary); font-size: 0.875rem; margin-top: 2px; }` |
| `glass.css:586` | `:root[data-ui="v2"] .hero-split-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--text-secondary); }` | `:root[data-ui="v2"] .hero-split-legend { display: flex; gap: 16px; margin-top: 8px; font-size: 0.75rem; color: var(--text-secondary); }` |
| `glass.css:619` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `glass.css:669` | `:root[data-ui="v2"] .admin-md-title { font-size: 20px; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.02em; }` | `:root[data-ui="v2"] .admin-md-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 2px; letter-spacing: -0.02em; }` |
| `glass.css:677` | `font-size: 11px;` | `font-size: 0.6875rem;` |
| `glass.css:688` | `font-size: 11px;` | `font-size: 0.6875rem;` |
| `glass.css:715` | `font-size: 13px;` | `font-size: 0.8125rem;` |
| `glass.css:786` | `font-size: 12px;` | `font-size: 0.75rem;` |
| `glass.css:837` | `font-size: 15px;` | `font-size: 0.9375rem;` |

* [ ] **Step 5: Create `frontend/src/test/browser/textScale.fixture.html`**

WHY: Representative stylesheet-sized text from each file: body, button, input, a card heading and two glass-UI elements.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Text scale fixture</title>
  </head>
  <body>
    <!-- Browser fixture for textScale.browser.test.ts: text sized by each
         stylesheet (base, components, glass UI), with no inline sizes. -->
    <p id="body-text">Body text</p>
    <button id="button" class="btn">Button</button>
    <input id="input" aria-label="Input" />
    <div class="classification-card"><h2 id="card-heading">Card heading</h2></div>
    <a id="shell-brand" class="shell-brand" href="#">Brand</a>
    <kbd id="kbd">⌘K</kbd>
    <script type="module" src="./textScale.fixture.ts"></script>
  </body>
</html>
```

* [ ] **Step 6: Create `frontend/src/test/browser/textScale.fixture.ts`**

WHY: Loads the real stylesheet.

```ts
// Loads the real app stylesheet into textScale.fixture.html.
import '../../index.css'
```

* [ ] **Step 7: Create `frontend/src/styles/textScale.browser.test.ts`**

WHY: At the default 16px text size each element keeps its px size; at 24px (Chromium's `Page.setFontSizes`, the setting behind Settings → Font size) each grows exactly 1.5×, in both UIs. A root px size (including `html[data-ui="v2"]`) or a px rule fails it. The meta tag itself isn't exercised: desktop Chromium can't emulate the OS setting.

```ts
// @vitest-environment node
/// <reference types="node" />

// Stylesheet text follows the user's text-size setting (PD-058 Task 14).
// Real Chromium: representative text is measured at the default 16px text
// size, then the browser's default text size is raised (the setting behind
// Chrome's Settings → Font size) and the same text must grow with it, in the
// current UI and the glass UI (data-ui="v2").
//
// <meta name="text-scale"> is not exercised: it ties 1rem to the OS text
// size, which only some platforms expose and desktop Chromium can't emulate.
// The browser setting drives rem the same way.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CDPSession, Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

const DEFAULT_TEXT_SIZE = 16
const LARGE_TEXT_SIZE = 24

// Fixture elements and their size at the default text size, in px. The
// glass-UI elements are only sized in that UI.
const TEXT = [
  { id: 'body-text', size: 14, glassOnly: false },
  { id: 'button', size: 13, glassOnly: false },
  { id: 'input', size: 13, glassOnly: false },
  { id: 'card-heading', size: 20, glassOnly: false },
  { id: 'shell-brand', size: 16, glassOnly: true },
  { id: 'kbd', size: 10, glassOnly: true },
]
const UIS = [['current UI', false], ['glass UI', true]] as const

let server: ViteDevServer
let page: Page
let cdp: CDPSession

// The browser's default text size, as the user's font-size setting sets it.
const setTextSize = (standard: number) => cdp.send('Page.setFontSizes', { fontSizes: { standard } })

const applyUi = (glass: boolean) => page.evaluate(glassUi => {
  if (glassUi) document.documentElement.dataset.ui = 'v2'
  else delete document.documentElement.dataset.ui
}, glass)

// The computed font size of each element, in px.
const textSizes = (ids: string[]) => page.evaluate(elementIds =>
  Object.fromEntries(elementIds.map(id => [id, parseFloat(getComputedStyle(document.getElementById(id)!).fontSize)])), ids)

describe.skipIf(!browser)('text scaling in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    cdp = await page.context().newCDPSession(page)
    await page.goto(`${fixture.baseUrl}/src/test/browser/textScale.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(UIS)('%s: text keeps its size at the default text size', async (_, glass) => {
    await applyUi(glass)
    await setTextSize(DEFAULT_TEXT_SIZE)
    const text = TEXT.filter(element => glass || !element.glassOnly)
    expect(await textSizes(text.map(element => element.id)))
      .toEqual(Object.fromEntries(text.map(element => [element.id, element.size])))
  })

  it.each(UIS)('%s: text grows with a larger text size', async (_, glass) => {
    await applyUi(glass)
    await setTextSize(LARGE_TEXT_SIZE)
    const text = TEXT.filter(element => glass || !element.glassOnly)
    const scale = LARGE_TEXT_SIZE / DEFAULT_TEXT_SIZE
    expect(await textSizes(text.map(element => element.id)))
      .toEqual(Object.fromEntries(text.map(element => [element.id, element.size * scale])))
  })
})
```

* [ ] **Step 8: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run src/styles/textScale.browser.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-13-forced-colors-focus
```

Expected: `Tests  4 passed (4)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 9: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/index.html frontend/src/styles/base.css frontend/src/styles/components.css frontend/src/styles/glass.css frontend/src/styles/textScale.browser.test.ts frontend/src/test/browser/textScale.fixture.html frontend/src/test/browser/textScale.fixture.ts
git commit -m "🐛 Size stylesheet text in rem"
```

---

### Task 15: Metric-adjusted font fallbacks (#319)

**Files:**

* Create: `frontend/src/styles/fontFallback.browser.test.ts`, `frontend/src/test/browser/fontFallback.fixture.html`, `frontend/src/test/browser/fontFallback.fixture.ts`
* Modify: `frontend/src/lib/useBranding.tsx`, `frontend/src/styles/base.css`, `frontend/src/styles/tokens.css`

Until the brand web font arrives (`display=swap`), text renders in a system fallback with different metrics, so lines re-wrap when it swaps in (`visually-stable-font-fallbacks`). The first draft used `font-size-adjust: from-font`, which can't work: it reads the first *available* font, which before the swap is the fallback itself. Each brand font instead gets `@font-face` fallbacks over local fonts, resized to its metrics, named second in its stack.

The server's stacks must name the same faces; that's Task 15a. Merge 15a first: until the faces exist, browsers skip the unknown name.

Branch `fix/PD-058-15-font-fallback` from `fix/PD-058-14-text-scale`.

* [ ] **Step 1: Modify `frontend/src/lib/useBranding.tsx` (Edit)**

WHY: The client catalog used until `/branding` answers. The id-length renames are required by `lint:changed`.

Current:

```tsx

// Client-side fallback catalog, used until /branding responds (first paint,
// load errors). The server's allowed_fonts is the source of truth once loaded.
export const FONT_CATALOG: { id: BrandingFont; label: string; css_family: string }[] = [
  { id: 'roboto', label: 'Roboto', css_family: 'Roboto, Arial, sans-serif' },
  { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
]

const FONT_STACKS = Object.fromEntries(FONT_CATALOG.map(f => [f.id, f.css_family])) as Record<BrandingFont, string>

function normaliseFont(raw: unknown): BrandingFont {
  return FONT_CATALOG.some(f => f.id === raw) ? (raw as BrandingFont) : DEFAULT_FONT
}

function readStoredFont(): BrandingFont {
```

Replacement:

```tsx

// Client-side fallback catalog, used until /branding responds (first paint,
// load errors). The server's allowed_fonts is the source of truth once loaded.
// Each stack's second family is its metric-adjusted fallback face
// (styles/base.css), matching the server's stacks.
export const FONT_CATALOG: { id: BrandingFont; label: string; css_family: string }[] = [
  { id: 'roboto', label: 'Roboto', css_family: 'Roboto, "Roboto Fallback", Arial, sans-serif' },
  { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
]

const FONT_STACKS = Object.fromEntries(FONT_CATALOG.map(option => [option.id, option.css_family])) as Record<BrandingFont, string>

function normaliseFont(raw: unknown): BrandingFont {
  return FONT_CATALOG.some(option => option.id === raw) ? (raw as BrandingFont) : DEFAULT_FONT
}

function readStoredFont(): BrandingFont {
```

Rename-only lines elsewhere in the file (for `lint:changed`): `f` → `option`.

* [ ] **Step 2: Modify `frontend/src/styles/base.css` (Edit)**

WHY: Four faces, regular and bold for each brand font. `size-adjust` is the weighted average glyph width ratio; ascent/descent come from the fonts' `hhea` tables (the served Google Fonts files instanced at 400 and 700, against Arial and Courier New). Liberation Sans/Mono, on Linux, have the same metrics. Bold has its own face because a synthesised bold is wider than the real one.

Current:

```css
/* Base layer (PD-045): reset, body backdrop, typography, focus, scrollbar. */

* {
  box-sizing: border-box;
  margin: 0;
```

Replacement:

```css
/* Base layer (PD-045): reset, body backdrop, typography, focus, scrollbar. */

/* Metric-adjusted fallbacks for the brand fonts (PD-058 Task 15). Each brand
 * stack lists "<font> Fallback" second, so while the web font loads (or if it
 * is blocked) text renders in a local font resized to the web font's average
 * glyph width, with its ascent and descent, and the swap does not move the
 * layout. Values come from the font files' hmtx/hhea tables: Roboto against
 * Arial, JetBrains Mono against Courier New. Liberation Sans/Mono (Linux) are
 * metric-compatible with those, so the same values hold. Bold has its own
 * face: a synthesised bold is wider than the real one. */
@font-face {
  font-family: "Roboto Fallback";
  src: local("Arial"), local("ArialMT"), local("Liberation Sans"), local("LiberationSans");
  font-weight: 100 500;
  size-adjust: 100.53%;
  ascent-override: 92.28%;
  descent-override: 24.28%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "Roboto Fallback";
  src: local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold"), local("LiberationSans-Bold");
  font-weight: 600 900;
  size-adjust: 94.09%;
  ascent-override: 98.60%;
  descent-override: 25.95%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "JetBrains Mono Fallback";
  src: local("Courier New"), local("CourierNewPSMT"), local("Liberation Mono"), local("LiberationMono");
  font-weight: 100 500;
  size-adjust: 99.98%;
  ascent-override: 102.02%;
  descent-override: 30%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "JetBrains Mono Fallback";
  src: local("Courier New Bold"), local("CourierNewPS-BoldMT"), local("Liberation Mono Bold"), local("LiberationMono-Bold");
  font-weight: 600 900;
  size-adjust: 99.98%;
  ascent-override: 102.02%;
  descent-override: 30%;
  line-gap-override: 0%;
}

* {
  box-sizing: border-box;
  margin: 0;
```

* [ ] **Step 3: Modify `frontend/src/styles/tokens.css` (Edit)**

WHY: The default stack before branding applies.

| File:line | Current | Replacement |
|---|---|---|
| `tokens.css:12` | `--brand-font-family: Roboto, Arial, sans-serif;` | `--brand-font-family: Roboto, "Roboto Fallback", Arial, sans-serif;` |

* [ ] **Step 4: Create `frontend/src/test/browser/fontFallback.fixture.html`**

WHY: A wrapping regular paragraph, a bold paragraph and a `line-height: normal` line, at large sizes so a mismatch shows in whole pixels.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Font fallback fixture</title>
  </head>
  <body>
    <!-- Browser fixture for fontFallback.browser.test.ts: text in the brand
         font whose geometry is compared before and after the web font loads.
         Sizes are large so a metric mismatch shows up in whole pixels. -->
    <p id="regular" style="width: 360px; font-size: 20px">
      Holdings, prices and realised gains update every five minutes from the
      market feed, and the history page keeps one snapshot per trading day.
    </p>
    <p id="bold" style="width: 360px; font-size: 20px; font-weight: 700">
      Total invested, current value and unrealised profit across every currency.
    </p>
    <p id="normal-line-height" style="font-size: 32px; line-height: normal">Portfolio value</p>
    <script type="module" src="./fontFallback.fixture.ts"></script>
  </body>
</html>
```

* [ ] **Step 5: Create `frontend/src/test/browser/fontFallback.fixture.ts`**

WHY: Loads the real stylesheet and the real Google Fonts `<link>` read from `index.html`, then applies the brand font with the app's `applyBrandFont`.

```ts
// Loads the real app stylesheet and the app's web-font <link> (read from
// index.html, so the test follows any change to it) into
// fontFallback.fixture.html, then applies the brand font named by ?font=.
import '../../index.css'
import indexHtml from '../../../index.html?raw'
import { applyBrandFont } from '../../lib/useBranding'
import type { BrandingFont } from '../../lib/api/client'

const fontLink = new DOMParser().parseFromString(indexHtml, 'text/html')
  .querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')!
document.head.append(document.importNode(fontLink, true))

applyBrandFont(new URLSearchParams(location.search).get('font') as BrandingFont)
```

* [ ] **Step 6: Create `frontend/src/styles/fontFallback.browser.test.ts`**

WHY: On an uncached visit, holds back the `fonts.gstatic.com` files, measures the text in the fallback, releases them and measures again in the web font, for both brand fonts. Line count and heights must match; line widths stay within 2% (this fixture lands within 1.4%). The `from-font` version and no adjustment both re-wrap lines and fail. It needs network access.

```ts
// @vitest-environment node
/// <reference types="node" />

// The web-font swap does not move the layout (PD-058 Task 15). Real
// Chromium, an uncached visit: the font files from Google Fonts are held
// back, text geometry is measured in the fallback, then the files are
// released and the same text is measured in the web font. Line count, block
// heights and line widths must match, for both selectable brand fonts.
//
// Needs network access to Google Fonts, like the app itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// The brand fonts, as useBranding names them and as CSS names the family.
const BRAND_FONTS = [['roboto', 'Roboto'], ['jetbrains_mono', 'JetBrains Mono']] as const
const MEASURED = ['regular', 'bold', 'normal-line-height']
// Largest line-width change allowed, as a share of the line, and the largest
// height change, in px. Fallback widths match the web font's on average, not
// glyph for glyph: this fixture's lines land within 1.4%. Unadjusted
// fallbacks re-wrap lines (13%+ on a line).
const WIDTH_TOLERANCE = 0.02
const HEIGHT_TOLERANCE_PX = 0.5

let server: ViteDevServer
let baseUrl: string

type Geometry = Record<string, { height: number; lineWidths: number[] }>

// Each measured block's height and the width of each of its lines.
const measure = (page: Page): Promise<Geometry> => page.evaluate(ids => Object.fromEntries(ids.map(id => {
  const block = document.getElementById(id)!
  const range = document.createRange()
  range.selectNodeContents(block)
  const lines = new Map<number, number>()
  for (const rect of range.getClientRects()) {
    const top = Math.round(rect.top)
    lines.set(top, Math.max(lines.get(top) ?? 0, rect.right) - block.getBoundingClientRect().left)
  }
  return [id, { height: block.getBoundingClientRect().height, lineWidths: [...lines.values()] }]
})), MEASURED)

// Whether the web font has loaded for both weights the fixture uses.
const webFontLoaded = (page: Page, family: string) => page.evaluate(name =>
  document.fonts.check(`400 20px "${name}"`) && document.fonts.check(`700 20px "${name}"`), family)

// Opens the fixture with the brand font and Google's font files held back;
// release() lets them through.
async function openWithFontFilesHeld(font: string) {
  const context = await browser!.newContext() // uncached
  const page = await context.newPage()
  let release!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  await page.route('https://fonts.gstatic.com/**', async route => {
    await released
    await route.continue()
  })
  await page.goto(`${baseUrl}/src/test/browser/fontFallback.fixture.html?font=${font}`)
  // The Google Fonts stylesheet has registered its faces and they are pending.
  await page.waitForFunction(() => document.fonts.status === 'loading')
  return { page, release }
}

describe.skipIf(!browser)('web-font swap in a real browser', () => {
  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer())
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(BRAND_FONTS)('%s: text keeps its geometry when the web font arrives', async (font, family) => {
    const { page, release } = await openWithFontFilesHeld(font)
    expect(await webFontLoaded(page, family)).toBe(false)
    const fallback = await measure(page)

    release()
    await page.evaluate(name => Promise.all([document.fonts.load(`400 20px "${name}"`), document.fonts.load(`700 20px "${name}"`)]), family)
    await page.evaluate(() => document.fonts.ready)
    expect(await webFontLoaded(page, family)).toBe(true)
    const loaded = await measure(page)

    for (const id of MEASURED) {
      expect(loaded[id].lineWidths.length, `${id}: line count`).toBe(fallback[id].lineWidths.length)
      expect(Math.abs(loaded[id].height - fallback[id].height), `${id}: height ${fallback[id].height} → ${loaded[id].height}`)
        .toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX)
      loaded[id].lineWidths.forEach((width, line) => {
        const before = fallback[id].lineWidths[line]
        expect(Math.abs(width - before) / width, `${id} line ${line + 1}: width ${before} → ${width}`)
          .toBeLessThanOrEqual(WIDTH_TOLERANCE)
      })
    }
    await page.context().close()
  }, 30_000)
})
```

* [ ] **Step 7: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run src/styles/fontFallback.browser.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-14-text-scale
```

Expected: `Tests  2 passed (2)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 8: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/lib/useBranding.tsx frontend/src/styles/base.css frontend/src/styles/fontFallback.browser.test.ts frontend/src/styles/tokens.css frontend/src/test/browser/fontFallback.fixture.html frontend/src/test/browser/fontFallback.fixture.ts
git commit -m "🐛 Add metric-adjusted fallback font faces"
```

---

### Task 15a: Name the fallback faces in the server's font stacks (backend, PR to main) (#324)

**Files:**

* Modify: `backend/internal/controllers/branding.go`, `backend/internal/controllers/branding_test.go`

`useBranding` prefers the stacks `GET /api/branding` returns, so the fallback face must be second in the server's stacks too. Until Task 15's faces exist, browsers skip the unknown name, so this changes nothing on its own.

Branch `fix/branding-fallback-faces` from `main`.

* [ ] **Step 1: Modify `backend/internal/controllers/branding.go` (Edit)**

WHY: Each stack lists `"<font> Fallback"` second.

Current:

```go
 "portfolio-dashboard/internal/persistence"
)

var brandingFontOptions = []api.BrandingFontOption{
 {
  Id:        api.Roboto,
  Label:     "Roboto",
  CssFamily: "Roboto, Arial, sans-serif",
 },
 {
  Id:        api.JetbrainsMono,
  Label:     "JetBrains Mono",
  CssFamily: "\"JetBrains Mono\", monospace",
 },
}
```

Replacement:

```go
 "portfolio-dashboard/internal/persistence"
)

// Each stack names a metric-adjusted fallback face second ("<font>
// Fallback", an @font-face in the frontend's base.css). It is what renders
// while the web font loads, sized to the web font's metrics so the swap
// does not shift the layout.
var brandingFontOptions = []api.BrandingFontOption{
 {
  Id:        api.Roboto,
  Label:     "Roboto",
  CssFamily: "Roboto, \"Roboto Fallback\", Arial, sans-serif",
 },
 {
  Id:        api.JetbrainsMono,
  Label:     "JetBrains Mono",
  CssFamily: "\"JetBrains Mono\", \"JetBrains Mono Fallback\", monospace",
 },
}
```

* [ ] **Step 2: Modify `backend/internal/controllers/branding_test.go` (Edit)**

WHY: Each stack returned by `GetBranding` starts with the web font, then its fallback face, then a system font.

Current:

```go
package controllers

import (
 "testing"

 "go.mongodb.org/mongo-driver/bson"
```

Replacement:

```go
package controllers

import (
 "strings"
 "testing"

 "go.mongodb.org/mongo-driver/bson"
```

Current:

```go
 })
}

func TestGetBranding_ReturnsStoredFont(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

Replacement:

```go
 })
}

// Each stack falls back to its metric-adjusted face first, so the text
// shown while the web font loads takes the web font's size.
func TestGetBranding_StacksFallBackToMetricAdjustedFace(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

 mt.Run("missing branding doc", func(mt *mtest.T) {
  mt.AddMockResponses(mtest.CreateCursorResponse(0, brandingNS(mt), mtest.FirstBatch))

  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  resp, err := h.GetBranding(userCtx(scopedUser()), api.GetBrandingRequestObject{})
  if err != nil {
   t.Fatalf("GetBranding: %v", err)
  }

  want := map[api.BrandingFont][]string{
   api.Roboto:        {"Roboto", `"Roboto Fallback"`},
   api.JetbrainsMono: {`"JetBrains Mono"`, `"JetBrains Mono Fallback"`},
  }
  for _, option := range resp.(api.GetBranding200JSONResponse).AllowedFonts {
   families := strings.Split(option.CssFamily, ", ")
   if len(families) < 3 || families[0] != want[option.Id][0] || families[1] != want[option.Id][1] {
    t.Errorf("%s stack = %q, want %s then %s, then a system fallback", option.Id, option.CssFamily, want[option.Id][0], want[option.Id][1])
   }
  }
 })
}

func TestGetBranding_ReturnsStoredFont(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

* [ ] **Step 3: Verify**

WHY: the new test fails on the old code and passes on the new.

```bash
cd backend && go test ./internal/controllers/ -run Branding
```

Expected: `ok  portfolio-dashboard/internal/controllers`.

* [ ] **Step 4: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add backend/internal/controllers/branding.go backend/internal/controllers/branding_test.go
git commit -m "🐛 Name metric-adjusted fallback in font stacks"
```

---

### Task 16: ES2023 copying array methods (#320)

**Files:**

* Create: `frontend/src/lib/es2023.test.ts`
* Modify: `frontend/src/features/dividends/DividendsAnalytics.tsx`, `frontend/src/features/gold/GoldPricesPanel.tsx`, `frontend/src/features/history/HistoryChartPage.tsx`, `frontend/src/features/history/HistoryPage.tsx`, `frontend/src/features/history/HistoryTable.tsx`, `frontend/src/features/history/historyShared.ts`, `frontend/src/features/holdings/HoldingsTable.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `frontend/src/features/transactions/transactionFilters.ts`, `frontend/tsconfig.json`

`[...rows].sort(f)` and `[...rows].reverse()` copy and then mutate the copy. `toSorted` / `toReversed` say the intent in one call (`js`) and are Baseline widely available. TypeScript needs the ES2023 lib to type them.

Branch `fix/PD-058-16-es2023-arrays` from `fix/PD-058-15-font-fallback`.

* [ ] **Step 1: Modify `frontend/src/features/dividends/DividendsAnalytics.tsx` (Edit)**

WHY: Newest year first.

| File:line | Current | Replacement |
|---|---|---|
| `DividendsAnalytics.tsx:43` | `{[...view.by_year].reverse().map(year => (` | `{view.by_year.toReversed().map(year => (` |

* [ ] **Step 2: Modify `frontend/src/features/gold/GoldPricesPanel.tsx` (Edit)**

WHY: Newest price first. The other hunks are id-length renames.

| File:line | Current | Replacement |
|---|---|---|
| `GoldPricesPanel.tsx:51` | `const recent = [...prices].reverse().slice(0, 30)` | `const recent = prices.toReversed().slice(0, 30)` |

Rename-only lines elsewhere in the file (for `lint:changed`): `d` → `now`, `p` → `price`, `v` → `value`.

* [ ] **Step 3: Modify `frontend/src/features/history/HistoryChartPage.tsx` (Edit)**

WHY: Oldest-first series.

| File:line | Current | Replacement |
|---|---|---|
| `HistoryChartPage.tsx:59` | `const oldestFirst = [...rows].sort((left, right) => left.date.localeCompare(right.date))` | `const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))` |
| `HistoryChartPage.tsx:74` | `const oldestFirst = [...rows].sort((left, right) => left.date.localeCompare(right.date))` | `const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))` |

* [ ] **Step 4: Modify `frontend/src/features/history/HistoryPage.tsx` (Edit)**

WHY: Conflicts in date order.

| File:line | Current | Replacement |
|---|---|---|
| `HistoryPage.tsx:207` | `const sorted = [...report.conflicts].sort((left, right) => left.date.localeCompare(right.date))` | `const sorted = report.conflicts.toSorted((left, right) => left.date.localeCompare(right.date))` |

* [ ] **Step 5: Modify `frontend/src/features/history/HistoryTable.tsx` (Edit)**

WHY: Descending rows and the ascending view.

| File:line | Current | Replacement |
|---|---|---|
| `HistoryTable.tsx:56` | `() => [...rows].sort((left, right) => right.date.localeCompare(left.date)),` | `() => rows.toSorted((left, right) => right.date.localeCompare(left.date)),` |
| `HistoryTable.tsx:64` | `const display = sortAsc ? [...byDateDesc].reverse() : byDateDesc` | `const display = sortAsc ? byDateDesc.toReversed() : byDateDesc` |

* [ ] **Step 6: Modify `frontend/src/features/history/historyShared.ts` (Edit)**

WHY: Chart series and row stats.

| File:line | Current | Replacement |
|---|---|---|
| `historyShared.ts:262` | `const oldestFirst = [...rows].sort((left, right) => left.date.localeCompare(right.date))` | `const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))` |
| `historyShared.ts:286` | `const oldestFirst = [...rows].sort((left, right) => left.date.localeCompare(right.date))` | `const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))` |
| `historyShared.ts:503` | `const byDate = [...rows].sort((left, right) => left.date.localeCompare(right.date))` | `const byDate = rows.toSorted((left, right) => left.date.localeCompare(right.date))` |

* [ ] **Step 7: Modify `frontend/src/features/holdings/HoldingsTable.tsx` (Edit)**

WHY: The sorted holdings view.

| File:line | Current | Replacement |
|---|---|---|
| `HoldingsTable.tsx:139` | `const sorted = [...visible].sort((left, right) => {` | `const sorted = visible.toSorted((left, right) => {` |

* [ ] **Step 8: Modify `frontend/src/features/holdings/TransactionsModal.tsx` (Edit)**

WHY: Ledger in date order.

| File:line | Current | Replacement |
|---|---|---|
| `TransactionsModal.tsx:182` | `const sorted = [...txns].sort((left, right) => {` | `const sorted = txns.toSorted((left, right) => {` |

* [ ] **Step 9: Modify `frontend/src/features/transactions/transactionFilters.ts` (Edit)**

WHY: The all-transactions sort. The rest of the diff is id-length renames.

Current:

```ts

export function sortRows(rows: TransactionWithHolding[], sort: Sort): TransactionWithHolding[] {
  const sign = sort.dir === 'desc' ? -1 : 1
  const value = (t: TransactionWithHolding): string | number => {
    switch (sort.key) {
      case 'holding': return (t.script || t.symbol || '').toLowerCase()
      case 'type': return t.type || ''
      case 'amount': return t.amount ?? 0
      case 'date': return day(t.date)
    }
  }
  // Copy first: callers hold the fetched array and must not see it reordered.
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === vb) {
      // Stable tiebreak so two events on one date never swap between
      // renders; created_at is what the server orders ties by too.
      return (a.created_at || '').localeCompare(b.created_at || '') * sign
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb)) * sign
  })
}
```

Replacement:

```ts

export function sortRows(rows: TransactionWithHolding[], sort: Sort): TransactionWithHolding[] {
  const sign = sort.dir === 'desc' ? -1 : 1
  const value = (txn: TransactionWithHolding): string | number => {
    switch (sort.key) {
      case 'holding': return (txn.script || txn.symbol || '').toLowerCase()
      case 'type': return txn.type || ''
      case 'amount': return txn.amount ?? 0
      case 'date': return day(txn.date)
    }
  }
  // toSorted returns a copy: callers hold the fetched array and must not see
  // it reordered.
  return rows.toSorted((left, right) => {
    const leftValue = value(left)
    const rightValue = value(right)
    if (leftValue === rightValue) {
      // Stable tiebreak so two events on one date never swap between
      // renders; created_at is what the server orders ties by too.
      return (left.created_at || '').localeCompare(right.created_at || '') * sign
    }
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * sign
    return String(leftValue).localeCompare(String(rightValue)) * sign
  })
}
```

Rename-only lines elsewhere in the file (for `lint:changed`): `a` → `left`, `b` → `right`, `d` → `txnDay`, `f` → `filters`, `t` → `txn`, `t` → `txnType`.

* [ ] **Step 10: Modify `frontend/tsconfig.json` (Edit)**

WHY: Moves `lib` to ES2023.

| File:line | Current | Replacement |
|---|---|---|
| `tsconfig.json:2` | `"lib": ["ES2020", "DOM", "DOM.Iterable"],` | `"lib": ["ES2023", "DOM", "DOM.Iterable"],` |

* [ ] **Step 11: Create `frontend/src/lib/es2023.test.ts`**

WHY: The app is typed against the ES2023 library, and a rewritten sort returns a sorted copy while leaving the fetched array in place.

```ts
/// <reference types="node" />

// The frontend targets ES2023 library typings so copying array methods
// (toSorted / toReversed) are available, and the sort helpers built on them
// never reorder the caller's array (PD-058 Task 16).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TransactionWithHolding } from '../types'
import { sortRows } from '../features/transactions/transactionFilters'

describe('ES2023 copying array methods', () => {
  it('types the app against the ES2023 library', () => {
    const tsconfig = readFileSync(resolve(process.cwd(), 'tsconfig.json'), 'utf8')
    expect(tsconfig).toMatch(/"lib":\s*\[\s*"ES2023"/)
  })

  it('sorts a copy and leaves the fetched array in place', () => {
    const rows = [
      { id: 'older', date: '2026-01-01', amount: 1 },
      { id: 'newer', date: '2026-02-01', amount: 2 },
    ] as TransactionWithHolding[]
    const sorted = sortRows(rows, { key: 'date', dir: 'desc' })
    expect(sorted.map(row => row.id)).toEqual(['newer', 'older'])
    expect(rows.map(row => row.id)).toEqual(['older', 'newer'])
  })
})
```

* [ ] **Step 12: Verify**

WHY: the slice's tests pass, and `lint:changed` checks every file it touched.

```bash
cd frontend && npx vitest run src/lib/es2023.test.ts && npm run typecheck && npm run lint:changed -- origin/fix/PD-058-15-font-fallback
```

Expected: `Tests  2 passed (2)`; typecheck prints nothing; `lint:changed` reports no errors.

* [ ] **Step 13: Commit**

WHY: one commit per slice, staging only its files.

```bash
git add frontend/src/features/dividends/DividendsAnalytics.tsx frontend/src/features/gold/GoldPricesPanel.tsx frontend/src/features/history/HistoryChartPage.tsx frontend/src/features/history/HistoryPage.tsx frontend/src/features/history/HistoryTable.tsx frontend/src/features/history/historyShared.ts frontend/src/features/holdings/HoldingsTable.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/transactions/transactionFilters.ts frontend/src/lib/es2023.test.ts frontend/tsconfig.json
git commit -m "♻️ Use ES2023 toSorted and toReversed"
```

---

### Task 17: End-to-end verification

**Files:** none.

* [ ] **Step 1: Run every check on the collapsed branch**

WHY: each slice was verified alone; this confirms they still pass together on
the branch that goes into the feature branch.

```bash
cd frontend && npm run typecheck && npm run lint:changed -- origin/feat/PD-058-modern-web && REQUIRE_BROWSER_TESTS=1 npx vitest run
cd ../backend && go test ./internal/services/ ./internal/controllers/
```

Expected: typecheck prints nothing; `lint:changed` reports no errors; every
Vitest file passes, the five `*.browser.test.ts` files included (none
skipped); both Go packages `ok`.

* [ ] **Step 2: Keyboard and display pass in the running app**

WHY: the scenarios a reviewer would try by hand, end to end against the dev
stack (`make dev-db && make backend`, `make frontend`).

1. Dashboard: Tab to a summary card, press Enter: it flips. Open a holding's
   transactions: focus is inside, Tab wraps, Escape closes and focus returns.
2. History: scroll the page, open Add row, wheel over the backdrop: the page
   doesn't move. At 01:00 IST the date defaults to today and saves.
3. Account menu and theme picker: Escape and a click outside close them.
4. Light theme: the date picker and scrollbars are light; dark theme: dark.
5. DevTools → Rendering → forced-colors: active: every focused control shows
   a solid outline.
6. Chrome → Settings → Font size: Very large: stylesheet text grows.
7. Block `fonts.gstatic.com`, reload, unblock with "Slow 4G": the swap
   doesn't move the layout.

Expected: every step behaves as described.

## Done

* 16 audit findings fixed in #305–#320; backend counterparts #323 and #324 on
  `main`.
* Shared browser-test harness for behaviour jsdom can't render.

## Next

* Collapse PR: `fix/PD-058-15-font-fallback` → `feat/PD-058-modern-web`, then
  the feature branch → `main`.
* Issue #321: install Chromium in CI and set `REQUIRE_BROWSER_TESTS=1`; move
  #307's test onto `harness.ts`.
* Task 9's `colorScheme.test.ts` still reads `tokens.css` / `index.html` text
  for `color-scheme`; replace with computed-style checks in Chromium.
* Inline TSX `fontSize` px → rem sweep (Task 14 follow-up, ~270 sites).
* Dark-theme scrollbar thumb contrast is below 3:1 (`--scrollbar-thumb`).
* Native `<dialog>` / `popover` once Baseline widely available (no polyfill).
