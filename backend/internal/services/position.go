package services

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// recomputeAndPersist replays a holding's full ledger (average cost) and writes
// the derived position (stocks_owned, avg_cost_price, realized_pnl,
// total_dividends) back to the holdings doc, returning the updated holding.
//
// When the ledger oversells (a sell exceeds shares held at that point) it
// returns ErrOversell WITHOUT persisting, so the caller can roll back the
// offending write and reject it. Shared by HoldingsService (opening-balance
// override) and TransactionsService (every ledger mutation).
func recomputeAndPersist(ctx context.Context, holdings *persistence.HoldingStore, txns *persistence.TransactionStore, uid, holdingID primitive.ObjectID) (domain.Holding, error) {
	list, err := txns.ListByHolding(ctx, uid, holdingID)
	if err != nil {
		return domain.Holding{}, err
	}
	pos, err := RecomputePosition(list)
	if err != nil {
		// oversell — leave the holding untouched; caller rolls back
		return domain.Holding{}, err
	}
	set := bson.D{
		{Key: "stocks_owned", Value: pos.StocksOwned},
		{Key: "avg_cost_price", Value: pos.AvgCostPrice},
		{Key: "realized_pnl", Value: pos.RealizedPnL},
		{Key: "total_dividends", Value: pos.TotalDividends},
		{Key: "updated_at", Value: time.Now()},
	}
	return holdings.UpdateScopedAndReturn(ctx, uid, holdingID, set)
}
