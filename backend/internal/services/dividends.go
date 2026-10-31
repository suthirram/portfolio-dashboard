package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// DividendsService owns the dividend views over the ledger (PRD-005).
// Dividends are ledger events (type=dividend); single-row writes stay on
// TransactionsService so there is one write path.
type DividendsService struct {
	txns     *persistence.TransactionStore
	holdings *persistence.HoldingStore
	tx       txRunner
	logger   *zap.Logger
	today    func() time.Time // IST calendar day; tests pin it
}

// txRunner runs fn atomically. *persistence.Store implements it; tests pass
// a runner that calls fn directly.
type txRunner interface {
	InTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, tx txRunner, logger *zap.Logger) *DividendsService {
	return &DividendsService{txns: txns, holdings: holdings, tx: tx, logger: logger, today: istToday}
}

func (s *DividendsService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// List returns one currency tab of userId's dividends (PRD-005 §8).
func (s *DividendsService) List(ctx context.Context, userId primitive.ObjectID, currency string) (_ api.DividendView, retErr error) {
	ctx, span := tracer.Start(ctx, "DividendsService.List")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	// No request validator enforces the spec enum, so check it here: an unknown
	// currency is a 400, not an empty tab that looks like "no dividends".
	if !ValidCurrency(currency) {
		return api.DividendView{}, fmt.Errorf("%w: currency must be INR or EUR", ErrValidation)
	}
	txns, err := s.txns.ListDividends(ctx, userId, currency)
	if err != nil {
		logger.Error("list dividends failed", zap.Error(err))
		return api.DividendView{}, err
	}
	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		logger.Error("list holdings for dividends failed", zap.Error(err))
		return api.DividendView{}, err
	}
	return buildDividendView(txns, holdings), nil
}

// importPlan is an evaluated import: what preview shows, what confirm writes.
type importPlan struct {
	preview    api.DividendImportPreview
	fresh      []importRow
	duplicates []importRow
	aliases    map[primitive.ObjectID][]string
}

// checkImportInput rejects malformed requests (400) before any read.
func checkImportInput(input api.DividendImportInput) error {
	if !ValidCurrency(input.Currency) {
		return fmt.Errorf("%w: currency must be INR or EUR", ErrValidation)
	}
	if len(input.Rows) > maxImportRows {
		return fmt.Errorf("%w: more than %d rows — split the file", ErrValidation, maxImportRows)
	}
	return nil
}

// evaluate runs validation, name resolution, the duplicate lookup and the
// cumulative check. Reads only.
func (s *DividendsService) evaluate(ctx context.Context, userId primitive.ObjectID, input api.DividendImportInput) (importPlan, error) {
	currency := string(input.Currency)
	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		return importPlan{}, err
	}
	candidates := make([]domain.Holding, 0, len(holdings))
	for _, holding := range holdings {
		if holdingCurrency, known := CurrencyOf(holding); known && holdingCurrency == currency {
			candidates = append(candidates, holding)
		}
	}
	var mappings map[string]*string
	if input.Mappings != nil {
		mappings = *input.Mappings
	}
	names := resolveNames(countNames(input.Rows), candidates, mappings)
	byName := make(map[string]nameResolution, len(names))
	for _, resolution := range names {
		byName[resolution.view.SheetName] = resolution
	}

	today := s.today()
	var valid []importRow
	invalid := []api.DividendImportRowStatus{}
	for _, sheetRow := range input.Rows {
		name := sheetName(sheetRow.ShareName)
		reason := ""
		if name == "" {
			reason = "Share Name is empty"
		} else if err := validateDividend(sheetRow.Date.Time, sheetRow.Amount, today); err != nil {
			reason = reasonOf(err)
		} else if byName[name].holding == nil {
			reason = fmt.Sprintf("no holding chosen for %q", name)
		}
		if reason != "" {
			invalid = append(invalid, api.DividendImportRowStatus{Line: sheetRow.Line, Status: "invalid", Reason: &reason})
			continue
		}
		valid = append(valid, importRow{sheetRow: sheetRow, day: domain.UTCDate(sheetRow.Date.Time), holding: byName[name].holding})
	}

	plan := importPlan{aliases: confirmedAliases(names)}
	if len(valid) > 0 {
		from, to, holdingIds := window(valid)
		existing, err := s.txns.ListDividendsByHoldings(ctx, userId, holdingIds, from, to)
		if err != nil {
			return importPlan{}, err
		}
		plan.fresh, plan.duplicates = partition(valid, existing)
	}
	plan.preview = buildPreview(names, plan.fresh, plan.duplicates, invalid, cumulativeWarnings(input.Rows))
	return plan, nil
}

