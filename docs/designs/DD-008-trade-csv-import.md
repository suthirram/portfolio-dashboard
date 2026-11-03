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
| Day-first dates | `normaliseDate` | `parseDateTime` (+ optional time); `normaliseDate` wraps it | date + minutes |
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

* `TradeImportRow { line, date, minutes?, symbol, stock_name, exchange: NSE|BSE, type: buy|sell, quantity, amount, isin? }`
* `TradeImportInput { rows (≤ 5000), mappings?: {symbol: holdingId | null}, create?: [symbol] }`
* `TradeImportCounts { ready, replace, covered, invalid, total }`
* `TradeImportPreview { counts, names: DividendNameResolution[], rows: DividendImportRowStatus[], warnings }`;
  name status adds `create`, row status adds `replace` and `covered`.
* `TradeImportResult { imported, replaced, covered, created_holdings, batch_id }`

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
   date set, its rows are invalid. Valid rows sort stably by day, then
   minutes (no time = −1), then file order: that is replay order. Each row
   gets its execution time (`executionTime`): the sheet time in IST (start
   of the day when there is none) plus its position in the day in
   milliseconds, so equal times and date-only rows keep the file's order
   (see "Same-day order" below).
5. **Replace** (`splitReplacements`). `ListTradesByHoldings` loads stored
   buys and sells of the stored holdings in the rows' date window.
   `partitionByKey(valid, existing, tradeRow.key, tradeKeyOf)` splits new
   from repeated; `pairStored` pairs each repeat with the stored trade it
   replaces, in order. Key: holding, UTC day, type, quantity in millionths
   of a share, value in cents.
6. **Oversell** (`oversoldHoldings`). Per holding with new or replacing
   rows, the ledger as the import leaves it is replayed with
   `RecomputePosition`: the stored events (`ListByHolding`; none for a
   created holding), each replaced trade moved to its row's execution time,
   plus the new events. `ErrOversell` marks the holding's sell rows (new
   or replacing) invalid.
7. **Preview.** `rowStatuses.counts()` tallies ready / replace / covered /
   invalid in line order.

## 4. Commit (`TradeImportService.Import`, one transaction)

Inside `runner.InTransaction`, re-run `evaluate`; any invalid row returns
`TradeImportInvalidError` (→ 422 with the fresh preview), writing nothing.
Otherwise, in order:

1. insert each created holding (`HoldingStore.Insert`);
2. `InsertMany` the new trades: `type` buy/sell, `date` = UTC day,
   `amount` rounded to cents, `currency` from `ledgerCurrency`,
   `import` = `{batch_id, line, sheet_name}`, `executed_at` = the row's
   execution time, `created_at` = now (the insertion time);
3. replace: for each paired stored trade, `TransactionStore.StampImport(
   ctx, userId, transactionId, meta, executedAt, updatedAt)` sets `import`,
   `executed_at` and `updated_at` only (owner-scoped; `ErrNotFound` when
   nothing matched). The values are identical by key, so the id, values and
   notes stay; the trade takes its row's place in the day. The update shape
   lives in persistence: the service never builds `bson` (CLAUDE.md,
   persistence layer);
4. `MoveAliases` for confirmed (not created) symbols;
5. `recomputeAndPersist` each holding with new or replaced trades (an
   oversell here aborts the transaction → 400);
6. heal History **inside the transaction**: `RecomputeFrom(earliest day
   with a new or replaced trade)` when that day is before today. A heal
   error aborts everything (owner: ACID). The single-trade ledger writes
   keep their best-effort heal after the write; only the import makes it
   transactional.

### Same-day order

`RecomputePosition` replays by `Date`, then same-day events by
`Transaction.SequencedAt()`: `executed_at` when set, else `created_at`.
`created_at` stays the insertion time (owner, 2026-11-03); the trade's
place in its day is `executed_at`, a new optional field (`omitempty`, not
in the API). One key per event keeps the sort order total.

* Hand-entered and existing events have no `executed_at`, so their order
  is unchanged and no migration is needed.
* Every imported row carries one, and a re-upload re-stamps the trades it
  replaces. A file that repeats a saved buy and sell and adds a buy
  between them replays buy, new buy, sell: buy 10 for ₹1,000, buy 10 for
  ₹3,000, sell 10 for ₹2,000 leaves average ₹200 and ₹0 realised.
* A same-day event outside the file keeps its `created_at` as its key. A
  hand-entered trade is usually entered after the day, so it sorts after
  that day's imported trades.
* `TransactionsService.Update` sets `executed_at` to null when an edit
  moves the trade to another day (the time belongs to its day); `restore`
  puts it back on a rollback.

MongoDB transactions need the replica set the dividend import already
requires (`Store.InTransaction`).

## 5. Frontend

* `lib/formDates.ts`: `parseDateTime(raw) → {date, minutes} | null`;
  `normaliseDate` returns its date. Day-first always; time optional
  (`h:mm[:ss] [AM|PM]` or 24-hour).
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
  `validateTrade` cases; `pairStored` one per occurrence; `Import`:
  re-upload replaces and inserts nothing (each stamp scoped to the user and
  the stored trade's id), a new trade lands between saved trades of its
  day (the `executed_at` written orders them; the recompute writes average
  ₹200, ₹0 realised), rows up to the opening date are
  covered, an oversell blocks everything, a created symbol inserts its
  holding, the heal runs from the earliest trade and its failure fails the
  import. `RecomputePosition` replays same-day events by execution time,
  else insertion time; a ledger edit to another day clears `executed_at`.
  Admin route tiers include the two act-as paths.
* Vitest: `parseDateTime` (both sample shapes, 12 AM / PM, 24-hour,
  rejects); `sniffDelimiter`; `parseTradeCsv` on sample lines; the modal
  (create a symbol, preview with replacements, import; invalid lines block;
  422); the page button on own and act-as. The dividend import's tests pass
  unchanged on the shared pieces.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The heal rewrites many snapshots in one transaction | per-user scope; RecomputeFrom starts at the earliest new day only |
| A replace overwrites a hand-entered note | it never does: `StampImport` sets only `import`, `executed_at` and `updated_at` |
| A new trade replays after saved trades of its day | `executed_at` orders the day for new and replaced trades alike; `created_at` is not reused |
| The ledger sort changes for existing data | it cannot: without `executed_at` the key is `created_at`, as today |
| Replace keys collide on genuinely repeated trades | occurrence matching: n identical rows replace at most n stored trades |
| Excel's mangled order ids | not used anywhere |
