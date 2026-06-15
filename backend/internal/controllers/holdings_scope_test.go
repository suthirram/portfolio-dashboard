package controllers

import (
	"context"
	"errors"
	"testing"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// Every holdings/prices/summary query must pin user_id (DD-001 §6.1). These
// tests inspect the wire commands the handlers issue.

func scopedUser() *domain.User {
	return &domain.User{
		ID:       primitive.NewObjectID(),
		Username: "owner",
		Role:     domain.RoleUser,
		Region:   "india",
	}
}

func userCtx(u *domain.User) context.Context {
	return auth.WithUser(context.Background(), u)
}

// commandFilterUserID digs the user_id value out of a find filter or the
// first update/delete statement of a started command.
func commandFilterUserID(t *testing.T, cmd bson.Raw, commandName string) (primitive.ObjectID, bool) {
	t.Helper()
	var filter bson.Raw
	switch commandName {
	case "find":
		v, err := cmd.LookupErr("filter")
		if err != nil {
			return primitive.NilObjectID, false
		}
		filter = v.Document()
	case "update":
		v, err := cmd.LookupErr("updates")
		if err != nil {
			return primitive.NilObjectID, false
		}
		first := v.Array().Index(0).Value().Document()
		filter = first.Lookup("q").Document()
	case "delete":
		v, err := cmd.LookupErr("deletes")
		if err != nil {
			return primitive.NilObjectID, false
		}
		first := v.Array().Index(0).Value().Document()
		filter = first.Lookup("q").Document()
	case "findAndModify":
		// findAndModify carries its filter inline under "query"; the wire
		// shape FindOneAndUpdate compiles to.
		v, err := cmd.LookupErr("query")
		if err != nil {
			return primitive.NilObjectID, false
		}
		filter = v.Document()
	default:
		return primitive.NilObjectID, false
	}
	uid, err := filter.LookupErr("user_id")
	if err != nil {
		return primitive.NilObjectID, false
	}
	oid, ok := uid.ObjectIDOK()
	return oid, ok
}

func requireScopedCommand(t *testing.T, mt *mtest.T, commandName string, want primitive.ObjectID) {
	t.Helper()
	for _, e := range mt.GetAllStartedEvents() {
		if e.CommandName != commandName {
			continue
		}
		got, ok := commandFilterUserID(t, e.Command, commandName)
		if !ok {
			t.Fatalf("%s command has no user_id in filter: %s", commandName, e.Command)
		}
		if got != want {
			t.Fatalf("%s command scoped to %s, want %s", commandName, got.Hex(), want.Hex())
		}
		return
	}
	t.Fatalf("no %s command issued", commandName)
}

func TestListHoldings_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("find pins user_id", func(mt *mtest.T) {
		ns := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, ns, mtest.FirstBatch))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		if _, err := h.ListHoldings(userCtx(u), api.ListHoldingsRequestObject{}); err != nil {
			t.Fatalf("ListHoldings: %v", err)
		}
		requireScopedCommand(t, mt, "find", u.ID)
	})
}

func TestListHoldings_UnauthenticatedFails(t *testing.T) {
	h := newWithDeps(&persistence.Store{}, &mockPriceFetcher{}, nil, false)
	_, err := h.ListHoldings(context.Background(), api.ListHoldingsRequestObject{})
	var httpErr *echo.HTTPError
	if !errors.As(err, &httpErr) || httpErr.Code != 401 {
		t.Fatalf("err = %v, want echo.HTTPError 401", err)
	}
}

func TestGetHolding_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("findOne pins user_id and _id", func(mt *mtest.T) {
		ns := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, ns, mtest.FirstBatch))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetHolding(userCtx(u), api.GetHoldingRequestObject{Id: primitive.NewObjectID().Hex()})
		if err != nil {
			t.Fatalf("GetHolding: %v", err)
		}
		// Another user's holding id must read as "not found", not "forbidden".
		if _, ok := resp.(api.GetHolding404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", resp)
		}
		requireScopedCommand(t, mt, "find", u.ID)
	})
}

func TestCreateHolding_StampsOwner(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("insert carries user_id", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		body := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}
		if _, err := h.CreateHolding(userCtx(u), api.CreateHoldingRequestObject{Body: &body}); err != nil {
			t.Fatalf("CreateHolding: %v", err)
		}

		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "insert" {
				continue
			}
			doc := e.Command.Lookup("documents").Array().Index(0).Value().Document()
			oid, ok := doc.Lookup("user_id").ObjectIDOK()
			if !ok || oid != u.ID {
				t.Fatalf("inserted doc user_id = %v, want %s; doc=%s", oid, u.ID.Hex(), doc)
			}
			return
		}
		t.Fatal("no insert command issued")
	})
}

func TestUpdateHolding_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("findAndModify filter pins user_id and 404s when nothing matches", func(mt *mtest.T) {
		// findAndModify returns {value: null} when no document matched.
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		body := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}
		resp, err := h.UpdateHolding(userCtx(u), api.UpdateHoldingRequestObject{
			Id:   primitive.NewObjectID().Hex(),
			Body: &body,
		})
		if err != nil {
			t.Fatalf("UpdateHolding: %v", err)
		}
		if _, ok := resp.(api.UpdateHolding404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404 for someone else's holding", resp)
		}
		requireScopedCommand(t, mt, "findAndModify", u.ID)
	})
}

func TestDeleteHolding_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("delete filter pins user_id", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.DeleteHolding(userCtx(u), api.DeleteHoldingRequestObject{Id: primitive.NewObjectID().Hex()})
		if err != nil {
			t.Fatalf("DeleteHolding: %v", err)
		}
		if _, ok := resp.(api.DeleteHolding404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404 for someone else's holding", resp)
		}
		requireScopedCommand(t, mt, "delete", u.ID)
	})
}

func TestGetPrices_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("find pins user_id", func(mt *mtest.T) {
		ns := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, ns, mtest.FirstBatch))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{forexRate: 0.011})
		if _, err := h.GetPrices(userCtx(u), api.GetPricesRequestObject{}); err != nil {
			t.Fatalf("GetPrices: %v", err)
		}
		requireScopedCommand(t, mt, "find", u.ID)
	})
}

func TestGetSummary_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("find pins user_id", func(mt *mtest.T) {
		ns := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, ns, mtest.FirstBatch))

		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{forexRate: 0.011})
		if _, err := h.GetSummary(userCtx(u), api.GetSummaryRequestObject{}); err != nil {
			t.Fatalf("GetSummary: %v", err)
		}
		requireScopedCommand(t, mt, "find", u.ID)
	})
}
