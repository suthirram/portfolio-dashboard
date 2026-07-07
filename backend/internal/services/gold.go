package services

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"go.uber.org/zap"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// ErrInvalidGoldTransaction flags a request body that fails the entered-field
// rules (PRD-003 §5); controllers map it to 400.
var ErrInvalidGoldTransaction = errors.New("gold: invalid transaction")

// goldGstRate is the flat 3% applied to both the gold cost and the quoted
// rate (PRD-003 §9.3).
const goldGstRate = 0.03

// GoldService owns the gold use cases (DD-003 §2): owner-scoped CRUD over
// the Postgres store returning API views with computed columns, the daily
// price series, and the live metrics table (which folds in the GOLDBEES
// holdings via the stock stores). Construction implies a live gold store —
// when Postgres is not configured the Controller has no GoldService and
// answers 503 before reaching here.
type GoldService struct {
	store    *persistence.GoldDao
	holdings *persistence.HoldingStore
	prices   PriceFetcher
	logger   *zap.Logger
}

// NewGoldService wires the gold service. holdings + prices serve only the
// metrics table's GOLDBEES row (DD-003 §3).
func NewGoldService(store *persistence.GoldDao, holdings *persistence.HoldingStore, prices PriceFetcher, logger *zap.Logger) *GoldService {
	return &GoldService{store: store, holdings: holdings, prices: prices, logger: logger}
}

// ListTransactions returns uid's purchases newest-first with computed
// columns (the store replays oldest-first for ledger work; the page wants
// the latest buy on top).
func (s *GoldService) ListTransactions(ctx context.Context, uid string) ([]api.GoldTransaction, error) {
	rows, err := s.store.ListTransactions(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]api.GoldTransaction, 0, len(rows))
	for _, row := range slices.Backward(rows) {
		out = append(out, goldTransactionToAPI(row))
	}
	return out, nil
}

// CreateTransaction validates and stores a purchase for uid.
func (s *GoldService) CreateTransaction(ctx context.Context, uid string, input api.GoldTransactionInput) (api.GoldTransaction, error) {
	if err := validateGoldInput(input); err != nil {
		return api.GoldTransaction{}, err
	}
	stored, err := s.store.InsertTransaction(ctx, goldTransactionFromInput(uid, input))
	if err != nil {
		return api.GoldTransaction{}, err
	}
	return goldTransactionToAPI(stored), nil
}

// UpdateTransaction rewrites uid's purchase id with input's entered fields.
// found is false when the row does not exist or belongs to someone else.
func (s *GoldService) UpdateTransaction(ctx context.Context, uid string, id int64, input api.GoldTransactionInput) (api.GoldTransaction, bool, error) {
	if err := validateGoldInput(input); err != nil {
		return api.GoldTransaction{}, false, err
	}
	stored, err := s.store.UpdateTransaction(ctx, uid, id, goldTransactionFromInput(uid, input))
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.GoldTransaction{}, false, nil
		}
		return api.GoldTransaction{}, false, err
	}
	return goldTransactionToAPI(stored), true, nil
}

// DeleteTransaction removes uid's purchase id; found is false when nothing
// matched.
func (s *GoldService) DeleteTransaction(ctx context.Context, uid string, id int64) (bool, error) {
	return s.store.DeleteTransaction(ctx, uid, id)
}

// computeColumns derives the read-only columns from a purchase's entered
// fields (PRD-003 §5, formulas §9 — spreadsheet-pinned in gold_test.go).
func computeColumns(t domain.GoldTransaction) domain.GoldComputed {
	c := domain.GoldComputed{
		GoldCost:    t.GmPrice * t.GramsBought,
		NettPerGram: t.ActualPaid / t.GramsBought,
	}
	c.GstOnCost = c.GoldCost * goldGstRate
	c.TotalExpected = c.GoldCost + c.GstOnCost
	c.NimmiLoss = t.ActualPaid - c.GoldCost
	if t.QuotePrice != nil {
		v := *t.QuotePrice * goldGstRate
		c.GstOnQuote = &v
	}
	if t.BillAmount != nil {
		v := *t.BillAmount - t.ActualPaid
		c.NettReduction = &v
	}
	return c
}

// validateGoldInput enforces the entered-field rules: the two factors of
// the gold cost must be positive, money fields non-negative.
func validateGoldInput(in api.GoldTransactionInput) error {
	if in.Date.IsZero() {
		return fmt.Errorf("%w: date is required", ErrInvalidGoldTransaction)
	}
	if in.GmPrice <= 0 {
		return fmt.Errorf("%w: gm_price must be > 0", ErrInvalidGoldTransaction)
	}
	if in.GramsBought <= 0 {
		return fmt.Errorf("%w: grams_bought must be > 0", ErrInvalidGoldTransaction)
	}
	if in.ActualPaid < 0 {
		return fmt.Errorf("%w: actual_paid must be >= 0", ErrInvalidGoldTransaction)
	}
	// chennai_rate is a free-text remark — never validated as a number.
	for name, v := range map[string]*float64{
		"quote_price":   in.QuotePrice,
		"bill_amount":   in.BillAmount,
		"billed_weight": in.BilledWeight,
	} {
		if v != nil && *v < 0 {
			return fmt.Errorf("%w: %s must be >= 0", ErrInvalidGoldTransaction, name)
		}
	}
	return nil
}

// goldTransactionFromInput maps entered API fields onto the storage struct.
func goldTransactionFromInput(uid string, in api.GoldTransactionInput) domain.GoldTransaction {
	return domain.GoldTransaction{
		UserID:       uid,
		Date:         in.Date.Time,
		GmPrice:      in.GmPrice,
		GramsBought:  in.GramsBought,
		QuotePrice:   in.QuotePrice,
		BillAmount:   in.BillAmount,
		ActualPaid:   in.ActualPaid,
		BilledWeight: in.BilledWeight,
		ChennaiRate:  in.ChennaiRate,
	}
}

// goldTransactionToAPI joins the stored row with its computed columns.
func goldTransactionToAPI(t domain.GoldTransaction) api.GoldTransaction {
	c := computeColumns(t)
	return api.GoldTransaction{
		Id:            t.ID,
		Date:          openapi_types.Date{Time: t.Date},
		GmPrice:       t.GmPrice,
		GramsBought:   t.GramsBought,
		QuotePrice:    t.QuotePrice,
		BillAmount:    t.BillAmount,
		ActualPaid:    t.ActualPaid,
		BilledWeight:  t.BilledWeight,
		ChennaiRate:   t.ChennaiRate,
		GoldCost:      c.GoldCost,
		GstOnCost:     c.GstOnCost,
		TotalExpected: c.TotalExpected,
		GstOnQuote:    c.GstOnQuote,
		NettPerGram:   c.NettPerGram,
		NettReduction: c.NettReduction,
		NimmiLoss:     c.NimmiLoss,
	}
}
