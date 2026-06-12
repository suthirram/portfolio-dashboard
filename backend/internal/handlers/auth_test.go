package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
)

// echoTestContext returns a request context carrying an echo.Context so
// handlers can set cookies, plus the recorder to inspect them.
func echoTestContext() (context.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return WithEchoContext(context.Background(), c), rec
}

func validAnswers() []api.SecurityAnswerInput {
	return []api.SecurityAnswerInput{
		{QuestionId: "favourite_movie", Answer: "The Matrix"},
		{QuestionId: "favourite_book", Answer: "Dune"},
		{QuestionId: "first_programming_lang", Answer: "Go"},
	}
}

func validSignup() api.SignupRequest {
	return api.SignupRequest{
		Username:        "Alice_1",
		Name:            "Alice",
		Password:        "longenough",
		Region:          "india",
		SecurityAnswers: validAnswers(),
	}
}

// userDocument builds a users-collection document for mtest cursor responses.
func userDocument(t *testing.T, id primitive.ObjectID, username, password, role, region string, mutate func(bson.M)) bson.D {
	t.Helper()
	pwHash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	questions := bson.A{}
	for _, a := range validAnswers() {
		h, err := auth.HashAnswer(a.Answer)
		if err != nil {
			t.Fatalf("HashAnswer: %v", err)
		}
		questions = append(questions, bson.M{"question_id": a.QuestionId, "answer_hash": h})
	}
	doc := bson.M{
		"_id":                        id,
		"username":                   username,
		"username_display":           username,
		"name":                       "Some Name",
		"password_hash":              pwHash,
		"role":                       role,
		"region":                     region,
		"disabled":                   false,
		"locked":                     false,
		"login_failures":             0,
		"security_question_failures": 0,
		"security_questions":         questions,
		"must_change_password":       false,
		"created_at":                 time.Now(),
		"updated_at":                 time.Now(),
	}
	if mutate != nil {
		mutate(doc)
	}
	out := bson.D{}
	for k, v := range doc {
		out = append(out, bson.E{Key: k, Value: v})
	}
	return out
}

func usersNS(mt *mtest.T) string    { return mt.DB.Name() + ".users" }
func sessionsNS(mt *mtest.T) string { return mt.DB.Name() + ".sessions" }

// ── Catalogues ─────────────────────────────────────────────────────────────

func TestGetRegions_ReturnsCatalogue(t *testing.T) {
	h := &Handler{}
	resp, err := h.GetRegions(context.Background(), api.GetRegionsRequestObject{})
	if err != nil {
		t.Fatalf("GetRegions: %v", err)
	}
	got := resp.(api.GetRegions200JSONResponse)
	if len(got) != 3 {
		t.Fatalf("regions = %d, want 3", len(got))
	}
	if got[0].Id != "india" || got[0].Label != "India" {
		t.Errorf("first region = %+v, want india/India", got[0])
	}
}

func TestGetSecurityQuestionCatalogue_ReturnsTen(t *testing.T) {
	h := &Handler{}
	resp, err := h.GetSecurityQuestionCatalogue(context.Background(), api.GetSecurityQuestionCatalogueRequestObject{})
	if err != nil {
		t.Fatalf("GetSecurityQuestionCatalogue: %v", err)
	}
	got := resp.(api.GetSecurityQuestionCatalogue200JSONResponse)
	if len(got) != 10 {
		t.Fatalf("questions = %d, want 10", len(got))
	}
}

// ── Signup ─────────────────────────────────────────────────────────────────

