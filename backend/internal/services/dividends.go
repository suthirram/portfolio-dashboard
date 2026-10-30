package services

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
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
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
	return &DividendsService{txns: txns, holdings: holdings, logger: logger}
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
