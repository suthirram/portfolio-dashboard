# PRD-002: Daily historical portfolio snapshots

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Type**: Product Requirements — the *what* and *why*. The *how*
  (storage schema, snapshot subcommand, API surface, UI wiring) will live in
  the companion technical design doc DD-002 and the rollout plan in PD-042.

## 1. Problem

Today the portfolio dashboard only shows a point-in-time view: the user opens
the app, the backend fetches live prices from Yahoo Finance, and the page
renders the *current* invested cost vs current market value. The moment the
user closes the tab, that view is gone. There is no record of what the
portfolio looked like yesterday, last week, or last month.

That makes it impossible to answer questions the user already wants to ask:

* "How did my India sleeve perform versus my Europe sleeve over the last
  three months?"
* "What was my total P/L on the day I sold X?"
* "Is my portfolio actually trending up, or just bouncing around?"

We want a daily, automatic snapshot of each user's portfolio so we can show a
historical view over time, broken down by region.

## 2. Goals

1. Once a day, at a fixed time, the system records a snapshot of every active
   user's portfolio (invested cost and current market value).
2. The snapshot is broken down **by region** (India, Europe, US) so the user
   can see each sleeve's contribution over time.
3. The snapshot also records the **aggregate** invested cost, current value,
   and P/L %, so a single headline line can be drawn for the whole portfolio.
4. The user can navigate to a new **Historical data** page from the main
   dashboard, pick a **year** and a **month**, and see the table for that
   month plus a chart for the selected window.
5. The chart shows invested vs current value over time, one colour family per
   region (India, Europe, US), and a separate **daily P/L %** line.
6. The user can fill in past data by hand — including bulk paste from Excel
   or Google Sheets — so dates from before the feature went live, or days the
   cron missed, can still appear in the table and chart.
7. Snapshots are private to each user (same multi-tenant model as the rest of
   the app — see PRD-001).

## 3. Non-goals (later, or never)

* **Backfilling missed cron days automatically.** If the backend is down at
  00:00 UTC, that day is skipped. The user can fill it manually if they care,
  and v2 will move the trigger to a durable NATS JetStream queue so missed
  ticks are redelivered — see §10.
* **Gold / commodities / cash** as a tracked region. The UI mock the owner
  shared uses orange/blue/yellow where yellow is gold; gold is deferred
  until we add it as a holding type, and snapshots will only cover the
  existing stock/ETF regions.
* **Intraday** snapshots (hourly, every-minute). Daily only in v1.
* **Per-holding** historical detail (per-symbol price history, per-symbol
  drilldown chart). v1 stops at per-region aggregates and one total.
* **Retroactive recomputation** when a user later edits or deletes a
  holding. Past snapshot rows are not rewritten — they are a frozen ledger of
  what the system saw at that midnight.
* **Mid-day snapshots** on holding add / edit / delete. Holding changes only
  show up in the *next* midnight snapshot.
* **Export** (CSV / PDF / email) of historical data.
* **Custom snapshot times per user** or per-region snapshot times that follow
  each market's local close. v1 uses a single global trigger.
* **Admin act-as view of another user's history.** v1 is the user's own
  history only.

## 4. Who uses this

The historical view is for **end users** looking at their own portfolio. It
is not, in v1, an admin oversight surface.

| Role | What they see |
|---|---|
| **User** | Their own historical snapshots — table and chart on `/history`. |
| **Admin** | Same as a user, for their own portfolio. No admin act-as in v1. |
| **Super admin** | Same as a user, for their own portfolio. |

## 5. When the snapshot runs

* The snapshot job runs **once per day at 00:00 UTC**.
* UTC is chosen deliberately: it is unambiguous, identical on every host, and
  does not need DST handling. The price recorded for a given day is "the
  last Yahoo Finance price the system could fetch around 00:00 UTC on that
  date" — not "the official close on the user's exchange".
* The trigger in v1 is an **external cron** (Cloud Scheduler / k8s CronJob /
  docker cron) invoking a `snapshot` subcommand on the backend binary. The
  web process itself does not own the cron.
