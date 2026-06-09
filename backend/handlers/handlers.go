package handlers

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/api"
	"portfolio-dashboard/models"
	"portfolio-dashboard/services"
)

// Handler implements api.StrictServerInterface.
type Handler struct {
	db           *mongo.Database
	priceService *services.PriceService
}

func New(db *mongo.Database) *Handler {
	return &Handler{
		db:           db,
		priceService: services.NewPriceService(),
	}
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
		return nil, err
	}
	defer cur.Close(dbCtx)

	var holdings []models.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		return nil, err
	}

	out := make(api.ListHoldings200JSONResponse, 0, len(holdings))
	for _, h := range holdings {
		out = append(out, holdingToAPI(h))
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
		if err == mongo.ErrNoDocuments {
			return api.GetHolding404JSONResponse{}, nil
		}
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
		return nil, err
	}
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
	if input.Notes != nil {
		update = append(update, bson.E{Key: "notes", Value: *input.Notes})
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := h.col().UpdateOne(dbCtx, bson.M{"_id": id}, bson.M{"$set": update})
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return api.UpdateHolding404JSONResponse{}, nil
	}

	var updated models.Holding
	h.col().FindOne(dbCtx, bson.M{"_id": id}).Decode(&updated)
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
		return nil, err
	}
	if res.DeletedCount == 0 {
		return api.DeleteHolding404JSONResponse{}, nil
	}
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
	cur.All(dbCtx, &holdings)

	eurRate, err := h.priceService.GetForexRate("INR", "EUR")
	if err != nil || eurRate == 0 {
		eurRate = 0.011
	}

	results := make([]api.HoldingWithPrice, 0, len(holdings))
	for _, hld := range holdings {
		hwp := holdingWithPriceToAPI(hld, h.priceService, eurRate)
		results = append(results, hwp)
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
	cur.All(dbCtx, &holdings)

	eurRate, err := h.priceService.GetForexRate("INR", "EUR")
	if err != nil || eurRate == 0 {
		eurRate = 0.011
	}

	var totalCost, totalCurrentValue, totalUnrealized, totalRealized float64
	for _, hld := range holdings {
		cost := hld.StocksOwned * hld.AvgCostPrice
		totalCost += cost
		totalRealized += hld.RealizedPnL

		if hld.Symbol != "" && hld.StocksOwned > 0 {
			if price, _, err := h.priceService.GetPrice(hld.Symbol); err == nil {
				cv := hld.StocksOwned * price
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

func (h *Handler) GetMarketPrice(_ context.Context, request api.GetMarketPriceRequestObject) (api.GetMarketPriceResponseObject, error) {
	symbol := request.Params.Symbol
	price, currency, err := h.priceService.GetPrice(symbol)
	if err != nil {
		errMsg := err.Error()
		return api.GetMarketPrice502JSONResponse{BadGatewayJSONResponse: api.BadGatewayJSONResponse{Error: &errMsg}}, nil
	}
	return api.GetMarketPrice200JSONResponse{Symbol: &symbol, Price: &price, Currency: &currency}, nil
}

func (h *Handler) GetForexRate(_ context.Context, request api.GetForexRateRequestObject) (api.GetForexRateResponseObject, error) {
	from := "INR"
	to := "EUR"
	if request.Params.From != nil {
		from = *request.Params.From
	}
	if request.Params.To != nil {
		to = *request.Params.To
	}

	rate, err := h.priceService.GetForexRate(from, to)
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

// ── Conversion helpers ─────────────────────────────────────────────────────

func holdingToAPI(h models.Holding) api.Holding {
	id := h.ID.Hex()
	exchange := api.HoldingExchange(h.Exchange)
	holdingType := api.HoldingType(h.Type)
	return api.Holding{
		Id:           &id,
		Script:       &h.Script,
		Symbol:       &h.Symbol,
		Exchange:     &exchange,
		Type:         &holdingType,
		StocksOwned:  &h.StocksOwned,
		AvgCostPrice: &h.AvgCostPrice,
		RealizedPnl:  &h.RealizedPnL,
		Notes:        &h.Notes,
		CreatedAt:    &h.CreatedAt,
		UpdatedAt:    &h.UpdatedAt,
	}
}

func holdingFromInput(input api.HoldingInput) models.Holding {
	h := models.Holding{
		Script:   input.Script,
		Exchange: string(input.Exchange),
		Type:     string(input.Type),
	}
	if input.Symbol != nil {
		h.Symbol = *input.Symbol
	}
	if input.StocksOwned != nil {
		h.StocksOwned = *input.StocksOwned
	}
	if input.AvgCostPrice != nil {
		h.AvgCostPrice = *input.AvgCostPrice
	}
	if input.RealizedPnl != nil {
		h.RealizedPnL = *input.RealizedPnl
	}
	if input.Notes != nil {
		h.Notes = *input.Notes
	}
	return h
}

func holdingWithPriceToAPI(hld models.Holding, ps *services.PriceService, eurRate float64) api.HoldingWithPrice {
	costPrice := hld.StocksOwned * hld.AvgCostPrice
	costPriceEUR := costPrice * eurRate
	realizedPnLEUR := hld.RealizedPnL * eurRate

	hwp := api.HoldingWithPrice{
		Id:             ptr(hld.ID.Hex()),
		Script:         &hld.Script,
		Symbol:         &hld.Symbol,
		Exchange:       (*api.HoldingWithPriceExchange)(&hld.Exchange),
		Type:           (*api.HoldingWithPriceType)(&hld.Type),
		StocksOwned:    &hld.StocksOwned,
		AvgCostPrice:   &hld.AvgCostPrice,
		RealizedPnl:    &hld.RealizedPnL,
		Notes:          &hld.Notes,
		CreatedAt:      &hld.CreatedAt,
		UpdatedAt:      &hld.UpdatedAt,
		CostPrice:      &costPrice,
		CostPriceEur:   &costPriceEUR,
		RealizedPnlEur: &realizedPnLEUR,
	}

	if hld.Symbol != "" {
		price, _, priceErr := ps.GetPrice(hld.Symbol)
		if priceErr != nil {
			errMsg := priceErr.Error()
			hwp.PriceError = &errMsg
		} else {
			currentValue := hld.StocksOwned * price
			unrealizedPnL := currentValue - costPrice
			currentValueEUR := currentValue * eurRate
			unrealizedPnLEUR := unrealizedPnL * eurRate

			hwp.CurrentPrice = &price
			hwp.CurrentValue = &currentValue
			hwp.UnrealizedPnl = &unrealizedPnL
			hwp.CurrentValueEur = &currentValueEUR
			hwp.UnrealizedPnlEur = &unrealizedPnLEUR
		}
	}

	return hwp
}

func ptr[T any](v T) *T { return &v }
