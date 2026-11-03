package services

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// Trades CSV import (PRD-008, DD-008): a broker's order history becomes
// buy/sell ledger events. Preview reads only; Import re-evaluates and
// commits everything in one transaction, History heal included.

// Row statuses and the name status a trade import adds.
const (
	tradeReady   = "ready"
	tradeReplace = "replace"
	tradeCovered = "covered"
	tradeInvalid = "invalid"
	nameCreate   = "create"
)

// maxTradeAmount bounds one trade's value, as maxDividendAmount does.
const maxTradeAmount = 1e12

// TradeImportService owns the trades CSV import.
type TradeImportService struct {
	txns       *persistence.TransactionStore
	holdings   *persistence.HoldingStore
	runner     txRunner
	recomputer snapshotRecomputer
	logger     *zap.Logger
	today      func() time.Time // IST calendar day; tests pin it
	now        func() time.Time
}

// NewTradeImportService wires a TradeImportService. recomputer may be nil
// (no History heal), as for TransactionsService.
func NewTradeImportService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, runner txRunner, recomputer snapshotRecomputer, logger *zap.Logger) *TradeImportService {
	return &TradeImportService{txns: txns, holdings: holdings, runner: runner, recomputer: recomputer, logger: logger,
		today: istToday, now: func() time.Time { return time.Now().UTC() }}
}

func (s *TradeImportService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// tradeRow is a valid sheet row resolved to a holding.
type tradeRow struct {
	sheetRow api.TradeImportRow
	day      time.Time
	holding  *domain.Holding
}

// tradeKey is "the same trade": one holding, day, type, quantity and value.
// A sheet row with the key of a stored trade replaces it (owner, 2026-11-03).
type tradeKey struct {
	HoldingId primitive.ObjectID
	Day       string
	Type      domain.TxnType
	Micros    int64 // quantity in millionths of a share
	Cents     int64
}

func quantityMicros(quantity float64) int64 { return int64(math.Round(quantity * 1e6)) }

func (r tradeRow) key() tradeKey {
	return tradeKey{HoldingId: r.holding.ID, Day: r.day.Format(time.DateOnly), Type: domain.TxnType(r.sheetRow.Type),
		Micros: quantityMicros(r.sheetRow.Quantity), Cents: domain.AmountCents(r.sheetRow.Amount)}
}

func tradeKeyOf(stored domain.Transaction) tradeKey {
	return tradeKey{HoldingId: stored.HoldingID, Day: domain.UTCDate(stored.Date).Format(time.DateOnly), Type: stored.Type,
		Micros: quantityMicros(stored.Quantity), Cents: domain.AmountCents(stored.Amount)}
}

// sheetSymbol is a sheet symbol as displayed and as the mappings key.
func sheetSymbol(raw string) string { return strings.ToUpper(strings.TrimSpace(raw)) }

// baseSymbol drops the Yahoo exchange suffix: "GOLDBEES.NS" → "GOLDBEES".
func baseSymbol(symbol string) string {
	return sheetSymbol(exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(symbol)), ""))
}

// countSymbols lists distinct sheet symbols in first-appearance order;
// suggestions are scored on the stock name.
func countSymbols(rows []api.TradeImportRow) []nameCount {
	index := map[string]int{}
	var out []nameCount
	for _, row := range rows {
		symbol := sheetSymbol(row.Symbol)
		if symbol == "" {
			continue
		}
		if position, seen := index[symbol]; seen {
			out[position].rows++
			continue
		}
		index[symbol] = len(out)
		out = append(out, nameCount{name: symbol, label: sheetName(row.StockName), rows: 1})
	}
	return out
}

// resolveSymbols matches each sheet symbol to an INR holding: its symbol
// without the exchange suffix (so a BSE row finds the .NS holding) or an
// alias the owner confirmed before.
func resolveSymbols(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
	index := matchIndex{}
	for i := range candidates {
		holding := &candidates[i]
		index.add(exactKey(baseSymbol(holding.Symbol)), "symbol", holding)
		for _, alias := range holding.Aliases {
			index.add(alias, "alias", holding)
		}
	}
	return resolveWith(names, index, candidates, mappings)
}

