package controllers

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func holdingsNS(mt *mtest.T) string { return mt.DB.Name() + ".holdings" }

func itcHoldingDoc(ownerId, holdingId primitive.ObjectID) bson.D {
	return bson.D{
		{Key: "_id", Value: holdingId}, {Key: "user_id", Value: ownerId}, {Key: "script", Value: "ITC"},
		{Key: "symbol", Value: "ITC.NS"}, {Key: "exchange", Value: "NSE"}, {Key: "type", Value: "stock"}, {Key: "currency", Value: "INR"},
	}
}

func confirmBody(holdingType api.HoldingClassificationInputType, sector *string) *api.ConfirmHoldingClassificationJSONRequestBody {
	return &api.ConfirmHoldingClassificationJSONRequestBody{Type: holdingType, Sector: sector}
}

func TestConfirmHoldingClassification_Responses(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("own rename is saved and returned", func(mt *mtest.T) {
		caller := scopedUser()
		holdingId := primitive.NewObjectID()
		confirmed := append(itcHoldingDoc(caller.ID, holdingId), bson.E{Key: "classification", Value: bson.D{
			{Key: "symbol", Value: "ITC.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "user"}, {Key: "sector", Value: "FMCG"},
		}})
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch, itcHoldingDoc(caller.ID, holdingId)),
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: confirmed}),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.ConfirmHoldingClassification(userCtx(caller), api.ConfirmHoldingClassificationRequestObject{
			Id: holdingId.Hex(), Body: confirmBody(api.HoldingClassificationInputTypeStock, new("FMCG")),
		})
		if err != nil {
			t.Fatalf("ConfirmHoldingClassification: %v", err)
		}
		got, ok := response.(api.ConfirmHoldingClassification200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", response)
		}
		if got.Classification == nil || *got.Classification.Sector != "FMCG" || *got.Classification.Source != api.ClassificationSourceUser {
			t.Errorf("classification = %+v, want the owner's FMCG", got.Classification)
		}
	})

	mt.Run("fund with a sector is a bad request", func(mt *mtest.T) {
		caller := scopedUser()
		holdingId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch, itcHoldingDoc(caller.ID, holdingId)),
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.ConfirmHoldingClassification(userCtx(caller), api.ConfirmHoldingClassificationRequestObject{
			Id: holdingId.Hex(), Body: confirmBody(api.HoldingClassificationInputTypeEtf, new("Banking")),
		})
		if err != nil {
			t.Fatalf("ConfirmHoldingClassification: %v", err)
		}
		if _, ok := response.(api.ConfirmHoldingClassification400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", response)
		}
	})

	mt.Run("another owner's holding is not found", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch))
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.ConfirmHoldingClassification(userCtx(scopedUser()), api.ConfirmHoldingClassificationRequestObject{
			Id: primitive.NewObjectID().Hex(), Body: confirmBody(api.HoldingClassificationInputTypeStock, nil),
		})
		if err != nil {
			t.Fatalf("ConfirmHoldingClassification: %v", err)
		}
		if _, ok := response.(api.ConfirmHoldingClassification404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", response)
		}
	})

	mt.Run("symbol changed meanwhile is a conflict", func(mt *mtest.T) {
		caller := scopedUser()
		holdingId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch, itcHoldingDoc(caller.ID, holdingId)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.ConfirmHoldingClassification(userCtx(caller), api.ConfirmHoldingClassificationRequestObject{
			Id: holdingId.Hex(), Body: confirmBody(api.HoldingClassificationInputTypeEtf, nil),
		})
		if err != nil {
			t.Fatalf("ConfirmHoldingClassification: %v", err)
		}
		if _, ok := response.(api.ConfirmHoldingClassification409JSONResponse); !ok {
			t.Fatalf("response = %T, want 409", response)
		}
	})
}

// Act-as confirms on the target's holding: every holdings command is scoped
// to the target, never the admin.
func TestAdminConfirmUserHoldingClassification_InRegionWritesTarget(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("india target, india admin", func(mt *mtest.T) {
		targetId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)),
			mtest.CreateCursorResponse(0, holdingsNS(mt), mtest.FirstBatch, itcHoldingDoc(targetId, holdingId)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: itcHoldingDoc(targetId, holdingId)}),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.AdminConfirmUserHoldingClassification(userCtx(regionalAdmin("india")), api.AdminConfirmUserHoldingClassificationRequestObject{
			Id: targetId.Hex(), HoldingId: holdingId.Hex(), Body: &api.AdminConfirmUserHoldingClassificationJSONRequestBody{Type: api.HoldingClassificationInputTypeEtf},
		})
		if err != nil {
			t.Fatalf("AdminConfirmUserHoldingClassification: %v", err)
		}
		if _, ok := response.(api.AdminConfirmUserHoldingClassification200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", response)
		}
		holdingsCommands := 0
		for _, started := range mt.GetAllStartedEvents() {
			var scope bson.RawValue
			switch {
			case started.CommandName == "find" && started.Command.Lookup("find").StringValue() == "holdings":
				scope = started.Command.Lookup("filter", "user_id")
			case started.CommandName == "findAndModify":
				scope = started.Command.Lookup("query", "user_id")
			default:
				continue
			}
			holdingsCommands++
			if owner, _ := scope.ObjectIDOK(); owner != targetId {
				t.Errorf("%s scoped to %v, want target %s", started.CommandName, scope, targetId.Hex())
			}
		}
		if holdingsCommands != 2 {
			t.Errorf("holdings commands = %d, want 2 (read + confirm)", holdingsCommands)
		}
	})
}

// Act-as is region-scoped: out-of-region reads as 404 and touches no holding.
func TestAdminConfirmUserHoldingClassification_OutOfRegion404(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("europe target, india admin", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})

		response, err := handler.AdminConfirmUserHoldingClassification(userCtx(regionalAdmin("india")), api.AdminConfirmUserHoldingClassificationRequestObject{
			Id: primitive.NewObjectID().Hex(), HoldingId: primitive.NewObjectID().Hex(), Body: &api.AdminConfirmUserHoldingClassificationJSONRequestBody{Type: api.HoldingClassificationInputTypeStock},
		})
		if err != nil {
			t.Fatalf("AdminConfirmUserHoldingClassification: %v", err)
		}
		if _, ok := response.(api.AdminConfirmUserHoldingClassification404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", response)
		}
		for _, started := range mt.GetAllStartedEvents() {
			if started.CommandName == "findAndModify" {
				t.Error("out-of-region confirm wrote a holding")
			}
		}
	})
}
