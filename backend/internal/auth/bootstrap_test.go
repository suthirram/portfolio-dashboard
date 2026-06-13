package auth

import (
	"context"
	"log/slog"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
)

func TestEnsureSuperAdmin_CreatesWhenAbsent(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("creates admin/admin with placeholders", func(mt *mtest.T) {
		usersNS := mt.DB.Name() + ".users"
		mt.AddMockResponses(
			// CountDocuments returns 0.
			mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch),
			// InsertOne success.
			mtest.CreateSuccessResponse(),
		)

		if err := EnsureSuperAdmin(context.Background(), mt.DB, slog.Default()); err != nil {
			t.Fatalf("EnsureSuperAdmin: %v", err)
		}

		// Inspect insert document.
		events := mt.GetAllStartedEvents()
		var insert bson.Raw
		for _, e := range events {
			if e.CommandName == "insert" {
				docs, err := e.Command.LookupErr("documents")
				if err != nil {
					t.Fatalf("documents lookup: %v", err)
				}
				arr, err := docs.Array().Values()
				if err != nil {
					t.Fatalf("documents array: %v", err)
				}
				insert = arr[0].Document()
			}
		}
		if insert == nil {
			t.Fatal("no insert command observed")
		}

		var user domain.User
		if err := bson.Unmarshal(insert, &user); err != nil {
			t.Fatalf("decode insert: %v", err)
		}
		if user.Username != "admin" {
			t.Errorf("username = %q, want admin", user.Username)
		}
		if user.Role != domain.RoleSuperAdmin {
			t.Errorf("role = %q, want superadmin", user.Role)
		}
		if !user.MustChangePassword {
			t.Error("must_change_password = false, want true")
		}
		if !CheckPassword(user.PasswordHash, "admin") {
			t.Error("bootstrap password should be 'admin'")
		}
		if len(user.SecurityQuestions) != 3 {
			t.Errorf("len(security_questions) = %d, want 3", len(user.SecurityQuestions))
		}
		// Placeholder answers must be unguessable: they must NOT bcrypt-match
		// the empty string, the literal placeholder ids, or common defaults.
		for _, q := range user.SecurityQuestions {
			for _, guess := range []string{"", "admin", "password", q.QuestionID} {
				if CheckPassword(q.AnswerHash, guess) {
					t.Errorf("placeholder answer for %q matches guess %q", q.QuestionID, guess)
				}
			}
		}
	})
}

func TestEnsureSuperAdmin_NoOpWhenPresent(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("does not insert when superadmin already exists", func(mt *mtest.T) {
		usersNS := mt.DB.Name() + ".users"
		mt.AddMockResponses(
			// CountDocuments returns 1.
			mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch, bson.D{
				{Key: "n", Value: int64(1)},
			}),
		)

		if err := EnsureSuperAdmin(context.Background(), mt.DB, slog.Default()); err != nil {
			t.Fatalf("EnsureSuperAdmin: %v", err)
		}

		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "insert" {
				t.Errorf("unexpected insert when super admin already exists")
			}
		}
	})
}

// guard against accidental id-style fields slipping into the document.
var _ = primitive.NewObjectID
