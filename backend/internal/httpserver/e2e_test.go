package httpserver

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
		userID := primitive.NewObjectID()
		sessionID := "test-session"
		expiresAt := time.Now().Add(time.Hour)
		holdingNS := mt.DB.Name() + ".holdings"
		sessionNS := mt.DB.Name() + ".sessions"
		userNS := mt.DB.Name() + ".users"
		sessionDoc := bson.D{
			{Key: "_id", Value: sessionID},
			{Key: "user_id", Value: userID},
			{Key: "created_at", Value: time.Now()},
			{Key: "expires_at", Value: expiresAt},
		}
		userDoc := bson.D{
			{Key: "_id", Value: userID},
			{Key: "username", Value: "owner"},
			{Key: "username_display", Value: "owner"},
			{Key: "name", Value: "Owner"},
			{Key: "role", Value: "user"},
			{Key: "region", Value: "india"},
			{Key: "disabled", Value: false},
		}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, sessionNS, mtest.FirstBatch, sessionDoc),
			mtest.CreateCursorResponse(0, userNS, mtest.FirstBatch, userDoc),
			mtest.CreateSuccessResponse(bson.E{Key: "nModified", Value: 1}, bson.E{Key: "n", Value: 1}),
			mtest.CreateSuccessResponse(),
			mtest.CreateCursorResponse(0, sessionNS, mtest.FirstBatch, sessionDoc),
			mtest.CreateCursorResponse(0, userNS, mtest.FirstBatch, userDoc),
			mtest.CreateSuccessResponse(bson.E{Key: "nModified", Value: 1}, bson.E{Key: "n", Value: 1}),
			mtest.CreateCursorResponse(1, holdingNS, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: id},
				{Key: "user_id", Value: userID},
				{Key: "script", Value: "TCS"},
				{Key: "symbol", Value: "TCS.NS"},
				{Key: "exchange", Value: "NSE"},
				{Key: "type", Value: "stock"},
				{Key: "stocks_owned", Value: 10.0},
				{Key: "avg_cost_price", Value: 3000.0},
				{Key: "realized_pnl", Value: 0.0},
				{Key: "currency", Value: "INR"},
			}),
			mtest.CreateCursorResponse(0, holdingNS, mtest.NextBatch),
		)

		logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
		h := handlers.New(mt.DB, logger)
		e := New(config.Default(), logger, mt.DB, h)

		createBody := []byte(`{"script":"TCS","exchange":"NSE","type":"stock","symbol":"TCS.NS","stocks_owned":10,"avg_cost_price":3000}`)
		createReq := httptest.NewRequest(http.MethodPost, "/api/holdings", bytes.NewReader(createBody))
		createReq.Header.Set("Content-Type", "application/json")
		createReq.Header.Set("X-Requested-With", "portfolio-dashboard")
		createReq.AddCookie(testSessionCookie(sessionID))
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
		listReq.AddCookie(testSessionCookie(sessionID))
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

func testSessionCookie(sessionID string) *http.Cookie {
	// #nosec G124 -- test cookie mirrors the app's cross-origin session cookie attributes.
	return &http.Cookie{
		Name:     "pd_session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	}
}
