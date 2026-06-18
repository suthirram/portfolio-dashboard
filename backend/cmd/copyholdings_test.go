package cmd

import (
	"context"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func superAdminDoc(username string) bson.D {
	return bson.D{
		{Key: "_id", Value: primitive.NewObjectID()},
		{Key: "username", Value: username},
		{Key: "role", Value: domain.RoleSuperAdmin},
	}
}

func TestFindSuperAdmin(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("exactly one returns it", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch,
			superAdminDoc("owner"),
		))
		st := persistence.New(mt.DB)
		admin, err := findSuperAdmin(context.Background(), st)
		if err != nil {
			t.Fatalf("findSuperAdmin: %v", err)
		}
		if admin.Username != "owner" {
			t.Errorf("Username = %q, want owner", admin.Username)
		}
	})

	mt.Run("zero errors", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch))
		st := persistence.New(mt.DB)
		_, err := findSuperAdmin(context.Background(), st)
		if err == nil || !strings.Contains(err.Error(), "no super admin found") {
			t.Fatalf("err = %v, want 'no super admin found'", err)
		}
	})

	mt.Run("multiple errors with count", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch,
			superAdminDoc("owner-a"),
			superAdminDoc("owner-b"),
		))
		st := persistence.New(mt.DB)
		_, err := findSuperAdmin(context.Background(), st)
		if err == nil || !strings.Contains(err.Error(), "found 2") {
			t.Fatalf("err = %v, want 'expected exactly one super admin, found 2'", err)
		}
	})
}