func TestSignup_RejectsInvalidInput(t *testing.T) {
	h := &Handler{}

	cases := map[string]func(*api.SignupRequest){
		"short username":         func(r *api.SignupRequest) { r.Username = "ab" },
		"long username":          func(r *api.SignupRequest) { r.Username = "abcdefghijklmnopqrstuvwxyz_0123456789" },
		"bad username chars":     func(r *api.SignupRequest) { r.Username = "alice!@#" },
		"empty name":             func(r *api.SignupRequest) { r.Name = "  " },
		"short password":         func(r *api.SignupRequest) { r.Password = "short" },
		"bad region":             func(r *api.SignupRequest) { r.Region = "atlantis" },
		"two answers":            func(r *api.SignupRequest) { r.SecurityAnswers = r.SecurityAnswers[:2] },
		"duplicate question ids": func(r *api.SignupRequest) { r.SecurityAnswers[1].QuestionId = r.SecurityAnswers[0].QuestionId },
		"unknown question id":    func(r *api.SignupRequest) { r.SecurityAnswers[0].QuestionId = "mother_maiden_name" },
		"blank answer":           func(r *api.SignupRequest) { r.SecurityAnswers[0].Answer = "   " },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			body := validSignup()
			mutate(&body)
			resp, err := h.Signup(context.Background(), api.SignupRequestObject{Body: &body})
			if err != nil {
				t.Fatalf("Signup: %v", err)
			}
			if _, ok := resp.(api.Signup400JSONResponse); !ok {
				t.Fatalf("response = %T, want Signup400JSONResponse", resp)
			}
		})
	}
}

func TestSignup_RejectsDuplicateUsername(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("duplicate", func(mt *mtest.T) {
		existing := userDocument(t, primitive.NewObjectID(), "alice_1", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, existing))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		body := validSignup()
		resp, err := h.Signup(context.Background(), api.SignupRequestObject{Body: &body})
		if err != nil {
			t.Fatalf("Signup: %v", err)
		}
		if _, ok := resp.(api.Signup409JSONResponse); !ok {
			t.Fatalf("response = %T, want Signup409JSONResponse", resp)
		}
	})
}

func TestSignup_CreatesUserAndLogsIn(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("success", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch), // no duplicate
			mtest.CreateSuccessResponse(),                                // insert user
			mtest.CreateSuccessResponse(),                                // insert session
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		ctx, rec := echoTestContext()
		body := validSignup()
		resp, err := h.Signup(ctx, api.SignupRequestObject{Body: &body})
		if err != nil {
			t.Fatalf("Signup: %v", err)
		}
		got, ok := resp.(api.Signup201JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want Signup201JSONResponse", resp)
		}
		if got.Username != "Alice_1" {
			t.Errorf("username = %q, want display form Alice_1", got.Username)
		}
		if got.Role != api.UserRoleUser {
			t.Errorf("role = %q, want user", got.Role)
		}
		if got.Region != "india" {
			t.Errorf("region = %q, want india", got.Region)
		}

		cookies := rec.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Name != "pd_session" {
			t.Fatalf("cookies = %+v, want one pd_session cookie", cookies)
		}
		if cookies[0].Value == "" || !cookies[0].HttpOnly {
			t.Errorf("session cookie not opaque+HttpOnly: %+v", cookies[0])
		}
	})
}

// ── Login ──────────────────────────────────────────────────────────────────

func TestLogin_UnknownUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("unknown user", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.Login(context.Background(), api.LoginRequestObject{
			Body: &api.LoginRequest{Username: "ghost", Password: "whatever1"},
		})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		if _, ok := resp.(api.Login401JSONResponse); !ok {
			t.Fatalf("response = %T, want Login401JSONResponse", resp)
		}
	})
}

func TestLogin_DisabledAndLockedAreToldWhy(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("disabled gets 403", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "correct-pass", domain.RoleUser, "india",
			func(m bson.M) { m["disabled"] = true })
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.Login(context.Background(), api.LoginRequestObject{
			Body: &api.LoginRequest{Username: "alice", Password: "correct-pass"},
		})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		if _, ok := resp.(api.Login403JSONResponse); !ok {
			t.Fatalf("response = %T, want Login403JSONResponse", resp)
		}
	})

	mt.Run("locked gets 423", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "correct-pass", domain.RoleUser, "india",
			func(m bson.M) { m["locked"] = true })
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.Login(context.Background(), api.LoginRequestObject{
			Body: &api.LoginRequest{Username: "alice", Password: "correct-pass"},
		})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		if _, ok := resp.(api.Login423JSONResponse); !ok {
			t.Fatalf("response = %T, want Login423JSONResponse", resp)
		}
	})
}