// newHolding is the INR holding a confirmed "create" adds, named and
// suffixed from the symbol's first sheet row.
func newHolding(userId primitive.ObjectID, symbol string, first api.TradeImportRow, now time.Time) *domain.Holding {
	suffix := ".NS"
	if first.Exchange == api.TradeImportRowExchangeBSE {
		suffix = ".BO"
	}
	return &domain.Holding{ID: primitive.NewObjectID(), UserID: userId, Script: sheetName(first.StockName), Symbol: symbol + suffix,
		Exchange: string(first.Exchange), Type: "stock", Currency: "INR", CreatedAt: now, UpdatedAt: now}
}

// validateTrade is the per-row rule: a known type and exchange, a positive
// quantity and value, dated no later than today (IST).
func validateTrade(row api.TradeImportRow, today time.Time) string {
	switch {
	case !row.Type.Valid():
		return fmt.Sprintf("Type %q is not BUY or SELL", row.Type)
	case !row.Exchange.Valid():
		return fmt.Sprintf("Exchange %q is not NSE or BSE", row.Exchange)
	case math.IsNaN(row.Quantity) || math.IsInf(row.Quantity, 0) || quantityMicros(row.Quantity) <= 0:
		return "Quantity must be a positive number"
	case math.IsNaN(row.Amount) || math.IsInf(row.Amount, 0) || domain.AmountCents(row.Amount) <= 0 || row.Amount >= maxTradeAmount:
		return "Value must be a positive amount"
	case domain.UTCDate(row.Date.Time).After(today):
		return "Date is in the future"
	}
	return ""
}

// tradePlan is an evaluated import: what preview shows, what confirm writes.
type tradePlan struct {
	preview  api.TradeImportPreview
	fresh    []tradeRow // in replay order
	replaced int        // rows already saved; their trades stay untouched
	created  []*domain.Holding
	aliases  map[primitive.ObjectID][]string
}

// toTransaction builds the ledger event for a new imported trade. created
// orders same-day events (the ledger replays date, then created_at). No
// import metadata is stored: nothing reads it (issue #251).
func (r tradeRow) toTransaction(userId primitive.ObjectID, created time.Time) domain.Transaction {
	return domain.Transaction{
		ID: primitive.NewObjectID(), UserID: userId, HoldingID: r.holding.ID,
		Type: domain.TxnType(r.sheetRow.Type), Date: r.day, Quantity: r.sheetRow.Quantity,
		Amount: domain.RoundCents(r.sheetRow.Amount), Currency: ledgerCurrency(*r.holding),
		CreatedAt: created, UpdatedAt: created,
	}
}

// rowStatuses collects each sheet line's outcome for the preview.
type rowStatuses []api.DividendImportRowStatus

func (statuses *rowStatuses) add(line int, status string, holding *domain.Holding, reason string) {
	entry := api.DividendImportRowStatus{Line: line, Status: status}
	if holding != nil {
		holdingId := holding.ID.Hex()
		entry.HoldingId = &holdingId
	}
	if reason != "" {
		entry.Reason = &reason
	}
	*statuses = append(*statuses, entry)
}

// counts tallies the statuses, in line order.
func (statuses rowStatuses) counts() api.TradeImportCounts {
	slices.SortFunc(statuses, func(first, second api.DividendImportRowStatus) int { return cmp.Compare(first.Line, second.Line) })
	counts := api.TradeImportCounts{Total: len(statuses)}
	for _, status := range statuses {
		switch status.Status {
		case tradeReady:
			counts.Ready++
		case tradeReplace:
			counts.Replace++
		case tradeCovered:
			counts.Covered++
		default:
			counts.Invalid++
		}
	}
	return counts
}

