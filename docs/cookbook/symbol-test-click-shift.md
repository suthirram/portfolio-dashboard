# Symbol Test button misses mouse clicks

* Status: Resolved
* Last verified: 2026-11-20
* Environment: frontend dev server (Vite), Chrome, Add holding dialog; every interface (Classic, Glass, UI_2.0)
* Related: PD-056 sector preview (#296), [PD-059 roadmap R06](../plans/PD-059-roadmap.md)

## Problem and trigger

In Add / Edit holding, typing a Yahoo symbol and then clicking **Test** with the
mouse often sent no quote request. Keyboard activation worked. It started with
PD-056, which added the sector preview under the symbol field.

## Reproduction and diagnostic aids

1. Open the dashboard, click **Add holding**.
2. Click the Yahoo Symbol field, type `TCS.NS`.
3. Before clicking Test, record the button's position on mousedown and mouseup
   and wrap `fetch` (browser console):

```js
window.__calls = []; const orig = window.fetch
window.fetch = (...a) => { window.__calls.push(String(a[0])); return orig(...a) }
const test = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Test')
for (const type of ['mousedown', 'mouseup'])
  test.addEventListener(type, () => console.log(type, Math.round(test.getBoundingClientRect().top)))
```

Then click Test with the mouse.

Observed (before the fix): `mousedown 216`, `mouseup 200` — the button moved
16 px between press and release. `/api/market/profile?symbol=TCS.NS` was
requested twice (once on blur, once on Test). A press on the button's lower
part releases outside it, so no `click` fires and no `/api/market/price`
request is sent.

## Cause and evidence

Pressing the button blurs the symbol input. The input's `onBlur` commits the
symbol to the sector preview (`setPreviewSymbol`), which renders
`ProfilePreview` below the field. The dialog is vertically centred, so the
taller content moves the whole card up by half the added height — the button
moves under the pointer between mousedown and mouseup. The measured 16 px shift
confirms it; the duplicate profile request confirms the blur ran before Test.

## Solution

Frontend only, no data impact. The Test button cancels its `mousedown`
(`onMouseDown={e => e.preventDefault()}`), so pressing it keeps focus in the
symbol field: no blur, no preview, no shift before the click. The click then
runs `handleLookup`, which commits the preview itself. Keyboard use is
unchanged.

## Verification

```bash
cd frontend && npx vitest run src/features/holdings/AddEditModal.test.tsx
```

Expected and observed: 16 tests pass, including `keeps the symbol focused when
Test is pressed`, which asserts the mousedown is cancelled, the field keeps
focus, the quote appears and the profile is requested once.

## Follow-up

None required. Any control placed under a field that commits on blur in a
centred dialog can repeat this; cancel the control's mousedown when it acts on
that field.
