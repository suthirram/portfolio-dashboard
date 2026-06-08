package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/models"
	"portfolio-dashboard/services"
)

// Handler bundles all HTTP handlers
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

// ── helpers ────────────────────────────────────────────────────────────────

func respond(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondErr(w http.ResponseWriter, status int, msg string) {
	respond(w, status, map[string]string{"error": msg})
}

// ── CRUD ───────────────────────────────────────────────────────────────────

// ListHoldings GET /api/holdings
func (h *Handler) ListHoldings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "script", Value: 1}})
	cur, err := h.col().Find(ctx, bson.M{}, opts)
	if err != nil {
		respondErr(w, 500, "database error")
		return
	}
	defer cur.Close(ctx)

	var holdings []models.Holding
	if err := cur.All(ctx, &holdings); err != nil {
		respondErr(w, 500, "decode error")
		return
	}
	if holdings == nil {
		holdings = []models.Holding{}
	}
	respond(w, 200, holdings)
}

// GetHolding GET /api/holdings/{id}
func (h *Handler) GetHolding(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, 400, "invalid id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var holding models.Holding
	if err := h.col().FindOne(ctx, bson.M{"_id": id}).Decode(&holding); err != nil {
		if err == mongo.ErrNoDocuments {
			respondErr(w, 404, "not found")
		} else {
			respondErr(w, 500, "database error")
		}
		return
	}
	respond(w, 200, holding)
}

// CreateHolding POST /api/holdings
func (h *Handler) CreateHolding(w http.ResponseWriter, r *http.Request) {
	var holding models.Holding
	if err := json.NewDecoder(r.Body).Decode(&holding); err != nil {
		respondErr(w, 400, "invalid body")
		return
	}
	holding.ID = primitive.NewObjectID()
	now := time.Now()
	holding.CreatedAt = now
	holding.UpdatedAt = now

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.col().InsertOne(ctx, holding); err != nil {
		respondErr(w, 500, "insert failed")
		return
	}
	respond(w, 201, holding)
}

// UpdateHolding PUT /api/holdings/{id}
func (h *Handler) UpdateHolding(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, 400, "invalid id")
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondErr(w, 400, "invalid body")
		return
	}
	// Prevent overwriting protected fields
	delete(body, "id")
	delete(body, "_id")
	delete(body, "created_at")
	body["updated_at"] = time.Now()

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	res, err := h.col().UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": body})
	if err != nil {
		respondErr(w, 500, "update failed")
		return
	}
	if res.MatchedCount == 0 {
		respondErr(w, 404, "not found")
		return
	}

	var updated models.Holding
	h.col().FindOne(ctx, bson.M{"_id": id}).Decode(&updated)
	respond(w, 200, updated)
}

// DeleteHolding DELETE /api/holdings/{id}
func (h *Handler) DeleteHolding(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chi.URLParam(r, "id"))
	if err != nil {
		respondErr(w, 400, "invalid id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	res, err := h.col().DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		respondErr(w, 500, "delete failed")
		return
	}
	if res.DeletedCount == 0 {
		respondErr(w, 404, "not found")
		return
	}
	respond(w, 200, map[string]string{"message": "deleted"})
}

// ── Market data ────────────────────────────────────────────────────────────

// GetPrices GET /api/prices — returns all holdings enriched with live prices
func (h *Handler) GetPrices(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	cur, err := h.col().Find(ctx, bson.M{})
	if err != nil {
		respondErr(w, 500, "database error")
		return
	}
	defer cur.Close(ctx)

	var holdings []models.Holding
	cur.All(ctx, &holdings)

	// Live EUR rate (INR → EUR)
	eurRate, err := h.priceService.GetForexRate("INR", "EUR")
	if err != nil || eurRate == 0 {
		eurRate = 0.011 // fallback ~Apr 2025
	}

	results := make([]models.HoldingWithPrice, 0, len(holdings))
	for _, hld := range holdings {
		hwp := models.HoldingWithPrice{Holding: hld}
		hwp.CostPrice = hld.StocksOwned * hld.AvgCostPrice

		if hld.Symbol != "" {
			price, _, priceErr := h.priceService.GetPrice(hld.Symbol)
			if priceErr != nil {
				hwp.PriceError = priceErr.Error()
			} else {
				hwp.CurrentPrice = price
				hwp.CurrentValue = hld.StocksOwned * price
				hwp.UnrealizedPnL = hwp.CurrentValue - hwp.CostPrice
			}
		}

		hwp.CostPriceEUR = hwp.CostPrice * eurRate
		hwp.CurrentValueEUR = hwp.CurrentValue * eurRate
		hwp.UnrealizedPnLEUR = hwp.UnrealizedPnL * eurRate
		hwp.RealizedPnLEUR = hld.RealizedPnL * eurRate

		results = append(results, hwp)
	}

	respond(w, 200, models.PricesResponse{Holdings: results, EURRate: eurRate})
}

// GetSummary GET /api/summary — portfolio-level aggregates
func (h *Handler) GetSummary(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	cur, err := h.col().Find(ctx, bson.M{})
	if err != nil {
		respondErr(w, 500, "database error")
		return
	}
	defer cur.Close(ctx)

	var holdings []models.Holding
	cur.All(ctx, &holdings)

	eurRate, err := h.priceService.GetForexRate("INR", "EUR")
	if err != nil || eurRate == 0 {
		eurRate = 0.011
	}

	var summary models.Summary
	summary.EURRate = eurRate

	for _, hld := range holdings {
		cost := hld.StocksOwned * hld.AvgCostPrice
		summary.TotalCost += cost
		summary.TotalRealized += hld.RealizedPnL

		if hld.Symbol != "" && hld.StocksOwned > 0 {
			if price, _, err := h.priceService.GetPrice(hld.Symbol); err == nil {
				cv := hld.StocksOwned * price
				summary.TotalCurrentValue += cv
				summary.TotalUnrealized += cv - cost
			}
		}
	}

	summary.TotalCostEUR = summary.TotalCost * eurRate
	summary.TotalCurrentValueEUR = summary.TotalCurrentValue * eurRate
	summary.TotalUnrealizedEUR = summary.TotalUnrealized * eurRate
	summary.TotalRealizedEUR = summary.TotalRealized * eurRate

	respond(w, 200, summary)
}

// GetMarketPrice GET /api/market/price?symbol=TCS.NS
func (h *Handler) GetMarketPrice(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		respondErr(w, 400, "symbol query param required")
		return
	}
	price, currency, err := h.priceService.GetPrice(symbol)
	if err != nil {
		respondErr(w, 502, err.Error())
		return
	}
	respond(w, 200, map[string]any{
		"symbol":   symbol,
		"price":    price,
		"currency": currency,
	})
}

// GetForexRate GET /api/market/forex?from=INR&to=EUR
func (h *Handler) GetForexRate(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from == "" {
		from = "INR"
	}
	if to == "" {
		to = "EUR"
	}
	rate, err := h.priceService.GetForexRate(from, to)
	if err != nil {
		respondErr(w, 502, err.Error())
		return
	}
	respond(w, 200, map[string]any{"from": from, "to": to, "rate": rate})
}
