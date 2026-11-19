# PD-059: Wave 5b — Gold page, prices and missing-price prompt (slices 20–21)

* **Status**: Amendment in review (this doc). Code below is implemented and verified on the slice branches.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Render the physical-gold ledger, its metrics, the daily price series and the missing-price prompt in the UI_2.0 shell, matching the handoff's Gold frame 1:1, on the shared `ui2/asset/*` primitives from slice 18.
* **Architecture**: Gold is the second asset page. It reuses `AssetStats`, `asset.css` and `Ui2Dialog`, and adds only gold-specific chrome (`gold.css`). `GoldPage` becomes a pure `useUiMode()` dispatcher with the Classic body moved into `ClassicGoldPage`, as `DividendsPage` does after slice 18. The four gold reads move out of `GoldPage` into `useGoldData`, shared by both interfaces; the purchase form's parse, validate and payload rules (`initialForm`, `validateGoldForm`, `toInput`) and the price-entry rules (`goldPrices.ts`) are shared too, so Classic and UI_2.0 accept and reject exactly the same input. Gold stays out of act-as (owner, 2026-11-18), so the page takes no `actAsUserId`.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library, existing typed API client. No new dependencies; no backend change.
* **Spec links**: [PRD-003](../prds/PRD-003-physical-gold-tracking.md), [DD-003](../designs/DD-003-physical-gold-tracking.md), [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff HTML](../visuals/PD-059-ui-2-reference.html) (`goldView`, `goldDetail`, `goldEditor`, `goldGapDialog`, `previewGoldMonths`), [wave 5a](PD-059-wave5a-dividends.md), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Built on: slice 18 (`AssetStats`, `asset.css`), slice 2 (`Ui2PageIntro`, `primitives.css`), slice 14 (`Ui2Dialog`), slice 4 (`money`, `signedMoney`).

Reused without modification: `DecimalInput`, `formatDate`, `formatRate`, `toast`, `parseDecimalInput`, every `/gold/*` API call.

Not reused: `GoldMetricsPanel` (a Classic table; the handoff splits the same eight numbers into four stat cards and a four-cell metrics strip) and the Classic table markup in `GoldPage`.

Deploy through the per-account `ui_mode` flag; Classic and Glass routes are untouched.

---

## 2. Handoff fidelity reference

Read out of `goldView()`, `goldDetail()`, `goldEditor()`, `goldGapDialog()`, `showAssetPage('Gold')`, `previewGoldMonths()` and the handoff stylesheet.

**Page intro**: title `A clear view of your gold.`, subtitle `Your physical gold ledger, from purchase to present value.`; intro actions hidden.

**`asset-top`**: `h2` `Physical gold`, note `Purchases, bill comparisons and daily prices · INR`; on the right `＋ Add purchase` (primary).

**Stat cards** (first is hero): `Current value` / `Latest recorded rate · <date>`; `Total invested` / `Actual amounts paid`; `Physical gold` (grams) / `Purchased weight`; `Net P/L · physical` (signed, toned) / `Excludes GOLDBEES`.

**Metrics strip** (`gold-meta`, four cells): `Average cost per gram`; `GOLDBEES P/L · excl. tax`, `Net P/L · including bees` and `Physical gold XIRR`, each label an `asset-metric-help` button carrying a `title` tooltip. `—` when unknown.

**Missing-price alert** (`asset-alert`): `<N> daily prices need attention` + `Review missing prices`.

**Purchase ledger**: heading `Purchase ledger`, note `All 15 purchase columns`; the 15 `goldFields` columns in order, calculated ones with class `computed` (shaded), then `Actions` (`Details`, `Edit`); the NIMMI loss toned negative when above 0; empty row `No purchases yet…`; footer `<n> purchases · newest first` / `Shaded columns are calculated · scroll horizontally to view all columns`. Rows newest first.

**Details** (`goldDetail`): title `Purchase · <date>`; a two-column `gold-detail` grid of all 15 fields, each label titled `Calculated value` or `Entered value`; actions `Delete purchase` (danger) and `Edit purchase` (primary); delete asks `Remove the <g> purchase from <date>?` first.

**Editor** (`goldEditor`): title `Add gold purchase` / `Edit gold purchase`; `asset-form` with `Purchase date` (full width), `Per-gram purchase rate · INR *`, `Weight bought · grams *`, `Actual paid · INR *`, `Price in quote · INR`, `Amount per bill · INR`, `Billed weight · grams`, `Chennai rate / remark` (full width, placeholder `Rate, Ditto, or a note`); note `Optional fields can remain blank. Calculated bill-comparison values appear after saving.`; `Cancel` / `Save purchase`.

**Daily gold price**: heading + note `One INR rate per gram, per calendar day`; a form with `Gold price date` (max today) and `Gold price per gram` (placeholder `₹ / gram`) and a primary save; note `Re-entering a date replaces its recorded rate.`; the 30 most recent days as `gold-price-item`s (date, `<money> / g`, `Edit rate`, which loads the day into the form and focuses the rate); `View all months` opens `Gold prices · all months`: note `Recorded rates only. Missing days remain missing; no interpolation.`, then per month (newest first) an `h3` and a `Date` / `INR per gram` table.

**Missing-price dialog** (`goldGapDialog`): title `Complete missing daily prices`; `<N> dates are missing. Enter known rates or skip for now; no price is inferred.`; one `<date> · INR / gram` input per day (placeholder `Enter recorded rate`); error `Enter at least one known rate, or skip for now.`; `Skip for now` / `Save entered prices`. Opens on arrival unless skipped; after a save it stays open on the days still missing and closes once all are filled.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/features/gold/useGoldData.ts` | Gold reads (purchases, prices, missing days, metrics) for both interfaces |
| Modify | `frontend/src/features/gold/GoldPage.tsx` | Pure dispatcher; Classic body → `ClassicGoldPage` on `useGoldData` |
| Modify | `frontend/src/features/gold/GoldTxnModal.tsx` | Export `FormState`, `initialForm`, `toInput` for reuse |
| Modify | `frontend/src/ui2/asset/asset.css` | Shared `.asset-form`, `.asset-modal-actions`, `.asset-alert`, `.computed`, `.asset-metric-help` |
| Create | `frontend/src/ui2/gold/gold.css` | `.gold-meta`, `.gold-detail`, `.gold-price-list/-item` |
| Create | `frontend/src/ui2/gold/goldColumns.ts` | The 15 columns and their cell formatting |
| Create | `frontend/src/ui2/gold/Ui2GoldEditor.tsx` | Add / edit purchase dialog |
| Create | `frontend/src/ui2/gold/Ui2GoldDetails.tsx` | Details dialog + delete confirmation |
| Create | `frontend/src/ui2/gold/Ui2GoldPage.tsx` | The UI_2.0 Gold page |
| Create | `frontend/src/ui2/gold/Ui2GoldPage.test.tsx` | Page, ledger, details, editor, missing-price flow |
| Create | `frontend/src/features/gold/goldPrices.ts` (+ test) | Shared price-entry rules: `localToday`, `pricePerGram`, `enteredPrices`, `pricesByMonth` |
| Modify | `frontend/src/features/gold/GoldPricesPanel.tsx`, `MissingPricesModal.tsx` | Classic panels use the shared rules; messages unchanged |
| Create | `frontend/src/ui2/gold/Ui2GoldPrices.tsx` (+ test) | Daily price panel, Edit rate, all-months dialog |
| Create | `frontend/src/ui2/gold/Ui2MissingPrices.tsx` | Missing-price alert and dialog |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-wave5b-gold` | This amendment + board rows | Docs only | Reviewable plan for 20–21 | `markdownlint` |
| `feat/PD-059-gold-page` | Slice 20: `useGoldData`, dispatcher, ledger, metrics, Details, editor | Classic gold tests pass unchanged; until slice 21 the UI_2.0 page mounts the Classic price panel and prompt, so no capability is lost | UI_2.0 accounts get the Gold ledger, metrics and purchase CRUD | `Ui2GoldPage.test.tsx` |
| `feat/PD-059-gold-prices` | Slice 21: shared price rules, UI_2.0 price panel, all-months view, missing-price alert + dialog | Classic price tests pass unchanged against the shared rules | UI_2.0 price entry and gap filling in the handoff's design | `Ui2GoldPrices.test.tsx`, `goldPrices.test.ts`, the page's missing-price cases |