func TestLogin_WrongPasswordIncrementsFailures(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("wrong password", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "correct-pass", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc),
			mtest.CreateSuccessResponse(), // $inc login_failures
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.Login(context.Background(), api.LoginRequestObject{
			Body: &api.LoginRequest{Username: "alice", Password: "wrong-pass"},
		})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		if _, ok := resp.(api.Login401JSONResponse); !ok {
			t.Fatalf("response = %T, want Login401JSONResponse", resp)
		}
	})
}

func TestLogin_SuccessIssuesSessionCookie(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("success", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "correct-pass", domain.RoleUser, "europe",
			func(m bson.M) { m["username_display"] = "Alice" })
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc),
			mtest.CreateSuccessResponse(), // insert session
			mtest.CreateSuccessResponse(), // update last_login_at
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		ctx, rec := echoTestContext()
		resp, err := h.Login(ctx, api.LoginRequestObject{
			Body: &api.LoginRequest{Username: "ALICE", Password: "correct-pass"},
		})
		if err != nil {
			t.Fatalf("Login: %v", err)
		}
		got, ok := resp.(api.Login200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want Login200JSONResponse", resp)
		}
		if got.Username != "Alice" {
			t.Errorf("username = %q, want display form Alice", got.Username)
		}

		cookies := rec.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Name != "pd_session" || cookies[0].Value == "" {
			t.Fatalf("cookies = %+v, want one non-empty pd_session", cookies)
		}
	})
}

// ── Me / Logout ────────────────────────────────────────────────────────────

func TestGetMe_ReturnsCurrentUserWithQuestionIDs(t *testing.T) {
	h := &Handler{}
	u := &domain.User{
		ID:              primitive.NewObjectID(),
		Username:        "alice",
		UsernameDisplay: "Alice",
		Name:            "Alice A",
		Role:            domain.RoleAdmin,
		Region:          "us",
		SecurityQuestions: []domain.SecurityAnswer{
			{QuestionID: "favourite_movie"}, {QuestionID: "favourite_book"}, {QuestionID: "first_job"},
		},
	}
	ctx := auth.WithUser(context.Background(), u)

	resp, err := h.GetMe(ctx, api.GetMeRequestObject{})
	if err != nil {
		t.Fatalf("GetMe: %v", err)
	}
	got, ok := resp.(api.GetMe200JSONResponse)
	if !ok {
		t.Fatalf("response = %T, want GetMe200JSONResponse", resp)
	}
	if got.Username != "Alice" || got.Role != api.UserRoleAdmin || got.Region != "us" {
		t.Errorf("unexpected user payload: %+v", got)
	}
	if got.SecurityQuestionIds == nil || len(*got.SecurityQuestionIds) != 3 {
		t.Errorf("security_question_ids missing: %+v", got.SecurityQuestionIds)
	}
}

func TestGetMe_Unauthenticated(t *testing.T) {
	h := &Handler{}
	resp, err := h.GetMe(context.Background(), api.GetMeRequestObject{})
	if err != nil {
		t.Fatalf("GetMe: %v", err)
	}
	if _, ok := resp.(api.GetMe401JSONResponse); !ok {
		t.Fatalf("response = %T, want GetMe401JSONResponse", resp)
	}
}

func TestLogout_DeletesSessionAndClearsCookie(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("logout", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1})) // delete session

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		ctx, rec := echoTestContext()
		ctx = auth.WithUser(ctx, &domain.User{ID: primitive.NewObjectID()})
		ctx = auth.WithSessionID(ctx, "some-opaque-id")

		resp, err := h.Logout(ctx, api.LogoutRequestObject{})
		if err != nil {
			t.Fatalf("Logout: %v", err)
		}
		if _, ok := resp.(api.Logout204Response); !ok {
			t.Fatalf("response = %T, want Logout204Response", resp)
		}

		cookies := rec.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Name != "pd_session" || cookies[0].MaxAge >= 0 && cookies[0].Expires.After(time.Now()) {
			t.Fatalf("cookies = %+v, want expired pd_session", cookies)
		}
	})
}

