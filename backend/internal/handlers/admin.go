package handlers

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
)

func (h *Handler) ListAdminUsers(ctx context.Context, request api.ListAdminUsersRequestObject) (api.ListAdminUsersResponseObject, error) {
	caller, err := currentUser(ctx)
	if err != nil {
		return api.ListAdminUsers401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !caller.IsAdmin() {
		return api.ListAdminUsers403JSONResponse{ForbiddenJSONResponse: forbidden("admin role required")}, nil
	}

	filter := bson.M{}
	if !caller.IsSuperAdmin() {
		filter["role"] = auth.RoleUser
		filter["region"] = caller.Region
	}
	if request.Params.IncludeHidden == nil || !*request.Params.IncludeHidden {
		filter["disabled"] = false
	}

	cur, err := h.users().Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "username", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var users []auth.User
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}
	out := make(api.ListAdminUsers200JSONResponse, 0, len(users))
	for _, user := range users {
		out = append(out, authUserToAPI(user))
	}
	return out, nil
}

func (h *Handler) ListAdmins(ctx context.Context, _ api.ListAdminsRequestObject) (api.ListAdminsResponseObject, error) {
	caller, err := currentUser(ctx)
	if err != nil {
		return api.ListAdmins401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !caller.IsSuperAdmin() {
		return api.ListAdmins403JSONResponse{ForbiddenJSONResponse: forbidden("super admin role required")}, nil
	}

	cur, err := h.users().Find(ctx, bson.M{"role": bson.M{"$in": []string{auth.RoleAdmin, auth.RoleSuperAdmin}}}, options.Find().SetSort(bson.D{{Key: "role", Value: 1}, {Key: "username", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var users []auth.User
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}
	out := make(api.ListAdmins200JSONResponse, 0, len(users))
	for _, user := range users {
		out = append(out, authUserToAPI(user))
	}
	return out, nil
}

func (h *Handler) GetAdminUser(ctx context.Context, request api.GetAdminUserRequestObject) (api.GetAdminUserResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return adminUserResponse(resp)
	}
	return api.GetAdminUser200JSONResponse(authUserToAPI(target)), nil
}

func (h *Handler) ResetAdminUserLockout(ctx context.Context, request api.ResetAdminUserLockoutRequestObject) (api.ResetAdminUserLockoutResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return resetLockoutResponse(resp)
	}
	var updated auth.User
	if err := h.users().FindOneAndUpdate(ctx, bson.M{"_id": target.ID}, bson.M{"$set": bson.M{
		"security_question_failures": 0,
		"locked":                     false,
		"updated_at":                 time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated); err != nil {
		return nil, err
	}
	return api.ResetAdminUserLockout200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) HideAdminUser(ctx context.Context, request api.HideAdminUserRequestObject) (api.HideAdminUserResponseObject, error) {
	return h.setUserDisabled(ctx, request.Id, true)
}

func (h *Handler) ReactivateAdminUser(ctx context.Context, request api.ReactivateAdminUserRequestObject) (api.ReactivateAdminUserResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return reactivateResponse(resp)
	}
	var updated auth.User
	if err := h.users().FindOneAndUpdate(ctx, bson.M{"_id": target.ID}, bson.M{"$set": bson.M{
		"disabled":   false,
		"updated_at": time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated); err != nil {
		return nil, err
	}
	return api.ReactivateAdminUser200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) setUserDisabled(ctx context.Context, id string, disabled bool) (api.HideAdminUserResponseObject, error) {
	caller, _ := currentUser(ctx)
	target, resp, err := h.authorizedTarget(ctx, id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return hideResponse(resp)
	}
	if target.ID == caller.ID {
		return api.HideAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden("cannot hide yourself")}, nil
	}
	var updated auth.User
	if err := h.users().FindOneAndUpdate(ctx, bson.M{"_id": target.ID}, bson.M{"$set": bson.M{
		"disabled":   disabled,
		"updated_at": time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated); err != nil {
		return nil, err
	}
	return api.HideAdminUser200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) DeleteAdminUser(ctx context.Context, request api.DeleteAdminUserRequestObject) (api.DeleteAdminUserResponseObject, error) {
	caller, _ := currentUser(ctx)
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return deleteUserResponse(resp)
	}
	if target.ID == caller.ID {
		return api.DeleteAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden("cannot delete yourself")}, nil
	}
	if _, err := h.col().DeleteMany(ctx, bson.M{"user_id": target.ID}); err != nil {
		return nil, err
	}
	if _, err := h.sessions().DeleteMany(ctx, bson.M{"user_id": target.ID}); err != nil {
		return nil, err
	}
	res, err := h.users().DeleteOne(ctx, bson.M{"_id": target.ID})
	if err != nil {
		return nil, err
	}
	if res.DeletedCount == 0 {
		return api.DeleteAdminUser404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
	}
	return api.DeleteAdminUser200JSONResponse(messageResponse("deleted")), nil
}

func (h *Handler) PromoteAdminUser(ctx context.Context, request api.PromoteAdminUserRequestObject) (api.PromoteAdminUserResponseObject, error) {
	return h.setRoleBySuperAdmin(ctx, request.Id, auth.RoleUser, auth.RoleAdmin)
}

func (h *Handler) DemoteAdminUser(ctx context.Context, request api.DemoteAdminUserRequestObject) (api.DemoteAdminUserResponseObject, error) {
	resp, err := h.setRoleBySuperAdmin(ctx, request.Id, auth.RoleAdmin, auth.RoleUser)
	if err != nil {
		return nil, err
	}
	switch r := resp.(type) {
	case api.PromoteAdminUser200JSONResponse:
		return api.DemoteAdminUser200JSONResponse(r), nil
	case api.PromoteAdminUser401JSONResponse:
		return api.DemoteAdminUser401JSONResponse(r), nil
	case api.PromoteAdminUser403JSONResponse:
		return api.DemoteAdminUser403JSONResponse(r), nil
	case api.PromoteAdminUser404JSONResponse:
		return api.DemoteAdminUser404JSONResponse(r), nil
	default:
		return nil, nil
	}
}

func (h *Handler) setRoleBySuperAdmin(ctx context.Context, id string, fromRole string, toRole string) (api.PromoteAdminUserResponseObject, error) {
	caller, err := currentUser(ctx)
	if err != nil {
		return api.PromoteAdminUser401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !caller.IsSuperAdmin() {
		return api.PromoteAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden("super admin role required")}, nil
	}
	targetID, err := parseObjectID(id)
	if err != nil {
		return api.PromoteAdminUser404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
	}
	if targetID == caller.ID {
		return api.PromoteAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden("cannot change your own role")}, nil
	}
	var updated auth.User
	err = h.users().FindOneAndUpdate(ctx, bson.M{"_id": targetID, "role": fromRole}, bson.M{"$set": bson.M{
		"role":       toRole,
		"updated_at": time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.PromoteAdminUser404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
		}
		return nil, err
	}
	return api.PromoteAdminUser200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) UpdateAdminUserRegion(ctx context.Context, request api.UpdateAdminUserRegionRequestObject) (api.UpdateAdminUserRegionResponseObject, error) {
	caller, err := currentUser(ctx)
	if err != nil {
		return api.UpdateAdminUserRegion401JSONResponse{UnauthorizedJSONResponse: unauthorized("authentication required")}, nil
	}
	if !caller.IsSuperAdmin() {
		return api.UpdateAdminUserRegion403JSONResponse{ForbiddenJSONResponse: forbidden("super admin role required")}, nil
	}
	region := string(request.Body.Region)
	if !auth.ValidRegion(region) {
		return api.UpdateAdminUserRegion400JSONResponse{BadRequestJSONResponse: badRequest("region is invalid")}, nil
	}
	targetID, err := parseObjectID(request.Id)
	if err != nil {
		return api.UpdateAdminUserRegion404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
	}
	if targetID == caller.ID {
		return api.UpdateAdminUserRegion403JSONResponse{ForbiddenJSONResponse: forbidden("cannot move yourself")}, nil
	}
	var updated auth.User
	err = h.users().FindOneAndUpdate(ctx, bson.M{"_id": targetID, "role": bson.M{"$ne": auth.RoleSuperAdmin}}, bson.M{"$set": bson.M{
		"region":     region,
		"updated_at": time.Now(),
	}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return api.UpdateAdminUserRegion404JSONResponse{NotFoundJSONResponse: notFound("user not found")}, nil
		}
		return nil, err
	}
	return api.UpdateAdminUserRegion200JSONResponse(authUserToAPI(updated)), nil
}

func (h *Handler) ListAdminUserHoldings(ctx context.Context, request api.ListAdminUserHoldingsRequestObject) (api.ListAdminUserHoldingsResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return listAdminHoldingsResponse(resp)
	}
	holdings, err := h.listHoldingsForUser(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.ListAdminUserHoldings200JSONResponse(holdings), nil
}

func (h *Handler) CreateAdminUserHolding(ctx context.Context, request api.CreateAdminUserHoldingRequestObject) (api.CreateAdminUserHoldingResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return createAdminHoldingResponse(resp)
	}
	created, err := h.createHoldingForUser(ctx, target.ID, request.Body)
	if err != nil {
		return nil, err
	}
	switch r := created.(type) {
	case api.CreateHolding201JSONResponse:
		return api.CreateAdminUserHolding201JSONResponse(r), nil
	case api.CreateHolding400JSONResponse:
		return api.CreateAdminUserHolding400JSONResponse(r), nil
	default:
		return nil, nil
	}
}

func (h *Handler) GetAdminUserHolding(ctx context.Context, request api.GetAdminUserHoldingRequestObject) (api.GetAdminUserHoldingResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return getAdminHoldingResponse(resp)
	}
	got, err := h.getHoldingForUser(ctx, target.ID, request.HoldingId)
	if err != nil {
		return nil, err
	}
	switch r := got.(type) {
	case api.GetHolding200JSONResponse:
		return api.GetAdminUserHolding200JSONResponse(r), nil
	case api.GetHolding404JSONResponse:
		return api.GetAdminUserHolding404JSONResponse(r), nil
	default:
		return nil, nil
	}
}

func (h *Handler) UpdateAdminUserHolding(ctx context.Context, request api.UpdateAdminUserHoldingRequestObject) (api.UpdateAdminUserHoldingResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return updateAdminHoldingResponse(resp)
	}
	updated, err := h.updateHoldingForUser(ctx, target.ID, request.HoldingId, request.Body)
	if err != nil {
		return nil, err
	}
	switch r := updated.(type) {
	case api.UpdateHolding200JSONResponse:
		return api.UpdateAdminUserHolding200JSONResponse(r), nil
	case api.UpdateHolding404JSONResponse:
		return api.UpdateAdminUserHolding404JSONResponse(r), nil
	default:
		return nil, nil
	}
}

func (h *Handler) DeleteAdminUserHolding(ctx context.Context, request api.DeleteAdminUserHoldingRequestObject) (api.DeleteAdminUserHoldingResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return deleteAdminHoldingResponse(resp)
	}
	deleted, err := h.deleteHoldingForUser(ctx, target.ID, request.HoldingId)
	if err != nil {
		return nil, err
	}
	switch r := deleted.(type) {
	case api.DeleteHolding200JSONResponse:
		return api.DeleteAdminUserHolding200JSONResponse(messageResponse(*r.Message)), nil
	case api.DeleteHolding404JSONResponse:
		return api.DeleteAdminUserHolding404JSONResponse(r), nil
	default:
		return nil, nil
	}
}

