package services

import (
	"context"
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
	logger   *zap.Logger
	today    func() time.Time // IST calendar day; tests pin it
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
	return &DividendsService{txns: txns, holdings: holdings, logger: logger, today: istToday}
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
	preview api.DividendImportPreview
	fresh   []importRow
	dups    []importRow
	aliases map[primitive.ObjectID][]string
}

// checkImportInput rejects malformed requests (400) before any read.
func checkImportInput(in api.DividendImportInput) error {
	if !ValidCurrency(in.Currency) {
		return fmt.Errorf("%w: currency must be INR or EUR", ErrValidation)
	}
	if len(in.Rows) > maxImportRows {
		return fmt.Errorf("%w: more than %d rows — split the file", ErrValidation, maxImportRows)
	}
	return nil
}

// evaluate runs validation, name resolution, the duplicate lookup and the
// cumulative check. Reads only.
func (s *DividendsService) evaluate(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (importPlan, error) {
	currency := string(in.Currency)
	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		return importPlan{}, err
	}
	candidates := make([]domain.Holding, 0, len(holdings))
	for _, h := range holdings {
		if c, ok := CurrencyOf(h); ok && c == currency {
			candidates = append(candidates, h)
		}
	}
	var mappings map[string]*string
	if in.Mappings != nil {
		mappings = *in.Mappings
	}
	names := resolveNames(countNames(in.Rows), candidates, mappings)
	byName := make(map[string]nameResolution, len(names))
	for _, n := range names {
		byName[n.view.SheetName] = n
	}

	today := s.today()
	var valid []importRow
	invalid := []api.DividendImportRowStatus{}
	for _, r := range in.Rows {
		name := sheetName(r.ShareName)
		reason := ""
		if name == "" {
			reason = "Share Name is empty"
		} else if err := validateDividend(r.Date.Time, r.Amount, today); err != nil {
			reason = reasonOf(err)
		} else if byName[name].holding == nil {
			reason = fmt.Sprintf("no holding chosen for %q", name)
		}
		if reason != "" {
			invalid = append(invalid, api.DividendImportRowStatus{Line: r.Line, Status: "invalid", Reason: &reason})
			continue
		}
		valid = append(valid, importRow{in: r, day: domain.UTCDate(r.Date.Time), holding: byName[name].holding})
	}

	plan := importPlan{aliases: confirmedAliases(names)}
	if len(valid) > 0 {
		from, to, holdingIds := window(valid)
		existing, err := s.txns.ListDividendsByHoldings(ctx, userId, holdingIds, from, to)
		if err != nil {
			return importPlan{}, err
		}
		plan.fresh, plan.dups = partition(valid, existing)
	}
	plan.preview = buildPreview(names, plan.fresh, plan.dups, invalid, cumulativeWarnings(in.Rows))
	return plan, nil
}

// Preview evaluates an import without writing anything (PRD-005 §7).
func (s *DividendsService) Preview(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (_ api.DividendImportPreview, retErr error) {
	ctx, span := tracer.Start(ctx, "DividendsService.Preview")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	if err := checkImportInput(in); err != nil {
		return api.DividendImportPreview{}, err
	}
	plan, err := s.evaluate(ctx, userId, in)
	if err != nil {
		logger.Error("dividend import preview failed", zap.Error(err))
		return api.DividendImportPreview{}, err
	}
	return plan.preview, nil
}