// resolveTradeNames resolves the sheet symbols against the INR holdings and
// turns each confirmed "create" into a new (not yet stored) holding.
func resolveTradeNames(userId primitive.ObjectID, input api.TradeImportInput, holdings []domain.Holding, now time.Time) ([]nameResolution, []*domain.Holding) {
	candidates := make([]domain.Holding, 0, len(holdings))
	for _, holding := range holdings {
		if currency, ok := CurrencyOf(holding); ok && currency == "INR" {
			candidates = append(candidates, holding)
		}
	}
	var mappings map[string]*string
	if input.Mappings != nil {
		mappings = *input.Mappings
	}
	toCreate := map[string]bool{}
	if input.Create != nil {
		for _, symbol := range *input.Create {
			toCreate[sheetSymbol(symbol)] = true
		}
	}
	firstRow := map[string]api.TradeImportRow{}
	for _, row := range input.Rows {
		if _, seen := firstRow[sheetSymbol(row.Symbol)]; !seen {
			firstRow[sheetSymbol(row.Symbol)] = row
		}
	}
	names := resolveSymbols(countSymbols(input.Rows), candidates, mappings)
	var created []*domain.Holding
	for i := range names {
		symbol := names[i].view.SheetName
		if _, answered := mappings[symbol]; names[i].holding == nil && toCreate[symbol] && !answered {
			names[i].holding, names[i].view.Status = newHolding(userId, symbol, firstRow[symbol], now), nameCreate
			created = append(created, names[i].holding)
		}
	}
	return names, created
}

// classifyRows validates each row and sets aside the rows an opening
// balance already holds; the rest come back in replay order (day, the
// sheet's time, file order).
func classifyRows(rows []api.TradeImportRow, names []nameResolution, openings map[primitive.ObjectID]domain.Transaction, today time.Time, statuses *rowStatuses) []tradeRow {
	bySymbol := make(map[string]*domain.Holding, len(names))
	for _, resolution := range names {
		bySymbol[resolution.view.SheetName] = resolution.holding
	}
	var valid []tradeRow
	for _, sheetRow := range rows {
		symbol := sheetSymbol(sheetRow.Symbol)
		reason := validateTrade(sheetRow, today)
		holding := bySymbol[symbol]
		switch {
		case symbol == "":
			reason = "Symbol is empty"
		case reason == "" && holding == nil:
			reason = fmt.Sprintf("no holding chosen for %q", symbol)
		}
		if reason != "" {
			statuses.add(sheetRow.Line, tradeInvalid, nil, reason)
			continue
		}
		day := domain.UTCDate(sheetRow.Date.Time)
		// The opening balance already holds every trade up to its date
		// (owner decision, PRD-008 §5): those rows would double-count it.
		if opening, ok := openings[holding.ID]; ok && opening.Quantity > 0 {
			if opening.OpeningDate == nil {
				statuses.add(sheetRow.Line, tradeInvalid, holding, fmt.Sprintf("set the opening date of %s on the dashboard first", holding.Script))
				continue
			}
			if !day.After(domain.UTCDate(*opening.OpeningDate)) {
				statuses.add(sheetRow.Line, tradeCovered, holding, "")
				continue
			}
		}
		valid = append(valid, tradeRow{sheetRow: sheetRow, day: day, holding: holding})
	}
	// By day only; a stable sort keeps the file's order within a day.
	slices.SortStableFunc(valid, func(first, second tradeRow) int { return first.day.Compare(second.day) })
	return valid
}

func isCreated(created []*domain.Holding, holdingId primitive.ObjectID) bool {
	return slices.ContainsFunc(created, func(holding *domain.Holding) bool { return holding.ID == holdingId })
}

