# History & snapshots

A daily job (`snapshot`, run by an external cron — see
[PRD-002](prds/PRD-002-historical-snapshots.md) /
[DD-002](designs/DD-002-historical-snapshots.md)) writes one row per user
per day: per-currency **invested/current** totals (INR / EUR / USD) **and** a
per-stock breakdown (each holding's quantity, average cost, and that day's
close). The **History** page (`/history`):

* charts invested-vs-current, P/L %, and daily volatility per currency;
* shows a month table you can sort, and **add / paste / edit** manual rows
  (manual values override the cron value for that currency);
* lets you click a currency cell on a cron row to open a **Holdings** modal —
  the per-stock breakdown for that currency (script, yesterday price, current
  price, change value, daily change), positive positions only.

Backdated ledger edits **heal** the affected stored snapshots so history stays
consistent with the corrected ledger.

The heal replays each holding's ledger *as-of* the snapshot date. The `opening`
event is treated as the **timeless baseline**: it is retained on a healed row
unless the user has set a real **opening date** that falls after that row (the
position genuinely did not exist yet). An unset opening date never drops the
holding — so re-healing an older row can no longer zero a holding that was only
recently entered.

**Dividends** ([PRD-005](prds/PRD-005-dividend-history.md) §9) reach History
as an on-read overlay, like gold: `GET /api/history` adds to each row a
`dividends` map per currency (`to_date` = received on or before the row date,
`on_day` = received on that date; absent before the first payout) and, on each
per-stock line, `dividends` received from that stock to date (matched by
symbol). Nothing is snapshotted, so a dividend add, import or delete shows up
at once — and dividend-only ledger writes never trigger the snapshot heal,
since snapshots carry no dividend figures.

See the [daily snapshot job](operations.md#daily-snapshot-job) for running it.
