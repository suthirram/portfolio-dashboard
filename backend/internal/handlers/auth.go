package handlers

import (
	"context"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
)

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_-]{3,32}$`)

const (
	minPasswordLen      = 8
	maxNameLen          = 80
	securityAnswerCount = 3
	recoveryMaxFailures = 3
)

// ── Validation helpers ─────────────────────────────────────────────────────

func validateUsername(username string) error {
	if !usernameRe.MatchString(username) {
		return errors.New("username must be 3-32 characters of letters, digits, _ or -")
	}
	return nil
}

func validateName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || len(trimmed) > maxNameLen {
		return errors.New("name must be 1-80 characters")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < minPasswordLen {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

// hashSecurityAnswers validates and hashes exactly three catalogue answers.
func hashSecurityAnswers(answers []api.SecurityAnswerInput) ([]domain.SecurityAnswer, error) {
	if len(answers) != securityAnswerCount {
		return nil, errors.New("exactly three security questions are required")
	}
	seen := map[string]bool{}
	out := make([]domain.SecurityAnswer, 0, securityAnswerCount)
	for _, a := range answers {
		if !auth.ValidQuestionID(a.QuestionId) {
			return nil, errors.New("unknown security question")
		}
		if seen[a.QuestionId] {
			return nil, errors.New("security questions must be distinct")
		}
		seen[a.QuestionId] = true
		if auth.NormalizeAnswer(a.Answer) == "" {
			return nil, errors.New("security answers cannot be empty")
		}
		hash, err := auth.HashAnswer(a.Answer)
		if err != nil {
			return nil, err
		}
		out = append(out, domain.SecurityAnswer{QuestionID: a.QuestionId, AnswerHash: hash})
	}
	return out, nil
}

// findUserByUsername loads a user by the lowercased username.
// Returns (nil, nil) when no user exists.
func (h *Handler) findUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var u domain.User
	err := h.users().FindOne(dbCtx, bson.M{"username": auth.NormalizeUsername(username)}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// userToAPI maps a user DBO to the public DTO. Question ids are included
// only for the account itself (profile screen), not in admin listings.
func userToAPI(u *domain.User, includeQuestionIDs bool) api.User {
	out := api.User{
		Id:                 u.ID.Hex(),
		Username:           u.UsernameDisplay,
		Name:               u.Name,
		Role:               api.UserRole(u.Role),
		Region:             u.Region,
		Disabled:           u.Disabled,
		Locked:             u.Locked,
		MustChangePassword: u.MustChangePassword,
	}
	if out.Username == "" {
		out.Username = u.Username
	}
	if !u.CreatedAt.IsZero() {
		out.CreatedAt = &u.CreatedAt
	}
	out.LastLoginAt = u.LastLoginAt
	if includeQuestionIDs {
		ids := make([]string, 0, len(u.SecurityQuestions))
		for _, q := range u.SecurityQuestions {
			ids = append(ids, q.QuestionID)
		}
		out.SecurityQuestionIds = &ids
	}
	return out
}

func errPtr(msg string) *string { return &msg }

// ── Catalogues ─────────────────────────────────────────────────────────────

func (h *Handler) GetRegions(_ context.Context, _ api.GetRegionsRequestObject) (api.GetRegionsResponseObject, error) {
	regions := auth.Regions()
	out := make(api.GetRegions200JSONResponse, 0, len(regions))
	for _, r := range regions {
		out = append(out, api.Region{Id: r.ID, Label: r.Label})
	}
	return out, nil
}

func (h *Handler) GetSecurityQuestionCatalogue(_ context.Context, _ api.GetSecurityQuestionCatalogueRequestObject) (api.GetSecurityQuestionCatalogueResponseObject, error) {
	qs := auth.SecurityQuestions()
	out := make(api.GetSecurityQuestionCatalogue200JSONResponse, 0, len(qs))
	for _, q := range qs {
		out = append(out, api.SecurityQuestion{Id: q.ID, Prompt: q.Prompt})
	}
	return out, nil
}

// ── Signup ─────────────────────────────────────────────────────────────────

func (h *Handler) Signup(ctx context.Context, request api.SignupRequestObject) (api.SignupResponseObject, error) {
	in := request.Body

	if err := validateUsername(in.Username); err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}
	if err := validateName(in.Name); err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}
	if err := validatePassword(in.Password); err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}
	if !auth.ValidRegion(in.Region) {
		return api.Signup400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr("region must be one of india, europe, us")}}, nil
	}
	answers, err := hashSecurityAnswers(in.SecurityAnswers)
	if err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}

	existing, err := h.findUserByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return api.Signup409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse{Error: errPtr("username already taken")}}, nil
	}

	pwHash, err := auth.HashPassword(in.Password)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	user := domain.User{
		ID:                primitive.NewObjectID(),
		Username:          auth.NormalizeUsername(in.Username),
		UsernameDisplay:   strings.TrimSpace(in.Username),
		Name:              strings.TrimSpace(in.Name),
		PasswordHash:      pwHash,
		Role:              domain.RoleUser,
		Region:            in.Region,
		SecurityQuestions: answers,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().InsertOne(dbCtx, user); err != nil {
		// The unique index is the authority; a concurrent signup loses here.
		if mongo.IsDuplicateKeyError(err) {
			return api.Signup409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse{Error: errPtr("username already taken")}}, nil
		}
		h.reqLog(ctx).ErrorContext(ctx, "signup insert failed", slog.String("error", err.Error()))
		return nil, err
	}

	if err := h.issueSession(ctx, user.ID); err != nil {
		h.logSessionError(ctx, "signup", err)
		return nil, err
	}

	h.reqLog(ctx).InfoContext(ctx, "user signed up",
		slog.String("user_id", user.ID.Hex()),
		slog.String("region", user.Region),
	)
	return api.Signup201JSONResponse(userToAPI(&user, true)), nil
}

// ── Login / logout / me ────────────────────────────────────────────────────

func (h *Handler) Login(ctx context.Context, request api.LoginRequestObject) (api.LoginResponseObject, error) {
	in := request.Body

	user, err := h.findUserByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return api.Login401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("invalid username or password")}}, nil
	}
	if user.Disabled {
		return api.Login403JSONResponse{ForbiddenJSONResponse: api.ForbiddenJSONResponse{Error: errPtr("account is hidden; contact your administrator")}}, nil
	}
	if user.Locked {
		return api.Login423JSONResponse{LockedJSONResponse: api.LockedJSONResponse{Error: errPtr("account is locked; contact your administrator")}}, nil
	}
	if !auth.CheckPassword(user.PasswordHash, in.Password) {
		dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$inc": bson.M{"login_failures": 1}}); err != nil {
			h.reqLog(ctx).WarnContext(ctx, "login failure counter update failed", slog.String("error", err.Error()))
		}
		return api.Login401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("invalid username or password")}}, nil
	}

	if err := h.issueSession(ctx, user.ID); err != nil {
		h.logSessionError(ctx, "login", err)
		return nil, err
	}

	now := time.Now()
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID},
		bson.M{"$set": bson.M{"last_login_at": now, "login_failures": 0}}); err != nil {
		h.reqLog(ctx).WarnContext(ctx, "last login update failed", slog.String("error", err.Error()))
	}
	user.LastLoginAt = &now

	h.reqLog(ctx).InfoContext(ctx, "user logged in", slog.String("user_id", user.ID.Hex()))
	return api.Login200JSONResponse(userToAPI(user, true)), nil
}

func (h *Handler) Logout(ctx context.Context, _ api.LogoutRequestObject) (api.LogoutResponseObject, error) {
	if err := h.destroySession(ctx); err != nil {
		h.logSessionError(ctx, "logout", err)
		return nil, err
	}
	return api.Logout204Response{}, nil
}

func (h *Handler) GetMe(ctx context.Context, _ api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return api.GetMe401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("not logged in")}}, nil
	}
	return api.GetMe200JSONResponse(userToAPI(user, true)), nil
}

// ── Forgot password (no email) ─────────────────────────────────────────────

func (h *Handler) GetRecoveryQuestions(ctx context.Context, request api.GetRecoveryQuestionsRequestObject) (api.GetRecoveryQuestionsResponseObject, error) {
	user, err := h.findUserByUsername(ctx, request.Body.Username)
	if err != nil {
		return nil, err
	}
	// A hidden account is reported as unknown — it must not be recoverable
	// and its existence is not revealed.
	if user == nil || user.Disabled {
		return api.GetRecoveryQuestions404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: errPtr("no such account")}}, nil
	}
	if user.Locked || user.SecurityQuestionFailures >= recoveryMaxFailures {
		return api.GetRecoveryQuestions423JSONResponse{LockedJSONResponse: api.LockedJSONResponse{Error: errPtr("recovery is locked; contact your administrator")}}, nil
	}

	out := make(api.GetRecoveryQuestions200JSONResponse, 0, len(user.SecurityQuestions))
	for _, q := range user.SecurityQuestions {
		out = append(out, api.SecurityQuestion{Id: q.QuestionID, Prompt: auth.QuestionPrompt(q.QuestionID)})
	}
	return out, nil
}

func (h *Handler) RecoverPassword(ctx context.Context, request api.RecoverPasswordRequestObject) (api.RecoverPasswordResponseObject, error) {
	in := request.Body

	if err := validatePassword(in.NewPassword); err != nil {
		return api.RecoverPassword400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}

	user, err := h.findUserByUsername(ctx, in.Username)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Disabled {
		return api.RecoverPassword404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: errPtr("no such account")}}, nil
	}
	if user.Locked || user.SecurityQuestionFailures >= recoveryMaxFailures {
		return api.RecoverPassword423JSONResponse{LockedJSONResponse: api.LockedJSONResponse{Error: errPtr("recovery is locked; contact your administrator")}}, nil
	}

	// All three of the account's questions must be answered correctly.
	given := map[string]string{}
	for _, a := range in.Answers {
		given[a.QuestionId] = a.Answer
	}
	allCorrect := len(user.SecurityQuestions) == securityAnswerCount
	for _, q := range user.SecurityQuestions {
		answer, ok := given[q.QuestionID]
		if !ok || !auth.CheckAnswer(q.AnswerHash, answer) {
			allCorrect = false
		}
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if !allCorrect {
		failures := user.SecurityQuestionFailures + 1
		update := bson.M{"$inc": bson.M{"security_question_failures": 1}}
		locked := failures >= recoveryMaxFailures
		if locked {
			update["$set"] = bson.M{"locked": true}
		}
		if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, update); err != nil {
			h.reqLog(ctx).ErrorContext(ctx, "recovery failure counter update failed", slog.String("error", err.Error()))
			return nil, err
		}
		h.reqLog(ctx).WarnContext(ctx, "password recovery attempt failed",
			slog.String("user_id", user.ID.Hex()),
			slog.Int("failures", failures),
			slog.Bool("locked", locked),
		)
		if locked {
			return api.RecoverPassword423JSONResponse{LockedJSONResponse: api.LockedJSONResponse{Error: errPtr("recovery is locked; contact your administrator")}}, nil
		}
		return api.RecoverPassword401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("one or more answers were incorrect")}}, nil
	}

	pwHash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return nil, err
	}
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"password_hash":              pwHash,
		"security_question_failures": 0,
		"updated_at":                 time.Now(),
	}}); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "recovery password update failed", slog.String("error", err.Error()))
		return nil, err
	}
	if err := h.invalidateAllSessions(ctx, user.ID); err != nil {
		h.logSessionError(ctx, "recover", err)
		return nil, err
	}

	h.reqLog(ctx).InfoContext(ctx, "password recovered via security questions", slog.String("user_id", user.ID.Hex()))
	return api.RecoverPassword204Response{}, nil
}

// ── Own account management ─────────────────────────────────────────────────

func (h *Handler) ChangePassword(ctx context.Context, request api.ChangePasswordRequestObject) (api.ChangePasswordResponseObject, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("not logged in")}}, nil
	}
	in := request.Body
	if !auth.CheckPassword(user.PasswordHash, in.CurrentPassword) {
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("current password is incorrect")}}, nil
	}
	if err := validatePassword(in.NewPassword); err != nil {
		return api.ChangePassword400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}

	pwHash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return nil, err
	}
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"password_hash": pwHash,
		"updated_at":    time.Now(),
	}}); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "password change failed", slog.String("error", err.Error()))
		return nil, err
	}
	if err := h.invalidateOtherSessions(ctx, user.ID); err != nil {
		h.logSessionError(ctx, "change-password", err)
		return nil, err
	}

	h.reqLog(ctx).InfoContext(ctx, "password changed", slog.String("user_id", user.ID.Hex()))
	return api.ChangePassword204Response{}, nil
}

func (h *Handler) UpdateProfile(ctx context.Context, request api.UpdateProfileRequestObject) (api.UpdateProfileResponseObject, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return api.UpdateProfile401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("not logged in")}}, nil
	}
	in := request.Body
	if !auth.CheckPassword(user.PasswordHash, in.CurrentPassword) {
		return api.UpdateProfile401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("current password is incorrect")}}, nil
	}

	updated := *user
	set := bson.M{"updated_at": time.Now()}

	if in.Name != nil {
		if err := validateName(*in.Name); err != nil {
			return api.UpdateProfile400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
		}
		updated.Name = strings.TrimSpace(*in.Name)
		set["name"] = updated.Name
	}

	if in.Username != nil {
		if err := validateUsername(*in.Username); err != nil {
			return api.UpdateProfile400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
		}
		newLower := auth.NormalizeUsername(*in.Username)
		if newLower != user.Username {
			existing, err := h.findUserByUsername(ctx, newLower)
			if err != nil {
				return nil, err
			}
			if existing != nil {
				return api.UpdateProfile409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse{Error: errPtr("username already taken")}}, nil
			}
		}
		updated.Username = newLower
		updated.UsernameDisplay = strings.TrimSpace(*in.Username)
		set["username"] = updated.Username
		set["username_display"] = updated.UsernameDisplay
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$set": set}); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return api.UpdateProfile409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse{Error: errPtr("username already taken")}}, nil
		}
		h.reqLog(ctx).ErrorContext(ctx, "profile update failed", slog.String("error", err.Error()))
		return nil, err
	}

	h.reqLog(ctx).InfoContext(ctx, "profile updated", slog.String("user_id", user.ID.Hex()))
	return api.UpdateProfile200JSONResponse(userToAPI(&updated, true)), nil
}

func (h *Handler) UpdateSecurityQuestions(ctx context.Context, request api.UpdateSecurityQuestionsRequestObject) (api.UpdateSecurityQuestionsResponseObject, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return api.UpdateSecurityQuestions401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("not logged in")}}, nil
	}
	in := request.Body
	if !auth.CheckPassword(user.PasswordHash, in.CurrentPassword) {
		return api.UpdateSecurityQuestions401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("current password is incorrect")}}, nil
	}
	answers, err := hashSecurityAnswers(in.SecurityAnswers)
	if err != nil {
		return api.UpdateSecurityQuestions400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"security_questions": answers,
		"updated_at":         time.Now(),
	}}); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "security questions update failed", slog.String("error", err.Error()))
		return nil, err
	}

	h.reqLog(ctx).InfoContext(ctx, "security questions updated", slog.String("user_id", user.ID.Hex()))
	return api.UpdateSecurityQuestions204Response{}, nil
}

func (h *Handler) CompleteOnboarding(ctx context.Context, request api.CompleteOnboardingRequestObject) (api.CompleteOnboardingResponseObject, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return api.CompleteOnboarding401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("not logged in")}}, nil
	}
	in := request.Body
	if !auth.CheckPassword(user.PasswordHash, in.CurrentPassword) {
		return api.CompleteOnboarding401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse{Error: errPtr("current password is incorrect")}}, nil
	}
	if err := validatePassword(in.NewPassword); err != nil {
		return api.CompleteOnboarding400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}
	answers, err := hashSecurityAnswers(in.SecurityAnswers)
	if err != nil {
		return api.CompleteOnboarding400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: errPtr(err.Error())}}, nil
	}

	pwHash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		return nil, err
	}
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.users().UpdateOne(dbCtx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"password_hash":        pwHash,
		"security_questions":   answers,
		"must_change_password": false,
		"updated_at":           time.Now(),
	}}); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "onboarding update failed", slog.String("error", err.Error()))
		return nil, err
	}
	if err := h.invalidateOtherSessions(ctx, user.ID); err != nil {
		h.logSessionError(ctx, "onboarding", err)
		return nil, err
	}

	updated := *user
	updated.MustChangePassword = false
	updated.SecurityQuestions = answers

	h.reqLog(ctx).InfoContext(ctx, "onboarding completed", slog.String("user_id", user.ID.Hex()))
	return api.CompleteOnboarding200JSONResponse(userToAPI(&updated, true)), nil
}