// splitReplacements separates the rows that repeat a stored trade (they
// replace it) from the new ones.
func (s *TradeImportService) splitReplacements(ctx context.Context, userId primitive.ObjectID, valid []tradeRow, created []*domain.Holding, plan *tradePlan, statuses *rowStatuses) ([]tradeRow, error) {
	if len(valid) == 0 {
		return nil, nil
	}
	var storedIds []primitive.ObjectID
	for _, row := range valid {
		if !slices.Contains(storedIds, row.holding.ID) && !isCreated(created, row.holding.ID) {
			storedIds = append(storedIds, row.holding.ID)
		}
	}
	var existing []domain.Transaction
	if len(storedIds) > 0 {
		from, to := valid[0].day, valid[len(valid)-1].day.Add(24*time.Hour-time.Nanosecond)
		var err error
		if existing, err = s.txns.ListTradesByHoldings(ctx, userId, storedIds, from, to); err != nil {
			return nil, err
		}
	}
	// Per key, n sheet rows against m saved trades add max(0, n−m); a saved
	// trade the sheet lacks is never removed (owner, 2026-11-03).
	fresh, duplicates := partitionByKey(valid, existing, tradeRow.key, tradeKeyOf)
	plan.replaced = len(duplicates)
	for _, row := range duplicates {
		statuses.add(row.sheetRow.Line, tradeReplace, row.holding, "")
	}
	return fresh, nil
}

// oversoldHoldings replays each holding's ledger with its new trades: a
// holding whose sells would exceed what it holds is returned.
func (s *TradeImportService) oversoldHoldings(ctx context.Context, userId primitive.ObjectID, fresh []tradeRow, created []*domain.Holding, now time.Time) (map[primitive.ObjectID]bool, error) {
	byHolding := map[primitive.ObjectID][]domain.Transaction{}
	for i, row := range fresh {
		byHolding[row.holding.ID] = append(byHolding[row.holding.ID], row.toTransaction(userId, now.Add(time.Duration(i)*time.Millisecond)))
	}
	oversold := map[primitive.ObjectID]bool{}
	for holdingId, events := range byHolding {
		var ledger []domain.Transaction
		if !isCreated(created, holdingId) {
			stored, err := s.txns.ListByHolding(ctx, userId, holdingId)
			if err != nil {
				return nil, err
			}
			ledger = stored
		}
		ledger = append(ledger, events...)
		if _, err := RecomputePosition(ledger); errors.Is(err, ErrOversell) {
			oversold[holdingId] = true
		} else if err != nil {
			return nil, err
		}
	}
	return oversold, nil
}

// evaluate runs validation, symbol resolution, the opening-balance cover,
// the replace lookup and the oversell check. Reads only.
func (s *TradeImportService) evaluate(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (tradePlan, error) {
	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		return tradePlan{}, err
	}
	now := s.now()
	names, created := resolveTradeNames(userId, input, holdings, now)
	openings, err := s.txns.OpeningsByUser(ctx, userId)
	if err != nil {
		return tradePlan{}, err
	}
	plan := tradePlan{created: created, aliases: confirmedAliases(names)}
	statuses := rowStatuses{}
	valid := classifyRows(input.Rows, names, openings, s.today(), &statuses)
	fresh, err := s.splitReplacements(ctx, userId, valid, created, &plan, &statuses)
	if err != nil {
		return tradePlan{}, err
	}
	oversold, err := s.oversoldHoldings(ctx, userId, fresh, created, now)
	if err != nil {
		return tradePlan{}, err
	}
	for _, row := range fresh {
		if oversold[row.holding.ID] && row.sheetRow.Type == api.TradeImportRowTypeSell {
			statuses.add(row.sheetRow.Line, tradeInvalid, row.holding, fmt.Sprintf("sells more %s than held — check earlier buys or the opening balance", row.holding.Script))
			continue
		}
		statuses.add(row.sheetRow.Line, tradeReady, row.holding, "")
		plan.fresh = append(plan.fresh, row)
	}

	views := make([]api.DividendNameResolution, 0, len(names))
	for _, resolution := range names {
		views = append(views, resolution.view)
	}
	plan.preview = api.TradeImportPreview{Counts: statuses.counts(), Names: views, Rows: statuses, Warnings: []api.DividendImportWarning{}}
	return plan, nil
}

