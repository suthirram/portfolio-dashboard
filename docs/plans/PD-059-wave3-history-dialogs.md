# PD-059: Wave 3c amendment — UI_2.0 History dialogs and chart page (slice 14)

* **Status**: In review (#346); implementation starts after this docs PR merges
* **Owner**: Claude; product decisions remain with the project owner
* **Updated**: 2026-11-19
* **Goal**: UI_2.0 History opens the handoff's dialogs — Add / Edit daily record, Paste monthly records, the record-exists choice, the snapshot breakdown and the Full-history charts — and shows the full-history chart page in UI_2.0 parts.
* **Architecture**: The page keeps its data and handlers (`useHistoryMonth`). The classic dialogs' logic moves into hooks and helpers both interfaces call (`usePasteSubmit`, `useConflictPicks`, `positiveRegionHoldings`); UI_2.0 renders them in a shared `Ui2Dialog` portalled to `document.body` with the app's `useDialogFocus` policy. The chart page branches its chrome on `ui_mode` and keeps its data, zoom and granularity.
* **Tech stack**: React 18 + TypeScript, `react-dom` portal, plain SVG mini charts from slice 13, CSS under `:root[data-ui="ui2"]`, Vitest + Testing Library.
* **Spec links**: [PRD-015 §4.5](../prds/PRD-015-ui-2.md#45-history), [wave 3b (slice 13)](PD-059-wave3-history.md), [parent plan PD-059](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md), visual authority `docs/visuals/PD-059-ui-2-reference.html` (History dialogs).

## 1. Scope and owner decisions

Owner answers (2026-11-19) this slice implements:

| # | Decision |
| --- | --- |
| Add / Edit | The handoff's form: one asset group per save (Date, Asset group, Invested amount, Snapshot value). INR or EUR only — gold comes from the Gold ledger and the API has no gold field. Edit pre-fills the chosen group from the row, the date is read-only, and only a change is sent (`changedRegions`); an unchanged edit closes. Delete stays inside Edit under today's rule (slice 13). |
| Paste | Today's tab-separated format (C8), in the handoff's dialog. |
| Breakdown | The handoff's columns only: the group's Invested and Snapshot value, then Holding / Quantity / Value (value at that day's close). Today's price, change and dividend columns are not shown in UI_2.0. |
| Full-history charts | A header button opens a dialog with the three mini charts per asset over every stored day. Dense point markers are omitted, while isolated valid values remain marked so a one-point series or a point across data gaps stays visible. A value chart still opens `/history/chart/:region`. |
| Chart page | No handoff frame: restyle with UI_2.0 parts — intro with Back to History, panel, segment and zoom buttons, the handoff's line colours. Same data, zoom and Daily / Weekly. |

Kept exactly: validation (`formError`, `formToBody`), the 409 conflict flow
and queue, paste parsing and its report, delete confirm and rule, owner
scope. Classic and Glass keep their dialogs and chart page; their only code
change is that the paste and conflict logic now lives in hooks they call.

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `frontend/src/features/history/HistoryModals.tsx` | `usePasteSubmit`, `useConflictPicks` and their types, called by the classic dialogs |
| Modify | `frontend/src/features/history/historyShared.ts` | `positiveRegionHoldings` |
| Modify | `frontend/src/features/history/HistoryChartPage.tsx` | Export `HISTORY_START`; UI_2.0 chrome |
| Create | `frontend/src/ui2/shell/Ui2Dialog.tsx` | Shared handoff dialog (registry) |
| Modify | `frontend/src/ui2/primitives.css` | Dialog, form, note, detail-grid and action styles; link buttons undecorated |
| Create | `frontend/src/ui2/history/Ui2HistoryDialogs.tsx` | Record, paste, conflict, breakdown and full-history dialogs |
| Modify | `frontend/src/ui2/history/history.css` | Dialog tables, paste report, chart-page panel and zoom |
| Modify | `frontend/src/ui2/history/Ui2History.tsx` | UI_2.0 dialogs and the Full-history charts button |
| Modify | `frontend/src/ui2/history/Ui2History.test.tsx` | Dialog behaviour |
| Modify | `frontend/src/ui2/history/Ui2MiniChart.tsx` | Keep isolated valid points visible when dense markers are disabled |
| Create | `frontend/src/ui2/history/Ui2MiniChart.test.tsx` | Isolated and connected point marker behaviour |
| Create | `frontend/src/ui2/history/Ui2HistoryChartPage.test.tsx` | Chart page in UI_2.0 and fallback |
| Modify | `docs/plans/PD-059-ui-2-status.md` | Slice 14 state, registry rows |

## 3. PR sequence

| Order | Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- | --- |
| Amendment | `docs/PD-059-wave3-history-dialogs` | This plan, board | Docs only | Unlocks slice 14 | markdownlint |
| Slice 14 | `feat/PD-059-history-dialogs` | Tasks 1–6 | Classic paste / conflict logic moved verbatim into hooks (177 History tests pass untouched); the chart page's classic branch renders as today | UI_2.0 History gets the handoff dialogs, the full-history charts and a UI_2.0 chart page | `Ui2History.test.tsx`, `Ui2HistoryChartPage.test.tsx` |

One frontend-only PR, label `ui-2.0`, branched from `main`.

## 4. Tasks

### Task 1: Share the classic dialog logic

**Files:** `HistoryModals.tsx`, `historyShared.ts`, `HistoryChartPage.tsx` (modify)

The UI_2.0 dialogs must not copy the paste flow, the conflict choice or
the breakdown's holdings filter, so each moves into a hook or helper the
classic dialogs call unchanged. `HISTORY_START` is exported so the
full-history dialog loads the same range as the chart page.

* [ ] **`HistoryModals.tsx`:**

Current:

```tsx
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, REGION_LABELS,
  changedRegions, emptyForm, fmt,
  fmtCurrency, formError, formToBody, groupedInitial, holdingRegion,
  modalBackdrop, modalCard, parsePasteText, regroupHandler, td, th,
  type RegionFormState, type RegionKey,
} from './historyShared'
```

Replace with:

```tsx
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, REGION_LABELS,
  changedRegions, emptyForm, fmt,
  fmtCurrency, formError, formToBody, groupedInitial, holdingRegion,
  modalBackdrop, modalCard, parsePasteText, positiveRegionHoldings, regroupHandler, td, th,
  type RegionFormState, type RegionKey,
} from './historyShared'
```

Current:

```tsx
  )
}

export function PasteModal({ monthLabel, onSubmit, onCancel }: {
  monthLabel: string
  onSubmit: (input: { month: string; rows: ReturnType<typeof parsePasteText> }) => Promise<PasteHistoryReport>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PasteHistoryReport | null>(null)
```

Replace with:

```tsx
  )
}

// usePasteSubmit is the paste-month dialog's submit flow: parse the pasted
// text, count client-skipped lines, send the rows and keep the server's
// report. Shared by the classic PasteModal and UI_2.0's paste dialog.
export function usePasteSubmit(month: string, onSubmit: PasteSubmit) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PasteHistoryReport | null>(null)
```

Current:

```tsx
        )
        return
      }
      const submitted = await onSubmit({ month: monthLabel, rows })
      setReport(submitted)
      if (submitted.applied.length === 0 && submitted.conflicts.length === 0 && submitted.rejected.length === 0) {
        alert('Server accepted no rows. They were likely all outside the selected month.')
```

Replace with:

```tsx
        )
        return
      }
      const submitted = await onSubmit({ month, rows })
      setReport(submitted)
      if (submitted.applied.length === 0 && submitted.conflicts.length === 0 && submitted.rejected.length === 0) {
        alert('Server accepted no rows. They were likely all outside the selected month.')
```

Current:

```tsx
      setBusy(false)
    }
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onCancel() })
```

Replace with:

```tsx
      setBusy(false)
    }
  }
  return { text, setText, busy, report, clientSkipped, submit }
}

export type PasteSubmit = (input: { month: string; rows: ReturnType<typeof parsePasteText> }) => Promise<PasteHistoryReport>

export function PasteModal({ monthLabel, onSubmit, onCancel }: {
  monthLabel: string
  onSubmit: PasteSubmit
  onCancel: () => void
}) {
  const { text, setText, busy, report, clientSkipped, submit } = usePasteSubmit(monthLabel, onSubmit)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onCancel() })
```

Current:

```tsx
  )
}

export function ConflictDialog({ conflict, onResolve, onSkip }: {
  conflict: DateConflict
  onResolve: (date: string, chosen: Record<string, { invested: number; current: number }>) => Promise<void>
  onSkip: () => void
}) {
  const [picks, setPicks] = useState<Record<RegionKey, boolean>>({
    INR: false, EUR: false,
  })
```

Replace with:

```tsx
  )
}

export type ConflictResolve = (date: string, chosen: Record<string, { invested: number; current: number }>) => Promise<void>

// useConflictPicks is the conflict dialog's choice: which regions take the
// incoming value. Shared by the classic ConflictDialog and UI_2.0's.
export function useConflictPicks(conflict: DateConflict, onResolve: ConflictResolve) {
  const [selection, setSelection] = useState<{ date: string; picks: Record<RegionKey, boolean> }>({
    date: conflict.date,
    picks: { INR: false, EUR: false },
  })
  const picks = selection.date === conflict.date
    ? selection.picks
    : { INR: false, EUR: false }

  const toggle = (region: RegionKey) => setSelection(previous => {
    const current = previous.date === conflict.date ? previous.picks : { INR: false, EUR: false }
    return { date: conflict.date, picks: { ...current, [region]: !current[region] } }
  })
```

Current:

```tsx
    }
    await onResolve(conflict.date, chosen)
  }
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onSkip)
```

Replace with:

```tsx
    }
    await onResolve(conflict.date, chosen)
  }
  return { picks, toggle, submit }
}

export function ConflictDialog({ conflict, onResolve, onSkip }: {
  conflict: DateConflict
  onResolve: ConflictResolve
  onSkip: () => void
}) {
  const { picks, toggle, submit } = useConflictPicks(conflict, onResolve)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onSkip)
```

Current:

```tsx
  // Key by symbol+script so two holdings that share a symbol (e.g. a dual
  // listing) don't collide on the React key or the yesterday-price lookup.
  const keyFor = (holding: HistoryHolding) => `${holding.symbol} ${holding.script}`
  // Only real (positive-quantity) holdings in this currency.
  const holdings = (row.holdings ?? []).filter(holding => inRegion(holding) && holding.quantity > 0)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(holding => [keyFor(holding), holding]),
  )
```

Replace with:

```tsx
  // Key by symbol+script so two holdings that share a symbol (e.g. a dual
  // listing) don't collide on the React key or the yesterday-price lookup.
  const keyFor = (holding: HistoryHolding) => `${holding.symbol} ${holding.script}`
  const holdings = positiveRegionHoldings(row, region)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(holding => [keyFor(holding), holding]),
  )
```

* [ ] **`historyShared.ts`:**

Current:

```ts
  return gold.invested > (prev.gold?.invested ?? 0)
}

// bucketCurrency mirrors the backend's CurrencyOf (services/snapshot.go):
// INR and EUR map to themselves, blank defaults to INR, and anything else
// (legacy USD) has no bucket at all — the snapshot job excludes such a
```

Replace with:

```ts
  return gold.invested > (prev.gold?.invested ?? 0)
}

// positiveRegionHoldings is a row's real (positive-quantity) stock lines in
// one currency: the per-stock breakdown's rows in both interfaces.
export function positiveRegionHoldings(row: HistoryRow, region: RegionKey): HistoryHolding[] {
  return (row.holdings ?? []).filter(holding => holdingRegion(holding) === region && holding.quantity > 0)
}

// bucketCurrency mirrors the backend's CurrencyOf (services/snapshot.go):
// INR and EUR map to themselves, blank defaults to INR, and anything else
// (legacy USD) has no bucket at all — the snapshot job excludes such a
```

* [ ] **`HistoryChartPage.tsx`:** change `const HISTORY_START = '2000-01-01'`
  to `export const HISTORY_START = '2000-01-01'` (the rest of this file
  changes in Task 5).
* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/features/history`
  Expected: no type errors; `5 passed` files, `177 passed` tests.
* [ ] **Commit:** `git add frontend/src/features/history/HistoryModals.tsx frontend/src/features/history/historyShared.ts frontend/src/features/history/HistoryChartPage.tsx && git commit -m "♻️ Share History dialog logic"`

### Task 2: Shared `Ui2Dialog`

**Files:** `frontend/src/ui2/shell/Ui2Dialog.tsx` (create), `frontend/src/ui2/primitives.css` (modify)

Every UI_2.0 dialog uses the handoff's `#details` look: blurred backdrop,
17px panel, heading with ×. It reuses `useDialogFocus` (focus trap,
Escape, focus return) instead of a native `<dialog>`, matching every other
dialog in the app. It is portalled to `document.body`: inside `.ui2-main`
(its own stacking context) the sidebar would sit above the backdrop.

```tsx
// The handoff's dialog (#details): a blurred backdrop, a rounded panel, a
// heading with a × close. Focus is trapped and restored, and Escape closes,
// through the app's useDialogFocus policy; a click on the backdrop closes
// like the handoff's closedby="any". `wide` fits chart content. It renders
// into document.body: inside .ui2-main (its own stacking context) the sidebar
// would sit above the backdrop, unlike the handoff's top-layer dialog.
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus'
import '../primitives.css'

export function Ui2Dialog({ title, onClose, children, wide = false, busy = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  // While a save runs, Escape, × and the backdrop do not close.
  busy?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = () => { if (!busy) onClose() }
  useDialogFocus(root, close)
  return createPortal(
    <div className="ui2-dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={wide ? 'ui2-dialog ui2-dialog-wide' : 'ui2-dialog'}>
        <div className="ui2-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui2-dialog-close" aria-label={`Close ${title}`} onClick={close} disabled={busy}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
```

`primitives.css` — the handoff's dialog, `.form`, `.formrow`,
`.dialognote` and `.detailgrid` rules, and no underline on a link styled
as a button:

Current:

```css
  gap: 7px;
  white-space: nowrap;
  cursor: pointer;
}

:root[data-ui="ui2"] .ui2-btn:disabled {
```

Replace with:

```css
  gap: 7px;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
}

:root[data-ui="ui2"] .ui2-btn:disabled {
```

Current:

```css
    line-height: 1.7;
  }
}
```

Replace with:

```css
    line-height: 1.7;
  }
}

/* ---------- dialog (handoff dialog, .dialoghead, .close) ---------- */

:root[data-ui="ui2"] .ui2-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #101a3155;
  backdrop-filter: blur(5px);
  overflow: auto;
  overscroll-behavior: contain;
}

:root[data-ui="ui2"] .ui2-dialog {
  background: var(--u2-panel);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 17px;
  width: min(480px, calc(100% - 32px));
  max-height: 90vh;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 26px;
  box-shadow: 0 25px 100px #0005;
  font: 14px var(--u2-font);
}

:root[data-ui="ui2"] .ui2-dialog-wide { width: min(940px, 94vw); }

:root[data-ui="ui2"] .ui2-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .ui2-dialog-head h2 {
  font: 700 20px var(--u2-font-display);
  margin: 0;
}

:root[data-ui="ui2"] .ui2-dialog-close {
  border: 0;
  background: none;
  font-size: 24px;
  color: var(--u2-muted);
  cursor: pointer;
}

/* ---------- forms in dialogs (handoff .form, .formrow, .dialognote) ---------- */

:root[data-ui="ui2"] .ui2-form label {
  display: block;
  font-size: 12px;
  margin-bottom: 15px;
}

:root[data-ui="ui2"] .ui2-form input,
:root[data-ui="ui2"] .ui2-form select,
:root[data-ui="ui2"] .ui2-form textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--u2-border);
  background: var(--u2-bg);
  color: var(--u2-text);
  padding: 10px;
  border-radius: 7px;
  margin-top: 7px;
  font: 12px var(--u2-font);
  box-sizing: border-box;
}

:root[data-ui="ui2"] .ui2-form textarea {
  min-height: 130px;
  padding: 12px;
  font: 11px monospace;
}

:root[data-ui="ui2"] .ui2-form input[readonly] { color: var(--u2-muted); }

:root[data-ui="ui2"] .ui2-formrow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

:root[data-ui="ui2"] .ui2-form .ui2-btn-primary { width: 100%; }

:root[data-ui="ui2"] .ui2-dialog-note {
  font-size: 11px;
  color: var(--u2-muted);
  line-height: 1.7;
  border-top: 1px solid var(--u2-border);
  padding-top: 16px;
  margin-top: 22px;
}

:root[data-ui="ui2"] .ui2-form .ui2-dialog-note { margin-bottom: 20px; }

:root[data-ui="ui2"] .ui2-form-error {
  color: var(--u2-red);
  font-size: 11px;
  margin: 0 0 12px;
}

:root[data-ui="ui2"] .ui2-detailgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

:root[data-ui="ui2"] .ui2-detailgrid span {
  display: block;
  color: var(--u2-muted);
  font-size: 11px;
  margin-bottom: 6px;
}

:root[data-ui="ui2"] .ui2-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

:root[data-ui="ui2"] .ui2-btn-danger { color: var(--u2-red); }

@media (max-width: 760px) {
  :root[data-ui="ui2"] .ui2-formrow { grid-template-columns: 1fr; }

  :root[data-ui="ui2"] .ui2-dialog-actions { flex-wrap: wrap; }
}
```

* [ ] **Verify:** `cd frontend && npx tsc -b` — Expected: no output.
* [ ] **Commit:** `git add frontend/src/ui2/shell/Ui2Dialog.tsx frontend/src/ui2/primitives.css && git commit -m "✨ Add the shared UI_2.0 dialog"`

### Task 3: The History dialogs

**Files:** `frontend/src/ui2/history/Ui2HistoryDialogs.tsx` (create), `frontend/src/ui2/history/history.css` (modify)

Each dialog is the handoff's layout over the classic rule. The record
form keeps a `RegionFormState` for both currencies but validates and
sends only the chosen group, so `formError`, `formToBody` and
`changedRegions` are reused unchanged. Paste and conflict call the Task 1
hooks. The breakdown reads `positiveRegionHoldings` and values a line by
its stored `current` (quantity × close when absent). The full-history
dialog loads `HISTORY_START` → today once and draws slice 13's
`Ui2AssetCharts` with `markers={false}`. The handoff puts the note above
the primary button.

```tsx
// UI_2.0 History dialogs (PD-059 slice 14), laid out from the handoff's
// snapshotForm / pasteSnapshots / snapshotDrill / Full-history charts. Every
// rule is the classic one: the form helpers (formError, formToBody,
// changedRegions), the paste and conflict hooks, the positive-holdings
// filter, and the page's handlers from useHistoryMonth.
import { useEffect, useState } from 'react'
import { api, type DateConflict, type HistoryRow } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDayMonthName, todayIST } from '../../lib/formDates'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, changedRegions, emptyForm, fmtCurrency, formError, formToBody,
  groupedInitial, positiveRegionHoldings, regroupHandler,
  type RegionFormState, type RegionKey,
} from '../../features/history/historyShared'
import {
  useConflictPicks, usePasteSubmit, type ConflictResolve, type PasteSubmit,
} from '../../features/history/HistoryModals'
import { HISTORY_START } from '../../features/history/HistoryChartPage'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { ASSET_LABELS, visibleAssets, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'

type Amounts = Record<string, { invested: number; current: number }>

function formFromRow(row?: HistoryRow): RegionFormState {
  if (!row) return emptyForm()
  const form = emptyForm()
  for (const region of REGIONS) {
    form[region] = {
      invested: groupedInitial(row.regions[region]?.invested),
      current: groupedInitial(row.regions[region]?.current),
    }
  }
  return form
}

// Ui2RecordDialog adds or edits one asset group of one day (owner: the
// handoff's single-group form, INR or EUR; gold comes from the Gold ledger).
// Edit pre-fills the chosen group from the row and sends only a change.
export function Ui2RecordDialog({ row, onAdd, onEdit, onDelete, onClose }: {
  // Absent = add a new record.
  row?: HistoryRow
  onAdd: (input: { date: string; regions: Amounts }) => Promise<void>
  onEdit: (date: string, regions: Amounts) => Promise<void>
  // Present when the delete rule allows it (all-manual row, or super admin).
  onDelete?: (date: string) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(() => row?.date ?? todayIST())
  const [asset, setAsset] = useState<RegionKey>('INR')
  const [form, setForm] = useState<RegionFormState>(() => formFromRow(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const regroup = regroupHandler(setForm)
  const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[asset]]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Only the chosen group is validated and sent.
    const single: RegionFormState = { ...emptyForm(), [asset]: form[asset] }
    const invalid = formError(single)
    if (invalid) { setError(invalid); return }
    const body = formToBody(single)
    if (Object.keys(body).length === 0) { setError('Enter the invested amount and the snapshot value.'); return }
    setError('')
    if (row) {
      const changed = changedRegions(body, row.regions)
      if (Object.keys(changed).length === 0) { onClose(); return }
      setBusy(true)
      try { await onEdit(row.date, changed) } finally { setBusy(false) }
    } else {
      setBusy(true)
      try { await onAdd({ date, regions: body }) } finally { setBusy(false) }
    }
  }

  const setAmount = (key: 'invested' | 'current') => (value: string) =>
    setForm(previousForm => ({ ...previousForm, [asset]: { ...previousForm[asset], [key]: value } }))

  return (
    <Ui2Dialog title={row ? 'Edit daily record' : 'Add daily record'} onClose={onClose} busy={busy}>
      <form className="ui2-form" onSubmit={submit} noValidate>
        <label>
          Date
          <input type="date" value={date} readOnly={!!row} required max={todayIST()}
            onChange={e => setDate(e.target.value)} />
        </label>
        <label>
          Asset group
          <select value={asset} onChange={e => setAsset(e.target.value as RegionKey)}>
            {REGIONS.map(region => <option key={region} value={region}>{ASSET_LABELS[region]}</option>)}
          </select>
        </label>
        <div className="ui2-formrow">
          <label>
            Invested amount ({symbol})
            <DecimalInput value={form[asset].invested} onValueChange={setAmount('invested')}
              onBlur={regroup(asset, 'invested')} />
          </label>
          <label>
            Snapshot value ({symbol})
            <DecimalInput value={form[asset].current} onValueChange={setAmount('current')}
              onBlur={regroup(asset, 'current')} />
          </label>
        </div>
        {error && <p className="ui2-form-error" role="alert">{error}</p>}
        <p className="ui2-dialog-note">
          Saving records this asset group for the date as a manual value, which the daily snapshot does not
          overwrite. Gold is recorded from the Gold page.
        </p>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
          {busy ? 'Saving…' : row ? 'Update record' : 'Save record'}
        </button>
        {row && onDelete && (
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn ui2-btn-danger" disabled={busy}
              onClick={() => onDelete(row.date)}>Delete record</button>
          </div>
        )}
      </form>
    </Ui2Dialog>
  )
}

// Ui2PasteDialog keeps today's paste format (owner, C8) in the handoff's
// dialog; parsing, sending and the report come from usePasteSubmit.
export function Ui2PasteDialog({ month, onSubmit, onClose }: {
  month: string
  onSubmit: PasteSubmit
  onClose: () => void
}) {
  const { text, setText, busy, report, clientSkipped, submit } = usePasteSubmit(month, onSubmit)
  return (
    <Ui2Dialog title="Paste monthly records" onClose={onClose} busy={busy}>
      <form className="ui2-form" onSubmit={e => { e.preventDefault(); void submit() }}>
        <p className="ui2-subtitle">
          Paste tab-separated rows for {month} from Google Sheets or Excel. Dates already present ask before they change.
        </p>
        <label style={{ marginTop: 16 }}>
          Rows · Date, INR invested, INR current, EUR invested, EUR current
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${month}-01\t142288\t112335\t2610\t4144`} />
        </label>
        {report && (
          <div className="ui2-paste-report" role="status">
            <p className="u2-positive">Applied: {report.applied.length}</p>
            <p>Need confirmation: {report.conflicts.length}</p>
            <p className="u2-negative">Rejected: {report.rejected.length}</p>
            {clientSkipped > 0 && <p className="u2-muted">Skipped (unrecognised date or format): {clientSkipped}</p>}
            {report.rejected.length > 0 && (
              <ul>
                {report.rejected.map(rejected => <li key={rejected.date}>{rejected.date}: {rejected.reason}</li>)}
              </ul>
            )}
          </div>
        )}
        <p className="ui2-dialog-note">
          Dates accept YYYY-MM-DD or dd/mm/yyyy. Currency symbols and thousands separators are removed; extra
          trailing columns are ignored. Pasted values are manual records.
        </p>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
          {busy ? 'Importing…' : 'Import rows'}
        </button>
      </form>
    </Ui2Dialog>
  )
}

