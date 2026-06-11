package httpserver

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/handlers"
)

func TestAPI_CreateThenListHoldingsJourney(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("create then list through HTTP", func(mt *mtest.T) {
		id := primitive.NewObjectID()
		ns := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(),
			mtest.CreateCursorResponse(1, ns, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: id},
				{Key: "script", Value: "TCS"},
				{Key: "symbol", Value: "TCS.NS"},
				{Key: "exchange", Value: "NSE"},
				{Key: "type", Value: "stock"},
				{Key: "stocks_owned", Value: 10.0},
				{Key: "avg_cost_price", Value: 3000.0},
				{Key: "realized_pnl", Value: 0.0},
				{Key: "currency", Value: "INR"},
			}),
			mtest.CreateCursorResponse(0, ns, mtest.NextBatch),
		)

		logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
		h := handlers.New(mt.DB, logger)
		e := New(config.Default(), logger, mt.DB, h)

		createBody := []byte(`{"script":"TCS","exchange":"NSE","type":"stock","symbol":"TCS.NS","stocks_owned":10,"avg_cost_price":3000}`)
		createReq := httptest.NewRequest(http.MethodPost, "/api/holdings", bytes.NewReader(createBody))
		createReq.Header.Set("Content-Type", "application/json")
		createRec := httptest.NewRecorder()
		e.ServeHTTP(createRec, createReq)

		if createRec.Code != http.StatusCreated {
			t.Fatalf("create status = %d, want 201; body=%s", createRec.Code, createRec.Body.String())
		}
		var created api.Holding
		if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
			t.Fatalf("decode created holding: %v", err)
		}
		if created.Script == nil || *created.Script != "TCS" {
			t.Fatalf("created script = %v, want TCS", created.Script)
		}
		if created.Currency == nil || *created.Currency != api.HoldingCurrencyINR {
			t.Fatalf("created currency = %v, want INR", created.Currency)
		}

		listReq := httptest.NewRequest(http.MethodGet, "/api/holdings", nil)
		listRec := httptest.NewRecorder()
		e.ServeHTTP(listRec, listReq)

		if listRec.Code != http.StatusOK {
			t.Fatalf("list status = %d, want 200; body=%s", listRec.Code, listRec.Body.String())
		}
		var listed []api.Holding
		if err := json.NewDecoder(listRec.Body).Decode(&listed); err != nil {
			t.Fatalf("decode listed holdings: %v", err)
		}
		if len(listed) != 1 {
			t.Fatalf("listed holdings = %d, want 1", len(listed))
		}
		if listed[0].Id == nil || *listed[0].Id != id.Hex() {
			t.Errorf("listed id = %v, want %s", listed[0].Id, id.Hex())
		}
		if listed[0].Symbol == nil || *listed[0].Symbol != "TCS.NS" {
			t.Errorf("listed symbol = %v, want TCS.NS", listed[0].Symbol)
		}
	})
}