func (h *Handler) GetAdminUserPrices(ctx context.Context, request api.GetAdminUserPricesRequestObject) (api.GetAdminUserPricesResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return pricesAdminResponse(resp)
	}
	prices, err := h.getPricesForUser(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.GetAdminUserPrices200JSONResponse(prices.(api.GetPrices200JSONResponse)), nil
}

func (h *Handler) GetAdminUserSummary(ctx context.Context, request api.GetAdminUserSummaryRequestObject) (api.GetAdminUserSummaryResponseObject, error) {
	target, resp, err := h.authorizedTarget(ctx, request.Id)
	if err != nil || resp.ok() {
		if err != nil {
			return nil, err
		}
		return summaryAdminResponse(resp)
	}
	summary, err := h.getSummaryForUser(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.GetAdminUserSummary200JSONResponse(summary.(api.GetSummary200JSONResponse)), nil
}

func (h *Handler) authorizedTarget(ctx context.Context, id string) (auth.User, adminTargetError, error) {
	caller, err := currentUser(ctx)
	if err != nil {
		return auth.User{}, adminTargetError{status: httpStatusUnauthorized, message: "authentication required"}, nil
	}
	if !caller.IsAdmin() {
		return auth.User{}, adminTargetError{status: httpStatusForbidden, message: "admin role required"}, nil
	}
	targetID, err := parseObjectID(id)
	if err != nil {
		return auth.User{}, adminTargetError{status: httpStatusNotFound, message: "user not found"}, nil
	}
	var target auth.User
	err = h.users().FindOne(ctx, bson.M{"_id": targetID}).Decode(&target)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return auth.User{}, adminTargetError{status: httpStatusNotFound, message: "user not found"}, nil
		}
		return auth.User{}, adminTargetError{}, err
	}
	if caller.IsSuperAdmin() {
		return target, adminTargetError{}, nil
	}
	if target.Role != auth.RoleUser || target.Region != caller.Region {
		return auth.User{}, adminTargetError{status: httpStatusForbidden, message: "target user is outside your region or role scope"}, nil
	}
	return target, adminTargetError{}, nil
}