const pair = (amounts?: { invested: number; current: number }, symbol = '') =>
  amounts ? `${fmtCurrency(amounts.invested, symbol)} / ${fmtCurrency(amounts.current, symbol)}` : '—'

// Ui2ConflictDialog asks, per currency, whether a pasted or added value
// replaces the stored one (useConflictPicks).
export function Ui2ConflictDialog({ conflict, onResolve, onSkip }: {
  conflict: DateConflict
  onResolve: ConflictResolve
  onSkip: () => void
}) {
  const { picks, toggle, submit } = useConflictPicks(conflict, onResolve)
  return (
    <Ui2Dialog title={`Record exists · ${formatDayMonthName(conflict.date)}`} onClose={onSkip}>
      <p className="ui2-subtitle">
        Tick a currency to replace its stored value with the new one. Unticked currencies keep what is stored.
      </p>
      <table className="ui2-table ui2-dialog-table">
        <thead>
          <tr><th scope="col">Asset group</th><th scope="col">Stored</th><th scope="col">New</th><th scope="col">Replace</th></tr>
        </thead>
        <tbody>
          {REGIONS.map(region => {
            const existing = conflict.existing[region]
            const incoming = conflict.incoming[region]
            if (!existing && !incoming) return null
            const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
            return (
              <tr key={region}>
                <th scope="row">{ASSET_LABELS[region]}</th>
                <td>{pair(existing, symbol)}{existing ? <small> · {existing.source}</small> : null}</td>
                <td>{pair(incoming, symbol)}</td>
                <td>
                  <input type="checkbox" checked={!!picks[region]} disabled={!incoming} onChange={() => toggle(region)}
                    aria-label={`Replace ${ASSET_LABELS[region]}`} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="ui2-dialog-actions">
        <button type="button" className="ui2-btn" onClick={onSkip}>Skip</button>
        <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => void submit()}>Confirm</button>
      </div>
    </Ui2Dialog>
  )
}

const QUANTITY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

// Ui2BreakdownDialog is the handoff's snapshot drill-down (owner: its columns
// only): the group's invested and value that day, then each held stock's
// quantity and value at that day's close.
export function Ui2BreakdownDialog({ row, region, onClose }: {
  row: HistoryRow
  region: RegionKey
  onClose: () => void
}) {
  const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const bucket = row.regions[region]
  const holdings = positiveRegionHoldings(row, region)
  return (
    <Ui2Dialog title={`${formatDayMonthName(row.date)} snapshot`} onClose={onClose}>
      <p className="ui2-subtitle">{ASSET_LABELS[region]} · {row.date}</p>
      <div className="ui2-detailgrid ui2-breakdown-totals">
        <div><span>Invested</span><strong>{bucket ? fmtCurrency(bucket.invested, symbol) : '—'}</strong></div>
        <div><span>Snapshot value</span><strong>{bucket ? fmtCurrency(bucket.current, symbol) : '—'}</strong></div>
      </div>
      {holdings.length === 0
        ? <p className="ui2-subtitle ui2-breakdown-empty">No {region} holdings recorded for this day.</p>
        : (
          <table className="ui2-table ui2-dialog-table">
            <thead><tr><th scope="col">Holding</th><th scope="col">Quantity</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {holdings.map(holding => (
                <tr key={`${holding.symbol} ${holding.script}`}>
                  <th scope="row">{holding.script || holding.symbol}</th>
                  <td>{QUANTITY.format(holding.quantity)}</td>
                  <td>{fmtCurrency(holding.current ?? holding.quantity * holding.close_price, symbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Ui2Dialog>
  )
}

// Ui2FullHistoryDialog draws daily lines over every stored day without dense
// markers. Isolated valid values stay marked; value charts still open the
// zoomable full-history page.
export function Ui2FullHistoryDialog({ onExpand, onClose }: {
  onExpand: (asset: HistoryAsset) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api.listHistory(HISTORY_START, todayIST())
      .then(list => { if (!cancelled) setRows(list.rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])
  const hasGold = !!rows?.some(row => row.gold)
  return (
    <Ui2Dialog title="Full-history charts" onClose={onClose} wide>
      {error && <p className="ui2-form-error" role="alert">Unable to load the full history: {error}</p>}
      {!error && rows === null && <p className="ui2-subtitle" role="status">Loading the full history…</p>}
      {rows !== null && rows.length === 0 && <p className="ui2-subtitle">No history recorded yet.</p>}
      {rows !== null && rows.length > 0 && (
        <Ui2AssetCharts rows={rows} assets={visibleAssets('ALL', hasGold)} periodLabel="Full history"
          markers={false} onExpand={onExpand} />
      )}
    </Ui2Dialog>
  )
}
```

`history.css`:

Current:

```css
  border-top-style: dashed;
}

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2h-asset-chart-grid { grid-template-columns: 1fr; }
```

Replace with:

```css
  border-top-style: dashed;
}

/* ---------- full-history chart page (slice 14) ---------- */

:root[data-ui="ui2"] .u2h-chart-page-panel { padding: 20px; }

:root[data-ui="ui2"] .u2h-zoom {
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 15px;
}

/* ---------- dialogs (slice 14) ---------- */

:root[data-ui="ui2"] .ui2-dialog-table { margin-top: 20px; }

:root[data-ui="ui2"] .ui2-dialog-table th,
:root[data-ui="ui2"] .ui2-dialog-table td { padding: 10px 7px; }

:root[data-ui="ui2"] .ui2-dialog-table thead th:first-child { text-align: left; }

:root[data-ui="ui2"] .ui2-dialog-table tbody th {
  text-align: left;
  font-size: 11px;
  color: var(--u2-text);
  background: transparent;
  border-bottom: 1px solid var(--u2-border);
  white-space: normal;
}

:root[data-ui="ui2"] .ui2-dialog-table tr:last-child th { border-bottom: 0; }

:root[data-ui="ui2"] .ui2-dialog-table small { color: var(--u2-muted); }

:root[data-ui="ui2"] .ui2-breakdown-totals { margin-top: 22px; }

:root[data-ui="ui2"] .ui2-breakdown-empty { margin-top: 20px; }

:root[data-ui="ui2"] .ui2-paste-report {
  font-size: 12px;
  margin: 0 0 15px;
}

:root[data-ui="ui2"] .ui2-paste-report p { margin: 0 0 4px; }

:root[data-ui="ui2"] .ui2-paste-report ul {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 11px;
}

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2h-asset-chart-grid { grid-template-columns: 1fr; }
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx eslint src/ui2` — Expected: no output.
* [ ] **Commit:** `git add frontend/src/ui2/history/Ui2HistoryDialogs.tsx frontend/src/ui2/history/history.css && git commit -m "✨ Add the UI_2.0 History dialogs"`

### Task 4: Open them from the History page

**Files:** `frontend/src/ui2/history/Ui2History.tsx`, `frontend/src/ui2/history/Ui2History.test.tsx` (modify); `frontend/src/ui2/history/Ui2MiniChart.tsx` (modify), `frontend/src/ui2/history/Ui2MiniChart.test.tsx` (create)

The page swaps the classic dialogs for the UI_2.0 ones with the same
handlers, and adds the handoff's Full-history charts button after Add
record.

The full-history charts disable dense point markers to keep long series
readable. That must not hide an isolated valid value: when a series has one
point or its neighbouring points are unavailable, draw a marker at that
value. Apply this to both current and invested lines. Connected series keep
the marker-free appearance. Add `isIsolatedPoint` after `seriesOf`:

```tsx
function isIsolatedPoint(values: (number | null)[], index: number): boolean {
  if (values[index] === null) return false
  const previousConnected = index > 0 && values[index - 1] !== null
  const nextConnected = index < values.length - 1 && values[index + 1] !== null
  return !previousConnected && !nextConnected
}
```

Current:

```tsx
{markers && values.map((value, index) => value === null ? null : (
  <circle key={index} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-accent)" tabIndex={onExpand ? undefined : 0}>
    <title>{`${points[index].date} · ${format(value)}${amountSuffix}`}</title>
  </circle>
))}
```

Replace with:

```tsx
{values.map((value, index) => value === null || (!markers && !isIsolatedPoint(values, index)) ? null : (
  <circle key={index} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-accent)" tabIndex={onExpand ? undefined : 0}>
    <title>{`${points[index].date} · ${format(value)}${amountSuffix}`}</title>
  </circle>
))}
{kind === 'value' && invested.map((value, index) => value === null || markers || !isIsolatedPoint(invested, index) ? null : (
  <circle key={`invested-${index}`} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-muted)" tabIndex={onExpand ? undefined : 0}>
    <title>{`${points[index].date} · ${format(value)}${amountSuffix} invested`}</title>
  </circle>
))}
```

The focused component test covers one isolated current value, one isolated
invested value and a connected series with dense markers disabled:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Ui2MiniChart, type MiniChartPoint } from './Ui2MiniChart'

const points: MiniChartPoint[] = [
  { date: '2026-11-14', invested: null, current: null, pnl_pct: null, daily_vol: null },
  { date: '2026-11-15', invested: 80, current: 100, pnl_pct: null, daily_vol: null },
  { date: '2026-11-16', invested: null, current: null, pnl_pct: null, daily_vol: null },
]

describe('Ui2MiniChart isolated values', () => {
  it('marks isolated current and invested values when dense markers are disabled', () => {
    const { container } = render(<Ui2MiniChart points={points} kind="value" unit="INR" label="India · INR" markers={false} />)
    const circles = [...container.querySelectorAll('circle')]
    expect(circles.map(circle => circle.querySelector('title')?.textContent)).toEqual([
      '2026-11-15 · 100 INR', '2026-11-15 · 80 INR invested',
    ])
  })

  it('omits dense markers for connected points when disabled', () => {
    const connected = points.map((point, index) => ({ ...point, current: 100 + index, invested: 80 + index }))
    const { container } = render(<Ui2MiniChart points={connected} kind="value" unit="INR" label="India · INR" markers={false} />)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
  })
})
```

Current:

```tsx
// The UI_2.0 History page (PD-059 slice 13), laid out 1:1 from the handoff:
// intro, month toolbar, Month in review, Daily records and the per-asset
// charts. HistoryPage owns the data and every action (useHistoryMonth); this
// component only renders them, and reuses the classic dialogs.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_YEAR, isAllManual, yearMonth0 } from '../../features/history/historyShared'
import { shiftMonth } from '../../features/history/MonthNavigator'
import type { useHistoryMonth } from '../../features/history/useHistoryMonth'
import {
  AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal,
} from '../../features/history/HistoryModals'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
```

Replace with:

```tsx
// The UI_2.0 History page (PD-059 slice 13), laid out 1:1 from the handoff:
// intro, month toolbar, Month in review, Daily records and the per-asset
// charts. HistoryPage owns the data and every action (useHistoryMonth); this
// component only renders them, with the UI_2.0 dialogs (slice 14).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_YEAR, isAllManual, yearMonth0 } from '../../features/history/historyShared'
import { shiftMonth } from '../../features/history/MonthNavigator'
import type { useHistoryMonth } from '../../features/history/useHistoryMonth'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import {
  Ui2BreakdownDialog, Ui2ConflictDialog, Ui2FullHistoryDialog, Ui2PasteDialog, Ui2RecordDialog,
} from './Ui2HistoryDialogs'
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
```

Current:

```tsx
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<AssetFilter>('ALL')
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, loading, error,
```

Replace with:

```tsx
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<AssetFilter>('ALL')
  const [fullHistoryOpen, setFullHistoryOpen] = useState(false)
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, loading, error,
```

Current:

```tsx
          <label><input type="checkbox" checked={chartsOnTop} onChange={toggleChartsOnTop} /> Charts on top</label>
          <button type="button" className="ui2-btn" onClick={() => setPasteOpen(true)}>Paste month</button>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setAddOpen(true)}>＋ Add record</button>
        </div>
      </div>
```

Replace with:

```tsx
          <label><input type="checkbox" checked={chartsOnTop} onChange={toggleChartsOnTop} /> Charts on top</label>
          <button type="button" className="ui2-btn" onClick={() => setPasteOpen(true)}>Paste month</button>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setAddOpen(true)}>＋ Add record</button>
          <button type="button" className="ui2-btn" onClick={() => setFullHistoryOpen(true)}>Full-history charts</button>
        </div>
      </div>
```

Current:

```tsx

      {displayRows.length > 0 && (chartsOnTop ? <>{charts}{table}</> : <>{table}{charts}</>)}

      {addOpen && <AddRowModal onSubmit={handleAddSaved} onCancel={() => setAddOpen(false)} />}
      {editRow && <EditRowModal row={editRow} onSubmit={handleEditSaved} onCancel={() => setEditRow(null)}
        onDelete={isAllManual(editRow.regions) || canForceDelete
          ? async date => { if (await handleDelete(date)) setEditRow(null) }
          : undefined} />}
      {pasteOpen && <PasteModal monthLabel={`${year}-${String(month + 1).padStart(2, '0')}`}
        onSubmit={async input => {
          const report = await handlePasteSubmit(input)
          if (report.conflicts.length === 0 && report.rejected.length === 0) setPasteOpen(false)
          return report
        }}
        onCancel={() => setPasteOpen(false)} />}
      {headConflict && <ConflictDialog conflict={headConflict} onResolve={handleConflictResolve} onSkip={handleConflictSkip} />}
      {holdingsView && <HoldingsModal row={holdingsView.row} prev={holdingsView.prev} region={holdingsView.region}
        onClose={() => setHoldingsView(null)} />}
    </div>
  )
}
```

Replace with:

```tsx

      {displayRows.length > 0 && (chartsOnTop ? <>{charts}{table}</> : <>{table}{charts}</>)}

      {addOpen && <Ui2RecordDialog onAdd={handleAddSaved} onEdit={handleEditSaved} onClose={() => setAddOpen(false)} />}
      {editRow && <Ui2RecordDialog row={editRow} onAdd={handleAddSaved} onEdit={handleEditSaved}
        onClose={() => setEditRow(null)}
        onDelete={isAllManual(editRow.regions) || canForceDelete
          ? async date => { if (await handleDelete(date)) setEditRow(null) }
          : undefined} />}
      {pasteOpen && <Ui2PasteDialog month={`${year}-${String(month + 1).padStart(2, '0')}`}
        onSubmit={async input => {
          const report = await handlePasteSubmit(input)
          if (report.conflicts.length === 0 && report.rejected.length === 0) setPasteOpen(false)
          return report
        }}
        onClose={() => setPasteOpen(false)} />}
      {headConflict && <Ui2ConflictDialog conflict={headConflict} onResolve={handleConflictResolve} onSkip={handleConflictSkip} />}
      {holdingsView && <Ui2BreakdownDialog row={holdingsView.row} region={holdingsView.region}
        onClose={() => setHoldingsView(null)} />}
      {fullHistoryOpen && <Ui2FullHistoryDialog onExpand={expand} onClose={() => setFullHistoryOpen(false)} />}
    </div>
  )
}
```

Tests: the delete tests use the new labels; new tests cover the breakdown
columns and totals, a one-group add (no Gold option), an empty add, an
edit pre-filled per group sending only the change, an unchanged edit, a
paste followed by the record-exists choice, and the full-history dialog
(range, no dense markers, isolated-point markers, expand link).

Current:

```tsx
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.queryByRole('button', { name: 'Delete row' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete row' }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-11-13'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
```

Replace with:

```tsx
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.queryByRole('button', { name: 'Delete record' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Edit daily record' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-11-13'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
```

Current:

```tsx
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeInTheDocument()
  })

  it('opens the per-stock breakdown from a value', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'View INR holdings on 2026-11-16' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('TCS')
  })

  it('moves the charts above the table when Charts on top is checked', async () => {
```

Replace with:

```tsx
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.getByRole('button', { name: 'Delete record' })).toBeInTheDocument()
  })

  it('shows the handoff breakdown: group totals, then holding, quantity and value', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'View INR holdings on 2026-11-16' }))
    const dialog = await screen.findByRole('dialog', { name: '16 Nov snapshot' })
    expect(dialog).toHaveTextContent('India · INR · 2026-11-16')
    expect(dialog).toHaveTextContent('Invested₹1,200.00')
    expect(dialog).toHaveTextContent('Snapshot value₹1,300.00')
    expect(within(dialog).getAllByRole('columnheader').map(header => header.textContent))
      .toEqual(['Holding', 'Quantity', 'Value'])
    expect(within(dialog).getByRole('rowheader', { name: 'TCS' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('₹1,300.00')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds one asset group per record', async () => {
    mockApi.addHistoryRow.mockResolvedValue(novemberRows[2])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add record' }))
    const dialog = screen.getByRole('dialog', { name: 'Add daily record' })
    // Gold is recorded from the Gold page, not here.
    expect(within(dialog).getAllByRole('option').map(option => option.textContent)).toEqual(['India · INR', 'Europe · EUR'])
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-10' } })
    fireEvent.change(within(dialog).getByLabelText('Asset group'), { target: { value: 'EUR' } })
    fireEvent.change(within(dialog).getByLabelText('Invested amount (€)'), { target: { value: '2610' } })
    fireEvent.change(within(dialog).getByLabelText('Snapshot value (€)'), { target: { value: '4144.05' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save record' }))
    await waitFor(() => expect(mockApi.addHistoryRow).toHaveBeenCalledWith({
      date: '2026-11-10', regions: { EUR: { invested: 2610, current: 4144.05 } },
    }))
  })

  it('refuses an add with no amounts', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the invested amount and the snapshot value.')
    expect(mockApi.addHistoryRow).not.toHaveBeenCalled()
  })

  it('edits the chosen group pre-filled from the row and sends only a change', async () => {
    mockApi.patchHistoryRegions.mockResolvedValue(novemberRows[2])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit daily record' })
    expect(within(dialog).getByLabelText('Date')).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText('Invested amount (₹)')).toHaveValue('1,200')
    fireEvent.change(within(dialog).getByLabelText('Asset group'), { target: { value: 'EUR' } })
    expect(within(dialog).getByLabelText('Invested amount (€)')).toHaveValue('100')
    fireEvent.change(within(dialog).getByLabelText('Snapshot value (€)'), { target: { value: '125' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update record' }))
    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-16', {
      regions: { EUR: { invested: 100, current: 125 } },
    }))
  })

  it('closes an unchanged edit without saving', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update record' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApi.patchHistoryRegions).not.toHaveBeenCalled()
  })

  it('pastes the current format and asks about an existing date', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [],
      rejected: [],
      conflicts: [{
        date: '2026-11-13',
        existing: { INR: { invested: 1000, current: 1150, source: 'manual' } },
        incoming: { INR: { invested: 1000, current: 1175 } },
      }],
    })
    mockApi.patchHistoryRegions.mockResolvedValue(novemberRows[1])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Paste month' }))
    const paste = screen.getByRole('dialog', { name: 'Paste monthly records' })
    fireEvent.change(within(paste).getByRole('textbox'), { target: { value: '2026-11-13\t1000\t1175\t100\t110' } })
    fireEvent.click(within(paste).getByRole('button', { name: 'Import rows' }))
    await waitFor(() => expect(mockApi.pasteHistory).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-11' })))

    const conflict = await screen.findByRole('dialog', { name: 'Record exists · 13 Nov' })
    fireEvent.click(within(conflict).getByRole('checkbox', { name: 'Replace India · INR' }))
    fireEvent.click(within(conflict).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-13', {
      regions: { INR: { invested: 1000, current: 1175 } },
    }))
  })

  it('resets region picks between consecutive date conflicts', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [], rejected: [], conflicts: [
        { date: '2026-11-13', existing: { INR: { invested: 1000, current: 1150, source: 'manual' } }, incoming: { INR: { invested: 1000, current: 1175 } } },
        { date: '2026-11-14', existing: { INR: { invested: 1000, current: 1160, source: 'manual' } }, incoming: { INR: { invested: 1000, current: 1180 } } },
      ],
    })
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Paste month' }))
    const paste = screen.getByRole('dialog', { name: 'Paste monthly records' })
    fireEvent.change(within(paste).getByRole('textbox'), { target: { value: '2026-11-13\t1000\t1175\t100\t110\n2026-11-14\t1000\t1180\t100\t110' } })
    fireEvent.click(within(paste).getByRole('button', { name: 'Import rows' }))

    const first = await screen.findByRole('dialog', { name: 'Record exists · 13 Nov' })
    fireEvent.click(within(first).getByRole('checkbox', { name: 'Replace India · INR' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Confirm' }))
    const second = await screen.findByRole('dialog', { name: 'Record exists · 14 Nov' })
    expect(within(second).getByRole('checkbox', { name: 'Replace India · INR' })).not.toBeChecked()
    fireEvent.click(within(second).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-13', {
      regions: { INR: { invested: 1000, current: 1175 } },
    }))
    expect(mockApi.patchHistoryRegions).toHaveBeenCalledTimes(1)
  })

  it('opens full-history charts without dense markers', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    mockApi.listHistory.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Full-history charts' }))
    const dialog = screen.getByRole('dialog', { name: 'Full-history charts' })
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith('2000-01-01', '2026-11-17'))
    await waitFor(() => expect(within(dialog).getAllByText('Full history').length).toBeGreaterThan(0))
    expect(dialog.querySelectorAll('circle')).toHaveLength(0) // Connected fixture series need no isolated markers.
    expect(within(dialog).getByRole('button', { name: /Open the full India · INR, Full history/ })).toBeInTheDocument()
  })

  it('moves the charts above the table when Charts on top is checked', async () => {
```

* [ ] **Verify:** `cd frontend && npx vitest run src/ui2/history/Ui2History.test.tsx src/ui2/history/Ui2MiniChart.test.tsx`
  Expected: `18 passed`; `Ui2MiniChart.test.tsx` adds 2 behavioral cases.
* [ ] **Commit:** `git add frontend/src/ui2/history/Ui2History.tsx frontend/src/ui2/history/Ui2History.test.tsx frontend/src/ui2/history/Ui2MiniChart.tsx frontend/src/ui2/history/Ui2MiniChart.test.tsx && git commit -m "✨ Open UI_2.0 dialogs from History"`

### Task 5: Chart page in UI_2.0 parts

**Files:** `frontend/src/features/history/HistoryChartPage.tsx` (modify), `frontend/src/ui2/history/Ui2HistoryChartPage.test.tsx` (create)

No handoff frame exists for this page (owner: restyle, no new layout).
Under `ui2` the classic header becomes `Ui2PageIntro` with a Back to
History button, the panel and controls take the UI_2.0 classes, and the
lines use the handoff's colours (accent current, muted dashed invested).
Data, zoom and granularity are untouched. The test lives in a new file:
the existing `HistoryChartPage.test.tsx` has pre-existing naming-lint
findings that `lint:changed` would report if edited.

Current:

```tsx
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { useAuthOptional } from '../auth/AuthContext'
import {
  REGIONS, REGION_LABELS, REGION_COLOURS, CURRENCY_BY_REGION, CURRENCY_SYMBOL,
  GOLD_PALETTE, chartTooltipProps, fmtCurrency, fmtAxisAmount, niceDomain,
```

Replace with:

```tsx
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { useAuthOptional } from '../auth/AuthContext'
import { useUiMode } from '../../lib/uiMode'
import { Ui2PageIntro } from '../../ui2/shell/Ui2PageIntro'
import '../../ui2/history/history.css'
import {
  REGIONS, REGION_LABELS, REGION_COLOURS, CURRENCY_BY_REGION, CURRENCY_SYMBOL,
  GOLD_PALETTE, chartTooltipProps, fmtCurrency, fmtAxisAmount, niceDomain,
```

Current:

```tsx
// visible regardless of how many snapshots exist. Reached by clicking the
// "Invested vs Current" mini-chart on the History page.

const HISTORY_START = '2000-01-01'
// Zoom = pixels of chart width per data point. Higher = more horizontal
// room per plot (zoom in), lower = denser (zoom out). Clamped to [ZOOM_MIN,
// ZOOM_MAX]; the container scrolls horizontally past the viewport.
```

Replace with:

```tsx
// visible regardless of how many snapshots exist. Reached by clicking the
// "Invested vs Current" mini-chart on the History page.

export const HISTORY_START = '2000-01-01'
// Zoom = pixels of chart width per data point. Higher = more horizontal
// room per plot (zoom in), lower = denser (zoom out). Clamped to [ZOOM_MIN,
// ZOOM_MAX]; the container scrolls horizontally past the viewport.
```

Current:

```tsx
    return () => { cancelled = true }
  }, [])

  const cur = isGold ? 'INR' : CURRENCY_BY_REGION[region]
  const sym = CURRENCY_SYMBOL[cur]
  const palette = isGold ? GOLD_PALETTE[theme] : REGION_COLOURS[theme][region]
  const label = isGold ? 'Gold' : REGION_LABELS[region]

  const daily = useMemo(
```

Replace with:

```tsx
    return () => { cancelled = true }
  }, [])

  // UI_2.0 (PD-059 slice 14, owner: restyle with UI_2.0 parts, no new
  // layout): its intro, panel and buttons, and the handoff's chart colours.
  const ui2 = useUiMode() === 'ui2'
  const cur = isGold ? 'INR' : CURRENCY_BY_REGION[region]
  const sym = CURRENCY_SYMBOL[cur]
  const palette = ui2
    ? { invested: 'var(--u2-muted)', current: 'var(--u2-accent)' }
    : isGold ? GOLD_PALETTE[theme] : REGION_COLOURS[theme][region]
  const label = isGold ? 'Gold' : REGION_LABELS[region]

  const daily = useMemo(
```

Current:

```tsx
  const firstDate = data.length ? data[0].date : null
  const lastDate = data.length ? data[data.length - 1].date : null

  return (
    <div style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/history" className="btn-icon" aria-label="Back to historical data" title="Back to historical data">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
            {label} — Invested vs Current
          </h1>
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ maxWidth: 1400, margin: '0 auto' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
          Full dataset {firstDate && lastDate ? `(${formatDate(firstDate)} → ${formatDate(lastDate)})` : '(2000 → today)'}.
          Scroll horizontally to see every plotted day.
        </p>

        {error && <div className="alert-danger">Error: {error}</div>}
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading full history…</div>}

        {!loading && !error && !hasData && (
```

Replace with:

```tsx
  const firstDate = data.length ? data[0].date : null
  const lastDate = data.length ? data[data.length - 1].date : null

  const datasetNote = `Full dataset ${firstDate && lastDate ? `(${formatDate(firstDate)} → ${formatDate(lastDate)})` : '(2000 → today)'}. `
    + 'Scroll horizontally to see every plotted day.'

  return (
    <div style={{ minHeight: '100dvh' }}>
      {ui2
        ? (
          <Ui2PageIntro title={`${label} · invested vs current`} subtitle={datasetNote}
            actions={<Link to="/history" className="ui2-btn">‹ Back to History</Link>} />
        )
        : (
          <header className="nav-glass page-nav">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Link to="/history" className="btn-icon" aria-label="Back to historical data" title="Back to historical data">
                <ArrowLeftIcon size={14} />
              </Link>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                {label} — Invested vs Current
              </h1>
            </div>
            <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
          </header>
        )}

      <main className={ui2 ? undefined : 'page-main'} style={ui2 ? undefined : { maxWidth: 1400, margin: '0 auto' }}>
        {!ui2 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>{datasetNote}</p>
        )}

        {error && <div className={ui2 ? 'u2h-alert' : 'alert-danger'}>Error: {error}</div>}
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading full history…</div>}

        {!loading && !error && !hasData && (
```

Current:

```tsx
        )}

        {!loading && !error && hasData && (
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center',
              flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="seg-group">
                {(['week', 'day'] as Granularity[]).map(option => (
                  <button key={option} className="seg-btn" onClick={() => setGranularity(option)}
                    aria-pressed={granularity === option}>
                    {option === 'week' ? 'Weekly' : 'Daily'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zoom</span>
                <button onClick={() => setZoom(previousZoom => Math.max(ZOOM_MIN, previousZoom - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN} style={zoomBtnStyle} aria-label="Zoom out (shrink)">−</button>
                <button onClick={() => setZoom(previousZoom => Math.min(ZOOM_MAX, previousZoom + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX} style={zoomBtnStyle} aria-label="Zoom in">+</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {data.length} points · {granularity === 'week' ? 'weekly close' : 'daily'}
```

Replace with:

```tsx
        )}

        {!loading && !error && hasData && (
          <div className={ui2 ? 'ui2-panel u2h-chart-page-panel' : undefined} style={ui2 ? undefined : {
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center',
              flexWrap: 'wrap', marginBottom: 12 }}>
              <div className={ui2 ? 'u2h-filters' : 'seg-group'} role="group" aria-label="Granularity">
                {(['week', 'day'] as Granularity[]).map(option => (
                  <button key={option} type="button" onClick={() => setGranularity(option)}
                    className={ui2 ? (granularity === option ? 'active' : undefined) : 'seg-btn'}
                    aria-pressed={granularity === option}>
                    {option === 'week' ? 'Weekly' : 'Daily'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: ui2 ? 'var(--u2-muted)' : 'var(--text-secondary)' }}>Zoom</span>
                <button onClick={() => setZoom(previousZoom => Math.max(ZOOM_MIN, previousZoom - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN} className={ui2 ? 'ui2-btn u2h-zoom' : undefined}
                  style={ui2 ? undefined : zoomBtnStyle} aria-label="Zoom out (shrink)">−</button>
                <button onClick={() => setZoom(previousZoom => Math.min(ZOOM_MAX, previousZoom + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX} className={ui2 ? 'ui2-btn u2h-zoom' : undefined}
                  style={ui2 ? undefined : zoomBtnStyle} aria-label="Zoom in">+</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {data.length} points · {granularity === 'week' ? 'weekly close' : 'daily'}
```

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { HistoryRow, User } from '../../lib/api/client'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const mockAuth = vi.hoisted(() => ({ user: null as Partial<User> | null }))
vi.mock('../../features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../features/auth/AuthContext')>('../../features/auth/AuthContext')
  return { ...actual, useAuthOptional: () => (mockAuth.user ? { user: mockAuth.user } : null) }
})

import HistoryChartPage from '../../features/history/HistoryChartPage'

const row = (date: string, invested: number, current: number): HistoryRow => ({
  date,
  regions: { INR: { invested, current, source: 'cron' } },
  totals: { invested_total: invested, current_total: current, pnl_pct: 0 },
})

const renderAt = (region: string) => render(
  <MemoryRouter initialEntries={[`/history/chart/${region}`]}>
    <Routes>
      <Route path="/history/chart/:region" element={<HistoryChartPage />} />
      <Route path="/history" element={<p>History page</p>} />
    </Routes>
  </MemoryRouter>,
)

describe('full-history chart page in UI_2.0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.listHistory.mockResolvedValue({
      currency: 'INR',
      rows: [row('2024-01-01', 100, 110), row('2024-01-03', 100, 130)],
    })
  })

  it('uses the UI_2.0 intro, panel and controls with the same data and actions', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false }
    renderAt('INR')
    expect(await screen.findByRole('heading', { level: 1, name: 'India (INR) · invested vs current' })).toBeInTheDocument()
    expect(screen.getByText(/Full dataset \(01-01-2024 → 03-01-2024\)/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/2 points · daily/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveClass('ui2-btn')
    const weekly = screen.getByRole('button', { name: 'Weekly' })
    fireEvent.click(weekly)
    expect(weekly).toHaveClass('active')
    expect(screen.getByText(/1 points · weekly close/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '‹ Back to History' }))
    expect(screen.getByText('History page')).toBeInTheDocument()
  })

  it('keeps the classic header for other interfaces', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'glass', premium: false }
    renderAt('INR')
    expect(await screen.findByRole('heading', { level: 1, name: 'India (INR) — Invested vs Current' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to historical data' })).toBeInTheDocument()
  })
})
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/ui2 src/features/history && npm run lint:changed`
  Expected: all pass (`799 passed` in the full suite at time of writing: `npx vitest run`); lint clean.
* [ ] **Commit:** `git add frontend/src/features/history/HistoryChartPage.tsx frontend/src/ui2/history/Ui2HistoryChartPage.test.tsx && git commit -m "🎨 Show the chart page in UI_2.0 parts"`

### Task 6: Board and registry

**Files:** `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Row 14: owner Claude, branch `feat/PD-059-history-dialogs`, PR #346, `in review` (→ `merged` on merge).
* [ ] Registry rows: `Ui2Dialog` (`ui2/shell/Ui2Dialog.tsx`; `title`, `onClose`, `wide`, `busy`; portalled; `useDialogFocus`), the dialog/form classes in `primitives.css` (`.ui2-dialog*`, `.ui2-form`, `.ui2-formrow`, `.ui2-dialog-note`, `.ui2-detailgrid`, `.ui2-dialog-actions`, `.ui2-btn-danger`), `usePasteSubmit` / `useConflictPicks` (`features/history/HistoryModals.tsx`).
* [ ] **Verify:** `npx markdownlint-cli2 docs/plans/PD-059-ui-2-status.md` — Expected: `0 error(s)`.
* [ ] **Commit:** `git add docs/plans/PD-059-ui-2-status.md && git commit -m "📝 Record slice 14 on the status board"`

