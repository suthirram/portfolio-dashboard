package controllers

import (
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/persistence"
)

// overallHandler is newIntegrationHandler with portfolio_overall attached,
// as production wiring does.
func overallHandler(mt *mtest.T) *Controller {
	store := persistence.New(mt.DB)
	store.AttachOverall()
	return newWithDeps(store, &mockPriceFetcher{}, nil, zap.NewNop(), false)
}

func overallDocument(userId primitive.ObjectID) bson.D {
	return bson.D{
		{Key: "user_id", Value: userId},
		{Key: "date", Value: time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)},
		{Key: "eur_inr", Value: 100.0}, {Key: "fx_carried", Value: false},
		{Key: "stocks_invested_inr", Value: 1000.0}, {Key: "stocks_current_inr", Value: 1200.0},
	}
}

var (
	overallFrom = openapi_types.Date{Time: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)}
	overallTo   = openapi_types.Date{Time: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)}
)

func TestNewAttachesOverall(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("wiring", func(mt *mtest.T) {
		h := NewWithProfiles(mt.DB, zap.NewNop(), false, nil)
		if h.store.Overall == nil {
			t.Fatal("controllers.New must attach portfolio_overall so History edits keep it in step")
		}
	})
}

func TestGetOverallHistory(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("returns the caller's days converted", func(mt *mtest.T) {
		caller := scopedUser()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, overallDocument(caller.ID)))
		resp, err := overallHandler(mt).GetOverallHistory(userCtx(caller), api.GetOverallHistoryRequestObject{
			Params: api.GetOverallHistoryParams{From: overallFrom, To: overallTo},
		})
		if err != nil {
			t.Fatalf("GetOverallHistory: %v", err)
		}
		got, ok := resp.(api.GetOverallHistory200JSONResponse)
		if !ok || len(got.Points) != 1 {
			t.Fatalf("response = %#v; want 200 with one point", resp)
		}
		if got.Points[0].CurrentEur == nil || *got.Points[0].CurrentEur != 12 || got.GoldUnavailable {
			t.Errorf("point = %+v; want 1200 INR = 12 EUR and gold not flagged", got.Points[0])
		}
		userId, ok := commandFilterUserID(t, mt.GetStartedEvent().Command, "find")
		if !ok || userId != caller.ID {
			t.Errorf("read scoped to %v; want the caller %v", userId, caller.ID)
		}
	})

	mt.Run("gold unreadable means no amounts at all", func(mt *mtest.T) {
		caller := scopedUser()
		caller.GoldEnabled = true
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, overallDocument(caller.ID)))
		// No gold store attached: Postgres is not configured.
		resp, err := overallHandler(mt).GetOverallHistory(userCtx(caller), api.GetOverallHistoryRequestObject{
			Params: api.GetOverallHistoryParams{From: overallFrom, To: overallTo},
		})
		if err != nil {
			t.Fatalf("GetOverallHistory: %v", err)
		}
		got := resp.(api.GetOverallHistory200JSONResponse)
		if !got.GoldUnavailable || got.Points[0].CurrentInr != nil || got.Points[0].InvestedInr != nil {
			t.Errorf("response = %+v; want gold_unavailable and no stock-only amounts", got)
		}
	})

	mt.Run("to before from is a 400", func(mt *mtest.T) {
		resp, err := overallHandler(mt).GetOverallHistory(userCtx(scopedUser()), api.GetOverallHistoryRequestObject{
			Params: api.GetOverallHistoryParams{From: overallTo, To: overallFrom},
		})
		if err != nil {
			t.Fatalf("GetOverallHistory: %v", err)
		}
		if _, ok := resp.(api.GetOverallHistory400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})
}

func TestGetFxMissing(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("lists the caller's flagged days", func(mt *mtest.T) {
		caller := scopedUser()
		flagged := bson.D{
			{Key: "user_id", Value: caller.ID},
			{Key: "date", Value: time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)},
			{Key: "fx_carried", Value: true},
		}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flagged))
		resp, err := overallHandler(mt).GetFxMissing(userCtx(caller), api.GetFxMissingRequestObject{})
		if err != nil {
			t.Fatalf("GetFxMissing: %v", err)
		}
		got, ok := resp.(api.GetFxMissing200JSONResponse)
		if !ok || len(got.Dates) != 1 || got.Dates[0].Format("2006-01-02") != "2026-11-13" {
			t.Fatalf("response = %#v; want 200 with 2026-11-13", resp)
		}
		command := mt.GetStartedEvent().Command
		userId, ok := commandFilterUserID(t, command, "find")
		if !ok || userId != caller.ID {
			t.Errorf("read scoped to %v; want the caller %v", userId, caller.ID)
		}
		if carried, _ := command.Lookup("filter", "fx_carried").BooleanOK(); !carried {
			t.Error("the read must select only flagged days")
		}
	})
}

func TestRefetchFxRequiresDates(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("empty dates is a 400", func(mt *mtest.T) {
		resp, err := overallHandler(mt).RefetchFx(userCtx(scopedUser()), api.RefetchFxRequestObject{Body: &api.FxDates{}})
		if err != nil {
			t.Fatalf("RefetchFx: %v", err)
		}
		if _, ok := resp.(api.RefetchFx400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})
}