// Preview evaluates an import without writing anything (PRD-005 §7).
func (s *DividendsService) Preview(ctx context.Context, userId primitive.ObjectID, input api.DividendImportInput) (_ api.DividendImportPreview, retErr error) {
	ctx, span := tracer.Start(ctx, "DividendsService.Preview")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	if err := checkImportInput(input); err != nil {
		return api.DividendImportPreview{}, err
	}
	plan, err := s.evaluate(ctx, userId, input)
	if err != nil {
		logger.Error("dividend import preview failed", zap.Error(err))
		return api.DividendImportPreview{}, err
	}
	return plan.preview, nil
}

// ImportInvalidError carries the fresh preview when a confirm finds invalid
// rows; nothing was written. Controllers map it to 422.
type ImportInvalidError struct{ Preview api.DividendImportPreview }

func (e *ImportInvalidError) Error() string {
	return fmt.Sprintf("dividend import: %d invalid rows", e.Preview.Counts.Invalid)
}

// toTransaction builds the ledger event for a new imported dividend. The
// ObjectID is assigned here, in sheet order (DD-005 §2.2).
func (r importRow) toTransaction(userId primitive.ObjectID, batchId string, now time.Time) domain.Transaction {
	return domain.Transaction{
		ID: primitive.NewObjectID(), UserID: userId, HoldingID: r.holding.ID,
		// Same helpers as hand-entered events, so both store one format (Task 3A)
		// and one precision: cents, exactly what every total sums.
		Type: domain.TxnDividend, Date: r.day, Amount: domain.RoundCents(r.sheetRow.Amount), Currency: ledgerCurrency(*r.holding),
		Import:    &domain.ImportMeta{BatchId: batchId, Line: r.sheetRow.Line, SheetName: r.sheetRow.ShareName, SheetCumulative: r.sheetRow.Cumulative},
		CreatedAt: now, UpdatedAt: now,
	}
}

func importRowsOf(rows []importRow) []api.DividendImportRow {
	out := make([]api.DividendImportRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.sheetRow)
	}
	return out
}

// Import commits every eligible row, the confirmed aliases and the
// recomputed holding totals together, or nothing (PRD-005 §7.7).
func (s *DividendsService) Import(ctx context.Context, userId primitive.ObjectID, input api.DividendImportInput) (_ api.DividendImportResult, retErr error) {
	ctx, span := tracer.Start(ctx, "DividendsService.Import")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	if err := checkImportInput(input); err != nil {
		return api.DividendImportResult{}, err
	}
	var result api.DividendImportResult
	err := s.tx.InTransaction(ctx, func(ctx context.Context) error {
		plan, err := s.evaluate(ctx, userId, input)
		if err != nil {
			return err
		}
		if plan.preview.Counts.Invalid > 0 {
			return &ImportInvalidError{Preview: plan.preview}
		}
		batchId := primitive.NewObjectID().Hex()
		now := time.Now().UTC()
		dividends := make([]domain.Transaction, 0, len(plan.fresh))
		var affected []primitive.ObjectID
		seen := map[primitive.ObjectID]bool{}
		for _, row := range plan.fresh {
			dividends = append(dividends, row.toTransaction(userId, batchId, now))
			if !seen[row.holding.ID] {
				seen[row.holding.ID] = true
				affected = append(affected, row.holding.ID)
			}
		}
		if err := s.txns.InsertMany(ctx, dividends); err != nil {
			return err
		}
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
		result = api.DividendImportResult{Imported: len(dividends), Duplicates: importRowsOf(plan.duplicates), BatchId: batchId, Warnings: plan.preview.Warnings}
		return nil
	})
	if err != nil {
		if _, invalid := errors.AsType[*ImportInvalidError](err); !invalid {
			logger.Error("dividend import failed", zap.Error(err))
		}
		return api.DividendImportResult{}, err
	}
	logger.Info("dividends imported", zap.Int("imported", result.Imported),
		zap.Int("duplicates", len(result.Duplicates)), zap.String("batch_id", result.BatchId))
	return result, nil
}