### Task 7: End-to-end verification

**Files:** none (throwaway stack)

Throwaway backend (`PORT=8091 MONGODB_DATABASE=portfolio_s14check`) and
Vite on another port proxied to it; never the owner's :8080/:3000. A
`ui2` user with several months of INR + EUR snapshots and stock lines.

* [ ] Add daily record: only India · INR and Europe · EUR; a new date saves one group; an existing date opens the record-exists dialog.
* [ ] Edit: read-only date; switching the group re-fills it; an unchanged save closes without a request; Delete shows only under the rule.
* [ ] Paste: today's format applies; a conflicting date asks per currency.
* [ ] Breakdown: Invested and Snapshot value, then Holding / Quantity / Value.
* [ ] Full-history charts: every stored day; dense markers are omitted, isolated values remain marked, and a value chart opens the chart page.
* [ ] Chart page: UI_2.0 intro and panel, Daily / Weekly and zoom work, Back to History returns.
* [ ] Every dialog covers the sidebar (blurred), closes on ×, Escape and the backdrop, and returns focus.
* [ ] Light, Dark, Cyber at 1280 px and 390 px: no horizontal page scroll.
* [ ] Glass account: the classic dialogs and chart page.
* [ ] Drop the throwaway database and stop both servers.

## 5. Done

* [ ] UI_2.0 History dialogs, full-history charts and chart page follow the handoff and the owner's answers.
* [ ] Classic and Glass dialogs and chart page unchanged; existing History tests pass untouched.
* [ ] `Ui2Dialog` and the shared dialog logic registered for reuse.

**Next:** slices 11–12 (fx re-fetch) in their own amendment; wave 2
Overview (Codex) mounts `OverallPerformance`.