type adminTargetError struct {
	status  int
	message string
}

const (
	httpStatusUnauthorized = 401
	httpStatusForbidden    = 403
	httpStatusNotFound     = 404
)

func (e adminTargetError) ok() bool { return e.status != 0 }

func adminUserResponse(e adminTargetError) (api.GetAdminUserResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.GetAdminUser401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.GetAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.GetAdminUser404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func resetLockoutResponse(e adminTargetError) (api.ResetAdminUserLockoutResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.ResetAdminUserLockout401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.ResetAdminUserLockout403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.ResetAdminUserLockout404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func hideResponse(e adminTargetError) (api.HideAdminUserResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.HideAdminUser401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.HideAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.HideAdminUser404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func reactivateResponse(e adminTargetError) (api.ReactivateAdminUserResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.ReactivateAdminUser401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.ReactivateAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.ReactivateAdminUser404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func deleteUserResponse(e adminTargetError) (api.DeleteAdminUserResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.DeleteAdminUser401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.DeleteAdminUser403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.DeleteAdminUser404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func listAdminHoldingsResponse(e adminTargetError) (api.ListAdminUserHoldingsResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.ListAdminUserHoldings401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.ListAdminUserHoldings403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.ListAdminUserHoldings404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func createAdminHoldingResponse(e adminTargetError) (api.CreateAdminUserHoldingResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.CreateAdminUserHolding401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.CreateAdminUserHolding403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.CreateAdminUserHolding404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func getAdminHoldingResponse(e adminTargetError) (api.GetAdminUserHoldingResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.GetAdminUserHolding401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.GetAdminUserHolding403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.GetAdminUserHolding404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func updateAdminHoldingResponse(e adminTargetError) (api.UpdateAdminUserHoldingResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.UpdateAdminUserHolding401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.UpdateAdminUserHolding403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.UpdateAdminUserHolding404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func deleteAdminHoldingResponse(e adminTargetError) (api.DeleteAdminUserHoldingResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.DeleteAdminUserHolding401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.DeleteAdminUserHolding403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.DeleteAdminUserHolding404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func pricesAdminResponse(e adminTargetError) (api.GetAdminUserPricesResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.GetAdminUserPrices401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.GetAdminUserPrices403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.GetAdminUserPrices404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}

func summaryAdminResponse(e adminTargetError) (api.GetAdminUserSummaryResponseObject, error) {
	if !e.ok() {
		return nil, nil
	}
	switch e.status {
	case httpStatusUnauthorized:
		return api.GetAdminUserSummary401JSONResponse{UnauthorizedJSONResponse: unauthorized(e.message)}, nil
	case httpStatusForbidden:
		return api.GetAdminUserSummary403JSONResponse{ForbiddenJSONResponse: forbidden(e.message)}, nil
	default:
		return api.GetAdminUserSummary404JSONResponse{NotFoundJSONResponse: notFound(e.message)}, nil
	}
}
