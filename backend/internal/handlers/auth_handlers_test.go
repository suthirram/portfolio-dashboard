package handlers

import (
	"context"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
)

func TestSignupCreatesUserAndSession(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("signup", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse())
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		questions := auth.SecurityQuestions()

		resp, err := h.Signup(context.Background(), api.SignupRequestObject{
			Body: &api.SignupRequest{
				Username: " Alice_01 ",
				Name:     "Alice",
				Password: "correct-horse",
				Region:   api.SignupRequestRegion(auth.RegionEurope),
				SecurityQuestions: []api.SecurityAnswerInput{
					{QuestionId: questions[0].ID, Answer: "Alpha"},
					{QuestionId: questions[1].ID, Answer: "Beta"},
					{QuestionId: questions[2].ID, Answer: "Gamma"},
				},
			},
		})
		if err != nil {
			t.Fatalf("Signup: %v", err)
		}
		got := resp.(api.Signup201JSONResponse)
		if got.Body.User == nil {
			t.Fatal("Signup user is nil")
		}
		if got.Body.User.Username == nil || *got.Body.User.Username != "Alice_01" {
			t.Errorf("Username = %v, want Alice_01", got.Body.User.Username)
		}
		if got.Body.User.Role == nil || string(*got.Body.User.Role) != auth.RoleUser {
			t.Errorf("Role = %v, want user", got.Body.User.Role)
		}
		if got.Headers.SetCookie == nil || !strings.Contains(*got.Headers.SetCookie, sessionCookieName+"=") {
			t.Errorf("Set-Cookie = %v, want session cookie", got.Headers.SetCookie)
		}
	})
}

func TestSignupRejectsInvalidSecurityQuestions(t *testing.T) {
	h := &Handler{}

	resp, err := h.Signup(context.Background(), api.SignupRequestObject{
		Body: &api.SignupRequest{
			Username: "alice",
			Name:     "Alice",
			Password: "correct-horse",
			Region:   api.SignupRequestRegion(auth.RegionEurope),
			SecurityQuestions: []api.SecurityAnswerInput{
				{QuestionId: "unknown", Answer: "Alpha"},
				{QuestionId: "favourite_book", Answer: "Beta"},
				{QuestionId: "first_job", Answer: "Gamma"},
			},
		},
	})
	if err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if _, ok := resp.(api.Signup400JSONResponse); !ok {
		t.Fatalf("response = %T, want Signup400JSONResponse", resp)
	}
}

func TestLoginRejectsDisabledAndLockedAccounts(t *testing.T) {
	cases := []struct {
		name string
		user auth.User
		want any
	}{
		{"disabled", auth.User{Disabled: true}, api.Login403JSONResponse{}},
		{"locked", auth.User{Locked: true}, api.Login423JSONResponse{}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
			mt.Run(tc.name, func(mt *mtest.T) {
				passwordHash, err := auth.HashPassword("correct-horse")
				if err != nil {
					t.Fatalf("hash password: %v", err)
				}
				tc.user.ID = primitive.NewObjectID()
				tc.user.Username = "alice"
				tc.user.UsernameDisplay = "alice"
				tc.user.PasswordHash = passwordHash
				tc.user.Role = auth.RoleUser
				tc.user.Region = auth.RegionIndia
				mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, userDocument(tc.user)))

				h := newIntegrationHandler(mt, &mockPriceFetcher{})
				resp, err := h.Login(context.Background(), api.LoginRequestObject{Body: &api.LoginRequest{
					Username: "alice",
					Password: "correct-horse",
				}})
				if err != nil {
					t.Fatalf("Login: %v", err)
				}
				switch tc.want.(type) {
				case api.Login403JSONResponse:
					if _, ok := resp.(api.Login403JSONResponse); !ok {
						t.Fatalf("response = %T, want Login403JSONResponse", resp)
					}
				case api.Login423JSONResponse:
					if _, ok := resp.(api.Login423JSONResponse); !ok {
						t.Fatalf("response = %T, want Login423JSONResponse", resp)
					}
				}
			})
		})
	}
}

func TestRecoverLocksAfterThirdWrongAttempt(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("third wrong attempt", func(mt *mtest.T) {
		user := testRecoveryUser(t)
		user.SecurityQuestionFailures = 2
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, userDocument(user)),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}, bson.E{Key: "nModified", Value: 1}),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		questions := auth.SecurityQuestions()
		newPassword := "new-password"
		resp, err := h.Recover(context.Background(), api.RecoverRequestObject{Body: &api.RecoverRequest{
			Username:    "alice",
			NewPassword: &newPassword,
			Answers: &[]api.SecurityAnswerInput{
				{QuestionId: questions[0].ID, Answer: "wrong"},
				{QuestionId: questions[1].ID, Answer: "Beta"},
				{QuestionId: questions[2].ID, Answer: "Gamma"},
			},
		}})
		if err != nil {
			t.Fatalf("Recover: %v", err)
		}
		if _, ok := resp.(api.Recover423JSONResponse); !ok {
			t.Fatalf("response = %T, want Recover423JSONResponse", resp)
		}
	})
}

func testRecoveryUser(t *testing.T) auth.User {
	t.Helper()
	questions := auth.SecurityQuestions()
	answers, err := auth.HashSecurityAnswers([]auth.SecurityAnswerInput{
		{QuestionID: questions[0].ID, Answer: "Alpha"},
		{QuestionID: questions[1].ID, Answer: "Beta"},
		{QuestionID: questions[2].ID, Answer: "Gamma"},
	})
	if err != nil {
		t.Fatalf("hash answers: %v", err)
	}
	passwordHash, err := auth.HashPassword("correct-horse")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	now := time.Now()
	return auth.User{
		ID:                primitive.NewObjectID(),
		Username:          "alice",
		UsernameDisplay:   "alice",
		Name:              "Alice",
		PasswordHash:      passwordHash,
		Role:              auth.RoleUser,
		Region:            auth.RegionIndia,
		SecurityQuestions: answers,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
}

func userDocument(user auth.User) bson.D {
	return bson.D{
		{Key: "_id", Value: user.ID},
		{Key: "username", Value: user.Username},
		{Key: "username_display", Value: user.UsernameDisplay},
		{Key: "name", Value: user.Name},
		{Key: "password_hash", Value: user.PasswordHash},
		{Key: "role", Value: user.Role},
		{Key: "region", Value: user.Region},
		{Key: "disabled", Value: user.Disabled},
		{Key: "locked", Value: user.Locked},
		{Key: "login_failures", Value: user.LoginFailures},
		{Key: "security_question_failures", Value: user.SecurityQuestionFailures},
		{Key: "security_questions", Value: user.SecurityQuestions},
		{Key: "must_change_password", Value: user.MustChangePassword},
		{Key: "created_at", Value: user.CreatedAt},
		{Key: "updated_at", Value: user.UpdatedAt},
	}
}
