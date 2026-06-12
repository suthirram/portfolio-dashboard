package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
)

const sessionCookieName = "pd_session"

func (h *Handler) ListRegions(ctx context.Context, _ api.ListRegionsRequestObject) (api.ListRegionsResponseObject, error) {
	regions := auth.Regions()
	out := make(api.ListRegions200JSONResponse, 0, len(regions))
	for _, region := range regions {
		out = append(out, regionToAPI(region))
	}
	return out, nil
}

func (h *Handler) ListSecurityQuestions(ctx context.Context, _ api.ListSecurityQuestionsRequestObject) (api.ListSecurityQuestionsResponseObject, error) {
	questions := auth.SecurityQuestions()
	out := make(api.ListSecurityQuestions200JSONResponse, 0, len(questions))
	for _, question := range questions {
		out = append(out, securityQuestionToAPI(question))
	}
	return out, nil
}

func (h *Handler) Signup(ctx context.Context, request api.SignupRequestObject) (api.SignupResponseObject, error) {
	body := request.Body
	username, err := auth.ValidateUsername(body.Username)
	if err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	name := strings.TrimSpace(body.Name)
	if err := auth.ValidateName(name); err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	if err := auth.ValidatePassword(body.Password); err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	region := string(body.Region)
	if !auth.ValidRegion(region) {
		return api.Signup400JSONResponse{BadRequestJSONResponse: badRequest("region is invalid")}, nil
	}
	securityAnswers, err := auth.HashSecurityAnswers(securityAnswerInputsFromAPI(body.SecurityQuestions))
	if err != nil {
		return api.Signup400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	passwordHash, err := auth.HashPassword(body.Password)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	user := auth.User{
		ID:                primitive.NewObjectID(),
		Username:          username,
		UsernameDisplay:   strings.TrimSpace(body.Username),
		Name:              name,
		PasswordHash:      passwordHash,
		Role:              auth.RoleUser,
		Region:            region,
		SecurityQuestions: securityAnswers,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if _, err := h.users().InsertOne(ctx, user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return api.Signup409JSONResponse{ConflictJSONResponse: conflict("username already exists")}, nil
		}
		return nil, err
	}
	cookie, err := h.createSession(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	apiUser := authUserToAPI(user)
	return api.Signup201JSONResponse{
		Body:    api.AuthResponse{User: &apiUser},
		Headers: api.Signup201ResponseHeaders{SetCookie: &cookie},
	}, nil
}

func (h *Handler) Login(ctx context.Context, request api.LoginRequestObject) (api.LoginResponseObject, error) {
	user, err := h.findUserByUsername(ctx, request.Body.Username)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.Login401JSONResponse{UnauthorizedJSONResponse: unauthorized("invalid username or password")}, nil
		}
		return nil, err
	}
	if user.Disabled {
		return api.Login403JSONResponse{ForbiddenJSONResponse: forbidden("account is disabled")}, nil
	}
	if user.Locked {
		return api.Login423JSONResponse{LockedJSONResponse: locked("account recovery is locked")}, nil
	}
	if !auth.CheckPassword(user.PasswordHash, request.Body.Password) {
		_, err := h.users().UpdateByID(ctx, user.ID, bson.M{"$inc": bson.M{"login_failures": 1}, "$set": bson.M{"updated_at": time.Now()}})
		if err != nil {
			return nil, err
		}
		return api.Login401JSONResponse{UnauthorizedJSONResponse: unauthorized("invalid username or password")}, nil
	}

	now := time.Now()
	user.LastLoginAt = &now
	user.LoginFailures = 0
	user.UpdatedAt = now
	if _, err := h.users().UpdateByID(ctx, user.ID, bson.M{"$set": bson.M{
		"last_login_at":  now,
		"login_failures": 0,
		"updated_at":     now,
	}}); err != nil {
		return nil, err
	}
	cookie, err := h.createSession(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	apiUser := authUserToAPI(user)
	return api.Login200JSONResponse{
		Body:    api.AuthResponse{User: &apiUser},
		Headers: api.Login200ResponseHeaders{SetCookie: &cookie},
	}, nil
}

func (h *Handler) Recover(ctx context.Context, request api.RecoverRequestObject) (api.RecoverResponseObject, error) {
	user, err := h.findUserByUsername(ctx, request.Body.Username)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.Recover404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
		}
		return nil, err
	}
	if user.Disabled {
		return api.Recover403JSONResponse{ForbiddenJSONResponse: forbidden("account is disabled")}, nil
	}

	if request.Body.Answers == nil || request.Body.NewPassword == nil {
		questions := userQuestionsToAPI(user)
		return api.Recover200JSONResponse{Body: api.RecoverResponse{Questions: &questions}}, nil
	}
	if user.Locked || user.SecurityQuestionFailures >= 3 {
		return api.Recover423JSONResponse{LockedJSONResponse: locked("account recovery is locked")}, nil
	}
	if err := auth.ValidatePassword(*request.Body.NewPassword); err != nil {
		return api.Recover400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}

	inputs := securityAnswerInputsFromAPI(*request.Body.Answers)
	if !auth.CheckSecurityAnswers(user.SecurityQuestions, inputs) {
		failures := user.SecurityQuestionFailures + 1
		update := bson.M{
			"$set": bson.M{"security_question_failures": failures, "updated_at": time.Now()},
		}
		if failures >= 3 {
			update["$set"].(bson.M)["locked"] = true
		}
		if _, err := h.users().UpdateByID(ctx, user.ID, update); err != nil {
			return nil, err
		}
		if failures >= 3 {
			return api.Recover423JSONResponse{LockedJSONResponse: locked("account recovery is locked")}, nil
		}
		return api.Recover401JSONResponse{UnauthorizedJSONResponse: unauthorized("security answers did not match")}, nil
	}

	passwordHash, err := auth.HashPassword(*request.Body.NewPassword)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	user.PasswordHash = passwordHash
	user.SecurityQuestionFailures = 0
	user.Locked = false
	user.UpdatedAt = now
	if _, err := h.users().UpdateByID(ctx, user.ID, bson.M{"$set": bson.M{
		"password_hash":              passwordHash,
		"security_question_failures": 0,
		"locked":                     false,
		"updated_at":                 now,
	}}); err != nil {
		return nil, err
	}
	if _, err := h.sessions().DeleteMany(ctx, bson.M{"user_id": user.ID}); err != nil {
		return nil, err
	}
	cookie, err := h.createSession(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	apiUser := authUserToAPI(user)
	return api.Recover200JSONResponse{
		Body:    api.RecoverResponse{User: &apiUser},
		Headers: api.Recover200ResponseHeaders{SetCookie: &cookie},
	}, nil
}

