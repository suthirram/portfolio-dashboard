package persistence

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
)

func migrationRecordBSON(status string, cursor string) bson.D {
	record := bson.D{
		{Key: "_id", Value: "20261116_01"},
		{Key: "status", Value: status},
		{Key: "attempts", Value: 1},
		{Key: "lease_owner", Value: "run-a"},
	}
	if cursor != "" {
		record = append(record, bson.E{Key: "cursor", Value: cursor})
	}
	return record
}

func TestMigrationClaim_ClaimableRecordIsClaimedAndKeepsItsCursor(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("claimed", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: migrationRecordBSON(domain.MigrationInProgress, "42")}))

		now := time.Now()
		record, claimed, err := New(mt.DB).Migrations.Claim(context.Background(), "20261116_01", "run-a", now, now.Add(time.Minute))
		if err != nil || !claimed {
			t.Fatalf("Claim = claimed %v, %v; want claimed", claimed, err)
		}
		if record.Cursor == nil || *record.Cursor != "42" {
			t.Errorf("cursor = %v; want the saved cursor 42 returned for resume", record.Cursor)
		}

		command := mt.GetStartedEvent().Command
		if upsert, _ := command.Lookup("upsert").BooleanOK(); !upsert {
			t.Error("claim must upsert so a step's first run creates its record")
		}
		if _, err := command.LookupErr("update", "$set", "cursor"); err == nil {
			t.Error("claim must not overwrite the saved cursor")
		}
		clauses := command.Lookup("query", "$or").Array()
		values, _ := clauses.Values()
		if len(values) != 2 {
			t.Fatalf("claim filter has %d $or clauses; want failed and expired in_progress", len(values))
		}
		if status := values[0].Document().Lookup("status").StringValue(); status != domain.MigrationFailed {
			t.Errorf("first clause status = %q; want failed", status)
		}
		expired := values[1].Document()
		if status := expired.Lookup("status").StringValue(); status != domain.MigrationInProgress {
			t.Errorf("second clause status = %q; want in_progress", status)
		}
		if _, err := expired.LookupErr("lease_expires_at", "$lte"); err != nil {
			t.Error("in_progress is claimable only once its lease has expired")
		}
	})
}

func TestMigrationClaim_DoneOrHeldRecordIsNotClaimed(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("duplicate key", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 11000, Name: "DuplicateKey", Message: "E11000 duplicate key error"}),
			mtest.CreateCursorResponse(0, "portfolio.migrations", mtest.FirstBatch, migrationRecordBSON(domain.MigrationDone, "")),
		)

		now := time.Now()
		record, claimed, err := New(mt.DB).Migrations.Claim(context.Background(), "20261116_01", "run-b", now, now.Add(time.Minute))
		if err != nil || claimed {
			t.Fatalf("Claim = claimed %v, %v; want not claimed", claimed, err)
		}
		if record.Status != domain.MigrationDone {
			t.Errorf("status = %q; want the current record returned", record.Status)
		}
	})
}

func TestMigrationLease_LostLeaseIsNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	notMatched := func() bson.D {
		return mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}, bson.E{Key: "nModified", Value: 0})
	}
	now := time.Now()
	mt.Run("save cursor", func(mt *mtest.T) {
		mt.AddMockResponses(notMatched())
		if err := New(mt.DB).Migrations.SaveCursor(context.Background(), "20261116_01", "run-a", "7", now, now); !errors.Is(err, ErrNotFound) {
			t.Errorf("SaveCursor = %v; want ErrNotFound", err)
		}
	})
	mt.Run("renew", func(mt *mtest.T) {
		mt.AddMockResponses(notMatched())
		if err := New(mt.DB).Migrations.Renew(context.Background(), "20261116_01", "run-a", now, now); !errors.Is(err, ErrNotFound) {
			t.Errorf("Renew = %v; want ErrNotFound", err)
		}
	})
	mt.Run("finish", func(mt *mtest.T) {
		mt.AddMockResponses(notMatched())
		if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", nil, now); !errors.Is(err, ErrNotFound) {
			t.Errorf("Finish = %v; want ErrNotFound", err)
		}
	})
}

func TestMigrationFinish_RecordsOutcome(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	matched := mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}, bson.E{Key: "nModified", Value: 1})
	now := time.Now()
	sentUpdate := func(mt *mtest.T) bson.Raw {
		updates, _ := mt.GetStartedEvent().Command.Lookup("updates").Array().Values()
		statement := updates[0].Document()
		if owner := statement.Lookup("q", "lease_owner").StringValue(); owner != "run-a" {
			t.Errorf("filter lease_owner = %q; want only the lease holder to finish", owner)
		}
		return statement.Lookup("u").Document()
	}
	mt.Run("done clears the cursor", func(mt *mtest.T) {
		mt.AddMockResponses(matched)
		if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", nil, now); err != nil {
			t.Fatalf("Finish: %v", err)
		}
		update := sentUpdate(mt)
		if status := update.Lookup("$set", "status").StringValue(); status != domain.MigrationDone {
			t.Errorf("status = %q; want done", status)
		}
		if _, err := update.LookupErr("$set", "finished_at"); err != nil {
			t.Error("done must stamp finished_at")
		}
		if _, err := update.LookupErr("$unset", "cursor"); err != nil {
			t.Error("done must clear the cursor")
		}
	})
	mt.Run("failed keeps the cursor and the error", func(mt *mtest.T) {
		mt.AddMockResponses(matched)
		if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", errors.New("yahoo rate limit"), now); err != nil {
			t.Fatalf("Finish: %v", err)
		}
		update := sentUpdate(mt)
		if status := update.Lookup("$set", "status").StringValue(); status != domain.MigrationFailed {
			t.Errorf("status = %q; want failed", status)
		}
		if message := update.Lookup("$set", "last_error").StringValue(); message != "yahoo rate limit" {
			t.Errorf("last_error = %q; want the run's error", message)
		}
		if _, err := update.LookupErr("$unset"); err == nil {
			t.Error("failed must keep the cursor for the retry")
		}
	})
}