// checkTradeInput rejects malformed requests (400) before any read.
func checkTradeInput(input api.TradeImportInput) error {
	if len(input.Rows) > maxImportRows {
		return fmt.Errorf("%w: more than %d rows — split the file", ErrValidation, maxImportRows)
	}
	return nil
}

// Preview evaluates a trades import without writing anything.
func (s *TradeImportService) Preview(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (_ api.TradeImportPreview, retErr error) {
	ctx, span := tracer.Start(ctx, "TradeImportService.Preview")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	if err := checkTradeInput(input); err != nil {
		return api.TradeImportPreview{}, err
	}
	plan, err := s.evaluate(ctx, userId, input)
	if err != nil {
		logger.Error("trade import preview failed", zap.Error(err))
		return api.TradeImportPreview{}, err
	}
	return plan.preview, nil
}

// TradeImportInvalidError carries the fresh preview when a confirm finds
// invalid rows; nothing was written. Controllers map it to 422.
type TradeImportInvalidError struct{ Preview api.TradeImportPreview }

func (e *TradeImportInvalidError) Error() string {
	return fmt.Sprintf("trade import: %d invalid rows", e.Preview.Counts.Invalid)
}

// Import commits the new holdings, new trades, replacements, aliases, the
// recomputed positions and the History heal together, or nothing.
func (s *TradeImportService) Import(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (_ api.TradeImportResult, retErr error) {
	ctx, span := tracer.Start(ctx, "TradeImportService.Import")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	if err := checkTradeInput(input); err != nil {
		return api.TradeImportResult{}, err
	}
	var result api.TradeImportResult
	err := s.runner.InTransaction(ctx, func(ctx context.Context) error {
		plan, err := s.evaluate(ctx, userId, input)
		if err != nil {
			return err
		}
		if plan.preview.Counts.Invalid > 0 {
			return &TradeImportInvalidError{Preview: plan.preview}
		}
		now := s.now()
		for _, holding := range plan.created {
			if err := s.holdings.Insert(ctx, *holding); err != nil {
				return err
			}
		}
		trades := make([]domain.Transaction, 0, len(plan.fresh))
		var affected []primitive.ObjectID
		var earliest time.Time
		for i, row := range plan.fresh {
			trades = append(trades, row.toTransaction(userId, now.Add(time.Duration(i)*time.Millisecond)))
			if !slices.Contains(affected, row.holding.ID) {
				affected = append(affected, row.holding.ID)
			}
			if earliest.IsZero() || row.day.Before(earliest) {
				earliest = row.day
			}
		}
		if len(trades) > 0 {
			if err := s.txns.InsertMany(ctx, trades); err != nil {
				return err
			}
		}
		// A row matching a saved trade writes nothing: the saved trade stays
		// exactly as it is.
		for holdingId, keys := range plan.aliases {
			if err := s.holdings.MoveAliases(ctx, userId, holdingId, keys); err != nil {
				return err
			}
		}
		for _, holdingId := range affected {
			if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, userId, holdingId); err != nil {
				return err
			}
		}
		// History heals inside the same transaction, so ledger, holdings and
		// snapshots commit together (owner: the import must be ACID).
		if s.recomputer != nil && !earliest.IsZero() && earliest.Before(domain.UTCDate(now)) {
			if err := s.recomputer.RecomputeFrom(ctx, userId, earliest); err != nil {
				return err
			}
		}
		result = api.TradeImportResult{Imported: len(trades), Replaced: plan.replaced, Covered: plan.preview.Counts.Covered,
			CreatedHoldings: len(plan.created)}
		return nil
	})
	if err != nil {
		if _, ok := errors.AsType[*TradeImportInvalidError](err); !ok {
			logger.Error("trade import failed", zap.Error(err))
		}
		return api.TradeImportResult{}, err
	}
	logger.Info("trades imported", zap.Int("imported", result.Imported), zap.Int("replaced", result.Replaced),
		zap.Int("covered", result.Covered), zap.Int("created_holdings", result.CreatedHoldings))
	return result, nil
}