// ── Recovery ───────────────────────────────────────────────────────────────

func TestGetRecoveryQuestions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("unknown user gets 404", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetRecoveryQuestions(context.Background(), api.GetRecoveryQuestionsRequestObject{
			Body: &api.RecoverQuestionsRequest{Username: "ghost"},
		})
		if err != nil {
			t.Fatalf("GetRecoveryQuestions: %v", err)
		}
		if _, ok := resp.(api.GetRecoveryQuestions404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", resp)
		}
	})

	mt.Run("locked gets 423", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "pw-irrelevant", domain.RoleUser, "india",
			func(m bson.M) { m["locked"] = true })
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetRecoveryQuestions(context.Background(), api.GetRecoveryQuestionsRequestObject{
			Body: &api.RecoverQuestionsRequest{Username: "alice"},
		})
		if err != nil {
			t.Fatalf("GetRecoveryQuestions: %v", err)
		}
		if _, ok := resp.(api.GetRecoveryQuestions423JSONResponse); !ok {
			t.Fatalf("response = %T, want 423", resp)
		}
	})

	mt.Run("returns the user's three prompts", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "pw-irrelevant", domain.RoleUser, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetRecoveryQuestions(context.Background(), api.GetRecoveryQuestionsRequestObject{
			Body: &api.RecoverQuestionsRequest{Username: "Alice"},
		})
		if err != nil {
			t.Fatalf("GetRecoveryQuestions: %v", err)
		}
		got, ok := resp.(api.GetRecoveryQuestions200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if len(got) != 3 {
			t.Fatalf("questions = %d, want 3", len(got))
		}
		if got[0].Id != "favourite_movie" || got[0].Prompt == "" {
			t.Errorf("first question = %+v, want favourite_movie with prompt", got[0])
		}
	})
}

func TestRecoverPassword_AllAnswersCorrectResetsPassword(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("full match", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "old-password", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc),
			mtest.CreateSuccessResponse(),                           // update password + counters
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 2}), // delete all sessions
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.RecoverPassword(context.Background(), api.RecoverPasswordRequestObject{
			Body: &api.RecoverRequest{
				Username:    "alice",
				NewPassword: "brand-new-pass",
				Answers: []api.SecurityAnswerInput{
					// normalization: case/whitespace must not matter
					{QuestionId: "favourite_movie", Answer: "  the MATRIX "},
					{QuestionId: "favourite_book", Answer: "dune"},
					{QuestionId: "first_programming_lang", Answer: "GO"},
				},
			},
		})
		if err != nil {
			t.Fatalf("RecoverPassword: %v", err)
		}
		if _, ok := resp.(api.RecoverPassword204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}
	})
}

