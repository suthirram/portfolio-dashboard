// Package handlers implements the strict OpenAPI server interface.
package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/api"
	"portfolio-dashboard/models"
	"portfolio-dashboard/services"
)

// priceFetcher abstracts PriceService for testing.
type priceFetcher interface {
	GetPrice(ctx context.Context, symbol string) (float64, string, error)
	GetForexRate(ctx context.Context, from, to string) (float64, error)
}

// Handler implements api.StrictServerInterface.
type Handler struct {
	db           *mongo.Database
	priceService priceFetcher
	logger       *slog.Logger
}

// New builds a Handler with the default PriceService.
func New(db *mongo.Database, logger *slog.Logger) *Handler {
	return &Handler{
		db:           db,
		priceService: services.NewPriceService(logger),
		logger:       logger,
	}
}

func (h *Handler) log() *slog.Logger {
	if h.logger == nil {
		return slog.New(slog.DiscardHandler)
	}
	return h.logger
}

func (h *Handler) col() *mongo.Collection {
	return h.db.Collection("holdings")
}

// ── CRUD ───────────────────────────────────────────────────────────────────

func (h *Handler) ListHoldings(ctx context.Context, _ api.ListHoldingsRequestObject) (api.ListHoldingsResponseObject, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "script", Value: 1}})
	cur, err := h.col().Find(dbCtx, bson.M{}, opts)
	if err != nil {
		h.log().ErrorContext(ctx, "list holdings query failed", slog.String("error", err.Error()))
		return nil, err
	}
	defer cur.Close(dbCtx)

	var holdings []models.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		h.log().ErrorContext(ctx, "list holdings decode failed", slog.String("error", err.Error()))
		return nil, err
	}

	out := make(api.ListHoldings200JSONResponse, 0, len(holdings))
	for _, hld := range holdings {
		out = append(out, holdingToAPI(hld))
	}
	return out, nil
}

