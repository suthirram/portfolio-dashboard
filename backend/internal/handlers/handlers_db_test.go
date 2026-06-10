package handlers

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
)

// newIntegrationHandler builds a Handler backed by the mtest mock database.
func newIntegrationHandler(mt *mtest.T, ps priceFetcher) *Handler {
	return &Handler{db: mt.DB, priceService: ps}
}

// ── CreateHolding ──────────────────────────────────────────────────────────

func TestIntegration_CreateHolding_INR(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("INR holding returned with currency INR", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		h := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{}})

		sym := "TCS.NS"
		qty := 10.0
		avg := 3000.0
		resp, err := h.CreateHolding(context.Background(), api.CreateHoldingRequestObject{
			Body: &api.HoldingInput{
				Script:       "TCS",
				Exchange:     "NSE",
				Type:         "stock",
				Symbol:       &sym,
				StocksOwned:  &qty,
				AvgCostPrice: &avg,
			},
		})
		if err != nil {
			t.Fatalf("CreateHolding: %v", err)
		}
		created := resp.(api.CreateHolding201JSONResponse)
		if *created.Currency != "INR" {
			t.Errorf("Currency = %q, want INR", *created.Currency)
		}
		if *created.Script != "TCS" {
			t.Errorf("Script = %q, want TCS", *created.Script)
		}
		if *created.AvgCostPrice != 3000.0 {
			t.Errorf("AvgCostPrice = %v, want 3000", *created.AvgCostPrice)
		}
	})
}

func TestIntegration_CreateHolding_EUR(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("EUR holding returned with currency EUR", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		h := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{}})

		sym := "VWCE.DE"
		qty := 5.0
		avg := 100.0
		cur := api.HoldingInputCurrency("EUR")
		resp, err := h.CreateHolding(context.Background(), api.CreateHoldingRequestObject{
			Body: &api.HoldingInput{
				Script:       "VWCE",
				Exchange:     "OTHER",
				Type:         "etf",
				Symbol:       &sym,
				StocksOwned:  &qty,
				AvgCostPrice: &avg,
				Currency:     &cur,
			},
		})
		if err != nil {
			t.Fatalf("CreateHolding: %v", err)
		}
		created := resp.(api.CreateHolding201JSONResponse)
		if *created.Currency != "EUR" {
			t.Errorf("Currency = %q, want EUR", *created.Currency)
		}
	})
}

// ── ListHoldings ───────────────────────────────────────────────────────────

func TestIntegration_ListHoldings_ReturnsCurrencyField(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("currency field present in list response", func(mt *mtest.T) {
		id1 := primitive.NewObjectID()
		id2 := primitive.NewObjectID()
		ns := mt.DB.Name() + ".holdings"

		mt.AddMockResponses(
			mtest.CreateCursorResponse(1, ns, mtest.FirstBatch,
				bson.D{
					{Key: "_id", Value: id1},
					{Key: "script", Value: "TCS"},
					{Key: "symbol", Value: "TCS.NS"},
					{Key: "exchange", Value: "NSE"},
					{Key: "type", Value: "stock"},
					{Key: "stocks_owned", Value: 10.0},
					{Key: "avg_cost_price", Value: 3000.0},
					{Key: "realized_pnl", Value: 0.0},
					{Key: "currency", Value: "INR"},
				},
				bson.D{
					{Key: "_id", Value: id2},
					{Key: "script", Value: "VWCE"},
					{Key: "symbol", Value: "VWCE.DE"},
					{Key: "exchange", Value: "OTHER"},
					{Key: "type", Value: "etf"},
					{Key: "stocks_owned", Value: 5.0},
					{Key: "avg_cost_price", Value: 100.0},
					{Key: "realized_pnl", Value: 0.0},
					{Key: "currency", Value: "EUR"},
				},
			),
			mtest.CreateCursorResponse(0, ns, mtest.NextBatch),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{}})

		resp, err := h.ListHoldings(context.Background(), api.ListHoldingsRequestObject{})
		if err != nil {
			t.Fatalf("ListHoldings: %v", err)
		}
		list := resp.(api.ListHoldings200JSONResponse)

		if len(list) != 2 {
			t.Fatalf("expected 2 holdings, got %d", len(list))
		}

		byScript := map[string]string{}
		for _, h := range list {
			byScript[*h.Script] = string(*h.Currency)
		}
		if byScript["TCS"] != "INR" {
			t.Errorf("TCS currency = %q, want INR", byScript["TCS"])
		}
		if byScript["VWCE"] != "EUR" {
			t.Errorf("VWCE currency = %q, want EUR", byScript["VWCE"])
		}
	})
}