func TestRecoverPassword_WrongAnswerCountsAndLocks(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("one wrong answer gets 401", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "old-password", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc),
			mtest.CreateSuccessResponse(), // increment failures
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		answers := validAnswers()
		answers[2].Answer = "Python" // wrong
		resp, err := h.RecoverPassword(context.Background(), api.RecoverPasswordRequestObject{
			Body: &api.RecoverRequest{Username: "alice", NewPassword: "brand-new-pass", Answers: answers},
		})
		if err != nil {
			for _, e := range mt.GetAllStartedEvents() {
				mt.Logf("issued command: %s", e.CommandName)
			}
			t.Fatalf("RecoverPassword: %v", err)
		}
		if _, ok := resp.(api.RecoverPassword401JSONResponse); !ok {
			t.Fatalf("response = %T, want 401", resp)
		}
	})

	mt.Run("third failure locks recovery", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "old-password", domain.RoleUser, "india",
			func(m bson.M) { m["security_question_failures"] = 2 })
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc),
			mtest.CreateSuccessResponse(), // increment + lock
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		answers := validAnswers()
		answers[0].Answer = "wrong"
		resp, err := h.RecoverPassword(context.Background(), api.RecoverPasswordRequestObject{
			Body: &api.RecoverRequest{Username: "alice", NewPassword: "brand-new-pass", Answers: answers},
		})
		if err != nil {
			t.Fatalf("RecoverPassword: %v", err)
		}
		if _, ok := resp.(api.RecoverPassword423JSONResponse); !ok {
			t.Fatalf("response = %T, want 423 once recovery locks", resp)
		}
	})

	mt.Run("already locked gets 423 without comparing", func(mt *mtest.T) {
		doc := userDocument(t, primitive.NewObjectID(), "alice", "old-password", domain.RoleUser, "india",
			func(m bson.M) { m["locked"] = true; m["security_question_failures"] = 3 })
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, doc))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.RecoverPassword(context.Background(), api.RecoverPasswordRequestObject{
			Body: &api.RecoverRequest{Username: "alice", NewPassword: "brand-new-pass", Answers: validAnswers()},
		})
		if err != nil {
			t.Fatalf("RecoverPassword: %v", err)
		}
		if _, ok := resp.(api.RecoverPassword423JSONResponse); !ok {
			t.Fatalf("response = %T, want 423", resp)
		}
	})
}

// ── Password / profile / questions / onboarding ────────────────────────────

func authedCtx(u *domain.User) context.Context {
	ctx := auth.WithUser(context.Background(), u)
	return auth.WithSessionID(ctx, "current-session-id")
}

func testUser(t *testing.T, password string) *domain.User {
	t.Helper()
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	return &domain.User{
		ID:              primitive.NewObjectID(),
		Username:        "alice",
		UsernameDisplay: "Alice",
		Name:            "Alice A",
		PasswordHash:    hash,
		Role:            domain.RoleUser,
		Region:          "india",
	}
}

func TestChangePassword(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("wrong current password gets 401", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ChangePassword(authedCtx(testUser(t, "right-pass")), api.ChangePasswordRequestObject{
			Body: &api.ChangePasswordRequest{CurrentPassword: "wrong-pass", NewPassword: "new-password"},
		})
		if err != nil {
			t.Fatalf("ChangePassword: %v", err)
		}
		if _, ok := resp.(api.ChangePassword401JSONResponse); !ok {
			t.Fatalf("response = %T, want 401", resp)
		}
	})

	mt.Run("short new password gets 400", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ChangePassword(authedCtx(testUser(t, "right-pass")), api.ChangePasswordRequestObject{
			Body: &api.ChangePasswordRequest{CurrentPassword: "right-pass", NewPassword: "short"},
		})
		if err != nil {
			t.Fatalf("ChangePassword: %v", err)
		}
		if _, ok := resp.(api.ChangePassword400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})

	mt.Run("success updates hash and signs out other sessions", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(),                           // update password
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}), // delete other sessions
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ChangePassword(authedCtx(testUser(t, "right-pass")), api.ChangePasswordRequestObject{
			Body: &api.ChangePasswordRequest{CurrentPassword: "right-pass", NewPassword: "new-password"},
		})
		if err != nil {
			t.Fatalf("ChangePassword: %v", err)
		}
		if _, ok := resp.(api.ChangePassword204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}
	})
}