func (h *Handler) GetHolding(ctx context.Context, request api.GetHoldingRequestObject) (api.GetHoldingResponseObject, error) {
	id, err := primitive.ObjectIDFromHex(request.Id)
	if err != nil {
		return api.GetHolding404JSONResponse{}, nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var holding models.Holding
	if err := h.col().FindOne(dbCtx, bson.M{"_id": id}).Decode(&holding); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.GetHolding404JSONResponse{}, nil
		}
		h.log().ErrorContext(ctx, "get holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	resp := api.GetHolding200JSONResponse(holdingToAPI(holding))
	return resp, nil
}

func (h *Handler) CreateHolding(ctx context.Context, request api.CreateHoldingRequestObject) (api.CreateHoldingResponseObject, error) {
	holding := holdingFromInput(*request.Body)
	holding.ID = primitive.NewObjectID()
	now := time.Now()
	holding.CreatedAt = now
	holding.UpdatedAt = now

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if _, err := h.col().InsertOne(dbCtx, holding); err != nil {
		h.log().ErrorContext(ctx, "create holding failed",
			slog.String("script", holding.Script),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	h.log().InfoContext(ctx, "holding created",
		slog.String("id", holding.ID.Hex()),
		slog.String("script", holding.Script),
		slog.String("currency", holding.Currency),
	)
	resp := api.CreateHolding201JSONResponse(holdingToAPI(holding))
	return resp, nil
}

func (h *Handler) UpdateHolding(ctx context.Context, request api.UpdateHoldingRequestObject) (api.UpdateHoldingResponseObject, error) {
	id, err := primitive.ObjectIDFromHex(request.Id)
	if err != nil {
		return api.UpdateHolding404JSONResponse{}, nil
	}

	input := request.Body
	update := bson.D{
		{Key: "script", Value: input.Script},
		{Key: "exchange", Value: string(input.Exchange)},
		{Key: "type", Value: string(input.Type)},
		{Key: "updated_at", Value: time.Now()},
	}
	if input.Symbol != nil {
		update = append(update, bson.E{Key: "symbol", Value: *input.Symbol})
	}
	if input.StocksOwned != nil {
		update = append(update, bson.E{Key: "stocks_owned", Value: *input.StocksOwned})
	}
	if input.AvgCostPrice != nil {
		update = append(update, bson.E{Key: "avg_cost_price", Value: *input.AvgCostPrice})
	}
	if input.RealizedPnl != nil {
		update = append(update, bson.E{Key: "realized_pnl", Value: *input.RealizedPnl})
	}
	if input.Currency != nil && validCurrency(*input.Currency) {
		update = append(update, bson.E{Key: "currency", Value: *input.Currency})
	}
	if input.Notes != nil {
		update = append(update, bson.E{Key: "notes", Value: *input.Notes})
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := h.col().UpdateOne(dbCtx, bson.M{"_id": id}, bson.M{"$set": update})
	if err != nil {
		h.log().ErrorContext(ctx, "update holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	if res.MatchedCount == 0 {
		return api.UpdateHolding404JSONResponse{}, nil
	}

	var updated models.Holding
	if err := h.col().FindOne(dbCtx, bson.M{"_id": id}).Decode(&updated); err != nil {
		h.log().ErrorContext(ctx, "update holding re-read failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	h.log().InfoContext(ctx, "holding updated", slog.String("id", request.Id))
	resp := api.UpdateHolding200JSONResponse(holdingToAPI(updated))
	return resp, nil
}

func (h *Handler) DeleteHolding(ctx context.Context, request api.DeleteHoldingRequestObject) (api.DeleteHoldingResponseObject, error) {
	id, err := primitive.ObjectIDFromHex(request.Id)
	if err != nil {
		return api.DeleteHolding404JSONResponse{}, nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := h.col().DeleteOne(dbCtx, bson.M{"_id": id})
	if err != nil {
		h.log().ErrorContext(ctx, "delete holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	if res.DeletedCount == 0 {
		return api.DeleteHolding404JSONResponse{}, nil
	}
	h.log().InfoContext(ctx, "holding deleted", slog.String("id", request.Id))
	msg := "deleted"
	return api.DeleteHolding200JSONResponse{Message: &msg}, nil
}

// ── Market data ────────────────────────────────────────────────────────────

func (h *Handler) GetPrices(ctx context.Context, _ api.GetPricesRequestObject) (api.GetPricesResponseObject, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cur, err := h.col().Find(dbCtx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(dbCtx)

	var holdings []models.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		return nil, err
	}

	eurRate, err := h.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		if err == nil {
			err = errors.New("EUR rate is zero")
		}
		h.log().ErrorContext(ctx, "EUR rate fetch failed", slog.String("error", err.Error()))
		return nil, fmt.Errorf("fetching EUR rate: %w", err)
	}

	results := make([]api.HoldingWithPrice, 0, len(holdings))
	for _, hld := range holdings {
		results = append(results, holdingWithPriceToAPI(ctx, hld, h.priceService, eurRate))
	}

	return api.GetPrices200JSONResponse{Holdings: &results, EurRate: &eurRate}, nil
}

func (h *Handler) GetSummary(ctx context.Context, _ api.GetSummaryRequestObject) (api.GetSummaryResponseObject, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cur, err := h.col().Find(dbCtx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cur.Close(dbCtx)

	var holdings []models.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		return nil, err
	}

	eurRate, err := h.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		h.log().WarnContext(ctx, "EUR rate unavailable, using fallback",
			slog.Float64("fallback", 0.011),
		)
		eurRate = 0.011
	}

	var totalCost, totalCurrentValue, totalUnrealized, totalRealized float64
	for _, hld := range holdings {
		isEUR := hld.Currency == "EUR"

		var cost, realized float64
		if isEUR {
			cost = (hld.StocksOwned * hld.AvgCostPrice) / eurRate
			realized = hld.RealizedPnL / eurRate
		} else {
			cost = hld.StocksOwned * hld.AvgCostPrice
			realized = hld.RealizedPnL
		}
		totalCost += cost
		totalRealized += realized

		if hld.Symbol != "" && hld.StocksOwned > 0 {
			if price, _, err := h.priceService.GetPrice(ctx, hld.Symbol); err == nil {
				var cv float64
				if isEUR {
					cv = (hld.StocksOwned * price) / eurRate
				} else {
					cv = hld.StocksOwned * price
				}
				totalCurrentValue += cv
				totalUnrealized += cv - cost
			}
		}
	}

	totalCostEUR := totalCost * eurRate
	totalCurrentValueEUR := totalCurrentValue * eurRate
	totalUnrealizedEUR := totalUnrealized * eurRate
	totalRealizedEUR := totalRealized * eurRate

	return api.GetSummary200JSONResponse{
		TotalCost:            &totalCost,
		TotalCurrentValue:    &totalCurrentValue,
		TotalUnrealized:      &totalUnrealized,
		TotalRealized:        &totalRealized,
		TotalCostEur:         &totalCostEUR,
		TotalCurrentValueEur: &totalCurrentValueEUR,
		TotalUnrealizedEur:   &totalUnrealizedEUR,
		TotalRealizedEur:     &totalRealizedEUR,
		EurRate:              &eurRate,
	}, nil
}

func (h *Handler) GetMarketPrice(ctx context.Context, request api.GetMarketPriceRequestObject) (api.GetMarketPriceResponseObject, error) {
	symbol := request.Params.Symbol
	price, currency, err := h.priceService.GetPrice(ctx, symbol)
	if err != nil {
		errMsg := err.Error()
		return api.GetMarketPrice502JSONResponse{BadGatewayJSONResponse: api.BadGatewayJSONResponse{Error: &errMsg}}, nil
	}
	return api.GetMarketPrice200JSONResponse{Symbol: &symbol, Price: &price, Currency: &currency}, nil
}

func (h *Handler) GetForexRate(ctx context.Context, request api.GetForexRateRequestObject) (api.GetForexRateResponseObject, error) {
	from := "INR"
	to := "EUR"
	if request.Params.From != nil {
		from = *request.Params.From
	}
	if request.Params.To != nil {
		to = *request.Params.To
	}

	rate, err := h.priceService.GetForexRate(ctx, from, to)
	if err != nil {
		errMsg := err.Error()
		return nil, &forexError{errMsg}
	}
	return api.GetForexRate200JSONResponse{From: &from, To: &to, Rate: &rate}, nil
}

// forexError surfaces a 502 for upstream failures on the forex endpoint.
// The spec doesn't define a 502 for GetForexRate, so we use a plain error
// which becomes a 500 via the strict handler's ResponseErrorHandlerFunc.
type forexError struct{ msg string }

func (e *forexError) Error() string { return e.msg }
