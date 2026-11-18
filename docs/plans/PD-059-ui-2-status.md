# PD-059 status board (UI_2.0)

Shared by Claude and Codex. Spec: [PRD-015](../prds/PRD-015-ui-2.md) ·
[DD-015](../designs/DD-015-ui-2.md) · [plan](PD-059-ui-2.md).

## How to use this board

1. Pick an unclaimed slice whose dependencies are merged.
2. In your first commit on the slice branch, set **Owner**, **Branch** and
   **State = in progress** on its row. Never start a row someone else holds.
3. Before building a component, check the registry below. If it exists,
   reuse it. If you build a shared one, add it in the same PR.
4. A product gap goes to **Open questions** with evidence and options.
   Wait for the owner's answer on that part; continue other work.
5. When the PR merges, set **State = merged** and the PR number.

Every PR: branch from `main` → `main`, label `ui-2.0`, gitmoji, no
attribution trailers, FE and BE separate, three gates (`task-breakdown`).

## Slices

| # | Wave | Layer | Slice | Depends on | Owner | Branch | PR | State |
|---|---|---|---|---|---|---|---|---|
| 0 | — | docs | PRD-015, DD-015, PD-059 plan, this board | — | Claude | `docs/PD-059-ui-2` | #332 | merged |
| 1 | 1 | BE | `ui_mode` + endpoint + step `20261118_01` | 0 | Claude | `feat/PD-059-ui-mode` | #333 | merged |
| 2 | 1 | FE | Interface picker + `Ui2Shell` | 1 | Claude | `feat/PD-059-ui2-shell` | #334 | merged |
| 3 | 2 | FE | Cyber entrance animation | 2 | Codex | `feat/PD-059-cyber-entrance` | #339 | merged |
| 4 | 2 | FE | Overview summary cards + dialogs + conversion rate | 2 | | | | needs amendment |
| 5 | 2 | FE | Holdings by currency → sector, price colours | 2 | | | | needs amendment |
| 6 | 2 | FE | Holding details dialog, add/edit, opening prompt, sector review | 5 | | | | needs amendment |
| 7 | 2 | FE | Allocation by holding / sector / currency | 2 | | | | needs amendment |
| 8 | 1 | BE | `portfolio_overall` + rate at snapshot + `GET /history/overall` | 0 | Claude | `feat/PD-059-overall-worth` | #336 | merged |
| 9a | 1 | BE | `migrate overall` (dry-run / apply / rebuild) | 8 | Claude | `feat/PD-059-overall-backfill` | #340, #341 | merged |
| 9b | 1 | BE | step `20261118_02` (after owner's prod dry run) | 9a + owner | | | | blocked: owner dry run |
| 10 | 3 | FE | Overview overall performance chart (standalone; mount after slices 4–7) | 2, 8 | Codex | `feat/PD-059-overall-performance` | #342 | in review |
| 11 | 4 | BE | `fx-missing` + `fx-refetch` | 8 | | | | needs amendment |
| 12 | 4 | FE | History re-fetch prompt | 11, 13 | | | | needs amendment |
| 13 | 3 | FE | History page ([wave 3b](PD-059-wave3-history.md)) | 2 | Claude | `feat/PD-059-history` | #344 | in review |
| 14 | 3 | FE | History modals + full-history chart page | 13 | Claude | | | needs amendment (after 13) |
| 15 | 4 | FE | Shared ledger hook + UI_2.0 ledger modal | 2 | | | | needs amendment |
| 16 | 4 | FE | Transactions page | 15 | | | | needs amendment |
| 17 | 4 | FE | Trade import: upload, paste, example | 16 | | | | needs amendment |
| 18 | 5 | FE | Dividends page | 2 | | | | needs amendment |
| 19 | 5 | FE | Dividend import: upload, paste, example | 18 | | | | needs amendment |
| 20 | 5 | FE | Gold table (15 cols) + Details + modal + metrics | 2 | | | | needs amendment |
| 21 | 5 | FE | Gold prices (daily, 30 days, all months) + missing-price prompt | 20 | | | | needs amendment |
| 22 | 6 | FE | Act-as in UI_2.0 | 2 | | | | needs amendment |
| 23 | 6 | FE | Admin user list + detail | 2 | | | | needs amendment |
| 24 | 6 | FE | Super-admin pages (Manage admins, Branding) | 23 | | | | needs amendment |
| 25 | 6 | FE | Profile | 2 | | | | needs amendment |
| 26 | 6 | FE | Signup / forgot-password / onboarding (Light) | 2 | | | | needs amendment |
| 27 | 6 | FE | Investment delta → sub-route (tentative) | 16 | | | | needs amendment |

"needs amendment" = its wave's plan-amendment docs PR (complete code) must
merge before the slice starts.

Slice 3's independent [Wave 2a amendment](PD-059-wave2-cyber-entrance.md)
contains its implementation and test plan. It is merged as #338, and the
slice 3 implementation is merged as #339 (`feat/PD-059-cyber-entrance`).
Slices 4–7 still need their own amendment.

## UI_2.0 components registry

Check before building; reuse if listed. Add a row in the PR that creates a
shared piece.

| Component / hook | Path | Purpose / props | Added in |
|---|---|---|---|
| `Ui2Shell` | `frontend/src/ui2/shell/Ui2Shell.tsx` | app frame (mockup layout): sidebar nav, Appearance, account, breadcrumb | slice 2 (planned) |
| `navItems` | `frontend/src/components/shell/navItems.tsx` | page list shared by both shells | slice 2 (planned) |
| `useUiMode` | `frontend/src/lib/uiMode.ts` | the account's interface | slice 2 (planned) |
| `UiModeSelect` | `frontend/src/features/admin/AdminUserSettings.tsx` | interface picker | slice 2 (planned) |
| `OverallPerformance` | `frontend/src/ui2/overview/OverallPerformance.tsx` | standalone daily overall chart; stays unmounted until Overview slices 4–7 land | slice 10 (#342) |
| `Ui2PageIntro` | `frontend/src/ui2/shell/Ui2PageIntro.tsx` | page intro: `title`, `subtitle`, optional `actions` (handoff `.intro`) | slice 13 (#344) |
| `primitives.css` | `frontend/src/ui2/primitives.css` | shared `.ui2-intro`, `.ui2-panel`, `.ui2-btn`, `.ui2-btn-primary`, `.ui2-table`, `.u2-positive` / `-negative` / `-muted` | slice 13 (#344) |
| `useHistoryMonth` | `frontend/src/features/history/useHistoryMonth.ts` | History month data and actions for both interfaces | slice 13 (#344) |
| `Ui2MiniChart` | `frontend/src/ui2/history/Ui2MiniChart.tsx` | handoff SVG mini chart; `linePath` gap-aware path | slice 13 (#344) |

Reused as is (do not copy): `ThemePicker`, `useTheme`, `CurrencySprinkle`,
`useHoldings`, `useAllTransactions`, `useDividends`, `usePagination`,
`useDialogFocus`, `flowAdjustedReturnPct`, `pnlPct`, `GoldService` overlays.

## Owner decisions log (2026-11-18)

* The handoff mockup (`docs/visuals/PD-059-ui-2-reference.html`, from
  `/handoff/design.html`) is the single source of truth for layout and
  style: every screen matches it 1:1. Treat deviations as bugs to fix, not
  redesign opportunities. Claude's own visual spec was withdrawn.
* Type follows Branding: UI_2.0 uses the super admin's Branding font
  (`--brand-font-family`), never a hard-coded face (#334). The mockup's
  DM Sans and Manrope become Branding choices in slice 24 (needs the
  server's allowed fonts).
* Slices merge to `main` behind the switch; label `ui-2.0`; revert by
  switching accounts or deleting `ui2/` + the `ShellLayout` branch.
* `ui_mode` enum `classic | glass | ui2`; super admin sets it per account.
  At cutover Classic goes, Glass stays as now, UI_2.0 is the new default.
* Claude drives; Codex takes tasks by claiming rows. No fixed area owners.
* Themes Light / Dark / Cyber; Cyber premium-gated. No ⌘K. No Ambient
  toggle (maybe last). Currency sprinkle as today.
* UI_2.0 typography follows the font selected on Branding. DM Sans and
  Manrope are added to Branding's font choices in slice 24.
* Overview: overall chart (INR + EUR + gold, INR/EUR toggle, 1W–All,
  existing volatility); Holding details dialog holds metrics + actions; keep
  AddEdit fields; keep and restyle sector review, opening prompt, badges.
* Overall data: `portfolio_overall` via `SnapshotStore`, `eur_inr` only (no
  USD), gold on read; rate carried on weekends; failed fetch → flagged,
  user-triggered re-fetch on `/history` (own rows, not in act-as, Not now,
  re-prompt). Backfill additive, dry-run, backup, zero data loss.
* Overall chart (owner, 2026-11-19): build slice 10 as a standalone
  `OverallPerformance` component and mount it when Overview slices 4–7 land.
  Keep the handoff labels, including **Daily movement**, the **View chart
  data** table and the absence of the preview-state selector. The History
  table's **Daily volatility** label remains specific to History.
* Gold in the overall chart: a day without a price copies the previous
  day's (heals when the price is entered). Gold held before its first price
  ⇒ that day's total is unavailable (`gold_unvalued`), not valued at cost.
  Postgres missing or failing ⇒ `gold_unavailable` and no totals, never a
  stock-only figure. Days before any gold keep their stock totals. A
  past-date snapshot uses that day's historical rate ("current" = the 08:00
  IST trading day); a stored good rate is never overwritten. History
  adds/pastes create the overall day, flagged for re-fetch when a rate is
  needed.
* History: keep paste format, chart page, period card, per-stock modal.
* Transactions: delta inline (sub-route late, tentative); filters =
  multi-select dropdown with count + clear; 15 rows; shared ledger hook.
* Imports (UI_2.0 only): upload + paste + Load example (header + hint).
* Gold: 15 columns in table and Details; daily price entry + 30 days, monthly
  behind "View all months".
* Act-as in UI_2.0 under the banner; gold stays out. Admin/super-admin pages
  designed by Claude (visuals per wave). Profile restyled. Auth screens in
  Light; login stays #330.

## Owner decisions log (2026-11-19, wave 3)

* Slice 10 (Codex): a standalone overall-performance component now, mounted
  in the Overview once slices 4–7 land; handoff SVG chart, "View chart
  data" table, no "Preview data state" select; the Overview keeps the label
  "Daily movement".
* History (slices 13–14): handoff title and subtitle; All / INR / EUR /
  Gold filter on Daily records; column stays "Daily volatility" with the
  handoff tints (P/L cell up / down / unchanged, Invested cell purple);
  value charts still open `/history/chart/:region`; a "Full-history charts"
  button opens a dialog (slice 14); rows show only Edit, Delete moves into
  the Edit dialog under today's rule; the Gold value stays plain text.
* Page pattern: the page stays the data owner and renders its UI_2.0
  component for `ui2` (as in the wave 2 Overview amendment).

## Open questions

Use the template; never pre-fill the owner's answer.

```text
ID:
Raised by / date:
Affected slice and files:
Existing behaviour and evidence:
What is missing or ambiguous:
Options and consequences:
Independent work that can continue:
Owner response (exact):
Status: awaiting owner / approved / implemented
```

*None open.*