// ── UpdateHolding ──────────────────────────────────────────────────────────

func TestIntegration_UpdateHolding_CurrencyPersistedAndReturned(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("update sets currency to EUR", func(mt *mtest.T) {
		id := primitive.NewObjectID()
		ns := mt.DB.Name() + ".holdings"

		// UpdateOne success + FindOne for the re-read
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(bson.E{Key: "nModified", Value: 1}, bson.E{Key: "n", Value: 1}),
			mtest.CreateCursorResponse(0, ns, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: id},
				{Key: "script", Value: "VWCE"},
				{Key: "exchange", Value: "OTHER"},
				{Key: "type", Value: "etf"},
				{Key: "currency", Value: "EUR"},
			}),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{}})

		cur := api.HoldingInputCurrency("EUR")
		resp, err := h.UpdateHolding(context.Background(), api.UpdateHoldingRequestObject{
			Id: id.Hex(),
			Body: &api.HoldingInput{
				Script:   "VWCE",
				Exchange: "OTHER",
				Type:     "etf",
				Currency: &cur,
			},
		})
		if err != nil {
			t.Fatalf("UpdateHolding: %v", err)
		}
		updated := resp.(api.UpdateHolding200JSONResponse)
		if *updated.Currency != "EUR" {
			t.Errorf("Currency = %q, want EUR", *updated.Currency)
		}
	})
}

// ── GetSummary ─────────────────────────────────────────────────────────────

func TestIntegration_GetSummary_MixedCurrenciesNormalisedToINR(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("EUR holdings converted to INR for totals", func(mt *mtest.T) {
		id1 := primitive.NewObjectID()
		id2 := primitive.NewObjectID()
		ns := mt.DB.Name() + ".holdings"

		mt.AddMockResponses(
			mtest.CreateCursorResponse(1, ns, mtest.FirstBatch,
				// INR holding: 10 shares × ₹3000 avg = ₹30 000 cost
				bson.D{
					{Key: "_id", Value: id1},
					{Key: "script", Value: "TCS"},
					{Key: "symbol", Value: "TCS.NS"},
					{Key: "exchange", Value: "NSE"},
					{Key: "type", Value: "stock"},
					{Key: "stocks_owned", Value: 10.0},
					{Key: "avg_cost_price", Value: 3000.0},
					{Key: "realized_pnl", Value: 0.0},
					{Key: "currency", Value: "INR"},
				},
				// EUR holding: 5 shares × €100 avg = €500 cost → ₹45 454.5 at 0.011
				bson.D{
					{Key: "_id", Value: id2},
					{Key: "script", Value: "VWCE"},
					{Key: "symbol", Value: "VWCE.DE"},
					{Key: "exchange", Value: "OTHER"},
					{Key: "type", Value: "etf"},
					{Key: "stocks_owned", Value: 5.0},
					{Key: "avg_cost_price", Value: 100.0},
					{Key: "realized_pnl", Value: 0.0},
					{Key: "currency", Value: "EUR"},
				},
			),
			mtest.CreateCursorResponse(0, ns, mtest.NextBatch),
		)

		const eurRate = 0.011
		ps := &mockPriceFetcher{
			forexRate: eurRate,
			prices: map[string]float64{
				"TCS.NS":  3600.0, // current INR price
				"VWCE.DE": 120.0,  // current EUR price
			},
		}

		h := newIntegrationHandler(mt, ps)

		resp, err := h.GetSummary(context.Background(), api.GetSummaryRequestObject{})
		if err != nil {
			t.Fatalf("GetSummary: %v", err)
		}
		summary := resp.(api.GetSummary200JSONResponse)

		// total_cost (INR) = 30 000  +  500/0.011 ≈ 75 454.5
		wantCost := 30000.0 + 500.0/eurRate
		if !approxEqual(*summary.TotalCost, wantCost) {
			t.Errorf("TotalCost = %v, want ≈%v", *summary.TotalCost, wantCost)
		}

		// total_current_value (INR) = 36 000  +  600/0.011 ≈ 90 545.5
		wantCV := 36000.0 + 600.0/eurRate
		if !approxEqual(*summary.TotalCurrentValue, wantCV) {
			t.Errorf("TotalCurrentValue = %v, want ≈%v", *summary.TotalCurrentValue, wantCV)
		}

		// total_unrealized (INR) = 6 000  +  100/0.011 ≈ 15 090.9
		wantUnrealized := 6000.0 + 100.0/eurRate
		if !approxEqual(*summary.TotalUnrealized, wantUnrealized) {
			t.Errorf("TotalUnrealized = %v, want ≈%v", *summary.TotalUnrealized, wantUnrealized)
		}
	})
}