Both slices stack on slice 18 (#373), which they need for `asset.css` and `AssetStats`.

---

## 5. Owner decisions and open questions

### Standing decisions applied

* The handoff is the 1:1 source of truth; deviations are bugs.
* "Gold: 15 columns in table and Details; daily price entry + 30 days, monthly behind 'View all months'."
* "Act-as in UI_2.0 under the banner; gold stays out."
* Gold in the overall chart is untouched: this wave changes no data path.

### Decisions taken in this plan (reversible)

* The handoff's sample-only copy is replaced with production copy: `Save sample purchase` → `Save purchase`, `Save sample price` → `Save price`, the alert's "sample price window" line → `Days since your first purchase with no recorded rate.` The illustrative-data footnote is dropped.
* Metric values come from `GET /gold/metrics` (the server already computes them); nothing is derived client-side except the latest price's date, read from the ascending price series.
* Validation messages are the Classic ones (`Per-gram price must be > 0`, `Price must be a number > 0`, `Price for <date> must be a number > 0`) because the rules are shared; only the empty-gap message uses the handoff's wording.
* Slice 20 mounts the Classic `GoldPricesPanel` and `MissingPricesModal` inside the UI_2.0 page so price entry and the gap prompt keep working until slice 21 replaces them.

### Open question — awaiting owner

```text
ID: PD-059-Q-5b-1
Raised by / date: Claude / 2026-11-20
Affected slice and files: 18–21 — every UI_2.0 asset page date
Existing behaviour and evidence: The handoff formats dates as "18 Nov 2026"
  (assetDate). The app formats every date as "18-11-2026" (lib/formDates
  formatDate), and slices 13–19 already use it in UI_2.0.
What is missing or ambiguous: Whether asset pages switch to the handoff format.
Options and consequences:
  (a) Keep formatDate everywhere — consistent across the app; differs from
      the mockup's text.
  (b) Add an assetDate formatter for Dividends and Gold — 1:1 with the
      mockup; two date styles in UI_2.0 until the rest follows.
Independent work that can continue: all of slices 20–21 (implemented as (a)).
Owner response (exact):
Status: awaiting owner
```

---

## 6. Task list

### Task 1 — Extract `useGoldData`

**Files:** `frontend/src/features/gold/useGoldData.ts` (create)

`GoldPage` loads four things at once and refreshes them after every save. UI_2.0 needs exactly the same reads and refresh semantics (no spinner flash on refresh, a stale error cleared by a later success), so the logic moves into a hook rather than being copied.

* [ ] Create `frontend/src/features/gold/useGoldData.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type GoldMetrics, type GoldPrice, type GoldTransaction } from '../../lib/api/client'

// useGoldData owns every gold read for both interfaces (PD-059 slice 20):
// purchases, the daily price series, the missing-price days and the live
// metrics. The gap list drives the missing-price prompt (PRD-003 §7).
export function useGoldData() {
  const [rows, setRows] = useState<GoldTransaction[]>([])
  const [prices, setPrices] = useState<GoldPrice[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [metrics, setMetrics] = useState<GoldMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [txns, priceRows, gaps, goldMetrics] = await Promise.all([
      api.listGoldTransactions(),
      api.listGoldPrices(),
      api.listGoldMissingDates(),
      api.getGoldMetrics(),
    ])
    setRows(txns)
    setPrices(priceRows)
    setMissing(gaps.missing)
    setMetrics(goldMetrics)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      await fetchAll()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to load gold data')
    } finally {
      setLoading(false)
    }
  }, [fetchAll])

  // refresh re-pulls without the full-page spinner, so the missing-price
  // prompt re-renders with the days still blank instead of the page flashing.
  // It clears the error first so a stale failure does not outlive a later
  // successful refresh.
  const refresh = useCallback(async () => {
    setErr(null)
    try {
      await fetchAll()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to refresh gold data')
    }
  }, [fetchAll])

  useEffect(() => { void load() }, [load])

  return { rows, prices, missing, metrics, loading, err, load, refresh }
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep useGoldData; echo "exit=$?"`

Expected: `exit=1`.

* [ ] Commit: `git add frontend/src/features/gold/useGoldData.ts`

### Task 2 — Make `GoldPage` a dispatcher on the shared hook

**Files:** `frontend/src/features/gold/GoldPage.tsx` (modify)

Only `useUiMode()` may run in the dispatcher, so the hook count stays stable when the account's mode flips while mounted. The Classic body keeps its markup and now reads from `useGoldData`.

* [ ] `frontend/src/features/gold/GoldPage.tsx`, change 1 of 2. Current code:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type GoldMetrics, type GoldPrice, type GoldTransaction } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import { formatDate } from '../../lib/formDates'
import ThemePicker from '../../components/ThemePicker'
import { useAuthOptional } from '../auth/AuthContext'
import { ArrowLeftIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/Icon'
import GoldTxnModal from './GoldTxnModal'
```

Replacement:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type GoldTransaction } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import { formatDate } from '../../lib/formDates'
import { useUiMode } from '../../lib/uiMode'
import ThemePicker from '../../components/ThemePicker'
import { Ui2GoldPage } from '../../ui2/gold/Ui2GoldPage'
import { useAuthOptional } from '../auth/AuthContext'
import { useGoldData } from './useGoldData'
import { ArrowLeftIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/Icon'
import GoldTxnModal from './GoldTxnModal'
```

* [ ] `frontend/src/features/gold/GoldPage.tsx`, change 2 of 2. Current code:

```tsx
  value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: digits })

export default function GoldPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const [rows, setRows] = useState<GoldTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; txn: GoldTransaction | null }>({ open: false, txn: null })
  const [busy, setBusy] = useState<number | null>(null)
  const [prices, setPrices] = useState<GoldPrice[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [metrics, setMetrics] = useState<GoldMetrics | null>(null)
  const [promptSkipped, setPromptSkipped] = useState(false)

  // fetchAll refreshes every gold slice at once. The gap list drives the
  // blocking prompt (PRD-003 §7), metrics is the live summary (§6).
  const fetchAll = useCallback(async () => {
    const [txns, priceRows, gaps, goldMetrics] = await Promise.all([
      api.listGoldTransactions(),
      api.listGoldPrices(),
      api.listGoldMissingDates(),
      api.getGoldMetrics(),
    ])
    setRows(txns)
    setPrices(priceRows)
    setMissing(gaps.missing)
    setMetrics(goldMetrics)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      await fetchAll()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load gold data')
    } finally {
      setLoading(false)
    }
  }, [fetchAll])

  // refresh re-pulls data without the full-page spinner — used after a save
  // so the missing-price prompt re-renders with the days still left blank
  // instead of the whole page flashing to a loading state. Clears the error
  // banner up front (like load) so a stale failure does not linger after a
  // later refresh succeeds.
  const refresh = useCallback(async () => {
    setErr(null)
    try {
      await fetchAll()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to refresh gold data')
    }
  }, [fetchAll])

  useEffect(() => { void load() }, [load])

  const remove = async (txn: GoldTransaction) => {
    if (!confirm(`Delete the ${formatDate(txn.date)} purchase of ${txn.grams_bought} g?`)) return
```

Replacement:

```tsx
  value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: digits })

// GoldPage is a pure dispatcher: only useUiMode() lives here. All Classic
// hooks live in ClassicGoldPage so the hook count is stable across mode
// changes.
export default function GoldPage() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2GoldPage />
  return <ClassicGoldPage />
}

function ClassicGoldPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const { rows, prices, missing, metrics, loading, err, load, refresh } = useGoldData()
  const [modal, setModal] = useState<{ open: boolean; txn: GoldTransaction | null }>({ open: false, txn: null })
  const [busy, setBusy] = useState<number | null>(null)
  const [promptSkipped, setPromptSkipped] = useState(false)

  const remove = async (txn: GoldTransaction) => {
    if (!confirm(`Delete the ${formatDate(txn.date)} purchase of ${txn.grams_bought} g?`)) return
```

* [ ] Verify: `cd frontend && npx vitest run src/features/gold 2>&1 | tail -4`

Expected: every Classic gold test passes, unmodified.

* [ ] Commit: `git add frontend/src/features/gold/GoldPage.tsx`

### Task 3 — Export the purchase-form helpers

**Files:** `frontend/src/features/gold/GoldTxnModal.tsx` (modify)

The UI_2.0 editor must accept and reject exactly what Classic does — including the weight rule that reads `2.500` as 2.5 g, not 2,500 g — so it imports these rather than re-deriving them.

* [ ] `frontend/src/features/gold/GoldTxnModal.tsx`, change 1 of 3. Current code:

```tsx
}

interface FormState {
  date: string
  gm_price: string
```

Replacement:

```tsx
}

export interface FormState {
  date: string
  gm_price: string
```

* [ ] `frontend/src/features/gold/GoldTxnModal.tsx`, change 2 of 3. Current code:

```tsx
const num = (value: number | null | undefined) => (value == null ? '' : String(value))

function initialForm(txn: GoldTransaction | null): FormState {
  if (!txn) {
    return {
```

Replacement:

```tsx
const num = (value: number | null | undefined) => (value == null ? '' : String(value))

export function initialForm(txn: GoldTransaction | null): FormState {
  if (!txn) {
    return {
```

* [ ] `frontend/src/features/gold/GoldTxnModal.tsx`, change 3 of 3. Current code:

```tsx
}

function toInput(form: FormState): GoldTransactionInput {
  const opt = (value: string, opts?: typeof weight) => (value.trim() === '' ? null : parseDecimalInput(value, opts))
  return {
```

Replacement:

```tsx
}

export function toInput(form: FormState): GoldTransactionInput {
  const opt = (value: string, opts?: typeof weight) => (value.trim() === '' ? null : parseDecimalInput(value, opts))
  return {
```

* [ ] Commit: `git add frontend/src/features/gold/GoldTxnModal.tsx`

### Task 4 — Shared asset form/alert styles and the gold stylesheet

**Files:** `frontend/src/ui2/asset/asset.css` (modify), `frontend/src/ui2/gold/gold.css` (create)

`.asset-form`, `.asset-modal-actions`, `.asset-alert`, `.computed` and `.asset-metric-help` are asset-page vocabulary in the handoff, so they join `asset.css`; the `.gold-*` rules are Gold's own. Every selector is scoped under `:root[data-ui="ui2"]`.

* [ ] `frontend/src/ui2/asset/asset.css`, change 1 of 1. Current code:

```css
:root[data-ui="ui2"] .asset-period .ui2-btn { padding: 7px 10px; }

@media (max-width: 900px) {
  :root[data-ui="ui2"] .asset-stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
```

Replacement:

```css
:root[data-ui="ui2"] .asset-period .ui2-btn { padding: 7px 10px; }

:root[data-ui="ui2"] .asset-table .computed {
  background: color-mix(in srgb, var(--u2-accentsoft) 35%, transparent);
}

:root[data-ui="ui2"] .asset-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 22px 0;
}

:root[data-ui="ui2"] .asset-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--u2-muted);
}

:root[data-ui="ui2"] .asset-form input,
:root[data-ui="ui2"] .asset-form select {
  width: 100%;
  min-width: 0;
  padding: 11px;
  background: var(--u2-bg);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 7px;
}

:root[data-ui="ui2"] .asset-form .full { grid-column: 1 / -1; }

:root[data-ui="ui2"] .asset-modal-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

:root[data-ui="ui2"] .asset-alert {
  border: 1px solid #c59544;
  background: color-mix(in srgb, #c59544 10%, var(--u2-panel));
  padding: 14px 18px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
}

:root[data-ui="ui2"] .asset-alert strong { display: block; font-size: 12px; margin-bottom: 5px; }
:root[data-ui="ui2"] .asset-alert span { font-size: 11px; color: var(--u2-muted); }

:root[data-ui="ui2"] .asset-metric-help {
  border: 0;
  background: none;
  padding: 0;
  color: inherit;
  cursor: help;
  text-align: left;
  font: inherit;
}

@media (max-width: 1100px) {
  :root[data-ui="ui2"] .asset-form { grid-template-columns: 1fr; }
  :root[data-ui="ui2"] .asset-form .full { grid-column: auto; }
  :root[data-ui="ui2"] .asset-alert { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 900px) {
  :root[data-ui="ui2"] .asset-stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
```

* [ ] Create `frontend/src/ui2/gold/gold.css`:

```css
/* Gold-only UI_2.0 chrome (PD-059 slices 20–21), ported from the handoff's
 * .gold-* rules. Shared asset chrome lives in ../asset/asset.css. */

:root[data-ui="ui2"] .gold-meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
}

:root[data-ui="ui2"] .gold-meta > div { padding: 18px; border-right: 1px solid var(--u2-border); min-width: 0; }
:root[data-ui="ui2"] .gold-meta > div:last-child { border-right: 0; }
:root[data-ui="ui2"] .gold-meta strong { display: block; font-size: 17px; margin-top: 8px; }
:root[data-ui="ui2"] .gold-meta span { color: var(--u2-muted); font-size: 11px; }

:root[data-ui="ui2"] .gold-detail {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

:root[data-ui="ui2"] .gold-detail > div { padding: 12px; border-bottom: 1px solid var(--u2-border); }
:root[data-ui="ui2"] .gold-detail span { display: block; font-size: 11px; color: var(--u2-muted); margin-bottom: 7px; }
:root[data-ui="ui2"] .gold-detail strong { font-size: 15px; }

:root[data-ui="ui2"] .gold-price-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 16px;
}

:root[data-ui="ui2"] .gold-price-item {
  background: var(--u2-bg);
  border: 1px solid var(--u2-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:root[data-ui="ui2"] .gold-price-item span { font-size: 11px; color: var(--u2-muted); }

@media (max-width: 1100px) {
  :root[data-ui="ui2"] .gold-meta { grid-template-columns: 1fr 1fr; }
  :root[data-ui="ui2"] .gold-price-list { grid-template-columns: repeat(2, 1fr); }
  :root[data-ui="ui2"] .gold-detail { grid-template-columns: 1fr; }
}
```

* [ ] Commit: `git add frontend/src/ui2/asset/asset.css frontend/src/ui2/gold/gold.css`

### Task 5 — The 15 columns

**Files:** `frontend/src/ui2/gold/goldColumns.ts` (create)

The table and Details render the same 15 fields in the same order with the same formatting; one list keeps them from drifting.

* [ ] Create `frontend/src/ui2/gold/goldColumns.ts`:

```ts
import type { GoldTransaction } from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { money } from '../overview/Ui2SummaryCards'

type GoldKey = Exclude<keyof GoldTransaction, 'id'>
export type GoldColumnKind = 'entered' | 'computed'

// The handoff's goldFields: the PRD-003 §5 column set in the owner's
// spreadsheet order, entered fields interleaved with server-computed ones.
// The table and the Details dialog both read this list.
export const GOLD_COLUMNS: ReadonlyArray<{ key: GoldKey; label: string; kind: GoldColumnKind }> = [
  { key: 'date', label: 'Date', kind: 'entered' },
  { key: 'gm_price', label: 'gm Price', kind: 'entered' },
  { key: 'grams_bought', label: 'Weight', kind: 'entered' },
  { key: 'gold_cost', label: 'Gold cost', kind: 'computed' },
  { key: 'gst_on_cost', label: '3%', kind: 'computed' },
  { key: 'total_expected', label: 'Total expected', kind: 'computed' },
  { key: 'quote_price', label: 'Price in quote', kind: 'entered' },
  { key: 'gst_on_quote', label: '3% (quote)', kind: 'computed' },
  { key: 'bill_amount', label: 'Amt per bill', kind: 'entered' },
  { key: 'actual_paid', label: 'Actual paid', kind: 'entered' },
  { key: 'nett_per_gram', label: 'Nett per gram', kind: 'computed' },
  { key: 'nett_reduction', label: 'Nett reduction', kind: 'computed' },
  { key: 'billed_weight', label: 'Billed weight', kind: 'entered' },
  { key: 'nimmi_loss', label: 'LOSS due to NIMMI', kind: 'computed' },
  { key: 'chennai_rate', label: 'Chennai rate', kind: 'entered' },
]

export const grams = (weight: number | null | undefined) =>
  weight == null ? '—' : `${weight.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

// goldCell renders one column the way the handoff's goldFormat does: '—' for
// an absent value, never a fake zero.
export function goldCell(txn: GoldTransaction, key: GoldKey): string {
  const value = txn[key]
  if (value == null || value === '') return '—'
  if (key === 'date') return formatDate(String(value))
  if (key === 'chennai_rate') return String(value)
  if (key === 'grams_bought' || key === 'billed_weight') return grams(Number(value))
  return money(Number(value), 'INR')
}

// nimmiTone colours the NIMMI loss: a positive loss is bad.
export const nimmiTone = (txn: GoldTransaction) => (txn.nimmi_loss > 0 ? 'u2-negative' : 'u2-positive')
```

* [ ] Commit: `git add frontend/src/ui2/gold/goldColumns.ts`

### Task 6 — Purchase editor

**Files:** `frontend/src/ui2/gold/Ui2GoldEditor.tsx` (create)

* [ ] Create `frontend/src/ui2/gold/Ui2GoldEditor.tsx`:

```tsx
import { useState } from 'react'
import { api, ApiError, type GoldTransaction } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { initialForm, toInput, validateGoldForm, type FormState } from '../../features/gold/GoldTxnModal'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

// The handoff's goldEditor: required fields first, the bill-comparison
// fields optional. Parsing and validation are the Classic modal's, so both
// interfaces accept and reject exactly the same input.
const NUMBER_FIELDS: ReadonlyArray<{ key: keyof FormState; label: string; required: boolean }> = [
  { key: 'gm_price', label: 'Per-gram purchase rate · INR', required: true },
  { key: 'grams_bought', label: 'Weight bought · grams', required: true },
  { key: 'actual_paid', label: 'Actual paid · INR', required: true },
  { key: 'quote_price', label: 'Price in quote · INR', required: false },
  { key: 'bill_amount', label: 'Amount per bill · INR', required: false },
  { key: 'billed_weight', label: 'Billed weight · grams', required: false },
]

export function Ui2GoldEditor({ txn, onClose, onSaved }: {
  txn: GoldTransaction | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(txn))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof FormState) => (value: string) => setForm(previous => ({ ...previous, [key]: value }))

  const save = async () => {
    const invalid = validateGoldForm(form)
    if (invalid) { setErr(invalid); return }
    setBusy(true)
    setErr('')
    try {
      const body = toInput(form)
      if (txn) await api.updateGoldTransaction(txn.id, body)
      else await api.createGoldTransaction(body)
      onSaved()
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Ui2Dialog title={txn ? 'Edit gold purchase' : 'Add gold purchase'} onClose={onClose} busy={busy}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="asset-form">
          <label className="full">
            Purchase date *
            <input type="date" value={form.date} onChange={event => set('date')(event.target.value)} required />
          </label>
          {NUMBER_FIELDS.map(field => (
            <label key={field.key}>
              {field.label}{field.required && ' *'}
              <DecimalInput value={form[field.key]} onValueChange={set(field.key)} />
            </label>
          ))}
          <label className="full">
            Chennai rate / remark
            <input value={form.chennai_rate} placeholder="Rate, Ditto, or a note"
              onChange={event => set('chennai_rate')(event.target.value)} />
          </label>
        </div>
        <p className="asset-note">Optional fields can remain blank. Calculated bill-comparison values appear after saving.</p>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save purchase'}
          </button>
        </div>
      </form>
    </Ui2Dialog>
  )
}
```

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2GoldEditor.tsx`

### Task 7 — Details and delete

**Files:** `frontend/src/ui2/gold/Ui2GoldDetails.tsx` (create)

The confirmation replaces the details dialog instead of stacking on it, so only one dialog is open at a time.

* [ ] Create `frontend/src/ui2/gold/Ui2GoldDetails.tsx`:

```tsx
import { useState } from 'react'
import { api, ApiError, type GoldTransaction } from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { GOLD_COLUMNS, goldCell, grams, nimmiTone } from './goldColumns'
import './gold.css'

// The handoff's goldDetail: every one of the 15 columns, entered and
// calculated, with Edit and Delete. Delete asks first, in place of the
// details, so only one dialog is ever open.
export function Ui2GoldDetails({ txn, onClose, onEdit, onDeleted }: {
  txn: GoldTransaction
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const remove = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.deleteGoldTransaction(txn.id)
      onDeleted()
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <Ui2Dialog title="Delete purchase?" onClose={() => setConfirming(false)} busy={busy}>
        <p className="asset-note">
          Remove the {grams(txn.grams_bought)} purchase from {formatDate(txn.date)}? This cannot be undone.
        </p>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          <button type="button" className="ui2-btn ui2-btn-danger" onClick={() => void remove()} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete purchase'}
          </button>
        </div>
      </Ui2Dialog>
    )
  }

  return (
    <Ui2Dialog title={`Purchase · ${formatDate(txn.date)}`} onClose={onClose} wide>
      <div className="gold-detail">
        {GOLD_COLUMNS.map(column => (
          <div key={column.key}>
            <span title={column.kind === 'computed' ? 'Calculated value' : 'Entered value'}>{column.label}</span>
            <strong className={column.key === 'nimmi_loss' && txn.nimmi_loss > 0 ? nimmiTone(txn) : undefined}>
              {goldCell(txn, column.key)}
            </strong>
          </div>
        ))}
      </div>
      <div className="asset-modal-actions">
        <button type="button" className="ui2-btn asset-danger" onClick={() => setConfirming(true)}>Delete purchase</button>
        <button type="button" className="ui2-btn ui2-btn-primary" onClick={onEdit}>Edit purchase</button>
      </div>
    </Ui2Dialog>
  )
}
```

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2GoldDetails.tsx`

### Task 8 — The page

**Files:** `frontend/src/ui2/gold/Ui2GoldPage.tsx` (create)

This is the slice-20 version: it mounts the Classic price panel and gap prompt, which Task 15 replaces.

* [ ] Create `frontend/src/ui2/gold/Ui2GoldPage.tsx`:

```tsx
import { useState } from 'react'
import type { GoldTransaction } from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { formatRate } from '../../lib/rate'
import { useGoldData } from '../../features/gold/useGoldData'
import GoldPricesPanel from '../../features/gold/GoldPricesPanel'
import MissingPricesModal from '../../features/gold/MissingPricesModal'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
import { money, signedMoney } from '../overview/Ui2SummaryCards'
import { GOLD_COLUMNS, goldCell, grams, nimmiTone } from './goldColumns'
import { Ui2GoldDetails } from './Ui2GoldDetails'
import { Ui2GoldEditor } from './Ui2GoldEditor'
import '../asset/asset.css'
import './gold.css'

const toneOf = (value: number | null | undefined): AssetStat['tone'] =>
  value == null || value === 0 ? undefined : value > 0 ? 'positive' : 'negative'

// newestFirst orders purchases the way the handoff's ledger does; the id
// breaks same-day ties so the order is stable across refreshes.
const newestFirst = (rows: GoldTransaction[]) =>
  [...rows].sort((first, second) => second.date.localeCompare(first.date) || second.id - first.id)

export function Ui2GoldPage() {
  const { rows, prices, missing, metrics, loading, err, refresh } = useGoldData()
  const [editing, setEditing] = useState<{ txn: GoldTransaction | null } | null>(null)
  const [details, setDetails] = useState<GoldTransaction | null>(null)
  const [promptSkipped, setPromptSkipped] = useState(false)

  const latest = prices.at(-1)
  const purchases = newestFirst(rows)

  const stats: AssetStat[] = [
    {
      label: 'Current value',
      value: money(metrics?.current, 'INR'),
      detail: `Latest recorded rate · ${latest ? formatDate(latest.date) : 'unavailable'}`,
    },
    { label: 'Total invested', value: money(metrics?.invested, 'INR'), detail: 'Actual amounts paid' },
    { label: 'Physical gold', value: grams(metrics?.grams), detail: 'Purchased weight' },
    {
      label: 'Net P/L · physical',
      value: signedMoney(metrics?.nett_ex_bees, 'INR'),
      detail: 'Excludes GOLDBEES',
      tone: toneOf(metrics?.nett_ex_bees),
    },
  ]

  const meta: Array<{ label: string; value: string; help?: string; tone?: AssetStat['tone'] }> = [
    { label: 'Average cost per gram', value: money(metrics?.avg_per_gram, 'INR') },
    {
      label: 'GOLDBEES P/L · excl. tax',
      value: signedMoney(metrics?.bees_pl, 'INR'),
      help: 'GOLDBEES P/L excluding tax, from your GOLDBEES holding.',
      tone: toneOf(metrics?.bees_pl),
    },
    {
      label: 'Net P/L · including bees',
      value: signedMoney(metrics?.nett_in_bees, 'INR'),
      help: 'Physical net P/L plus GOLDBEES P/L. Unavailable when the ETF component is unavailable.',
      tone: toneOf(metrics?.nett_in_bees),
    },
    {
      label: 'Physical gold XIRR',
      value: formatRate(metrics?.xirr),
      help: 'Annualised cash-flow return for physical gold.',
      tone: toneOf(metrics?.xirr),
    },
  ]

  return (
    <>
      <Ui2PageIntro title="A clear view of your gold." subtitle="Your physical gold ledger, from purchase to present value." />

      <section className="asset-root" aria-label="Gold">
        <div className="asset-top">
          <div>
            <h2>Physical gold</h2>
            <p className="asset-note" style={{ marginTop: 7 }}>Purchases, bill comparisons and daily prices · INR</p>
          </div>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setEditing({ txn: null })}>
            ＋ Add purchase
          </button>
        </div>

        {err && <p className="ui2-note" role="alert">{err}</p>}
        {loading && <p className="ui2-note" aria-live="polite">Loading…</p>}

        <AssetStats stats={stats} />

        <section className="ui2-panel gold-meta" aria-label="Gold metrics">
          {meta.map(item => (
            <div key={item.label}>
              {item.help
                ? <button type="button" className="asset-metric-help" title={item.help}><span>{item.label}</span></button>
                : <span>{item.label}</span>}
              <strong className={item.tone === 'positive' ? 'u2-positive' : item.tone === 'negative' ? 'u2-negative' : undefined}>
                {item.value}
              </strong>
            </div>
          ))}
        </section>

        <section className="ui2-panel">
          <div className="asset-search">
            <h2 style={{ font: '700 15px var(--u2-font-display)', margin: 0 }}>Purchase ledger</h2>
            <span style={{ flex: 1 }} />
            <span className="asset-note">All 15 purchase columns</span>
          </div>
          <div className="asset-table-wrap">
            <table className="asset-table" aria-label="Gold purchases">
              <thead>
                <tr>
                  {GOLD_COLUMNS.map(column => (
                    <th key={column.key} scope="col" className={column.kind === 'computed' ? 'computed' : undefined}>
                      {column.label}
                    </th>
                  ))}
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && purchases.length === 0 ? (
                  <tr><td colSpan={GOLD_COLUMNS.length + 1} className="empty">No purchases yet. Add your first purchase.</td></tr>
                ) : purchases.map(txn => (
                  <tr key={txn.id}>
                    {GOLD_COLUMNS.map(column => (
                      <td
                        key={column.key}
                        className={[
                          column.kind === 'computed' && 'computed',
                          column.key === 'nimmi_loss' && nimmiTone(txn),
                        ].filter(Boolean).join(' ') || undefined}
                      >
                        {goldCell(txn, column.key)}
                      </td>
                    ))}
                    <td>
                      <button type="button" className="ui2-btn" aria-label={`Details of ${formatDate(txn.date)} purchase`}
                        onClick={() => setDetails(txn)}>Details</button>{' '}
                      <button type="button" className="ui2-btn" aria-label={`Edit ${formatDate(txn.date)} purchase`}
                        onClick={() => setEditing({ txn })}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="asset-footer">
            <span>{purchases.length} purchases · newest first</span>
            <span>Shaded columns are calculated · scroll horizontally to view all columns</span>
          </div>
        </section>

        {!loading && <GoldPricesPanel prices={prices} onSaved={() => void refresh()} />}
      </section>

      {editing && (
        <Ui2GoldEditor txn={editing.txn} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
      )}
      {details && (
        <Ui2GoldDetails
          txn={details}
          onClose={() => setDetails(null)}
          onEdit={() => { setEditing({ txn: details }); setDetails(null) }}
          onDeleted={() => void refresh()}
        />
      )}
      {!loading && !promptSkipped && missing.length > 0 && !editing && !details && (
        <MissingPricesModal missing={missing} onSkip={() => setPromptSkipped(true)} onSaved={() => void refresh()} />
      )}
    </>
  )
}
```

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2GoldPage.tsx`

### Task 9 — Page tests

**Files:** `frontend/src/ui2/gold/Ui2GoldPage.test.tsx` (create)

* [ ] Create `frontend/src/ui2/gold/Ui2GoldPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type GoldTransaction } from '../../lib/api/client'
import { Ui2GoldPage } from './Ui2GoldPage'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      listGoldTransactions: vi.fn(),
      listGoldPrices: vi.fn(),
      listGoldMissingDates: vi.fn(),
      getGoldMetrics: vi.fn(),
      createGoldTransaction: vi.fn(),
      updateGoldTransaction: vi.fn(),
      deleteGoldTransaction: vi.fn(),
      putGoldPrices: vi.fn(),
    },
  }
})

const older: GoldTransaction = {
  id: 1, date: '2026-03-01', gm_price: 8000, grams_bought: 10, actual_paid: 82000,
  gold_cost: 80000, gst_on_cost: 2400, total_expected: 82400, nett_per_gram: 8200, nimmi_loss: 0,
}
const newer: GoldTransaction = {
  id: 2, date: '2026-06-01', gm_price: 9000, grams_bought: 2.5, actual_paid: 23500,
  quote_price: 9100, bill_amount: 23400, billed_weight: 2.48, chennai_rate: 'Ditto',
  gold_cost: 22500, gst_on_cost: 675, total_expected: 23175, gst_on_quote: 682.5,
  nett_per_gram: 9400, nett_reduction: 100, nimmi_loss: 180,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.listGoldTransactions).mockResolvedValue([older, newer])
  vi.mocked(api.listGoldPrices).mockResolvedValue([{ date: '2026-11-19', price_per_gram: 9500 }])
  vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: [] })
  vi.mocked(api.getGoldMetrics).mockResolvedValue({
    invested: 105500, grams: 12.5, current: 118750, avg_per_gram: 8440,
    bees_pl: null, nett_ex_bees: 13250, nett_in_bees: null, xirr: 0.12,
  })
})

const ledger = () => screen.findByRole('table', { name: 'Gold purchases' })

describe('Ui2GoldPage', () => {
  it('renders the handoff intro and the four stat cards from the server metrics', async () => {
    render(<Ui2GoldPage />)
    expect(screen.getByRole('heading', { name: 'A clear view of your gold.' })).toBeInTheDocument()
    expect(await screen.findByText('₹1,18,750.00')).toBeInTheDocument()
    expect(screen.getByText('Latest recorded rate · 19-11-2026')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Physical gold' })).getByText('12.5 g')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Net P/L · physical' })).getByText('+₹13,250.00'))
      .toHaveClass('u2-positive')
  })

  it('shows unknowable metrics as a dash, never a zero', async () => {
    render(<Ui2GoldPage />)
    const metrics = await screen.findByRole('region', { name: 'Gold metrics' })
    expect(within(metrics).getByTitle(/GOLDBEES P\/L excluding tax/).parentElement).toHaveTextContent('—')
    expect(within(metrics).getByText('12%')).toHaveClass('u2-positive')
  })

  it('renders all 15 columns, shades the calculated ones and lists newest first', async () => {
    render(<Ui2GoldPage />)
    const table = await ledger()
    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(16)
    expect(headers[3]).toHaveTextContent('Gold cost')
    expect(headers[3]).toHaveClass('computed')
    expect(headers[1]).not.toHaveClass('computed')
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const [, first, second] = within(table).getAllByRole('row')
    expect(first).toHaveTextContent('01-06-2026')
    expect(second).toHaveTextContent('01-03-2026')
  })

  it('renders absent optional fields as a dash and tones a NIMMI loss', async () => {
    render(<Ui2GoldPage />)
    const table = await ledger()
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const olderRow = within(table).getAllByRole('row')[2]
    expect(within(olderRow).getAllByText('—').length).toBeGreaterThanOrEqual(6)
    const newerRow = within(table).getAllByRole('row')[1]
    expect(within(newerRow).getByText('₹180.00')).toHaveClass('u2-negative')
  })

  it('opens Details with every column and deletes after confirmation', async () => {
    vi.mocked(api.deleteGoldTransaction).mockResolvedValue(undefined)
    render(<Ui2GoldPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Details of 01-06-2026 purchase' }))
    const dialog = screen.getByRole('dialog', { name: 'Purchase · 01-06-2026' })
    expect(within(dialog).getByText('LOSS due to NIMMI')).toBeInTheDocument()
    expect(within(dialog).getByText('Ditto')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete purchase' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete purchase?' })
    expect(confirm).toHaveTextContent('Remove the 2.5 g purchase from 01-06-2026?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete purchase' }))
    await waitFor(() => expect(api.deleteGoldTransaction).toHaveBeenCalledWith(2))
    await waitFor(() => expect(api.listGoldTransactions).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves from Details to the editor prefilled with the purchase', async () => {
    render(<Ui2GoldPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Details of 01-06-2026 purchase' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit purchase' }))
    const editor = screen.getByRole('dialog', { name: 'Edit gold purchase' })
    expect(within(editor).getByLabelText('Weight bought · grams *')).toHaveValue('2.5')
    expect(within(editor).getByLabelText('Chennai rate / remark')).toHaveValue('Ditto')
  })

  it('validates and creates a purchase with the shared rules', async () => {
    vi.mocked(api.createGoldTransaction).mockResolvedValue(older)
    render(<Ui2GoldPage />)
    await userEvent.click(screen.getByRole('button', { name: '＋ Add purchase' }))
    const editor = screen.getByRole('dialog', { name: 'Add gold purchase' })
    await userEvent.click(within(editor).getByRole('button', { name: 'Save purchase' }))
    expect(within(editor).getByRole('alert')).toHaveTextContent('Per-gram price must be > 0')
    expect(api.createGoldTransaction).not.toHaveBeenCalled()
    await userEvent.type(within(editor).getByLabelText('Per-gram purchase rate · INR *'), '9000')
    await userEvent.type(within(editor).getByLabelText('Weight bought · grams *'), '2.500')
    await userEvent.type(within(editor).getByLabelText('Actual paid · INR *'), '23500')
    await userEvent.click(within(editor).getByRole('button', { name: 'Save purchase' }))
    await waitFor(() => expect(api.createGoldTransaction).toHaveBeenCalledWith(expect.objectContaining({
      gm_price: 9000, grams_bought: 2.5, actual_paid: 23500, quote_price: null, chennai_rate: null,
    })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add gold purchase' })).not.toBeInTheDocument())
  })

  it('shows the empty ledger row when there are no purchases', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([])
    render(<Ui2GoldPage />)
    expect(await screen.findByText('No purchases yet. Add your first purchase.')).toBeInTheDocument()
  })
})
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/gold src/features/gold 2>&1 | tail -4`

Expected: all pass (8 page tests plus the unchanged Classic suites).

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2GoldPage.test.tsx`

### Task 10 — Slice 20 gate

* [ ] `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`

Expected: every suite passes, no type or lint errors, build succeeds.

* [ ] Open the slice 20 PR (`feat/PD-059-gold-page`), label `ui-2.0`.

### Task 11 — Shared price-entry rules

**Files:** `frontend/src/features/gold/goldPrices.ts`, `goldPrices.test.ts` (create)

The Classic panel, the Classic prompt and both UI_2.0 replacements all parse a rate, reject non-positive ones and send only filled days. One module keeps those four in step.

* [ ] Create `frontend/src/features/gold/goldPrices.ts`:

```ts
import type { GoldPrice } from '../../lib/api/client'
import { parseDecimalInput } from '../../lib/formNumbers'

// Shared gold-price input rules (PRD-003 §7) for the Classic panels and the
// UI_2.0 page, so both accept and reject exactly the same entries.

// localToday is the user's calendar day; the server rejects future dates
// (IST), and a date input capped at this never sends one.
export function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// pricePerGram parses one entered rate; null unless it is a number above 0.
export function pricePerGram(raw: string): number | null {
  const value = parseDecimalInput(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

// enteredPrices collects the days the user actually filled, in the order
// given. Blank days are left for later rather than rejected, so a long gap
// can be closed piecemeal; invalidDate names the first unusable entry.
export function enteredPrices(dates: string[], entered: Record<string, string>): {
  prices: GoldPrice[]
  invalidDate: string | null
} {
  const prices: GoldPrice[] = []
  for (const date of dates) {
    const raw = entered[date]
    if (raw == null || raw.trim() === '') continue
    const value = pricePerGram(raw)
    if (value == null) return { prices: [], invalidDate: date }
    prices.push({ date, price_per_gram: value })
  }
  return { prices, invalidDate: null }
}

// pricesByMonth groups the series into YYYY-MM months, newest month and
// newest day first, for the "View all months" list.
export function pricesByMonth(prices: GoldPrice[]): Array<{ month: string; prices: GoldPrice[] }> {
  const months = new Map<string, GoldPrice[]>()
  for (const price of [...prices].sort((first, second) => second.date.localeCompare(first.date))) {
    const month = price.date.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), price])
  }
  return [...months].map(([month, monthPrices]) => ({ month, prices: monthPrices }))
}
```

* [ ] Create `frontend/src/features/gold/goldPrices.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { enteredPrices, pricePerGram, pricesByMonth } from './goldPrices'

describe('pricePerGram', () => {
  it('accepts a positive rate, grouped or not', () => {
    expect(pricePerGram('9500')).toBe(9500)
    expect(pricePerGram('9,500.5')).toBe(9500.5)
  })

  it('rejects zero, negatives and blanks', () => {
    expect(pricePerGram('0')).toBeNull()
    expect(pricePerGram('')).toBeNull()
  })
})

describe('enteredPrices', () => {
  const days = ['2026-11-15', '2026-11-16', '2026-11-17']

  it('sends only the filled days, in the given order', () => {
    expect(enteredPrices(days, { '2026-11-17': '9600', '2026-11-15': '9500', '2026-11-16': ' ' })).toEqual({
      prices: [{ date: '2026-11-15', price_per_gram: 9500 }, { date: '2026-11-17', price_per_gram: 9600 }],
      invalidDate: null,
    })
  })

  it('names the first unusable entry and sends nothing', () => {
    expect(enteredPrices(days, { '2026-11-15': '9500', '2026-11-16': '0' }))
      .toEqual({ prices: [], invalidDate: '2026-11-16' })
  })
})

describe('pricesByMonth', () => {
  it('groups newest month first with newest day first inside each', () => {
    const groups = pricesByMonth([
      { date: '2026-10-30', price_per_gram: 9000 },
      { date: '2026-11-01', price_per_gram: 9100 },
      { date: '2026-11-18', price_per_gram: 9500 },
    ])
    expect(groups.map(group => group.month)).toEqual(['2026-11', '2026-10'])
    expect(groups[0].prices.map(price => price.date)).toEqual(['2026-11-18', '2026-11-01'])
  })
})
```

* [ ] Commit: `git add frontend/src/features/gold/goldPrices.ts frontend/src/features/gold/goldPrices.test.ts`

### Task 12 — Classic price panels on the shared rules

**Files:** `frontend/src/features/gold/GoldPricesPanel.tsx`, `MissingPricesModal.tsx` (modify)

Behaviour and messages are unchanged; `GoldPricesPanel.test.tsx` and `GoldPage.test.tsx` prove it.

* [ ] `frontend/src/features/gold/GoldPricesPanel.tsx`, change 1 of 3. Current code:

```tsx
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'

interface Props {
```

Replacement:

```tsx
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { localToday, pricePerGram } from './goldPrices'

interface Props {
```

* [ ] `frontend/src/features/gold/GoldPricesPanel.tsx`, change 2 of 3. Current code:

```tsx
const fmt = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 })

// localToday keeps the quick-add default on the user's calendar day; the
// server rejects future dates (IST), and this input never sends one.
function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Recent daily prices plus a single-row quick-add/edit (PRD-003 §7). Bulk
 * gap-filling is the MissingPricesModal's job; this panel is for the routine
```

Replacement:

```tsx
const fmt = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** Recent daily prices plus a single-row quick-add/edit (PRD-003 §7). Bulk
 * gap-filling is the MissingPricesModal's job; this panel is for the routine
```

* [ ] `frontend/src/features/gold/GoldPricesPanel.tsx`, change 3 of 3. Current code:

```tsx

  const save = async () => {
    const value = parseDecimalInput(price)
    if (!date) { setErr('Pick a date'); return }
    if (!Number.isFinite(value) || value <= 0) { setErr('Price must be a number > 0'); return }
    setErr('')
    setSaving(true)
```

Replacement:

```tsx

  const save = async () => {
    const value = pricePerGram(price)
    if (!date) { setErr('Pick a date'); return }
    if (value == null) { setErr('Price must be a number > 0'); return }
    setErr('')
    setSaving(true)
```

* [ ] `frontend/src/features/gold/MissingPricesModal.tsx`, change 1 of 2. Current code:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { formatDate } from '../../lib/formDates'

interface Props {
```

Replacement:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { enteredPrices } from './goldPrices'

interface Props {
```

* [ ] `frontend/src/features/gold/MissingPricesModal.tsx`, change 2 of 2. Current code:

```tsx
  const set = (date: string, value: string) => setPrices(previousPrices => ({ ...previousPrices, [date]: value }))

  // Only the days the user actually filled are sent; blanks are left for a
  // later visit rather than rejected, so a long gap can be closed piecemeal.
  const filled = (): GoldPrice[] => {
    const out: GoldPrice[] = []
    for (const date of missing) {
      const raw = prices[date]
      if (raw == null || raw.trim() === '') continue
      out.push({ date, price_per_gram: parseDecimalInput(raw) })
    }
    return out
  }

  const invalid = (): string | null => {
    for (const price of filled()) {
      if (!Number.isFinite(price.price_per_gram) || price.price_per_gram <= 0) {
        return `Price for ${formatDate(price.date)} must be a number > 0`
      }
    }
    return null
  }

  const save = async () => {
    const bad = invalid()
    if (bad) { setErr(bad); return }
    const rows = filled()
    if (rows.length === 0) { setErr('Enter at least one price, or skip.'); return }
    setErr('')
```

Replacement:

```tsx
  const set = (date: string, value: string) => setPrices(previousPrices => ({ ...previousPrices, [date]: value }))

  const save = async () => {
    const { prices: rows, invalidDate } = enteredPrices(missing, prices)
    if (invalidDate) { setErr(`Price for ${formatDate(invalidDate)} must be a number > 0`); return }
    if (rows.length === 0) { setErr('Enter at least one price, or skip.'); return }
    setErr('')
```

* [ ] Verify: `cd frontend && npx vitest run src/features/gold 2>&1 | tail -4`

Expected: all Classic gold tests pass, unmodified.

* [ ] Commit: `git add frontend/src/features/gold/GoldPricesPanel.tsx frontend/src/features/gold/MissingPricesModal.tsx`

### Task 13 — Daily price panel

**Files:** `frontend/src/ui2/gold/Ui2GoldPrices.tsx` (create)

`DecimalInput` does not forward refs, so Edit rate focuses the rate field by id.

* [ ] Create `frontend/src/ui2/gold/Ui2GoldPrices.tsx`:

```tsx
import { useState } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { localToday, pricePerGram, pricesByMonth } from '../../features/gold/goldPrices'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { money } from '../overview/Ui2SummaryCards'
import '../asset/asset.css'
import './gold.css'

const RECENT_DAYS = 30
const PRICE_INPUT_ID = 'ui2-gold-price-per-gram'

// The handoff's daily gold price panel: one INR rate per gram per day, the
// 30 most recent shown, every month behind "View all months" (owner,
// 2026-11-18). Edit rate loads a day into the form; saving it replaces it.
export function Ui2GoldPrices({ prices, onSaved }: { prices: GoldPrice[]; onSaved: () => void }) {
  const [date, setDate] = useState(localToday())
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [allMonths, setAllMonths] = useState(false)

  const recent = [...prices].sort((first, second) => second.date.localeCompare(first.date)).slice(0, RECENT_DAYS)

  const save = async () => {
    const value = pricePerGram(price)
    if (!date) { setErr('Pick a date'); return }
    if (value == null) { setErr('Price must be a number > 0'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices([{ date, price_per_gram: value }])
      setPrice('')
      toast('Daily price saved', 'success')
      onSaved()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const editRate = (recorded: GoldPrice) => {
    setDate(recorded.date)
    setPrice(String(recorded.price_per_gram))
    document.getElementById(PRICE_INPUT_ID)?.focus()
  }

  return (
    <section className="ui2-panel asset-panel" aria-label="Daily gold price">
      <div className="asset-panel-head">
        <h2>Daily gold price</h2>
        <span className="asset-note">One INR rate per gram, per calendar day</span>
      </div>
      <form
        className="asset-toolbar"
        style={{ justifyContent: 'flex-start', alignItems: 'flex-end' }}
        onSubmit={event => { event.preventDefault(); void save() }}
      >
        <label className="asset-note">
          Price date<br />
          <input className="asset-input" type="date" aria-label="Gold price date" max={localToday()}
            value={date} onChange={event => setDate(event.target.value)} required style={{ marginTop: 7 }} />
        </label>
        <label className="asset-note">
          Price per gram · INR<br />
          <DecimalInput id={PRICE_INPUT_ID} className="asset-input" aria-label="Gold price per gram" placeholder="₹ / gram"
            value={price} onValueChange={setPrice} style={{ marginTop: 7 }} />
        </label>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save price'}
        </button>
      </form>
      {err && <p className="asset-error" role="alert">{err}</p>}
      <p className="asset-note" style={{ marginTop: 12 }}>Re-entering a date replaces its recorded rate.</p>
      {recent.length === 0 ? (
        <p className="asset-note" style={{ marginTop: 16 }}>No prices recorded yet.</p>
      ) : (
        <div className="gold-price-list">
          {recent.map(recorded => (
            <div key={recorded.date} className="gold-price-item">
              <span>{formatDate(recorded.date)}</span>
              <strong>{money(recorded.price_per_gram, 'INR')} / g</strong>
              <button type="button" className="ui2-btn" aria-label={`Edit rate for ${formatDate(recorded.date)}`}
                onClick={() => editRate(recorded)}>Edit rate</button>
            </div>
          ))}
        </div>
      )}
      <div className="asset-modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="ui2-btn" onClick={() => setAllMonths(true)} disabled={prices.length === 0}>
          View all months
        </button>
      </div>

      {allMonths && (
        <Ui2Dialog title="Gold prices · all months" onClose={() => setAllMonths(false)} wide>
          <p className="asset-note">Recorded rates only. Missing days remain missing; no interpolation.</p>
          {pricesByMonth(prices).map(group => (
            <section key={group.month} aria-label={`Gold prices ${group.month}`}>
              <h3>{group.month}</h3>
              <div className="asset-table-wrap">
                <table className="asset-table">
                  <thead><tr><th scope="col">Date</th><th scope="col">INR per gram</th></tr></thead>
                  <tbody>
                    {group.prices.map(recorded => (
                      <tr key={recorded.date}>
                        <td>{formatDate(recorded.date)}</td>
                        <td>{money(recorded.price_per_gram, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </Ui2Dialog>
      )}
    </section>
  )
}
```

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2GoldPrices.tsx`

### Task 14 — Missing-price alert and dialog

**Files:** `frontend/src/ui2/gold/Ui2MissingPrices.tsx` (create)

`onSaved` is awaited so the dialog re-renders on the refreshed gap list before the toast decides whether everything is filled.

* [ ] Create `frontend/src/ui2/gold/Ui2MissingPrices.tsx`:

```tsx
import { useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { enteredPrices } from '../../features/gold/goldPrices'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

// MissingPricesAlert is the handoff's asset-alert above the ledger: it stays
// while any day since the first purchase lacks a price, and reopens the
// dialog after the user skipped it.
export function MissingPricesAlert({ count, onReview }: { count: number; onReview: () => void }) {
  return (
    <div className="asset-alert" role="status">
      <div>
        <strong>{count} daily {count === 1 ? 'price needs' : 'prices need'} attention</strong>
        <span>Days since your first purchase with no recorded rate.</span>
      </div>
      <button type="button" className="ui2-btn" onClick={onReview}>Review missing prices</button>
    </div>
  )
}

// Ui2MissingPrices is the handoff's goldGapDialog: enter the rates you know,
// skip the rest. Nothing is inferred. After a save the dialog stays open on
// the days still missing, and closes with a toast once every day is filled.
export function Ui2MissingPrices({ missing, onSkip, onSaved }: {
  missing: string[]
  onSkip: () => void
  onSaved: () => Promise<void>
}) {
  const [entered, setEntered] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const { prices, invalidDate } = enteredPrices(missing, entered)
    if (invalidDate) { setErr(`Price for ${formatDate(invalidDate)} must be a number > 0`); return }
    if (prices.length === 0) { setErr('Enter at least one known rate, or skip for now.'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices(prices)
      const allFilled = prices.length === missing.length
      await onSaved()
      if (allFilled) toast('All price gaps filled', 'success')
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Ui2Dialog title="Complete missing daily prices" onClose={onSkip} busy={saving}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <p className="asset-note">
          {missing.length} {missing.length === 1 ? 'date is' : 'dates are'} missing. Enter known rates or skip for now; no price is inferred.
        </p>
        <div className="asset-form">
          {missing.map(date => (
            <label key={date}>
              {formatDate(date)} · INR / gram
              <DecimalInput placeholder="Enter recorded rate" value={entered[date] ?? ''}
                onValueChange={value => setEntered(previous => ({ ...previous, [date]: value }))} />
            </label>
          ))}
        </div>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={onSkip} disabled={saving}>Skip for now</button>
          <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save entered prices'}
          </button>
        </div>
      </form>
    </Ui2Dialog>
  )
}
```

* [ ] Commit: `git add frontend/src/ui2/gold/Ui2MissingPrices.tsx`

### Task 15 — Wire the page and test it

**Files:** `frontend/src/ui2/gold/Ui2GoldPage.tsx`, `Ui2GoldPage.test.tsx` (modify), `Ui2GoldPrices.test.tsx` (create)

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.tsx`, change 1 of 5. Current code:

```tsx
import { formatRate } from '../../lib/rate'
import { useGoldData } from '../../features/gold/useGoldData'
import GoldPricesPanel from '../../features/gold/GoldPricesPanel'
import MissingPricesModal from '../../features/gold/MissingPricesModal'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
```

Replacement:

```tsx
import { formatRate } from '../../lib/rate'
import { useGoldData } from '../../features/gold/useGoldData'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
```

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.tsx`, change 2 of 5. Current code:

```tsx
import { Ui2GoldDetails } from './Ui2GoldDetails'
import { Ui2GoldEditor } from './Ui2GoldEditor'
import '../asset/asset.css'
import './gold.css'
```

Replacement:

```tsx
import { Ui2GoldDetails } from './Ui2GoldDetails'
import { Ui2GoldEditor } from './Ui2GoldEditor'
import { Ui2GoldPrices } from './Ui2GoldPrices'
import { MissingPricesAlert, Ui2MissingPrices } from './Ui2MissingPrices'
import '../asset/asset.css'
import './gold.css'
```

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.tsx`, change 3 of 5. Current code:

```tsx
        </section>

        <section className="ui2-panel">
          <div className="asset-search">
```

Replacement:

```tsx
        </section>

        {!loading && missing.length > 0 && (
          <MissingPricesAlert count={missing.length} onReview={() => setPromptSkipped(false)} />
        )}

        <section className="ui2-panel">
          <div className="asset-search">
```

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.tsx`, change 4 of 5. Current code:

```tsx
        </section>

        {!loading && <GoldPricesPanel prices={prices} onSaved={() => void refresh()} />}
      </section>

```

Replacement:

```tsx
        </section>

        {!loading && <Ui2GoldPrices prices={prices} onSaved={() => void refresh()} />}
      </section>

```

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.tsx`, change 5 of 5. Current code:

```tsx
      )}
      {!loading && !promptSkipped && missing.length > 0 && !editing && !details && (
        <MissingPricesModal missing={missing} onSkip={() => setPromptSkipped(true)} onSaved={() => void refresh()} />
      )}
    </>
```

Replacement:

```tsx
      )}
      {!loading && !promptSkipped && missing.length > 0 && !editing && !details && (
        <Ui2MissingPrices missing={missing} onSkip={() => setPromptSkipped(true)} onSaved={refresh} />
      )}
    </>
```

* [ ] `frontend/src/ui2/gold/Ui2GoldPage.test.tsx`, change 1 of 1. Current code:

```tsx
  })

  it('shows the empty ledger row when there are no purchases', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([])
```

Replacement:

```tsx
  })

  it('opens the missing-price dialog on arrival and keeps the alert after a skip', async () => {
    vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: ['2026-11-15', '2026-11-16'] })
    render(<Ui2GoldPage />)
    const dialog = await screen.findByRole('dialog', { name: 'Complete missing daily prices' })
    expect(dialog).toHaveTextContent('2 dates are missing')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 daily prices need attention')
    await userEvent.click(screen.getByRole('button', { name: 'Review missing prices' }))
    expect(screen.getByRole('dialog', { name: 'Complete missing daily prices' })).toBeInTheDocument()
  })

  it('saves the entered days and stays open on the days still missing', async () => {
    vi.mocked(api.listGoldMissingDates)
      .mockResolvedValueOnce({ missing: ['2026-11-15', '2026-11-16'] })
      .mockResolvedValue({ missing: ['2026-11-16'] })
    vi.mocked(api.putGoldPrices).mockResolvedValue(undefined)
    render(<Ui2GoldPage />)
    const dialog = await screen.findByRole('dialog', { name: 'Complete missing daily prices' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save entered prices' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter at least one known rate, or skip for now.')
    await userEvent.type(within(dialog).getByLabelText('15-11-2026 · INR / gram'), '9400')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save entered prices' }))
    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([{ date: '2026-11-15', price_per_gram: 9400 }]))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Complete missing daily prices' }))
      .toHaveTextContent('1 date is missing'))
    expect(screen.queryByLabelText('15-11-2026 · INR / gram')).not.toBeInTheDocument()
  })

  it('shows the empty ledger row when there are no purchases', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([])
```

* [ ] Create `frontend/src/ui2/gold/Ui2GoldPrices.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type GoldPrice } from '../../lib/api/client'
import { Ui2GoldPrices } from './Ui2GoldPrices'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: { putGoldPrices: vi.fn() } }
})

// 35 consecutive days ending 2026-11-18, ascending as the server returns them.
const series: GoldPrice[] = Array.from({ length: 35 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, 15 + index))
  return { date: day.toISOString().slice(0, 10), price_per_gram: 9000 + index }
})

beforeEach(() => { vi.clearAllMocks() })

describe('Ui2GoldPrices', () => {
  it('lists the 30 most recent days, newest first', () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    const edits = screen.getAllByRole('button', { name: /^Edit rate for/ })
    expect(edits).toHaveLength(30)
    expect(edits[0]).toHaveAccessibleName('Edit rate for 18-11-2026')
  })

  it('loads a recorded day into the form with Edit rate', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit rate for 18-11-2026' }))
    expect(screen.getByLabelText('Gold price date')).toHaveValue('2026-11-18')
    expect(screen.getByLabelText('Gold price per gram')).toHaveValue('9034')
    expect(screen.getByLabelText('Gold price per gram')).toHaveFocus()
  })

  it('saves one day and reports it', async () => {
    vi.mocked(api.putGoldPrices).mockResolvedValue(undefined)
    const onSaved = vi.fn()
    render(<Ui2GoldPrices prices={series} onSaved={onSaved} />)
    await userEvent.clear(screen.getByLabelText('Gold price date'))
    await userEvent.type(screen.getByLabelText('Gold price date'), '2026-11-10')
    await userEvent.type(screen.getByLabelText('Gold price per gram'), '9450')
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([{ date: '2026-11-10', price_per_gram: 9450 }]))
    expect(onSaved).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Gold price per gram')).toHaveValue('')
  })

  it('rejects a non-positive rate without calling the server', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Gold price per gram'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a number > 0')
    expect(api.putGoldPrices).not.toHaveBeenCalled()
  })

  it('shows every month, newest first, behind View all months', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'View all months' }))
    const dialog = screen.getByRole('dialog', { name: 'Gold prices · all months' })
    const months = within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(months).toEqual(['2026-11', '2026-10'])
    expect(within(within(dialog).getByRole('region', { name: 'Gold prices 2026-10' })).getAllByRole('row'))
      .toHaveLength(18) // header + 17 October days
  })
})
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/gold src/features/gold 2>&1 | tail -4`

Expected: 7 files, 45 tests pass.

* [ ] Commit: `git add frontend/src/ui2/gold/`

### Task 16 — Slice 21 gate

* [ ] The four Task 10 commands. Expected: all pass.
* [ ] Open the slice 21 PR (`feat/PD-059-gold-prices`), label `ui-2.0`.

### Task 17 — Board

**Files:** `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Rows 20 and 21: owner Claude, branch, PR number, state; on merge add `useGoldData`, `goldPrices`, `gold.css` and the `asset.css` additions to the components registry.
* [ ] Commit: `git add docs/plans/PD-059-ui-2-status.md`

