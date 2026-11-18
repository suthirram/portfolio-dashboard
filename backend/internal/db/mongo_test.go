package db

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func newBufLogger(buf *bytes.Buffer) *zap.Logger {
	enc := zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig())
	core := zapcore.NewCore(enc, zapcore.AddSync(buf), zapcore.DebugLevel)
	return zap.New(core)
}

func TestEnsureIndexesCreatesAllCollectionIndexes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("indexes created", func(mt *mtest.T) {
		// One createIndexes command per collection: holdings, transactions,
		// users, sessions, portfolio_snapshots, portfolio_overall.
		for range 6 {
			mt.AddMockResponses(mtest.CreateSuccessResponse(
				bson.E{Key: "createdCollectionAutomatically", Value: false},
				bson.E{Key: "numIndexesBefore", Value: 1},
				bson.E{Key: "numIndexesAfter", Value: 4},
			))
		}

		var buf bytes.Buffer
		logger := newBufLogger(&buf)

		if err := EnsureIndexes(context.Background(), mt.DB, logger); err != nil {
			t.Fatalf("EnsureIndexes: %v", err)
		}
		for _, col := range []string{"holdings", "transactions", "users", "sessions", "portfolio_snapshots", "portfolio_overall"} {
			if !strings.Contains(buf.String(), `"collection":"`+col+`"`) {
				t.Errorf("log output missing collection %q: %s", col, buf.String())
			}
		}
		// transactions: replay, cascade, user listing, dividend tab (DD-005 §2.2).
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "createIndexes" || event.Command.Lookup("createIndexes").StringValue() != "transactions" {
				continue
			}
			indexes, _ := event.Command.Lookup("indexes").Array().Values()
			if len(indexes) != 4 {
				t.Errorf("transactions indexes = %d, want 4", len(indexes))
			}
		}
		// portfolio_overall: one document per (user, day) (PD-059), which the
		// backfill's "already rated" duplicate-key check relies on.
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "createIndexes" || event.Command.Lookup("createIndexes").StringValue() != "portfolio_overall" {
				continue
			}
			index := event.Command.Lookup("indexes").Array().Index(0).Value().Document()
			if unique, _ := index.Lookup("unique").BooleanOK(); !unique {
				t.Error("portfolio_overall (user_id, date) index must be unique")
			}
		}
	})
}
