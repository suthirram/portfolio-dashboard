# PRD-004: All-transactions view

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Type**: Product Requirements — the *what* and *why*. The *how* (endpoint
  shape, query params, component split) belongs in a companion design doc
  (DD-004) and rollout plan (PD-0xx), not here.
* **Visuals**: [PD-047 visual spec](../visuals/PD-047-all-transactions-view.html)
  ([published](https://claude.ai/code/artifact/f9a60fc0-e8c3-4ae9-9549-02af56e6f52c)) —
  annotated frames for every state described below.
* **Builds on**: the per-holding transactions ledger (average-cost,
  derive-from-ledger) and [PRD-001](PRD-001-user-auth-and-multi-tenancy.md)
  multi-tenancy.

## 1. Problem

Transactions exist today only **inside one holding**. To see them a user must
open the dashboard, find a row, click its ledger icon, and read that holding's
events in `TransactionsModal`. Consequences:

* There is **no portfolio-wide activity view**. "What did I buy last month?",
  "when did the last dividend land?", "which trades did I enter this week?"
  require opening every holding one at a time.
* Mis-entered events are hard to spot. A wrong date or a duplicated buy is
  invisible unless the user already suspects which holding it is in — and a
  wrong-dated event silently re-heals snapshots (History), so the symptom
  shows up far from the cause.
* The ledger is the **source of truth** for every derived number on the
  dashboard and History page, yet it is the only data in the app with no
  top-level view of its own.

## 2. Goals

1. A **single button on the dashboard header** (next to History / Gold) opens
   an **All transactions** view listing **every past transaction across all
   holdings** for the signed-in user, newest first.
2. Each row shows **every field the add/edit transaction modal accepts**, plus
   the holding context the modal gets implicitly from being opened on a row
   (§5). Nothing a user can enter is hidden in this view.
3. The view is **filterable and sortable** so it answers the questions in §1
   without scrolling: by holding, by type, by date range, free-text search
   over script/symbol/notes (§6).
4. **Editing stays in one place.** A row's edit action opens the **existing**
   per-holding `TransactionsModal` focused on that holding, rather than
   introducing a second write path for the same data (reuse rule, CLAUDE.md).
5. **Admin act-as parity**: an admin viewing a user's portfolio in act-as mode
   sees that user's all-transactions view, under the same region scope as the
   rest of act-as.
6. Private per user — same scoping rules as holdings: every read pins
   `user_id`, a foreign id returns 404, never data.

## 3. Non-goals

* **No new write surface.** Create / update / delete continue to go through
  the existing per-holding endpoints and modal. This view is read + navigate.
* **No new stored data.** No new collection, no denormalised activity feed; the
  view reads the existing `transactions` collection (whose per-user listing
  already exists in the persistence layer) joined with holdings for display
  labels.
* **No cross-currency totals.** Transaction amounts are in the holding's
  currency; the view groups/labels per currency and does **not** sum
  two currencies into one figure. (A per-currency subtotal strip is allowed,
  §7.) The app supports INR and EUR; a holding carrying a legacy code gets its
  own bucket rather than being merged into a catch-all.
* **No gold transactions.** Physical gold (PRD-003) has its own page and its
  own table shape; it is out of scope here.
* **No export** (CSV / print) in v1 — likely follow-up, see §9.
* **No infinite-scroll / server-side pagination** in v1; portfolios are tens of
  holdings with hundreds of events (§8).

## 4. Who uses this

| Role | What they see |
|---|---|
| **User** | Their own transactions, all holdings, all time. |
| **Admin** | Same for their own portfolio; plus act-as view for users in their region. |
| **Super admin** | Same, act-as for any user. |

## 5. Row contents

The view must show, per transaction, everything the add/edit modal takes plus
the holding it belongs to:

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Date | `date` | Trade / ex date; the primary sort key |
| 2 | Holding | holding `script` + `symbol` | The context the modal gets from its row; click → that holding's ledger |
| 3 | Type | `type` | opening / buy / sell / dividend / split / bonus / merger, same labels as the modal |
| 4 | Shares | `quantity` | Blank for dividend (modal hides it there too) |
| 5 | Amount | `amount` | Total cash, in the holding's currency, with that currency's symbol |
| 6 | Implied cost/share | derived `amount ÷ quantity` | The modal's "Implied cost/share" hint, shown for buy / sell / opening only |
| 7 | Ratio | `ratio` | split / bonus only |
| 8 | Realised P&L seed | `realized_seed` | opening only |
| 9 | Opening date | `opening_date` | opening only; the user-set effective date (nil ⇒ "not set", matching the dashboard prompt) |
| 10 | Notes | `notes` | Free text as entered |
| 11 | Currency | holding `currency` | Drives the money symbol; also a filter facet |

Running **avg cost per share** is deliberately *not* a column here: it is only
meaningful within one holding's replay order, which is what the per-holding
modal already shows.

## 6. Filtering, sorting, search

* **Default view**: all transactions, sorted **date descending** (most recent
  first) — "recent transactions" is the stated entry point.
* **Sort** by date, holding, type, or amount; click a header to toggle.
* **Filters**: holding (multi-select), type (multi-select), currency, and a
  date range (from / to).
* **Search** box matches script, symbol, and notes, case-insensitive.
* Filter state is view-local; no requirement to persist it across reloads.
* A visible **count** of matching rows ("142 transactions") so the user can
  tell a filter is active.

## 7. Per-currency subtotals (optional strip)

Above the table, for the currently filtered set, one line per currency present:
total bought, total sold, total dividends. These are plain sums of `amount` by
type within a currency — never converted or combined across currencies, and
never a P&L claim.

## 8. Scale and performance

* Expected scale: ≤ ~50 holdings, ≤ ~2,000 lifetime transactions per user.
* One request returns the user's transactions; the holding labels come from the
  holdings the dashboard already loads or from a single joined read — no
  per-row fetch.
* Filtering and sorting are client-side at this scale. If a real portfolio
  exceeds ~5,000 events, revisit with server-side paging (an explicit
  follow-up, not a v1 requirement).

## 9. Open questions

1. **Entry point wording / placement** — "Transactions" button in the
   dashboard header next to History and Gold (assumed), vs. a tab inside the
   dashboard. Assumed: header button + its own route, so it is linkable.
2. **Inline edit** — v1 routes editing to the existing per-holding modal.
   Is a direct inline edit wanted later, accepting the second write path?
3. **Export** — CSV download of the filtered set: wanted in v1 or deferred?
4. **Deleted holdings** — transactions cascade-delete with their holding today,
   so they simply vanish from this view. Confirm that is acceptable (no
   "orphaned history" expectation).

## 10. Success criteria

1. From the dashboard, one click reaches a view listing every transaction the
   user has ever entered, newest first, across all holdings.
2. Every field enterable in the add/edit transaction modal is visible for the
   transactions that carry it (§5) — nothing requires opening the modal to read.
3. Filtering to one holding shows exactly the same set of events that holding's
   ledger modal shows (same count, same values).
4. Filtering by type + date range answers "what did I buy last month?" without
   scrolling.
5. A row's edit action lands in the existing per-holding ledger editor with
   that holding in context; after a write, returning to the view shows the
   updated event.
6. A user never sees another user's transactions; probing another user's ids
   returns 404.
