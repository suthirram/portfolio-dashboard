# ADR-0003: Store per-stock close prices in snapshots

* **Status**: Accepted (valuation source revised 2026-06-24 — see Revision)
* **Date**: 2026-06-23
* **Deciders**: project owner
* **Related**: [DD-002 historical snapshots](../designs/DD-002-historical-snapshots.md)
  (§11 documents the data model and recompute flow this ADR decides),
  [PRD-002](../prds/PRD-002-historical-snapshots.md)

> **Revision (2026-06-24).** The original decision valued snapshots from the
> last daily *candle close* via a new `PriceService.GetClose`. In practice that
> read the wrong number on a trading day (a stale candle, not the live price).
> The valuation source is now: **trading day → live `GetPrice`
> (`regularMarketPrice`, same as the dashboard); weekend → re-value the current
> positions at the prior snapshot's stored per-stock price** (carry-forward,
> keeping its `PriceDate`). `GetClose` is removed. Everything else this ADR
> decides — per-stock `Lines`, the backdated recompute, forward-only,
> carry-forward-at-avg-cost — is unchanged; recompute still revalues against the
> price stored on each line. The weekend-phantom problem (Context §1) is still
> solved: a closed-market day no longer fetches a flicker, it copies the last
> real session's stored price. The strikethrough below marks the superseded
> mechanism.

## Context

Daily snapshots (DD-002) stored only per-currency **bucket totals**
(`invested`, `current`) and valued holdings from `PriceService.GetPrice`,
which reads Yahoo's `regularMarketPrice`. Two problems surfaced in production:

1. **Weekend / holiday phantom diffs.** `regularMarketPrice` is not a session
   close — on a closed market it returns a non-session flicker that drifts
   between fetches. A snapshot run on a Sunday recorded a value that differed
   from the prior real close by a non-zero amount, so the history chart showed
   a day-over-day "move" on a day the market never opened. A concrete case: a
   1730.25 INR jump on the super-admin's folio with NSE shut, which decomposed
   to small flicker deltas across the whole INR book (TATACAP, TCS, TITAN…),
   none of them a real trade.

2. **Backdated transactions silently break history.** Holdings are a
   projection of a trade ledger (avg-cost). If a user buys on day 1 but only
   records the transaction on day 5, the snapshots for days 1–4 captured the
   wrong position and can never be made correct: a closed/over market cannot
   be re-asked for "what was the price on day 2," and even an open market only
   gives *today's* price, not that date's.

The root cause of both is the same: a snapshot stored a **total** but not the
**inputs** (per-stock quantity and the price used). Without the inputs a row
is not reproducible.

## Decision

**Store the per-stock price (and the quantity and avg cost behind it) on each
snapshot, and value a closed-market day from the prior session's stored price
rather than refetching.**

Concretely:

* **Valuation source (revised 2026-06-24).** A **trading day** marks each
  holding to the **live current price** (`PriceService.GetPrice` /
  `regularMarketPrice`, same source as the dashboard), stamped with that day's
  date. A **weekend** does not fetch a closed-market quote — it re-values the
  current positions at the prior snapshot's stored per-stock price, carried
  forward with its original `PriceDate`. A weekend symbol with no prior line
  (bought over the weekend) falls back to the live price.
  ~~`PriceService.GetClose` read the last non-null daily candle close instead
  of `GetPrice`.~~ (removed — it returned a stale candle on trading days).

* **`PortfolioSnapshot.Lines []HoldingSnapshot`** — per-stock breakdown
  (symbol, script, currency, quantity, avg cost, close price, price date,
  invested, current). Buckets are derived from `Lines`; manual overrides are
  still preserved by the store's upsert merge.

* **`SnapshotRecomputer.RecomputeFrom(uid, date)`** — after a backdated ledger
  change, replays each holding's ledger **as-of** every affected snapshot date
  and revalues it against the **close already stored** on that date's line.
  History self-heals with no refetch.

### Decisions taken on the recompute (the cheap, deterministic options)

* **Missing close → carry-forward at average cost.** When a backdated
  transaction introduces a symbol on a date no cron ever priced, there is no
  stored line. Rather than fetch historical candles (network in the write
  path, and still lossy for delisted names), that day values at avg cost
  (`current == invested`, no synthetic gain). A stored close of **0** is a
  different case — a holding the snapshot recorded as worthless (delisted /
  failed fetch) — and is **kept at 0**, never resurrected to cost. Accepted as
  a small, honest inaccuracy on exactly the days the user themselves
  under-recorded.

* **Recompute is inline and synchronous** on transaction create/update/delete.
  Single-user portfolios, bounded day ranges; no job queue needed. It is
  **best-effort**: a recompute failure is logged, never rolled back — the
  ledger write has already succeeded and must not be reverted for a
  history-heal miss.

* **Forward-only.** Existing total-only rows (written before this change) are
  left untouched; lines populate from the next cron run forward. No migration,
  no historical-candle backfill. Recompute enforces this by **skipping any row
  whose `holdings` field is absent (`Lines == nil`)** — legacy and manual rows
  — without which it would carry holdings at average cost and overwrite the
  legacy cron buckets. The guard is nil, not `len == 0`: an empty-portfolio
  cron row persists an explicit empty array (no `omitempty`) and stays
  recomputable.

## Consequences

### Positive

* Closed-market snapshots record a real, dated session close — the phantom
  diff class is gone.
* History is reproducible: a backdated transaction heals days 1–4 instead of
  leaving them permanently wrong.
* `Lines` double as an audit trail — you can see *which* stock at *what* close
  drove a day's value, which is how the 1730.25 case was diagnosed.

### Negative / accepted

* Snapshot documents grow from a 3-bucket map to a per-holding array (tens of
  entries for a typical folio). Acceptable at this scale.
* Carry-forward days are flat (no price curve) until a cron prices them — only
  affects under-recorded backdated ranges.
* Recompute reuses the close stored at original write time; it does not
  re-derive what the *true* historical close was on a missing day. Storing the
  close is what makes the common case (txn added after the cron already priced
  the date) correct; the backfill-from-history option was explicitly declined.

## Alternatives considered

* **Fetch historical candles during recompute.** Most accurate for newly
  introduced symbol-days, but puts network in the transaction-write path and
  is still lossy for delisted tickers. Declined for cost/complexity; revisit
  if accuracy on backdated ranges becomes a real complaint.
* **Background recompute job.** Fast txn writes, but needs a status surface and
  overlap handling for no benefit at single-user scale. Declined.
* **Keep totals only, clamp weekend runs.** Special-casing "is the market open"
  per exchange is brittle and still leaves history non-reproducible. Reading
  the actual last candle close is simpler and fixes both problems at once.