---

## 7. End-to-end verification scenarios

On an account with `ui_mode = ui2` and Postgres configured:

1. `/gold` shows the intro, the four stat cards with their detail lines, the metrics strip with tooltips, the ledger with 15 columns (calculated ones shaded) newest first, and the daily price panel.
2. With a day missing a price, the missing-price dialog opens on arrival. Skip: it closes and the alert remains; Review missing prices reopens it.
3. Enter one of several missing days and save: the dialog stays open on the rest. Fill the last: it closes with "All price gaps filled".
4. Details on a purchase shows all 15 fields; Edit purchase opens the editor prefilled; Delete purchase asks first, then removes the row and refreshes metrics.
5. Add purchase with an empty form shows `Per-gram price must be > 0`; a valid purchase saves and appears, metrics refresh.
6. Edit rate on a recorded day loads it into the form; saving replaces it.
7. View all months lists every month newest first, with no invented days.
8. At 390 px the page has no horizontal overflow; the ledger scrolls inside its wrapper.
9. Switch the account to Classic: `/gold` is the original page with ThemePicker, metrics table and its prompt.

---

## Done

* [ ] `feat/PD-059-gold-page` merged → slice 20 live
* [ ] `feat/PD-059-gold-prices` merged → slice 21 live
* [ ] Board rows 20–21 merged; registry updated
* [ ] PD-059-Q-5b-1 answered

**Next:** Wave 6 — slices 22–23 (act-as in UI_2.0, admin user list and detail).
