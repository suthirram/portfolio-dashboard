# DD-008: Trades CSV import — technical design

* **Status**: Draft v1 (DD), owner decisions of 2026-11-03 ([PRD-008 §8](../prds/PRD-008-trade-csv-import.md#8-owner-decisions-2026-11-03))
* **Owner**: project owner
* **Implements**: [PRD-008](../prds/PRD-008-trade-csv-import.md)
* **Rollout plan**: [PD-051](../plans/PD-051-trade-csv-import.md)
* **Visuals**: [PD-051 visual spec](../visuals/PD-051-trade-csv-import.html) ([published](https://claude.ai/artifact/E9QgoLHTdo5iDUJVkQf9fd))

## 1. Approach: the dividend import, generalised

The dividend import (DD-005 §2) already has the right shape: the browser
parses the file, the server previews (reads only) and then commits
(re-evaluates, writes in one transaction), names are resolved against
holdings with remembered aliases, and duplicates are counted per occurrence.
The trades import is a second user of those pieces, so the first two PRs
extract them without changing dividends' behaviour, and the next two add
trades on top.

| Piece | Today (dividends) | Shared as | Trades use |
|---|---|---|---|
| Occurrence rule | `partition` (DividendKey) | `partitionByKey[Row, Key]` | key = holding, day, type, quantity, value |
| Name → holding | `resolveNames` (script + aliases) | `matchIndex` + `resolveWith` | index = symbol without suffix + aliases; suggestions on the stock name (`nameCount.label`) |
| Aliases | `confirmedAliases`, `HoldingStore.MoveAliases` | unchanged | same |
| Atomic commit | `txRunner.InTransaction` | unchanged | same, History heal inside |
| Day-first dates | `normaliseDate` | `normaliseDate` reads past an optional clock time and drops it | the day alone |
| CSV reader | `parseCsv` (comma) | `parseCsv(text, delimiter = sniffDelimiter(text))` | tab or comma |
| Name popup | `dividends/NameConfirmDialog` | `imports/NameConfirmDialog` (+ optional create) | create a new holding |
| Preview tables | inline in `DividendImportModal` | `imports/ImportTables` (`ImportCounts`, `InvalidLines`) | four counts |

## 2. API

New paths, mirroring `/dividends/import(/preview)`; the admin pair is
`tierAdmin` and region-scoped through `loadTargetUser`:

```
POST /transactions/import/preview              → 200 TradeImportPreview | 400
POST /transactions/import                      → 200 TradeImportResult  | 400 | 422 TradeImportPreview
POST /admin/users/{id}/transactions/import/preview
POST /admin/users/{id}/transactions/import     (+ 404 unknown / out-of-region user)
```

Schemas (`portfolio-api.yaml`):

* `TradeImportRow { line, date, symbol, stock_name, exchange: NSE|BSE, type: buy|sell, quantity, amount, isin? }`
* `TradeImportInput { rows (≤ 5000), mappings?: {symbol: holdingId | null}, create?: [symbol] }`
* `TradeImportCounts { ready, replace, covered, invalid, total }`
* `TradeImportPreview { counts, names: DividendNameResolution[], rows: DividendImportRowStatus[], warnings }`;
  name status adds `create`, row status adds `replace` and `covered`.
* `TradeImportResult { imported, replaced, covered, created_holdings }`

The name, row-status and warning schemas are reused as they are; their
`Dividend` prefix is historical.

## 3. Evaluation (`TradeImportService.evaluate`, reads only)

1. **Holdings.** `ListByUser`, keeping INR ones (`CurrencyOf`).
2. **Symbols.** `countSymbols` lists distinct sheet symbols (upper-cased)
   with the stock name as the suggestion label. `resolveSymbols` builds a
   `matchIndex` from `exactKey(baseSymbol(holding.Symbol))` ("symbol") and
   the holding's aliases, then `resolveWith` applies the shared rule: an
   answer in `mappings` wins; one exact match is `auto`; several are
   `ambiguous`; none is `needs_confirmation` with suggestions.
3. **Create.** A symbol listed in `create`, unmatched and unanswered,
   becomes a not-yet-stored holding (`newHolding`: `Script` = stock name,
   `Symbol` = `SYMBOL.NS`, or `.BO` when its first row is BSE, INR, no
   opening) with status `create`.
4. **Rows** (`classifyRows`). Per row: `validateTrade` (type, exchange,
   quantity > 0, 0 < value < 1e12, date ≤ IST today), then the holding.
   Opening cover from `OpeningsByUser`: an opening with quantity > 0 and
   `opening_date` set covers rows dated on or before it (`covered`); with no
   date set, its rows are invalid. Valid rows sort stably by day, so file
   order is kept within a day: that is replay order.
5. **Replace** (`splitReplacements`). `ListTradesByHoldings` loads stored
   buys and sells of the stored holdings in the rows' date window.
   `partitionByKey(valid, existing, tradeRow.key, tradeKeyOf)` splits new
   from repeated: per key, n sheet rows against m saved trades add
   max(0, n−m), and a saved trade the sheet lacks is never removed (owner,
   2026-11-03). Key: holding, UTC day, type, quantity in millionths of a
   share, value in cents.
6. **Oversell** (`oversoldHoldings`). Per holding with new rows, the stored
   ledger (`ListByHolding`; none for a created holding) plus the new events
   is replayed with `RecomputePosition`; `ErrOversell` marks the holding's
   new sell rows invalid.
7. **Preview.** `rowStatuses.counts()` tallies ready / replace / covered /
   invalid in line order.

## 4. Commit (`TradeImportService.Import`, one transaction)

Inside `runner.InTransaction`, re-run `evaluate`; any invalid row returns
`TradeImportInvalidError` (→ 422 with the fresh preview), writing nothing.
Otherwise, in order:

1. insert each created holding (`HoldingStore.Insert`);
2. `InsertMany` the new trades: `type` buy/sell, `date` = the bare UTC
   day, `amount` rounded to cents, `currency` from `ledgerCurrency`, no
   `import` metadata (nothing reads it; removing it from the dividend
   import is issue #251), `created_at` = the import time, a millisecond apart in replay order so
   the day's new trades replay as in the file (see "Same-day order");
3. a row matching a saved trade writes nothing: the saved trade stays
   exactly as it is (no import stamp, so a trade's `import` always names
   the import that created it, and a hand-entered trade never looks
   imported);
4. `MoveAliases` for confirmed (not created) symbols;
5. `recomputeAndPersist` each holding with new trades (an oversell here
   aborts the transaction → 400);
6. heal History **inside the transaction**: `RecomputeFrom(earliest new
   day)` when that day is before today. A heal error aborts everything
   (owner: ACID). The single-trade ledger writes keep their best-effort
   heal after the write; only the import makes it transactional.

### Same-day order

Dates only (owner, 2026-11-03): the time in the file is read past and
dropped, so it has no effect. Trades are dated at the bare day and the
ledger replays as it already does: date, then `created_at`.

* A saved trade keeps its place: matched or not, it is never moved.
* The day's new trades follow the saved ones, in the file's order.
* Known limit: when a file adds a trade to a day where the holding already
  has saved trades, and the real order interleaves a buy and a sell, the
  replay can differ from the broker's (e.g. saved buy ₹1,000 and sell
  ₹2,000, new buy ₹3,000 executed before the sell: average ₹300 and ₹1,000
  realised, not ₹200 and ₹0). It needs one stock bought and sold the same
  day across two uploads; ordering by time is left for a later iteration.

MongoDB transactions need the replica set the dividend import already
requires (`Store.InTransaction`).

## 5. Frontend

* `lib/formDates.ts`: `normaliseDate(raw)` reads day-first always and
  accepts an optional clock time (`h:mm[:ss] [AM|PM]` or 24-hour), which it
  drops; an impossible time or trailing text is still invalid.
* `lib/csv.ts`: `sniffDelimiter` (most of `,` `\t` `;` in the first
  non-blank line); `parseCsv` defaults to it.
* `features/imports/NameConfirmDialog.tsx` (moved from dividends):
  `heading` (also the accessible name), optional `context`, `intro`,
  optional `createLabel` adding "Create a new holding"; `onConfirm(answers,
  created)`.
* `features/imports/ImportTables.tsx`: `ImportCounts`, `InvalidLines`.
* `features/transactions/tradeCsv.ts`: `parseTradeCsv(text, today)` →
  rows, errors (with line and reason), skipped (not executed), total.
* `features/transactions/TradeImportModal.tsx`: pick → names → preview →
  result, with `api.previewTradeImport` / `api.importTrades` and the 422
  re-preview, as `DividendImportModal`.
* `TransactionsPage`: an **Import CSV** button in the filters toolbar (own
  and act-as); `afterLedgerChange` (table refresh + `ledgerVersion` bump)
  is shared by the ledger editor and the import.

## 6. Testing

* Go (behaviour, mtest mock): generic partition with another key; symbols
  match across exchange suffixes; an unknown symbol waits with suggestions;
  `validateTrade` cases; the occurrence rule on trade keys (add only what
  is missing, never remove); `Import`: re-upload writes nothing to
  transactions, rows up to the opening date are
  covered, an oversell blocks everything, a created symbol inserts its
  holding, the heal runs from the earliest trade and its failure fails the
  import, and new trades of a day follow its saved trades in file order,
  dated at the bare day. Admin route tiers include the two act-as paths.
* Vitest: `normaliseDate` (both sample shapes, 12 AM, 24-hour, rejects); `sniffDelimiter`; `parseTradeCsv` on sample lines; the modal
  (create a symbol, preview with replacements, import; invalid lines block;
  422); the page button on own and act-as. The dividend import's tests pass
  unchanged on the shared pieces.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The heal rewrites many snapshots in one transaction | per-user scope; RecomputeFrom starts at the earliest new day only |
| A re-upload changes a saved trade | it never does: a matching row writes nothing |
| Replace keys collide on genuinely repeated trades | occurrence matching: n identical rows replace at most n stored trades |
| Excel's mangled order ids | not used anywhere |