* A day is identified by its UTC date (`YYYY-MM-DD`). Each user has at most
  one cron-written snapshot per UTC date; re-running the job for the same
  date overwrites the previous cron row.
* If the trigger is missed (backend down, cron failed), that day is
  **skipped**. There is no automatic backfill. The user can fill it in
  manually (see §7.3). v2 will replace the cron with a NATS JetStream event
  so missed ticks are redelivered automatically (see §10).

## 6. What a snapshot contains

For a given (user, UTC date), the snapshot records the **cumulative state**
of the portfolio at that midnight:

* **Per region** — for each of `india`, `europe`, `us`:
  * `invested` — sum of `(quantity × buy_price)` across that region's
    holdings *as they existed at that midnight*.
  * `current` — sum of `(quantity × latest_price)` across that region's
    holdings, using the same Yahoo Finance fetch path the live dashboard uses.
* **Aggregate** — totals across all regions:
  * `invested_total`
  * `current_total`
  * `pnl_pct` — `(current_total − invested_total) / invested_total × 100`,
    rounded to two decimals. Undefined (and rendered as "—") when
    `invested_total` is zero.
* The **currency** the values are expressed in (the user's display currency
  is currently INR; conversion follows the same rules as the live dashboard).
* A **source** marker — `cron` for rows the snapshot subcommand wrote, or
  `manual` for rows the user entered or overrode by hand. A row's source
  flips to `manual` the moment the user accepts an override for any of its
  values (see §7.3).

### Worked example (the model in one picture)

| UTC date | Action that day | Stored row |
|---|---|---|
| Day 1 | User invests 100; live price stays at 100 | `invested=100, current=100, source=cron` |
| Day 2 | User invests another 100; portfolio now worth 198 | `invested=200, current=198, source=cron` |

Past rows are not rewritten when later holdings change. Each row is a frozen
view of "what the system saw at that midnight".

A user with no holdings on a given date still gets a row with zeros, so the
chart starts at the day they signed up rather than jumping in mid-air.

## 7. What the user sees

### 7.1 Entry point

* A new **History** link in the main dashboard navigation. Clicking it goes
  to `/history`.

### 7.2 Historical data page

The page has three controls and two stacked panels.

**Controls:**

* **Year** dropdown — populated from the earliest snapshot year for this
  user to the current year.
* **Month** dropdown — 12 months; disabled months (no snapshots and not yet
  reached) are greyed out.
* **Edit / Add row** button (see §7.3).

**Chart** (top panel) — covers the selected month (or the last 90 days if
the user picks "All"):

* X axis: date (one tick per snapshot day in the window).
* Y axis (left): currency amount (invested / current value).
* Y axis (right): percentage (daily P/L %).
* Series:
  * India invested vs India current (one colour family — e.g. orange).
  * Europe invested vs Europe current (a second colour family — e.g. blue).
  * US invested vs US current (a third colour family).
  * Total P/L % as a separate line on the right axis.
* The mockup the owner shared uses orange for India, blue for Europe, and
  yellow for gold; gold is **out of scope** for v1 (see §3), but the visual
  language (one colour per region, invested-vs-current as paired series) is
  the intended direction.

**Table** (bottom panel):

* One row per UTC date in the selected month, newest first.
* Columns: Date, India invested, India current, Europe invested, Europe
  current, US invested, US current, Total invested, Total current, P/L %,
  Source.
* If a region has no holdings on that date, its cells render as "—".
* Every row is editable. Cron-written rows can be overridden; doing so
  flips the row's `source` to `manual` (see §7.3 for the conflict UX).
  Manual rows can be edited or deleted freely.

### 7.3 Manual entry — typing, pasting, and overriding cron rows

The user can fill or correct historical data by hand. Three paths:

* **Add row** opens a form: pick a date, type per-region `invested` and
  `current` for India / Europe / US. The system computes totals and P/L %.
  Saving creates a row with `source: manual`. If the date already has any
  row (cron or manual), the conflict dialog described below opens
  instead.
* **Inline edit on an existing row** — clicking edit on any row, including
  a cron row, opens the same per-region form pre-filled with the current
  values. Saving an override flips the row's `source` from `cron` to
  `manual` for the values the user changed; untouched cells stay as the
  cron values they were.
