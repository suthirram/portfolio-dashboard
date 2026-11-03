# PRD-008: Import trades from a broker CSV

* **Status**: Draft v1 (PRD), owner decisions of 2026-11-03 applied
* **Owner**: project owner
* **Type**: Product Requirements: the *what* and *why*. The *how* lives in
  [DD-008](../designs/DD-008-trade-csv-import.md); the rollout in
  [PD-051](../plans/PD-051-trade-csv-import.md).
* **Visuals**: [PD-051 visual spec](../visuals/PD-051-trade-csv-import.html) ([published](https://claude.ai/artifact/E9QgoLHTdo5iDUJVkQf9fd))
* **Builds on**: [PRD-005](PRD-005-dividend-history.md) (the dividend CSV
  import, whose flow and matching this reuses), [PRD-004](PRD-004-all-transactions-view.md)
  (the All transactions page), the ledger conventions in `CLAUDE.md`.

## 1. Problem

Every buy and sell is typed into a holding's ledger one at a time. A broker
already has the full order history: the owner's Groww export holds 63 orders
from November 2024 to November 2026 across 15 symbols. Typing them in is
slow and error-prone, and re-entering a file twice would double the
positions.

## 2. Goals

1. Upload a broker order-history CSV on the All transactions page and turn
   each executed order into a buy or sell in the right holding's ledger.
2. Read the file's mixed date column correctly (§4).
3. Never duplicate: a trade already in the ledger is replaced, not added
   again, so uploading the same file twice changes nothing (owner, §8).
4. All or nothing: trades, new holdings, positions and History are saved
   together or not at all (owner: ACID, §8).
5. Reuse the dividend import's flow and matching rather than building a
   second one.

## 3. Non-goals (v1)

* **Only INR (NSE / BSE) trades.** The sample is an Indian broker; EUR
  imports can follow with a second column map.
* **No fees or taxes column.** `Value` is the trade's total cash amount, the
  ledger's money convention; fees are not in the file.
* **No editing inside the preview.** A bad line is fixed in the file and
  the file chosen again, as in the dividend import.
* **No undo button.** Trades are ordinary ledger events afterwards; they are
  edited or deleted in the holding's ledger.

## 4. The file

The owner's Groww export, comma- or tab-separated (both are detected):

| Column | Used as | Notes |
|---|---|---|
| Stock name | the holding's name when one is created; suggestions | e.g. `LG ELECTRONICS INDIA LTD` |
| Symbol | matches the holding | `KALYANKJIL`; one odd value `NSE$` |
| ISIN | kept with the row | not used to match in v1 |
| Type | `BUY` → buy, `SELL` → sell | anything else is invalid |
| Quantity | shares | positive |
| Value | total cash amount | positive |
| Exchange | `NSE` / `BSE` | picks the suffix for a new holding |
| Exchange Order Id | ignored | Excel has mangled some to `1.1E+15`, so it cannot identify a trade |
| Execution date and time | the trade date | see below |
| Order status | only `Executed` rows import | other rows are listed as skipped |

**Dates are always day-first (owner, 2026-11-03).** The column mixes two
shapes:

* `17-12-2024 03:30 PM`: DD-MM-YYYY with a 12-hour time.
* `1/11/2024`: D/M/YYYY with no time. Every such cell in the sample has a
  day ≤ 12; Excel turned those cells into dates and dropped the time. Read
  day-first, the file is in date order (1 Nov, 7 Nov, 2 Dec, 17 Dec 2024).

Accepted: `D/M/YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`,
each with an optional `hh:mm` (12-hour with AM/PM, or 24-hour, optional
seconds). The time only orders trades on the same day. Anything else, or an
impossible date (`31/02/2025`, `13:30 PM`), makes the line invalid with the
reason. Dates after today are invalid. The banner says it: "dates read as
DD/MM/YYYY (1/11/2024 = 1 Nov 2024)".

## 5. Behaviour

* **Entry.** An **Import CSV** button in the All transactions toolbar, on
  the user's own page and in admin act-as (the import writes the target's
  ledger, as the dividend import does).
* **Steps.** Choose file → confirm symbols (only when needed) → preview →
  confirm → result. Nothing is saved before confirm.
* **Symbols.** A row's symbol matches an INR holding whose symbol, without
  its `.NS` / `.BO` suffix, is the same (`GOLDBEES` finds `GOLDBEES.NS`,
  also on a BSE row), or a name the owner confirmed before. An unknown
  symbol is never guessed; the confirm step offers, per symbol:
  * a suggested holding (scored on the stock name), or any other holding;
  * **Create a new holding**: an INR holding named from the stock name,
    symbol `SYMBOL.NS` (`.BO` for a BSE-only symbol), with no opening
    balance;
  * leave it unresolved (its rows become invalid).

  A confirmed mapping is remembered for the next import.
* **Same trade = replace (owner, 2026-11-03).** A row whose holding, day,
  type, quantity and value equal a saved buy or sell replaces that trade in
  place: its id, notes and ledger position stay, and the import is recorded
  on it. Matching is per occurrence: two identical trades on one day need
  two identical rows. Re-uploading a file therefore imports nothing new.
* **Opening balances (owner, 2026-11-03).** A holding with an opening
  balance already holds every trade up to its opening date. Rows dated on
  or before that date are **covered**: shown in the preview, not imported.
  If the holding has an opening balance but no opening date yet, its rows
  are invalid until the date is set on the dashboard.
* **Oversell.** If a holding's sells would exceed the shares it holds once
  the new trades are in, its sell rows are invalid ("sells more ITC than
  held — check earlier buys or the opening balance").
* **Preview.** Counts of *ready*, *replaces an identical trade*, *covered by
  the opening balance* and *invalid*, plus the total; the skipped
  (not executed) rows; every invalid line with its reason. Confirm is
  disabled while any line is invalid or nothing would be written.
* **All or nothing.** Confirm re-checks everything against the database as
  it is now. If anything became invalid, nothing is written and the fresh
  preview is shown ("The data changed since the preview — review it
  again."). Otherwise the new holdings, new trades, replacements, remembered
  symbols, recomputed positions and the healed History rows are saved in
  one transaction.
* **Result.** "N imported · R replaced · C covered by an opening balance ·
  H new holdings". The table, and an open investment delta chart, reload.
* **Limits.** 1 MB and 5,000 rows per file, as for dividends.

## 6. Success criteria

1. The owner's sample imports: 63 orders, 15 symbols; `1/11/2024` lands on
   1 Nov 2024 and `17-12-2024 03:30 PM` on 17 Dec 2024.
2. Uploading the same file again reports 0 imported and every row as a
   replacement; the ledger and positions are unchanged.
3. A row dated on or before a holding's opening date is covered, not
   imported.
4. An unknown symbol (e.g. `LGEINDIA`) can be created as a new holding, and
   its buy and sell land in it.
5. A forced failure during confirm leaves no trade, holding or History
   change behind.
6. The dividend import works exactly as before on the shared pieces.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A month-first file imports wrong dates | day-first is stated in the banner and the docs; the user doc shows both shapes |
| A mangled symbol (`NSE$`) | never auto-matched or auto-created; the user maps or creates it knowingly |
| Large History heal inside the transaction | one user's snapshots (hundreds of rows) fit easily inside MongoDB's transaction limits |
| Same-day order without times | rows keep the file's order; a time, when present, wins |
| A new trade between saved trades of the same day | it replays in its place in the file, saved trades included; the time is stored on the trade, never in its created date |

## 8. Owner decisions (2026-11-03)

| # | Question | Decision |
|---|---|---|
| 1 | Date format | Always DD/MM/YYYY; also accept `DD-MM-YYYY hh:mm AM/PM` |
| 2 | Rows on or before an opening date | Covered: shown, not imported |
| 3 | Unknown symbols | Confirm: map, create a new INR holding, or leave |
| 4 | Where | Transactions page, own portfolio and admin act-as |
| 5 | A matching existing trade | Replace it; uploading never duplicates |
| 6 | Atomicity | ACID: everything, History included, in one transaction |
| 7 | Reuse | The dividend import's flow and matching become shared pieces |
