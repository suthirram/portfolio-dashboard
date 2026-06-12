package db

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestEnsureIndexesCreatesAllCollectionIndexes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("indexes created", func(mt *mtest.T) {
		// One createIndexes command per collection: holdings, users, sessions.
		for i := 0; i < 3; i++ {
			mt.AddMockResponses(mtest.CreateSuccessResponse(
				bson.E{Key: "createdCollectionAutomatically", Value: false},
				bson.E{Key: "numIndexesBefore", Value: 1},
				bson.E{Key: "numIndexesAfter", Value: 4},
			))
		}

		var buf bytes.Buffer
		logger := slog.New(slog.NewJSONHandler(&buf, nil))

		if err := EnsureIndexes(context.Background(), mt.DB, logger); err != nil {
			t.Fatalf("EnsureIndexes: %v", err)
		}
		for _, col := range []string{"holdings", "users", "sessions"} {
			if !strings.Contains(buf.String(), `"collection":"`+col+`"`) {
				t.Errorf("log output missing collection %q: %s", col, buf.String())
			}
		}
	})
}