* **Paste per month** — when the user is viewing a month, they can paste a
  block of rows copied from Excel or Google Sheets. The expected shape is
  one row per date in that month, with the same columns as the table. The
  paste handler validates each row, shows a per-row pass/fail summary,
  and processes the valid rows in date order:
  * Rows for dates that have no existing entry are inserted as
    `source: manual`.
  * Rows for dates that conflict with an existing row (cron *or* manual)
    queue a conflict dialog.

**Conflict dialog — per date, per region.**

When a manual value collides with an existing row for the same date, a
modal opens for that one date. The modal shows, for each region (India,
Europe, US):

* The **existing** value (with a tag — `cron` or `manual`) for `invested`
  and `current`.
* The **incoming** value the user just typed or pasted.
* A checkbox in front of each region; ticking the checkbox means "keep
  the incoming value for this region", leaving it unticked means "keep
  the existing value".

The user confirms once per date. If a paste produced conflicts on
multiple dates, the dialogs are shown sequentially — one date at a time,
in date order — so the user explicitly decides each one. Any region the
user overrode has its `source` flipped to `manual` on save; regions left
unchanged keep their original source. A "Cancel" on any dialog leaves
that date alone and continues to the next.

### 7.4 Empty / partial states

* **No snapshots yet** (brand-new account, feature just rolled out, or the
  selected month has no data): the page shows a friendly empty state —
  "No data for June 2026 yet. Your first snapshot will be taken at the next
  00:00 UTC, or you can add rows manually." — with the **Add row** button
  prominent. No chart.
* **One snapshot only** in the window: the table renders one row; the chart
  renders the single point with a hint that more days are needed for a
  meaningful trend.

## 8. Privacy and access

* A user can only see their own snapshots. The same per-user scoping rule
  from PRD-001 / DD-001 applies: every read or write of historical data
  pins the caller's user id at the data layer.
* Snapshots are deleted when the user is deleted. Hiding a user
  (soft-delete) pauses snapshot collection for that user until they are
  reactivated; existing rows are preserved.
* Admins and the super admin do **not** get an act-as view of another user's
  history in v1.

## 9. Success criteria

We will consider v1 successful when:

1. Every active user has a `cron` snapshot for every UTC date the backend
   was up for, with no gaps for at least 30 consecutive up-days.
2. A user can open `/history`, pick a year and month, see their own table
   and chart, and the totals on the most recent row match (within
   rounding) what the live dashboard shows them at that moment.
3. The snapshot subcommand completes for the full user base within a
   single Yahoo Finance cache window (5 minutes) so it does not noticeably
   load the provider.
4. A user can paste a month of rows from Excel / Google Sheets and have
   the chart and table reflect them within one page refresh.
5. A `cron`-written row is never silently overwritten by a `manual` entry;
   every conflict surfaces a per-date, per-region confirmation dialog
   before any change is persisted.

## 10. Open questions (to resolve in DD-002)

* **NATS migration timing.** v2 will replace the external cron with a NATS
  JetStream event so missed midnights are redelivered automatically. DD-002
  should describe the event contract (`portfolio.snapshot.tick` with
  `{date, trigger}`) so v1's subcommand and v2's consumer share the same
  handler.
* **Catch-up on backend restart mid-job.** If the snapshot subcommand is
  killed halfway through the user list, do we re-run for the whole list (and
  rely on the upsert-by-date being idempotent) or persist a cursor? Likely
  the former, but DD-002 should confirm.
* **Currency on manual rows.** Manual entry currently assumes the user types
  numbers in the same display currency as the live dashboard. If the user
  later changes display currency, do manual rows convert, stay frozen, or
  get flagged? Open.
* **Paste schema.** The exact paste format (headers required? column order
  fixed? date format?) and the error-handling UX for partial pastes are a
  DD-002 / UI-spec concern.
* **Audit trail on override.** When a user overrides a cron row, do we
  keep the original cron values somewhere (e.g. an `original_cron`
  sub-document) so the override is reversible, or is the override
  destructive? v1 leans destructive for simplicity; DD-002 will confirm.
