package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/samber/lo"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// errAdminOnly is a defence-in-depth guard; the route middleware enforces the
// same rule before any handler runs.
var errAdminOnly = echo.NewHTTPError(http.StatusForbidden, "admin access required")

// adminCaller returns the calling user when they hold admin or super-admin
// powers.
func adminCaller(ctx context.Context) (*domain.User, error) {
	user, ok := auth.UserFromContext(ctx)
	if !ok {
		return nil, errNotLoggedIn
	}
	if !user.IsAdmin() {
		return nil, errAdminOnly
	}
	return user, nil
}

// loadTargetUser resolves an /admin/users/:id target for caller, applying
// DD-001 §6 scope rules: an admin reaches only role:"user" rows in their own
// region; the super admin reaches everyone. Out-of-scope targets read as
// not-found so account ids cannot be enumerated.
func (h *Controller) loadTargetUser(ctx context.Context, caller *domain.User, userIdHex string) (*domain.User, bool, error) {
	userId, err := primitive.ObjectIDFromHex(userIdHex)
	if err != nil {
		return nil, false, nil
	}

	target, err := h.store.Users.FindByID(ctx, userId)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return nil, false, nil
		}
		h.reqLog(ctx).Error("load target user failed",
			zap.String("id", userIdHex), zap.String("error", err.Error()))
		return nil, false, err
	}

	if caller.IsSuperAdmin() {
		return target, true, nil
	}
	if target.Role != domain.RoleUser || target.Region != caller.Region {
		return nil, false, nil
	}
	return target, true, nil
}

func notFoundUser() api.NotFoundJSONResponse {
	return api.NotFoundJSONResponse{Error: lo.ToPtr("no such user")}
}

// Listing.

func (h *Controller) AdminListUsers(ctx context.Context, request api.AdminListUsersRequestObject) (api.AdminListUsersResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}

	filter := bson.M{}
	if !caller.IsSuperAdmin() {
		filter["region"] = caller.Region
		filter["role"] = domain.RoleUser
	}
	if request.Params.IncludeHidden == nil || !*request.Params.IncludeHidden {
		filter["disabled"] = false
	}

	users, err := h.store.Users.List(ctx, filter, bson.D{{Key: "username", Value: 1}})
	if err != nil {
		h.reqLog(ctx).Error("admin list users failed", zap.String("error", err.Error()))
		return nil, err
	}

	out := make(api.AdminListUsers200JSONResponse, 0, len(users))
	for i := range users {
		out = append(out, services.UserToAPI(&users[i], false))
	}
	return out, nil
}

func (h *Controller) AdminListAdmins(ctx context.Context, _ api.AdminListAdminsRequestObject) (api.AdminListAdminsResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	if !caller.IsSuperAdmin() {
		return api.AdminListAdmins403JSONResponse{ForbiddenJSONResponse: api.ForbiddenJSONResponse{Error: lo.ToPtr("super admin access required")}}, nil
	}

	users, err := h.store.Users.List(ctx,
		bson.M{"role": bson.M{"$in": bson.A{domain.RoleAdmin, domain.RoleSuperAdmin}}},
		bson.D{{Key: "role", Value: 1}, {Key: "username", Value: 1}})
	if err != nil {
		h.reqLog(ctx).Error("admin list admins failed", zap.String("error", err.Error()))
		return nil, err
	}

	out := make(api.AdminListAdmins200JSONResponse, 0, len(users))
	for i := range users {
		out = append(out, services.UserToAPI(&users[i], false))
	}
	return out, nil
}

func (h *Controller) AdminGetUser(ctx context.Context, request api.AdminGetUserRequestObject) (api.AdminGetUserResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminGetUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	return api.AdminGetUser200JSONResponse(services.UserToAPI(target, false)), nil
}

// Lockout / hide / delete.

func (h *Controller) AdminResetLockout(ctx context.Context, request api.AdminResetLockoutRequestObject) (api.AdminResetLockoutResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminResetLockout404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}

	// login_failures intentionally stays (DD-001 §8).
	if err := h.store.Users.Update(ctx, target.ID, bson.M{
		"locked":                     false,
		"security_question_failures": 0,
		"updated_at":                 time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("reset lockout failed", zap.String("error", err.Error()))
		return nil, err
	}

	h.reqLog(ctx).Info("lockout reset",
		zap.String("target", target.ID.Hex()), zap.String("by", caller.ID.Hex()))
	return api.AdminResetLockout204Response{}, nil
}

