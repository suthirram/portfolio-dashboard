package cmd

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func resetMigrateGlobals(t *testing.T) {
	t.Helper()
	oldOwner := migrateOwner
	oldConnect := cliConnectFn
	oldEnsure := ensureIndexesFn
	t.Cleanup(func() {
		migrateOwner = oldOwner
		cliConnectFn = oldConnect
		ensureIndexesFn = oldEnsure
	})
}

func clearCIEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"CI", "GITHUB_ACTIONS", "BUILDKITE", "CIRCLECI", "GITLAB_CI"} {
		t.Setenv(key, "")
	}
}

func countResponse(ns string, n int64) bson.D {
	return mtest.CreateCursorResponse(0, ns, mtest.FirstBatch, bson.D{{Key: "n", Value: n}})
}

func migrateUserDoc(id primitive.ObjectID, username, role string) bson.D {
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "username", Value: username},
		{Key: "username_display", Value: username},
		{Key: "name", Value: username},
		{Key: "password_hash", Value: "x"},
		{Key: "role", Value: role},
		{Key: "created_at", Value: time.Now()},
		{Key: "updated_at", Value: time.Now()},
	}
}

func injectMigrateDB(t *testing.T, mt *mtest.T) *bool {
	t.Helper()
	ensured := false
	cliConnectFn = func(context.Context, *slog.Logger, config.Config) (*persistence.Store, *mongo.Database, func(), error) {
		return persistence.New(mt.DB), mt.DB, func() {}, nil
	}
	ensureIndexesFn = func(context.Context, *mongo.Database, *slog.Logger) error {
		ensured = true
		return nil
	}
	return &ensured
}

func TestValidateLocalMongoURI(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		ok   bool
	}{
		{name: "localhost", uri: "mongodb://localhost:27017/portfolio", ok: true},
		{name: "loopback", uri: "mongodb://127.0.0.1:27017/portfolio", ok: true},
		{name: "ipv6 loopback", uri: "mongodb://[::1]:27017/portfolio", ok: true},
		{name: "compose service", uri: "mongodb://mongodb:27017/portfolio", ok: true},
		{name: "docker host", uri: "mongodb://host.docker.internal:27017/portfolio", ok: true},
		{name: "local replica set", uri: "mongodb://localhost:27017,127.0.0.1:27018/portfolio", ok: true},
		{name: "srv remote", uri: "mongodb+srv://cluster.example.com/portfolio", ok: false},
		{name: "remote host", uri: "mongodb://cluster.example.com:27017/portfolio", ok: false},
		{name: "missing host", uri: "mongodb:///portfolio", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateLocalMongoURI(tt.uri)
			if tt.ok && err != nil {
				t.Fatalf("validateLocalMongoURI() error = %v, want nil", err)
			}
			if !tt.ok && err == nil {
				t.Fatal("validateLocalMongoURI() error = nil, want error")
			}
		})
	}
}

func TestRunMigrateUsersRefusesCIAndRemoteBeforeMongo(t *testing.T) {
	for _, tt := range []struct {
		name     string
		envKey   string
		mongoURI string
		want     string
	}{
		{name: "ci", envKey: "CI", mongoURI: "mongodb://localhost:27017/portfolio", want: "must not run in CI"},
		{name: "remote", mongoURI: "mongodb://cluster.example.com:27017/portfolio", want: "local-only"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			resetMigrateGlobals(t)
			clearCIEnv(t)
			migrateOwner = "admin"
			t.Setenv("MONGODB_URI", tt.mongoURI)
			if tt.envKey != "" {
				t.Setenv(tt.envKey, "true")
			}
			cliConnectFn = func(context.Context, *slog.Logger, config.Config) (*persistence.Store, *mongo.Database, func(), error) {
				t.Fatal("cliConnectFn called before validation completed")
				return nil, nil, nil, errors.New("unreachable")
			}

			err := runMigrateUsers(nil, nil)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("runMigrateUsers() error = %v, want containing %q", err, tt.want)
			}
		})
	}
}

func TestRunMigrateUsersRequiresSuperAdminOwner(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	for _, role := range []string{domain.RoleUser, domain.RoleAdmin} {
		mt.Run(role+" owner refused", func(mt *mtest.T) {
			resetMigrateGlobals(t)
			clearCIEnv(t)
			t.Setenv("MONGODB_URI", "mongodb://localhost:27017/portfolio")
			migrateOwner = "owner"
			injectMigrateDB(t, mt)
			mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch,
				migrateUserDoc(primitive.NewObjectID(), "owner", role),
			))

			err := runMigrateUsers(nil, nil)
			if err == nil || !strings.Contains(err.Error(), "must be superadmin") {
				t.Fatalf("runMigrateUsers() error = %v, want superadmin role error", err)
			}
			for _, e := range mt.GetAllStartedEvents() {
				if e.CommandName == "update" {
					t.Fatal("unexpected holdings update for non-superadmin owner")
				}
			}
		})
	}
}

func TestRunMigrateUsersAssignsLegacyHoldingsToSuperAdmin(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("migration", func(mt *mtest.T) {
		resetMigrateGlobals(t)
		clearCIEnv(t)
		t.Setenv("MONGODB_URI", "mongodb://localhost:27017/portfolio")
		migrateOwner = "admin"
		ensured := injectMigrateDB(t, mt)

		ownerID := primitive.NewObjectID()
		usersNS := mt.DB.Name() + ".users"
		holdingsNS := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch,
				migrateUserDoc(ownerID, "admin", domain.RoleSuperAdmin),
			),
			countResponse(holdingsNS, 0),                                        // malformed owners
			mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{}}), // dangling owner distinct
			countResponse(holdingsNS, 2),                                        // legacy before
			countResponse(holdingsNS, 1),                                        // owner before
			mtest.CreateSuccessResponse(
				bson.E{Key: "n", Value: int32(2)},
				bson.E{Key: "nModified", Value: int32(2)},
			),
			countResponse(holdingsNS, 0), // legacy after
			countResponse(holdingsNS, 3), // owner after
		)

		if err := runMigrateUsers(nil, nil); err != nil {
			t.Fatalf("runMigrateUsers: %v", err)
		}
		if !*ensured {
			t.Fatal("indexes were not ensured after migration")
		}

		var sawUpdate bool
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "update" || e.Command.Lookup("update").StringValue() != "holdings" {
				continue
			}
			sawUpdate = true
			updateDoc := e.Command.Lookup("updates").Array().Index(0).Value().Document()
			filter := updateDoc.Lookup("q").Document()
			exists := filter.Lookup("user_id").Document().Lookup("$exists").Boolean()
			if exists {
				t.Fatal("update filter matches existing user_id; want only missing user_id")
			}
			set := updateDoc.Lookup("u").Document().Lookup("$set").Document()
			gotOwner, ok := set.Lookup("user_id").ObjectIDOK()
			if !ok || gotOwner != ownerID {
				t.Fatalf("update $set user_id = %v, want %s", gotOwner, ownerID.Hex())
			}
		}
		if !sawUpdate {
			t.Fatal("no holdings update issued")
		}
	})
}
