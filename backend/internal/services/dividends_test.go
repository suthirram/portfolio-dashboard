package services

import (
	"context"
	"errors"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/persistence"
)

// directRunner runs the transaction body without a replica set.
type directRunner struct{}

func (directRunner) InTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func commandCount(mt *mtest.T, name, collection string) int {
	n := 0
	for _, e := range mt.GetAllStartedEvents() {
		if e.CommandName == name && e.Command.Lookup(name).StringValue() == collection {
			n++
		}
	}
	return n
}

func importInput(mappings map[string]*string) api.DividendImportInput {
	day := openapi_types.Date{Time: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)}
	in := api.DividendImportInput{Currency: "INR", Rows: []api.DividendImportRow{
		{Line: 2, Date: day, ShareName: "TCS", Amount: 300},
		{Line: 3, Date: day, ShareName: "TCS", Amount: 300},
		{Line: 4, Date: day, ShareName: "JLP", Amount: 500},
	}}
	if mappings != nil {
		in.Mappings = &mappings
	}
	return in
}

func TestImport(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	userId, tcs, jio := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	holdingDocs := func(mt *mtest.T) bson.D {
		return mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			bson.D{{Key: "_id", Value: tcs}, {Key: "user_id", Value: userId}, {Key: "script", Value: "TCS"}, {Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"}},
			bson.D{{Key: "_id", Value: jio}, {Key: "user_id", Value: userId}, {Key: "script", Value: "Jio Platforms Ltd"}, {Key: "symbol", Value: "JIOPLA.NS"}, {Key: "currency", Value: "INR"}},
		)
	}
	service := func(mt *mtest.T) *DividendsService {
		st := persistence.New(mt.DB)
		svc := NewDividendsService(st.Transactions, st.Holdings, directRunner{}, nil)
		svc.today = func() time.Time { return time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC) }
		return svc
	}

	mt.Run("unresolved name blocks the import, nothing written", func(mt *mtest.T) {
		mt.AddMockResponses(holdingDocs(mt), mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch))
		_, err := service(mt).Import(context.Background(), userId, importInput(nil))
		var invalid *ImportInvalidError
		if !errors.As(err, &invalid) || invalid.Preview.Counts.Invalid != 1 {
			t.Fatalf("err = %v, want ImportInvalidError with 1 invalid row (JLP)", err)
		}
		if n := commandCount(mt, "insert", "transactions"); n != 0 {
			t.Errorf("%d inserts issued; want none", n)
		}
	})

	mt.Run("confirmed import inserts, saves the alias, recomputes each holding once", func(mt *mtest.T) {
		jioHex := jio.Hex()
		mt.AddMockResponses(
			holdingDocs(mt),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // no stored dividends
			mtest.CreateSuccessResponse(), // insertMany
			mtest.CreateSuccessResponse(), // aliases $pull
			mtest.CreateSuccessResponse(), // aliases $addToSet
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute TCS
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: tcs}}}),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute Jio
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: jio}}}),
		)
		result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 3 || len(result.Duplicates) != 0 {
			t.Errorf("imported %d dups %d, want 3 / 0 (in-sheet repeats kept)", result.Imported, len(result.Duplicates))
		}
		if n := commandCount(mt, "findAndModify", "holdings"); n != 2 {
			t.Errorf("holding recomputes = %d, want 2 (once per holding)", n)
		}
		if n := commandCount(mt, "update", "holdings"); n != 2 {
			t.Errorf("alias writes = %d, want 2 (pull + addToSet for JLP)", n)
		}
	})

	mt.Run("re-import of stored rows imports nothing", func(mt *mtest.T) {
		jioHex := jio.Hex()
		day := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
		stored := func(holdingId primitive.ObjectID, amount float64) bson.D {
			return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "holding_id", Value: holdingId}, {Key: "type", Value: "dividend"}, {Key: "date", Value: day}, {Key: "amount", Value: amount}}
		}
		mt.AddMockResponses(
			holdingDocs(mt),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, stored(tcs, 300), stored(tcs, 300), stored(jio, 500)),
			mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(), // alias pull + addToSet (answer re-sent)
		)
		result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 0 || len(result.Duplicates) != 3 {
			t.Errorf("imported %d dups %d, want 0 / 3 (idempotent)", result.Imported, len(result.Duplicates))
		}
		if n := commandCount(mt, "insert", "transactions"); n != 0 {
			t.Errorf("%d inserts issued; want none", n)
		}
	})
}
