# PRD-015: UI_2.0

* **Status**: Approved (owner, 2026-11-18)
* **Owner**: project owner
* **Design**: [DD-015](../designs/DD-015-ui-2.md)
* **Rollout**: [PD-059](../plans/PD-059-ui-2.md) · status [PD-059 status](../plans/PD-059-ui-2-status.md)
* **Visual reference**: [PD-059 reference](../visuals/PD-059-ui-2-reference.html), the
  owner's handoff mockup (`/handoff/design.html`). Single source of truth for
  layout and style: UI_2.0 matches it 1:1. Its sample figures are not data.

## 1. Problem

The app has three looks: the classic UI, the PD-054 glass UI and nothing in
between. The owner has a new design (the UI_2.0 mockup) for every page:
compact summary cards with breakdown dialogs, currency-then-sector grouping,
a portfolio-wide performance chart, a consistent shell and Light / Dark /
Cyber themes. Porting it in place would change the app for every user at
once and could not be rolled back cheaply.

## 2. Goals

* A third UI, **UI_2.0**, behind a per-account switch the super admin sets.
  Accounts without it see exactly what they see today.
* One switch with three values: `classic`, `glass`, `ui2`. Only one is ever
  active. At cutover (a later plan) `classic` is removed, UI_2.0 becomes the
  default for new accounts, and Glass stays as it is now.
* Every page reworked: Overview, History, Transactions, Dividends, Gold,
  Admin (users, admins, branding), Profile, signup / forgot-password /
  onboarding. Login stays as #330.
* A new **overall** performance chart on Overview: INR + EUR + gold summed
  into one series, shown in INR or EUR, periods 1W / 1M / 3M / 1Y / All.
* Every existing behaviour, calculation, permission and write path is kept.
  The mockup changes presentation, not financial logic.

## 3. Non-goals

The cutover itself (removing classic, changing the default), a ⌘K palette in
UI_2.0, an Ambient on/off toggle (may come as the last task), a USD display
currency (USD is not a tracked bucket since 2026-07-07), manual entry of
exchange rates, paste/example import in the Glass UI (possible follow-up),
interpolating missing gold prices.

## 4. Behaviour

### 4.1 Switch and rollback

1. The super admin picks Classic / Glass / UI_2.0 per account (admin user
   detail). The choice takes effect on the account's next page load; on the
   super admin's own account immediately.
2. Existing Glass accounts keep Glass. The current `ui_revamp` switch keeps
   working until cutover and stays in step with the new value.
3. A UI_2.0 page that is not built yet renders the current page inside the
   UI_2.0 shell, so there is never a dead page.
4. Rollback: set accounts back (instant), or delete the UI_2.0 code and its
   one switch point (one PR). Every UI_2.0 PR carries the `ui-2.0` label.

### 4.2 Shell and themes

Navigation Overview, History, Transactions, Dividends, Gold (when enabled),
Admin (admins), account menu (profile, log out). Themes Light, Dark, Cyber;
Cyber stays premium-gated (PD-046) and plays a brief, reduced-motion-aware
entrance animation. The currency-symbol background shows as today.

### 4.3 Overview

* Summary cards (invested, current, daily change, unrealised, realised,
  combined P/L, dividends) with breakdown **dialogs**, never inline
  expansion. One bold conversion rate.
* Holdings grouped by currency, then optionally by sector (grouping, never a
  filter). Share price coloured green / red / blue against previous close.
* Clicking a holding opens **Holding details**: metrics (cost, realised,
  dividends, XIRR) and actions (edit, ledger, delete). Rows carry no action
  buttons. Add holding keeps today's fields.
* Allocation by holding / sector / currency.
* Overall performance chart (§4.4).
* Kept and restyled: sector review queue, opening-date prompt, sector
  badges, renames and navigation. Gold daily movement keeps today's
  behaviour.

### 4.4 Overall performance

* Each day: invested and current = INR bucket + EUR bucket × that day's
  EUR→INR rate + physical gold. EUR view = INR total ÷ the same rate.
* The day-close EUR→INR rate is fetched when the snapshot runs and stored.
  Weekends and holidays carry the last close forward, as stock closes do.
  Gold rows move when a gold price is entered for that day.
* Backdated or moved trades, manual History edits and paste, and late gold
  prices are reflected automatically.
* Volatility uses the existing daily-movement definition (flow-adjusted),
  computed from daily rows before the chart thins long periods to weekly.
* If the rate cannot be fetched, the previous rate is used and the day is
  flagged. The next `/history` visit lists flagged days with **Fetch rates
  again**; the user triggers the Yahoo refetch. Failed days stay flagged and
  are offered again; **Not now** skips for the visit. Own rows only; not in
  act-as.
* A one-time backfill builds the overall data for all past days, fetching
  historical rates once. It must not lose or change any existing data.

### 4.5 History

Kept: month ledger, colour semantics (green up, red down, blue unchanged,
purple new investment) with the legend below the table, charts (invested vs
current, P/L %, daily volatility), add / edit / paste (current format),
per-stock breakdown, full-history chart page, period performance card.

### 4.6 Transactions

Kept: all-event ledger, search, filters, sort, 15-row pagination, per-currency
subtotals, every event type and field, Groww import, investment delta
(inline for now; a sub-route is a late, tentative slice). Event-type and
currency filters become multi-select dropdowns showing a count and a clear
action. The ledger dialog keeps every event type and field. Import offers
upload, paste and **Load example** (header and format hint only).

### 4.7 Dividends

Kept: currency tabs, summaries, cumulative columns, add / edit / delete,
scoped delete-all, monthly / yearly chart, year totals, by-holding analytics,
CSV import (5,000 rows, server matching). Import adds paste and Load example.

### 4.8 Gold

All 15 columns in the table **and** in a per-row **Details** view (the owner
may reduce table columns later; Details keeps all). All eight metrics with
server values, `—` for null. Prices: daily entry plus the last 30 dates, the
monthly table behind **View all months**. Missing-price prompt unchanged.

### 4.9 Admin, Profile, act-as, auth

Admin user list and detail, Manage admins and Branding restyled (UI_2.0
visuals, owner-approved per wave). Profile restyled with today's flows.
Act-as pages (`/admin/users/:id`, `/transactions`, `/dividends`) render in
UI_2.0 under a persistent banner with Exit; gold stays outside act-as.
Signup, forgot-password and onboarding use the UI_2.0 Light theme.

## 5. Success criteria

* An account switched to UI_2.0 sees the new shell; Classic and Glass
  accounts see no change (existing tests pass untouched).
* Every page reaches its UI_2.0 form with the behaviours in §4 and their
  existing tests.
* Overall chart: correct series for a 10-year, 50-holding portfolio with a
  per-request read independent of holding count.
* Backfill: zero changed or lost fields in `portfolio_snapshots`
  (post-check), resumable, dry-run first.

## 6. Rollout constraints

Slices merge to `main` behind the switch, one PR each, backend before its
frontend. Production writes (the backfill) stay owner-gated: backup first,
dry run, then apply. Claude drives; Codex takes tasks by claiming them in the
status file. Unmocked or ambiguous behaviour goes to the owner.
