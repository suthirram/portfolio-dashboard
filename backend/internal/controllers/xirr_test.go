package controllers

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// xirrMockResponses queues the two reads View issues, in order: the owner's
// holdings, then their ledger. One TCS position bought a year ago for
// ₹10,000, now 10 × ₹1,100.
func xirrMockResponses(mt *mtest.T, ownerId primitive.ObjectID) {
	holdingId := primitive.NewObjectID()
	mt.AddMockResponses(
		mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: holdingId}, {Key: "user_id", Value: ownerId}, {Key: "script", Value: "TCS"},
			{Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"}, {Key: "stocks_owned", Value: 10.0},
		}),
		mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: ownerId},
			{Key: "holding_id", Value: holdingId}, {Key: "type", Value: "buy"},
			{Key: "date", Value: time.Now().AddDate(-1, 0, 0)}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: 10000.0},
		}),
	)
}

// The caller's own view reads only the caller's holdings and returns a
// positive rate for a position that gained.
func TestGetStockXirr_ScopedToCaller(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("own portfolio", func(mt *mtest.T) {
		caller := regionalAdmin("india")
		xirrMockResponses(mt, caller.ID)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{"TCS.NS": 1100}})

		response, err := handler.GetStockXirr(userCtx(caller), api.GetStockXirrRequestObject{})
		if err != nil {
			t.Fatalf("GetStockXirr: %v", err)
		}
		view, ok := response.(api.GetStockXirr200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", response)
		}
		if got := findFilter(t, mt).Lookup("user_id").ObjectID(); got != caller.ID {
			t.Errorf("holdings user_id = %s, want caller %s", got.Hex(), caller.ID.Hex())
		}
		if len(view.Currencies) != 1 || view.Currencies[0].Xirr == nil || *view.Currencies[0].Xirr <= 0 {
			t.Fatalf("currencies = %+v, want one INR bucket with a positive rate", view.Currencies)
		}
	})
}

// Act-as reads the target's portfolio, not the admin's.
func TestAdminGetUserStockXirr_InRegionReadsTarget(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("india target, india admin", func(mt *mtest.T) {
		targetId := primitive.NewObjectID()
		target := userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		xirrMockResponses(mt, targetId)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{"TCS.NS": 1100}})

		response, err := handler.AdminGetUserStockXirr(userCtx(regionalAdmin("india")), api.AdminGetUserStockXirrRequestObject{Id: targetId.Hex()})
		if err != nil {
			t.Fatalf("AdminGetUserStockXirr: %v", err)
		}
		if _, ok := response.(api.AdminGetUserStockXirr200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", response)
		}
		var holdingsFilter bson.Raw
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName == "find" && event.Command.Lookup("find").StringValue() == "holdings" {
				holdingsFilter = event.Command.Lookup("filter").Document()
			}
		}
		if holdingsFilter == nil {
			t.Fatal("no holdings find issued")
		}
		if got := holdingsFilter.Lookup("user_id").ObjectID(); got != targetId {
			t.Errorf("holdings user_id = %s, want target %s", got.Hex(), targetId.Hex())
		}
	})
}

// Act-as is region-scoped: out-of-region reads as 404.
func TestAdminGetUserStockXirr_OutOfRegion404(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("europe target, india admin", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.AdminGetUserStockXirr(userCtx(regionalAdmin("india")), api.AdminGetUserStockXirrRequestObject{Id: primitive.NewObjectID().Hex()})
		if err != nil {
			t.Fatalf("AdminGetUserStockXirr: %v", err)
		}
		if _, ok := response.(api.AdminGetUserStockXirr404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", response)
		}
	})
}