func (h *Controller) AdminHideUser(ctx context.Context, request api.AdminHideUserRequestObject) (api.AdminHideUserResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminHideUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	if target.ID == caller.ID {
		// The deployment must never lock out its only owner (PRD-001 §6.7).
		return nil, echo.NewHTTPError(http.StatusForbidden, "cannot hide own account")
	}

	if err := h.store.Users.Update(ctx, target.ID, bson.M{
		"disabled":   true,
		"updated_at": time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("hide user failed", zap.String("error", err.Error()))
		return nil, err
	}
	// Kill live sessions so access ends now, not at next session expiry.
	if err := h.invalidateAllSessions(ctx, target.ID); err != nil {
		h.logSessionError(ctx, "hide-user", err)
		return nil, err
	}

	h.reqLog(ctx).Info("user hidden",
		zap.String("target", target.ID.Hex()), zap.String("by", caller.ID.Hex()))
	return api.AdminHideUser204Response{}, nil
}

func (h *Controller) AdminReactivateUser(ctx context.Context, request api.AdminReactivateUserRequestObject) (api.AdminReactivateUserResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminReactivateUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}

	if err := h.store.Users.Update(ctx, target.ID, bson.M{
		"disabled":   false,
		"updated_at": time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("reactivate user failed", zap.String("error", err.Error()))
		return nil, err
	}

	h.reqLog(ctx).Info("user reactivated",
		zap.String("target", target.ID.Hex()), zap.String("by", caller.ID.Hex()))
	return api.AdminReactivateUser204Response{}, nil
}

func (h *Controller) AdminDeleteUser(ctx context.Context, request api.AdminDeleteUserRequestObject) (api.AdminDeleteUserResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminDeleteUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	if target.ID == caller.ID {
		return nil, echo.NewHTTPError(http.StatusForbidden, "cannot delete own account")
	}

	// Holdings and their transactions first: if anything fails midway the
	// account still exists and the delete can be retried.
	if err := h.store.Holdings.DeleteByUser(ctx, target.ID); err != nil {
		h.reqLog(ctx).Error("delete user holdings failed", zap.String("error", err.Error()))
		return nil, err
	}
	if err := h.store.Transactions.DeleteByUser(ctx, target.ID); err != nil {
		h.reqLog(ctx).Error("delete user transactions failed", zap.String("error", err.Error()))
		return nil, err
	}
	if err := h.store.Sessions.DeleteByUser(ctx, target.ID); err != nil {
		h.reqLog(ctx).Error("delete user sessions failed", zap.String("error", err.Error()))
		return nil, err
	}
	if err := h.store.Users.Delete(ctx, target.ID); err != nil {
		h.reqLog(ctx).Error("delete user failed", zap.String("error", err.Error()))
		return nil, err
	}

	h.reqLog(ctx).Info("user permanently deleted",
		zap.String("target", target.ID.Hex()), zap.String("by", caller.ID.Hex()))
	return api.AdminDeleteUser204Response{}, nil
}

// Promote / demote / region (super admin only).

// superAdminCaller returns the caller when they are the super admin.
func superAdminCaller(ctx context.Context) (*domain.User, bool) {
	u, ok := auth.UserFromContext(ctx)
	return u, ok && u.IsSuperAdmin()
}

func forbiddenMsg(msg string) api.ForbiddenJSONResponse {
	return api.ForbiddenJSONResponse{Error: lo.ToPtr(msg)}
}

func (h *Controller) AdminPromoteUser(ctx context.Context, request api.AdminPromoteUserRequestObject) (api.AdminPromoteUserResponseObject, error) {
	caller, ok := superAdminCaller(ctx)
	if !ok {
		return api.AdminPromoteUser403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
	}
	if request.Id == caller.ID.Hex() {
		return api.AdminPromoteUser403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("cannot change own account")}, nil
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminPromoteUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	if target.Role != domain.RoleUser {
		return api.AdminPromoteUser400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr("only a user can be promoted")}}, nil
	}

	if err := h.setRole(ctx, target.ID, domain.RoleAdmin); err != nil {
		return nil, err
	}
	target.Role = domain.RoleAdmin

	h.reqLog(ctx).Info("user promoted to admin",
		zap.String("target", target.ID.Hex()), zap.String("region", target.Region))
	return api.AdminPromoteUser200JSONResponse(services.UserToAPI(target, false)), nil
}

func (h *Controller) AdminDemoteUser(ctx context.Context, request api.AdminDemoteUserRequestObject) (api.AdminDemoteUserResponseObject, error) {
	caller, ok := superAdminCaller(ctx)
	if !ok {
		return api.AdminDemoteUser403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
	}
	if request.Id == caller.ID.Hex() {
		// The deployment must always keep its owner (PRD-001 §6.7).
		return api.AdminDemoteUser403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("cannot change own account")}, nil
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminDemoteUser404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	if target.Role != domain.RoleAdmin {
		return api.AdminDemoteUser400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr("only an admin can be demoted")}}, nil
	}

	if err := h.setRole(ctx, target.ID, domain.RoleUser); err != nil {
		return nil, err
	}
	target.Role = domain.RoleUser

	h.reqLog(ctx).Info("admin demoted to user", zap.String("target", target.ID.Hex()))
	return api.AdminDemoteUser200JSONResponse(services.UserToAPI(target, false)), nil
}