func TestUpdateProfile(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("wrong password gets 401", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		newName := "New Name"
		resp, err := h.UpdateProfile(authedCtx(testUser(t, "right-pass")), api.UpdateProfileRequestObject{
			Body: &api.UpdateProfileRequest{CurrentPassword: "nope", Name: &newName},
		})
		if err != nil {
			t.Fatalf("UpdateProfile: %v", err)
		}
		if _, ok := resp.(api.UpdateProfile401JSONResponse); !ok {
			t.Fatalf("response = %T, want 401", resp)
		}
	})

	mt.Run("taken username gets 409", func(mt *mtest.T) {
		other := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, other))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		newUsername := "Bob"
		resp, err := h.UpdateProfile(authedCtx(testUser(t, "right-pass")), api.UpdateProfileRequestObject{
			Body: &api.UpdateProfileRequest{CurrentPassword: "right-pass", Username: &newUsername},
		})
		if err != nil {
			t.Fatalf("UpdateProfile: %v", err)
		}
		if _, ok := resp.(api.UpdateProfile409JSONResponse); !ok {
			t.Fatalf("response = %T, want 409", resp)
		}
	})

	mt.Run("success returns updated account", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch), // username free
			mtest.CreateSuccessResponse(),                                // update
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		newUsername := "Alice2"
		newName := "Alice Adams"
		resp, err := h.UpdateProfile(authedCtx(testUser(t, "right-pass")), api.UpdateProfileRequestObject{
			Body: &api.UpdateProfileRequest{CurrentPassword: "right-pass", Username: &newUsername, Name: &newName},
		})
		if err != nil {
			t.Fatalf("UpdateProfile: %v", err)
		}
		got, ok := resp.(api.UpdateProfile200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.Username != "Alice2" || got.Name != "Alice Adams" {
			t.Errorf("updated user = %+v", got)
		}
	})
}

func TestUpdateSecurityQuestions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("invalid answers get 400", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		answers := validAnswers()[:2]
		resp, err := h.UpdateSecurityQuestions(authedCtx(testUser(t, "right-pass")), api.UpdateSecurityQuestionsRequestObject{
			Body: &api.UpdateSecurityQuestionsRequest{CurrentPassword: "right-pass", SecurityAnswers: answers},
		})
		if err != nil {
			t.Fatalf("UpdateSecurityQuestions: %v", err)
		}
		if _, ok := resp.(api.UpdateSecurityQuestions400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})

	mt.Run("success replaces questions", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse())
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.UpdateSecurityQuestions(authedCtx(testUser(t, "right-pass")), api.UpdateSecurityQuestionsRequestObject{
			Body: &api.UpdateSecurityQuestionsRequest{CurrentPassword: "right-pass", SecurityAnswers: validAnswers()},
		})
		if err != nil {
			t.Fatalf("UpdateSecurityQuestions: %v", err)
		}
		if _, ok := resp.(api.UpdateSecurityQuestions204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}
	})
}

func TestCompleteOnboarding_ClearsMustChangePassword(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("success", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(),                           // update user
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}), // delete other sessions
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		u := testUser(t, "admin")
		u.Role = domain.RoleSuperAdmin
		u.Region = ""
		u.MustChangePassword = true
		resp, err := h.CompleteOnboarding(authedCtx(u), api.CompleteOnboardingRequestObject{
			Body: &api.OnboardingRequest{
				CurrentPassword: "admin",
				NewPassword:     "a-real-password",
				SecurityAnswers: validAnswers(),
			},
		})
		if err != nil {
			t.Fatalf("CompleteOnboarding: %v", err)
		}
		got, ok := resp.(api.CompleteOnboarding200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.MustChangePassword {
			t.Error("must_change_password still true after onboarding")
		}
	})

	mt.Run("wrong current password gets 401", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		u := testUser(t, "admin")
		u.MustChangePassword = true
		resp, err := h.CompleteOnboarding(authedCtx(u), api.CompleteOnboardingRequestObject{
			Body: &api.OnboardingRequest{
				CurrentPassword: "wrong",
				NewPassword:     "a-real-password",
				SecurityAnswers: validAnswers(),
			},
		})
		if err != nil {
			t.Fatalf("CompleteOnboarding: %v", err)
		}
		if _, ok := resp.(api.CompleteOnboarding401JSONResponse); !ok {
			t.Fatalf("response = %T, want 401", resp)
		}
	})
}