func (h *Handler) GetCurrentUser(ctx context.Context, _ api.GetCurrentUserRequestObject) (api.GetCurrentUserResponseObject, error) {
	user, err := currentUser(ctx)
	if err != nil {
		return api.GetCurrentUser401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	return api.GetCurrentUser200JSONResponse(authUserToAPI(user)), nil
}

func (h *Handler) Logout(ctx context.Context, _ api.LogoutRequestObject) (api.LogoutResponseObject, error) {
	sessionID, ok := auth.SessionIDFromContext(ctx)
	if !ok || sessionID == "" {
		return api.Logout401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if _, err := h.sessions().DeleteOne(ctx, bson.M{"_id": sessionID}); err != nil {
		return nil, err
	}
	clearCookie := expiredSessionCookie()
	return api.Logout200JSONResponse{
		Body:    messageResponse("logged out"),
		Headers: api.Logout200ResponseHeaders{SetCookie: &clearCookie},
	}, nil
}

func (h *Handler) ChangePassword(ctx context.Context, request api.ChangePasswordRequestObject) (api.ChangePasswordResponseObject, error) {
	user, err := currentUser(ctx)
	if err != nil {
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !auth.CheckPassword(user.PasswordHash, request.Body.CurrentPassword) {
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: unauthorized("current password is incorrect")}, nil
	}
	if err := auth.ValidatePassword(request.Body.NewPassword); err != nil {
		return api.ChangePassword400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	passwordHash, err := auth.HashPassword(request.Body.NewPassword)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var updated auth.User
	if err := h.users().FindOneAndUpdate(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"password_hash":        passwordHash,
		"must_change_password": false,
		"updated_at":           now,
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated); err != nil {
		return nil, err
	}
	sessionID, _ := auth.SessionIDFromContext(ctx)
	sessionFilter := bson.M{"user_id": user.ID}
	if sessionID != "" {
		sessionFilter["_id"] = bson.M{"$ne": sessionID}
	}
	if _, err := h.sessions().DeleteMany(ctx, sessionFilter); err != nil {
		return nil, err
	}
	return api.ChangePassword200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) UpdateProfile(ctx context.Context, request api.UpdateProfileRequestObject) (api.UpdateProfileResponseObject, error) {
	user, err := currentUser(ctx)
	if err != nil {
		return api.UpdateProfile401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !auth.CheckPassword(user.PasswordHash, request.Body.CurrentPassword) {
		return api.UpdateProfile401JSONResponse{UnauthorizedJSONResponse: unauthorized("current password is incorrect")}, nil
	}
	username, err := auth.ValidateUsername(request.Body.Username)
	if err != nil {
		return api.UpdateProfile400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	name := strings.TrimSpace(request.Body.Name)
	if err := auth.ValidateName(name); err != nil {
		return api.UpdateProfile400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}

	var updated auth.User
	err = h.users().FindOneAndUpdate(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"username":         username,
		"username_display": strings.TrimSpace(request.Body.Username),
		"name":             name,
		"updated_at":       time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return api.UpdateProfile409JSONResponse{ConflictJSONResponse: conflict("username already exists")}, nil
		}
		return nil, err
	}
	return api.UpdateProfile200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) UpdateSecurityQuestions(ctx context.Context, request api.UpdateSecurityQuestionsRequestObject) (api.UpdateSecurityQuestionsResponseObject, error) {
	user, err := currentUser(ctx)
	if err != nil {
		return api.UpdateSecurityQuestions401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !auth.CheckPassword(user.PasswordHash, request.Body.CurrentPassword) {
		return api.UpdateSecurityQuestions401JSONResponse{UnauthorizedJSONResponse: unauthorized("current password is incorrect")}, nil
	}
	answers, err := auth.HashSecurityAnswers(securityAnswerInputsFromAPI(request.Body.SecurityQuestions))
	if err != nil {
		return api.UpdateSecurityQuestions400JSONResponse{BadRequestJSONResponse: badRequest(err.Error())}, nil
	}
	var updated auth.User
	if err := h.users().FindOneAndUpdate(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{
		"security_questions": answers,
		"updated_at":         time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated); err != nil {
		return nil, err
	}
	return api.UpdateSecurityQuestions200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) findUserByUsername(ctx context.Context, username string) (auth.User, error) {
	var user auth.User
	err := h.users().FindOne(ctx, bson.M{"username": auth.NormalizeUsername(username)}).Decode(&user)
	return user, err
}

func (h *Handler) createSession(ctx context.Context, userID primitive.ObjectID) (string, error) {
	sessionID, err := auth.NewSessionID()
	if err != nil {
		return "", err
	}
	now := time.Now()
	session := auth.Session{
		ID:        sessionID,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: sessionExpiry(now),
	}
	if _, err := h.sessions().InsertOne(ctx, session); err != nil {
		return "", err
	}
	return sessionCookie(sessionID, session.ExpiresAt), nil
}

func sessionCookie(sessionID string, expires time.Time) string {
	// #nosec G124 -- SameSite=None is required for cross-origin session cookies; Secure and HttpOnly are set.
	return (&http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	}).String()
}

func expiredSessionCookie() string {
	// #nosec G124 -- SameSite=None is required for cross-origin session cookies; Secure and HttpOnly are set.
	return (&http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	}).String()
}

func errorBody(message string) api.Error {
	return api.Error{Error: &message}
}

func badRequest(message string) api.BadRequestJSONResponse {
	return api.BadRequestJSONResponse(errorBody(message))
}

func unauthorized(message string) api.UnauthorizedJSONResponse {
	return api.UnauthorizedJSONResponse(errorBody(message))
}

func forbidden(message string) api.ForbiddenJSONResponse {
	return api.ForbiddenJSONResponse(errorBody(message))
}

func notFound(message string) api.NotFoundJSONResponse {
	return api.NotFoundJSONResponse(errorBody(message))
}

func conflict(message string) api.ConflictJSONResponse {
	return api.ConflictJSONResponse(errorBody(message))
}

func locked(message string) api.LockedJSONResponse {
	return api.LockedJSONResponse(errorBody(message))
}

func parseObjectID(id string) (primitive.ObjectID, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, fmt.Errorf("invalid id")
	}
	return objectID, nil
}