func (h *Controller) setRole(ctx context.Context, id primitive.ObjectID, role string) error {
	if err := h.store.Users.Update(ctx, id, bson.M{
		"role":       role,
		"updated_at": time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("role update failed", zap.String("error", err.Error()))
		return err
	}
	return nil
}

func (h *Controller) AdminSetUserRegion(ctx context.Context, request api.AdminSetUserRegionRequestObject) (api.AdminSetUserRegionResponseObject, error) {
	caller, ok := superAdminCaller(ctx)
	if !ok {
		return api.AdminSetUserRegion403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
	}
	if request.Id == caller.ID.Hex() {
		return api.AdminSetUserRegion403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("cannot change own account")}, nil
	}
	if !auth.ValidRegion(request.Body.Region) {
		return api.AdminSetUserRegion400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr("region must be one of india, europe, us")}}, nil
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminSetUserRegion404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}

	if err := h.store.Users.Update(ctx, target.ID, bson.M{
		"region":     request.Body.Region,
		"updated_at": time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("region update failed", zap.String("error", err.Error()))
		return nil, err
	}
	target.Region = request.Body.Region

	h.reqLog(ctx).Info("account moved to region",
		zap.String("target", target.ID.Hex()), zap.String("region", target.Region))
	return api.AdminSetUserRegion200JSONResponse(services.UserToAPI(target, false)), nil
}

// AdminSetUserGold turns gold tracking on or off for an account. Super
// admin only (PRD-003 §2.4); unlike role/region changes the super admin may
// toggle their own account — the owner is the primary gold user. Toggling
// off hides gold data but deletes nothing.
func (h *Controller) AdminSetUserGold(ctx context.Context, request api.AdminSetUserGoldRequestObject) (api.AdminSetUserGoldResponseObject, error) {
	caller, ok := superAdminCaller(ctx)
	if !ok {
		return api.AdminSetUserGold403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminSetUserGold404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}

	if err := h.store.Users.Update(ctx, target.ID, bson.M{
		"gold_enabled": request.Body.Enabled,
		"updated_at":   time.Now(),
	}); err != nil {
		h.reqLog(ctx).Error("gold toggle failed", zap.String("error", err.Error()))
		return nil, err
	}
	target.GoldEnabled = request.Body.Enabled

	h.reqLog(ctx).Info("gold tracking toggled",
		zap.String("target", target.ID.Hex()), zap.Bool("enabled", target.GoldEnabled))
	return api.AdminSetUserGold200JSONResponse(services.UserToAPI(target, false)), nil
}

// Act on a user's portfolio (region-scoped).

func (h *Controller) AdminListUserHoldings(ctx context.Context, request api.AdminListUserHoldingsRequestObject) (api.AdminListUserHoldingsResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminListUserHoldings404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	holdings, err := h.holdings.List(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.AdminListUserHoldings200JSONResponse(holdings), nil
}

func (h *Controller) AdminCreateUserHolding(ctx context.Context, request api.AdminCreateUserHoldingRequestObject) (api.AdminCreateUserHoldingResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminCreateUserHolding404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	created, err := h.holdings.Create(ctx, target.ID, *request.Body)
	if err != nil {
		return nil, err
	}
	return api.AdminCreateUserHolding201JSONResponse(created), nil
}

func (h *Controller) AdminUpdateUserHolding(ctx context.Context, request api.AdminUpdateUserHoldingRequestObject) (api.AdminUpdateUserHoldingResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminUpdateUserHolding404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	updated, found, err := h.holdings.Update(ctx, target.ID, request.HoldingId, *request.Body)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminUpdateUserHolding404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: lo.ToPtr("no such holding")}}, nil
	}
	return api.AdminUpdateUserHolding200JSONResponse(updated), nil
}

func (h *Controller) AdminDeleteUserHolding(ctx context.Context, request api.AdminDeleteUserHoldingRequestObject) (api.AdminDeleteUserHoldingResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminDeleteUserHolding404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	deleted, err := h.holdings.Delete(ctx, target.ID, request.HoldingId)
	if err != nil {
		return nil, err
	}
	if !deleted {
		return api.AdminDeleteUserHolding404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: lo.ToPtr("no such holding")}}, nil
	}
	msg := "deleted"
	return api.AdminDeleteUserHolding200JSONResponse{Message: &msg}, nil
}

func (h *Controller) AdminGetUserPrices(ctx context.Context, request api.AdminGetUserPricesRequestObject) (api.AdminGetUserPricesResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminGetUserPrices404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	results, eurRate, err := h.portfolio.Prices(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.AdminGetUserPrices200JSONResponse{Holdings: &results, EurRate: &eurRate}, nil
}

func (h *Controller) AdminGetUserSummary(ctx context.Context, request api.AdminGetUserSummaryRequestObject) (api.AdminGetUserSummaryResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminGetUserSummary404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	summary, err := h.portfolio.Summary(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.AdminGetUserSummary200JSONResponse(summary), nil
}
