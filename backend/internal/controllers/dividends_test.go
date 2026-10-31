package controllers

import (
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// The tab query pins the caller, type=dividend and the requested currency.
func TestListDividends_ScopedToCallerAndCurrency(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("EUR tab", func(mt *mtest.T) {
		caller := regionalAdmin("india")
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch),
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ListDividends(userCtx(caller), api.ListDividendsRequestObject{Params: api.ListDividendsParams{Currency: "EUR"}})
		if err != nil {
			t.Fatalf("ListDividends: %v", err)
		}
		if _, ok := resp.(api.ListDividends200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		filter := findFilter(t, mt) // first find = the transactions query
		if got := filter.Lookup("type").StringValue(); got != "dividend" {
			t.Errorf("type filter = %q, want dividend", got)
		}
		if got := filter.Lookup("currency").StringValue(); got != "EUR" {
			t.Errorf("currency filter = %q, want EUR", got)
		}
		if got := filter.Lookup("user_id").ObjectID(); got != caller.ID {
			t.Errorf("user_id = %s, want caller %s", got.Hex(), caller.ID.Hex())
		}
	})
}

// Act-as is region-scoped: out-of-region reads as 404.
func TestAdminListUserDividends_OutOfRegion404(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("europe target, india admin", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminListUserDividends(userCtx(regionalAdmin("india")), api.AdminListUserDividendsRequestObject{
			Id: primitive.NewObjectID().Hex(), Params: api.AdminListUserDividendsParams{Currency: "INR"},
		})
		if err != nil {
			t.Fatalf("AdminListUserDividends: %v", err)
		}
		if _, ok := resp.(api.AdminListUserDividends404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", resp)
		}
	})
}

// No request validator enforces the enum: an unknown currency must be a 400
// with a message, never an empty 200 that reads as "no dividends".
func TestListDividends_BadCurrency400(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("USD", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ListDividends(userCtx(regionalAdmin("india")), api.ListDividendsRequestObject{Params: api.ListDividendsParams{Currency: "USD"}})
		if err != nil {
			t.Fatalf("ListDividends: %v", err)
		}
		if _, ok := resp.(api.ListDividends400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
		if n := len(mt.GetAllStartedEvents()); n != 0 {
			t.Errorf("%d database commands issued for an invalid currency; want none", n)
		}
	})
}

// Preview never writes: every command it issues is a read.
func TestPreviewDividendImport_ReadOnly(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("one row", func(mt *mtest.T) {
		caller := regionalAdmin("india")
		holdingId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
				{Key: "_id", Value: holdingId}, {Key: "user_id", Value: caller.ID}, {Key: "script", Value: "TCS"},
				{Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"},
			}),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})
		day := openapi_types.Date{Time: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)}
		resp, err := handler.PreviewDividendImport(userCtx(caller), api.PreviewDividendImportRequestObject{Body: &api.DividendImportInput{
			Currency: "INR", Rows: []api.DividendImportRow{{Line: 2, Date: day, ShareName: "TCS", Amount: 300}},
		}})
		if err != nil {
			t.Fatalf("Preview: %v", err)
		}
		preview, isOK := resp.(api.PreviewDividendImport200JSONResponse)
		if !isOK || preview.Counts.Ready != 1 {
			t.Fatalf("response = %#v, want 200 with 1 ready", resp)
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "find" {
				t.Errorf("preview issued %s; want reads only", event.CommandName)
			}
		}
	})
}

func TestAdminDeleteUserDividends_BadCurrency400(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("USD", func(mt *mtest.T) {
		targetId := primitive.NewObjectID()
		target := userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})
		response, err := handler.AdminDeleteUserDividends(userCtx(regionalAdmin("india")), api.AdminDeleteUserDividendsRequestObject{
			Id: targetId.Hex(), Params: api.AdminDeleteUserDividendsParams{Currency: "USD"},
		})
		if err != nil {
			t.Fatalf("AdminDeleteUserDividends: %v", err)
		}
		if _, ok := response.(api.AdminDeleteUserDividends400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", response)
		}
	})
}
