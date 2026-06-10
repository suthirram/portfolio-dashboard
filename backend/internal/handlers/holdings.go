package handlers

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func (h *Handler) ListHoldings(ctx context.Context, _ api.ListHoldingsRequestObject) (api.ListHoldingsResponseObject, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "script", Value: 1}})
	cur, err := h.col().Find(dbCtx, bson.M{}, opts)
	if err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "list holdings query failed", slog.String("error", err.Error()))
		return nil, err
	}
	defer cur.Close(dbCtx)

	var holdings []domain.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "list holdings decode failed", slog.String("error", err.Error()))
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

	var holding domain.Holding
	if err := h.col().FindOne(dbCtx, bson.M{"_id": id}).Decode(&holding); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.GetHolding404JSONResponse{}, nil
		}
		h.reqLog(ctx).ErrorContext(ctx, "get holding failed",
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
		h.reqLog(ctx).ErrorContext(ctx, "create holding failed",
			slog.String("script", holding.Script),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	h.reqLog(ctx).InfoContext(ctx, "holding created",
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
		update = append(update, bson.E{Key: "currency", Value: string(*input.Currency)})
	}
	if input.Notes != nil {
		update = append(update, bson.E{Key: "notes", Value: *input.Notes})
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := h.col().UpdateOne(dbCtx, bson.M{"_id": id}, bson.M{"$set": update})
	if err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "update holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	if res.MatchedCount == 0 {
		return api.UpdateHolding404JSONResponse{}, nil
	}

	var updated domain.Holding
	if err := h.col().FindOne(dbCtx, bson.M{"_id": id}).Decode(&updated); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "update holding re-read failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	h.reqLog(ctx).InfoContext(ctx, "holding updated", slog.String("id", request.Id))
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
		h.reqLog(ctx).ErrorContext(ctx, "delete holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	if res.DeletedCount == 0 {
		return api.DeleteHolding404JSONResponse{}, nil
	}
	h.reqLog(ctx).InfoContext(ctx, "holding deleted", slog.String("id", request.Id))
	msg := "deleted"
	return api.DeleteHolding200JSONResponse{Message: &msg}, nil
}
