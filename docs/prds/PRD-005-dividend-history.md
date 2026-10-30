# PRD-005: Dividend history (CSV import + Dividends page)

* **Status**: Draft v2 (PRD) — owner decisions of 2026-10-30 applied; v1 scope agreed
* **Owner**: project owner
* **Type**: Product Requirements — the *what* and *why*. The *how* lives in
  [DD-005](../designs/DD-005-dividend-history.md); the rollout in
  [PD-048](../plans/PD-048-dividend-history.md).
* **Visuals**: [PD-048 visual spec](../visuals/PD-048-dividend-history.html) ([published](https://claude.ai/artifact/N1DGvkdmVHjUyVG5gxiUv6))
* **Builds on**: the per-holding transactions ledger (average cost,
  derive-from-ledger), [PRD-001](PRD-001-user-auth-and-multi-tenancy.md)
  multi-tenancy + admin act-as, [PRD-002](PRD-002-historical-snapshots.md)
  History, [PRD-004](PRD-004-all-transactions-view.md) all-transactions view.

## 1. Problem

The owner keeps years of dividend receipts in a spreadsheet:

```
Date,Share Name,Dividend,CUMULATIVE
01/01/2020,TCS,300,300
01/01/2020,TCS,300,600
15/03/2020,Jio Platforms,1250.50,1850.50
```

The ledger already has a `dividend` event type, and a holding's
`total_dividends` is already derived from it — but events can only be entered
one at a time inside one holding's ledger editor. Years of history cannot be
loaded, there is no portfolio-wide dividend view, the dashboard does not show
dividend income, and History does not show it at all.

## 2. Goals

1. **Upload a CSV** (`Date,Share Name,Dividend,CUMULATIVE`) with a
   **preview → confirm** workflow (§7).
2. Every dividend **belongs to an existing holding** (by holding id). Sheet
   share names are matched to holdings; anything that is not an exact match is
   **confirmed by the user in a popup** during import (§6).
3. A new **Dividends** page (dashboard header button, `/dividends`) with
   **INR** and **EUR** tabs: chronological table, running totals, analytics
   (yearly, monthly, per-holding, charts).
4. Dividends are **one dataset across the app**: the same records drive the
   holding's dividend total, the dashboard, History, the all-transactions
   view and the per-holding ledger editor. **Nothing is counted twice** (§9).
5. **CRUD** on single dividends; **Delete all** per currency tab.
6. **Re-uploading is idempotent**, with **occurrence-based** duplicate
   detection against the database (§5).
7. **Admin act-as**: an admin acting as a user can view and manage that user's
   dividends, under the existing region scope.

## 3. Non-goals (v1)

* **Partial imports** (import valid rows, skip invalid) — future enhancement.
* **No new money concept.** Dividends are shown next to P&L, never folded into
  unrealised or realised P&L figures.
* **No cross-currency totals / FX.** INR and EUR are never summed.
* **No USD tab** (the app supports INR and EUR).
* **No CSV export** (follow-up).
* **No dividends for holdings that do not exist.** A stock that was never
  added (or was deleted) must be added as a holding first — it may hold zero
  shares (§6.4).

## 4. CSV contract

| Column | Required | Rule |
|---|---|---|
| `Date` | yes | **Day-first** `DD/MM/YYYY`: `1/2/2020` = 1 Feb 2020, `12/5/2023` = 12 May 2023. Also `DD-MM-YYYY`, `DD.MM.YYYY`, ISO `YYYY-MM-DD`. Must be a real calendar date, not in the future (IST). |
| `Share Name` | yes | Non-empty. Resolved to a holding of the tab's currency (§6). |
| `Dividend` | yes | Number > 0 — total cash received for that row. `₹`, `€`, thousands separators and spaces are stripped (`"1,250.50"` ok). |
| `CUMULATIVE` | no | Running total across all holdings in the sheet. **Never authoritative and never a key.** Kept as import metadata and used only for the consistency warning (§7.2). |

* First non-blank line is the header; names are matched case- and
  whitespace-insensitively, in any order. Blank lines are skipped.
* **No currency column.** Currency = the **active tab** when the upload
  starts; the import dialog shows it prominently on every step.
* Max 5,000 rows / 1 MB per file.

## 5. Duplicate detection (occurrence-based)

**Identity of a dividend** = **holding** (id) + **date** (calendar day) +
**amount** (2 decimals). Cumulative is ignored.

Matching counts occurrences: for each identity, the sheet's first *k* rows
are duplicates where *k* = how many such dividends the database already holds
for that holding (including ones entered by hand in the ledger editor); the
rest are new.

| Scenario | Sheet | Database | Result |
|---|---|---|---|
| A | 2 × (TCS, 01-01-2020, 300) | 1 | 1 duplicate, **1 imported** |
| B | 2 × | 2 | **both skipped** |
| C | 2 × same identity, cumulative 300 and 600 | 0 | **2 imported** (cumulative does not distinguish them; occurrences do) |
| D | same file uploaded again | after first import | **0 imported**, every row a duplicate |

* Importing the same file repeatedly is **idempotent**.
* Duplicates are **not invalid**: they are skipped and listed ("**Duplicates
  are discarded**") and never block an otherwise valid import.
* Duplicate detection applies to **CSV imports only**. Adding an identical
  dividend by hand remains possible.

## 6. Matching share names to holdings

### 6.1 Automatic (no prompt)

A sheet name maps automatically only when, ignoring letter case and extra
spaces, it equals exactly one holding of the tab's currency by its **display
name** (script), or a name the owner **confirmed before** for that holding
(alias, §6.3). Nothing else is normalised for an automatic match: punctuation,
legal suffixes (`Ltd` / `Limited`), exchange suffixes (`.NS` / `.BO`) and a
name that equals the holding's **symbol** are all inconsistencies that go to
the popup (§6.2).

### 6.2 Confirmation popup (any inconsistency)

Every other name — e.g. the holding is `Jio Platforms Ltd` / `JIOPLA.NS`
and the sheet says `jio`, `JLP`, `Jio Platforms Limited` or `JIOPLA` (owner's
example, decision 13) — is **never auto-accepted**. A name equal to the
symbol (`JIOPLA`, `JIOPLA.NS`) is the strongest suggestion and is
pre-selected, but it still waits for the owner's confirmation. The preview
opens a **"Confirm share names"** popup, one line per distinct sheet name:

* the sheet name and how many rows use it,
* **suggested** holdings ranked by similarity (best first, pre-selected only
  when there is a clear best),
* a dropdown of **all holdings in this currency** to pick any other,
* the option to **leave it unresolved** (its rows become invalid).

A name matching **several holdings** equally (ambiguous) also goes to the
popup with no pre-selection.

### 6.3 Remembering the answer

Confirmed names are saved as **aliases** of the chosen holding when the import
is committed, so the next upload maps them automatically (§6.1). The preview
always lists every sheet name with its holding — including automatic and
alias matches — and any of them can be changed there.

### 6.4 Holdings that cannot receive the dividend

* Only holdings whose currency equals the active tab are candidates.
* Holdings sold down to zero shares are valid targets (they still exist).
* A name left unresolved makes **all its rows invalid**, which blocks the
  import (§7). The fix is to add the holding (zero shares allowed) or
  correct the sheet.

## 7. Import workflow (preview → confirm)

1. User picks a CSV on the INR or EUR tab. The dialog states
   **"Importing into ₹ INR"** (or € EUR) and **"Dates read as DD/MM/YYYY"**.
2. The file is parsed and checked **without writing anything**: fields,
   dates, amounts, currency (tab), holding resolution.
3. If any name needs confirmation, the **Confirm share names** popup opens
   (§6.2); the preview recalculates after each answer.
4. Duplicate detection runs against the current database (§5).
5. **Preview** shows the summary and the rows:

   | Status | Count |
   |---|---|
   | Ready to import | 90 |
   | Already exists | 7 |
   | Invalid | 3 |
   | **Total** | **100** |

   plus a per-row list (line, date, sheet name → holding, amount, status,
   reason for invalid rows) and any **warnings** (§7.2).
6. **Confirm import** is enabled **only when Invalid = 0**.
7. On confirm, the server **re-validates against the database as it is now**
   (someone may have added a dividend meanwhile) and imports every eligible
   row **atomically**: all new rows, the holding totals they change and the
   confirmed aliases commit together, or nothing does.
8. The result shows **"N imported"** and, if any, **"M duplicates are
   discarded"** with the list. Totals everywhere update immediately.

### 7.1 Invalid rows — all-or-nothing (v1)

Any invalid row blocks the whole import; nothing is written. The report lists
each invalid row's **file line number** (header = line 1, matching the
spreadsheet row) and **reason**, with counts of valid-new, duplicate and
invalid rows.

### 7.2 Cumulative consistency warning

When the sheet has a CUMULATIVE column and its rows are in chronological
order, each row's cumulative should equal the previous row's cumulative plus
its dividend (the first row: its own dividend, or any starting balance). A
mismatch (> 0.01) is shown as a **warning** on that line ("cumulative 1,900.00,
expected 1,850.50"). Warnings never block the import and never affect
duplicate detection. Rows out of date order → one warning, check skipped.

## 8. Dividends page

* Tabs `INR` / `EUR`, selected tab in the URL (`/dividends?currency=EUR`).
* **Summary**: total dividends, count, first → last date, holdings paying.
* **Table** (chronological, same-day rows keep entry order): `#`, Date,
  Holding (script + symbol), Dividend, **Cumulative** (running total across
  all holdings in the tab), **Holding cumulative** (running total for that
  holding), actions (edit / delete).
* **Filter** by holding and search; both cumulative columns keep their
  full-tab values so a filtered view never misstates totals.
* **Analytics** (all recomputed on every add / edit / import / delete):
  * **Yearly totals** — table + bar chart.
  * **Monthly trend** — chart, toggle monthly / yearly.
  * **Per-holding totals** — ranked table with share of total (biggest
    contributors first) + bar chart.
* **Actions**: Upload CSV, Add dividend, **Delete all dividends (INR)**.
* **Add / edit**: holding (dropdown of the tab's holdings), date, amount.
  Identical rows are allowed.
* **Delete all**: removes every dividend of the selected currency — imported
  *and* hand-entered (they are the same records). Shows the count, requires
  typing `DELETE`. Never touches holdings or other transaction types.
  Atomic.

## 9. Integration and the no-double-counting rule

Dividends are ledger events (`type = dividend`). **One record, every view**:

| View | Shows | Source |
|---|---|---|
| Holding position | `total_dividends` | derived from its dividend events (existing) |
| Dashboard | per-holding **Dividends** column; per-currency **Dividend income** card | holding `total_dividends` |
| History | per-currency **Dividends** column (received to date, with day change) and in the per-stock breakdown | same events, as of each row's date |
| All-transactions view | dividend rows | same events (existing) |
| Per-holding ledger editor | dividend rows, add/edit/delete | same events (existing) |
| Dividends page | everything above, per currency | same events |

Because there is only one record per dividend, a dividend entered in the
ledger editor and the "same" dividend in a sheet are matched by duplicate
detection (§5) rather than stored twice. Dividend income is displayed beside
P&L and **never added into** unrealised or realised P&L.

## 10. Roles

| Role | Dividends |
|---|---|
| User | Own: view, import, add, edit, delete, delete all. |
| Admin | Same on own; same via act-as for users in their region. |
| Super admin | Same; act-as for any user. |

Act-as reuses the existing admin authorization (region scope, 404 on miss).

## 11. Scale

≤ ~5,000 dividends per user; ≤ 5,000 rows per file. One request per tab.

## 12. Success criteria

1. The owner's sheet imports on the INR tab after confirming the inconsistent
   names once; order, amounts and the Cumulative column match the sheet.
2. Uploading the same file again: preview shows 0 ready, all "already
   exists"; confirming imports 0.
3. Scenarios A–D of §5 behave as listed.
4. A sheet with 3 invalid rows shows them with line + reason and Confirm is
   disabled; nothing is written.
5. A name confirmed once (e.g. `JLP` → Jio Platforms) maps automatically on
   the next upload.
6. After import, the holding's dividend total, the dashboard dividend figures,
   History's dividend column and the Dividends page all agree.
7. Add / edit / delete / delete-all update every view above; delete-all leaves
   holdings and buy/sell events untouched.
8. An admin acting as an in-region user manages their dividends; an
   out-of-region user id returns 404.
9. INR and EUR never mix; one user never sees another's dividends.

## 13. Owner decisions (2026-10-30)

| # | Topic | Decision |
|---|---|---|
| 1 | Storage | Dividends are ledger events in the existing `transactions` collection (`type = dividend`), referencing the holding by id. Owner preferred this after debate; a separate collection had no remaining advantage once every dividend must belong to a holding (DD-005 §1). |
| 2 | Currency | From the active tab; shown clearly during import. |
| 3 | Cumulative | Calculated dynamically, overall per tab and per holding; sheet value kept as metadata only. |
| 4 | Dates | Day-first `DD/MM/YYYY`. |
| 5 | Duplicates | Occurrence-based on holding + date + amount; CSV only. |
| 6 | Invalid rows | All-or-nothing in v1. |
| 7 | Delete all | In v1, per currency, typed `DELETE`. |
| 8 | Act-as | In v1, view + manage. |
| 9 | Analytics | Yearly, per-holding, monthly/yearly charts in v1. |
| 10 | Import | Preview → confirm, atomic. |
| 11 | Cumulative check | Warning only. |
| 12 | Reuse | As DD-005 §4.1. |
| 13 | Name mismatches | Any inconsistent name is confirmed in a popup during import; answers remembered as aliases. Owner's example: for Jio Platforms, sheet names `jio`, `JLP`, `Jio Platforms Limited` and `JIOPLA` all get the popup. So only the display name (case/space-insensitive) or a confirmed alias maps automatically; a symbol match is a pre-selected suggestion, never automatic (§6.1–6.2). |

Assumed (raise if wrong): delete-all covers hand-entered dividends too (same
records); zero-share holdings are the way to receive dividends for sold-out
stocks; dev MongoDB becomes a single-node replica set so imports can be truly
atomic (DD-005 §2.6).
