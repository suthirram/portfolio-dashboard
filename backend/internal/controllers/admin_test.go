package controllers

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func regionalAdmin(region string) *domain.User {
	return &domain.User{
		ID:       primitive.NewObjectID(),
		Username: "admin_" + region,
		Role:     domain.RoleAdmin,
		Region:   region,
	}
}

func superAdmin() *domain.User {
	return &domain.User{
		ID:       primitive.NewObjectID(),
		Username: "admin",
		Role:     domain.RoleSuperAdmin,
	}
}

// findFilter extracts the filter document of the first `find` command.
func findFilter(t *testing.T, mt *mtest.T) bson.Raw {
	t.Helper()
	for _, e := range mt.GetAllStartedEvents() {
		if e.CommandName == "find" {
			return e.Command.Lookup("filter").Document()
		}
	}
	t.Fatal("no find command issued")
	return nil
}

// firstUpdateSet extracts the $set document of the first `update` command.
func firstUpdateSet(t *testing.T, mt *mtest.T) bson.Raw {
	t.Helper()
	for _, e := range mt.GetAllStartedEvents() {
		if e.CommandName == "update" {
			u := e.Command.Lookup("updates").Array().Index(0).Value().Document()
			return u.Lookup("u").Document().Lookup("$set").Document()
		}
	}
	t.Fatal("no update command issued")
	return nil
}

// ── List users ─────────────────────────────────────────────────────────────

func TestAdminListUsers_AdminSeesOwnRegionUsersOnly(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("region+role scoped, hidden excluded", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		caller := regionalAdmin("india")
		resp, err := h.AdminListUsers(userCtx(caller), api.AdminListUsersRequestObject{})
		if err != nil {
			t.Fatalf("AdminListUsers: %v", err)
		}
		if _, ok := resp.(api.AdminListUsers200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", resp)
		}

		filter := findFilter(t, mt)
		if got := filter.Lookup("region").StringValue(); got != "india" {
			t.Errorf("filter.region = %q, want india", got)
		}
		if got := filter.Lookup("role").StringValue(); got != domain.RoleUser {
			t.Errorf("filter.role = %q, want user", got)
		}
		if got, ok := filter.Lookup("disabled").BooleanOK(); !ok || got {
			t.Errorf("filter.disabled = %v, want false (hidden excluded by default)", got)
		}
	})

	mt.Run("include_hidden drops the disabled clause", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		includeHidden := true
		_, err := h.AdminListUsers(userCtx(regionalAdmin("us")), api.AdminListUsersRequestObject{
			Params: api.AdminListUsersParams{IncludeHidden: &includeHidden},
		})
		if err != nil {
			t.Fatalf("AdminListUsers: %v", err)
		}
		filter := findFilter(t, mt)
		if _, err := filter.LookupErr("disabled"); err == nil {
			t.Error("filter still pins disabled despite include_hidden=1")
		}
	})
}

func TestAdminListUsers_SuperAdminSeesAllRegions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("no region clause", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		if _, err := h.AdminListUsers(userCtx(superAdmin()), api.AdminListUsersRequestObject{}); err != nil {
			t.Fatalf("AdminListUsers: %v", err)
		}
		filter := findFilter(t, mt)
		if _, err := filter.LookupErr("region"); err == nil {
			t.Error("super admin list should not filter by region")
		}
		if _, err := filter.LookupErr("role"); err == nil {
			t.Error("super admin list should not filter by role (sees admins too)")
		}
	})
}

// ── Target scoping ─────────────────────────────────────────────────────────

func TestAdminGetUser_OutOfRegionReadsAsNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("other region target", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminGetUser(userCtx(regionalAdmin("india")), api.AdminGetUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminGetUser: %v", err)
		}
		if _, ok := resp.(api.AdminGetUser404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404 (no enumeration)", resp)
		}
	})

	mt.Run("admin target is out of scope for an admin", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "peeradmin", "irrelevant1", domain.RoleAdmin, "india", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminGetUser(userCtx(regionalAdmin("india")), api.AdminGetUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminGetUser: %v", err)
		}
		if _, ok := resp.(api.AdminGetUser404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404 (admins never manage admins)", resp)
		}
	})

	mt.Run("super admin reaches any region", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminGetUser(userCtx(superAdmin()), api.AdminGetUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminGetUser: %v", err)
		}
		got, ok := resp.(api.AdminGetUser200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.Region != "europe" {
			t.Errorf("target region = %q, want europe", got.Region)
		}
	})
}

// ── Lockout / hide / delete ────────────────────────────────────────────────

func TestAdminResetLockout_ClearsRecoveryNotLoginFailures(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("reset", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "india",
			func(m bson.M) { m["locked"] = true; m["security_question_failures"] = 3; m["login_failures"] = 7 })
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminResetLockout(userCtx(regionalAdmin("india")), api.AdminResetLockoutRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminResetLockout: %v", err)
		}
		if _, ok := resp.(api.AdminResetLockout204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}

		set := firstUpdateSet(t, mt)
		if locked, _ := set.Lookup("locked").BooleanOK(); locked {
			t.Error("locked not cleared")
		}
		if n, _ := set.Lookup("security_question_failures").AsInt64OK(); n != 0 {
			t.Errorf("security_question_failures = %d, want 0", n)
		}
		// DD-001 §8: login failures stay untouched.
		if _, err := set.LookupErr("login_failures"); err == nil {
			t.Error("reset-lockout must not touch login_failures")
		}
	})
}

func TestAdminHideUser_DisablesAndKillsSessions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("hide", func(mt *mtest.T) {
		targetID := primitive.NewObjectID()
		target := userDocument(t, targetID, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),                           // update disabled
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}), // delete sessions
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminHideUser(userCtx(regionalAdmin("india")), api.AdminHideUserRequestObject{
			Id: targetID.Hex(),
		})
		if err != nil {
			t.Fatalf("AdminHideUser: %v", err)
		}
		if _, ok := resp.(api.AdminHideUser204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}
		set := firstUpdateSet(t, mt)
		if disabled, _ := set.Lookup("disabled").BooleanOK(); !disabled {
			t.Error("disabled not set true")
		}
	})
}

func TestAdminDeleteUser_RemovesUserHoldingsSessions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("delete cascades", func(mt *mtest.T) {
		targetID := primitive.NewObjectID()
		target := userDocument(t, targetID, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 5}), // holdings
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 2}), // sessions
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}), // user
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminDeleteUser(userCtx(regionalAdmin("india")), api.AdminDeleteUserRequestObject{
			Id: targetID.Hex(),
		})
		if err != nil {
			t.Fatalf("AdminDeleteUser: %v", err)
		}
		if _, ok := resp.(api.AdminDeleteUser204Response); !ok {
			t.Fatalf("response = %T, want 204", resp)
		}

		deletes := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "delete" {
				deletes++
			}
		}
		if deletes != 3 {
			t.Errorf("delete commands = %d, want 3 (holdings, sessions, user)", deletes)
		}
	})
}

// ── Promote / demote / region (super admin) ────────────────────────────────

func TestAdminPromoteUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("user becomes admin, region kept", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminPromoteUser(userCtx(superAdmin()), api.AdminPromoteUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminPromoteUser: %v", err)
		}
		got, ok := resp.(api.AdminPromoteUser200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.Role != api.UserRoleAdmin || got.Region != "europe" {
			t.Errorf("promoted = role %q region %q, want admin/europe", got.Role, got.Region)
		}
	})

	mt.Run("promoting an admin is a 400", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleAdmin, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminPromoteUser(userCtx(superAdmin()), api.AdminPromoteUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminPromoteUser: %v", err)
		}
		if _, ok := resp.(api.AdminPromoteUser400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})

	mt.Run("regional admins cannot promote", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminPromoteUser(userCtx(regionalAdmin("india")), api.AdminPromoteUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminPromoteUser: %v", err)
		}
		if _, ok := resp.(api.AdminPromoteUser403JSONResponse); !ok {
			t.Fatalf("response = %T, want 403", resp)
		}
	})
}

func TestAdminDemoteUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("admin becomes user", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleAdmin, "us", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminDemoteUser(userCtx(superAdmin()), api.AdminDemoteUserRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminDemoteUser: %v", err)
		}
		got, ok := resp.(api.AdminDemoteUser200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.Role != api.UserRoleUser {
			t.Errorf("demoted role = %q, want user", got.Role)
		}
	})

	mt.Run("super admin cannot demote itself", func(mt *mtest.T) {
		caller := superAdmin()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminDemoteUser(userCtx(caller), api.AdminDemoteUserRequestObject{
			Id: caller.ID.Hex(),
		})
		if err != nil {
			t.Fatalf("AdminDemoteUser: %v", err)
		}
		if _, ok := resp.(api.AdminDemoteUser403JSONResponse); !ok {
			t.Fatalf("response = %T, want 403 (self-demotion forbidden)", resp)
		}
	})
}

func TestAdminSetUserRegion(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("moves any account", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleAdmin, "us", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminSetUserRegion(userCtx(superAdmin()), api.AdminSetUserRegionRequestObject{
			Id:   primitive.NewObjectID().Hex(),
			Body: &api.RegionUpdateRequest{Region: "india"},
		})
		if err != nil {
			t.Fatalf("AdminSetUserRegion: %v", err)
		}
		got, ok := resp.(api.AdminSetUserRegion200JSONResponse)
		if !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		if got.Region != "india" {
			t.Errorf("region = %q, want india", got.Region)
		}
	})

	mt.Run("invalid region is a 400", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminSetUserRegion(userCtx(superAdmin()), api.AdminSetUserRegionRequestObject{
			Id:   primitive.NewObjectID().Hex(),
			Body: &api.RegionUpdateRequest{Region: "atlantis"},
		})
		if err != nil {
			t.Fatalf("AdminSetUserRegion: %v", err)
		}
		if _, ok := resp.(api.AdminSetUserRegion400JSONResponse); !ok {
			t.Fatalf("response = %T, want 400", resp)
		}
	})

	mt.Run("cannot move itself", func(mt *mtest.T) {
		caller := superAdmin()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminSetUserRegion(userCtx(caller), api.AdminSetUserRegionRequestObject{
			Id:   caller.ID.Hex(),
			Body: &api.RegionUpdateRequest{Region: "india"},
		})
		if err != nil {
			t.Fatalf("AdminSetUserRegion: %v", err)
		}
		if _, ok := resp.(api.AdminSetUserRegion403JSONResponse); !ok {
			t.Fatalf("response = %T, want 403", resp)
		}
	})
}

func TestAdminListAdmins(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("filters to admin roles", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		if _, err := h.AdminListAdmins(userCtx(superAdmin()), api.AdminListAdminsRequestObject{}); err != nil {
			t.Fatalf("AdminListAdmins: %v", err)
		}
		filter := findFilter(t, mt)
		if _, err := filter.LookupErr("role"); err != nil {
			t.Error("admins list missing role filter")
		}
	})

	mt.Run("regional admin is refused", func(mt *mtest.T) {
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminListAdmins(userCtx(regionalAdmin("india")), api.AdminListAdminsRequestObject{})
		if err != nil {
			t.Fatalf("AdminListAdmins: %v", err)
		}
		if _, ok := resp.(api.AdminListAdmins403JSONResponse); !ok {
			t.Fatalf("response = %T, want 403", resp)
		}
	})
}

// ── Act on a user's portfolio ──────────────────────────────────────────────

func TestAdminCreateUserHolding_StampsTargetOwner(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("insert carries the target's user_id", func(mt *mtest.T) {
		targetID := primitive.NewObjectID()
		target := userDocument(t, targetID, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateSuccessResponse(),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		body := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}
		resp, err := h.AdminCreateUserHolding(userCtx(regionalAdmin("india")), api.AdminCreateUserHoldingRequestObject{
			Id:   targetID.Hex(),
			Body: &body,
		})
		if err != nil {
			t.Fatalf("AdminCreateUserHolding: %v", err)
		}
		if _, ok := resp.(api.AdminCreateUserHolding201JSONResponse); !ok {
			t.Fatalf("response = %T, want 201", resp)
		}

		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "insert" || e.Command.Lookup("insert").StringValue() != "holdings" {
				continue
			}
			doc := e.Command.Lookup("documents").Array().Index(0).Value().Document()
			oid, ok := doc.Lookup("user_id").ObjectIDOK()
			if !ok || oid != targetID {
				t.Fatalf("inserted user_id = %v, want target %s", oid, targetID.Hex())
			}
			return
		}
		t.Fatal("no holdings insert issued")
	})

	mt.Run("out-of-region target reads as 404", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		body := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}
		resp, err := h.AdminCreateUserHolding(userCtx(regionalAdmin("india")), api.AdminCreateUserHoldingRequestObject{
			Id:   primitive.NewObjectID().Hex(),
			Body: &body,
		})
		if err != nil {
			t.Fatalf("AdminCreateUserHolding: %v", err)
		}
		if _, ok := resp.(api.AdminCreateUserHolding404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", resp)
		}
	})
}

func TestAdminListUserHoldings_ScopedToTarget(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("list", func(mt *mtest.T) {
		targetID := primitive.NewObjectID()
		target := userDocument(t, targetID, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		holdingsNS := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch),
		)

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminListUserHoldings(userCtx(regionalAdmin("india")), api.AdminListUserHoldingsRequestObject{
			Id: targetID.Hex(),
		})
		if err != nil {
			t.Fatalf("AdminListUserHoldings: %v", err)
		}
		if _, ok := resp.(api.AdminListUserHoldings200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", resp)
		}

		// second find (holdings) must pin the target's user_id
		var sawHoldingsFind bool
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "find" || e.Command.Lookup("find").StringValue() != "holdings" {
				continue
			}
			sawHoldingsFind = true
			oid, ok := e.Command.Lookup("filter").Document().Lookup("user_id").ObjectIDOK()
			if !ok || oid != targetID {
				t.Fatalf("holdings find user_id = %v, want %s", oid, targetID.Hex())
			}
		}
		if !sawHoldingsFind {
			t.Fatal("no holdings find issued")
		}
	})
}

func TestAdminGetUserSummary_PlainUserRefused(t *testing.T) {
	h := newWithDeps(&persistence.Store{}, &mockPriceFetcher{}, nil, false)
	caller := scopedUser() // role: user
	_, err := h.AdminGetUserSummary(userCtx(caller), api.AdminGetUserSummaryRequestObject{
		Id: primitive.NewObjectID().Hex(),
	})
	if err == nil {
		t.Fatal("expected an authorization error for a plain user")
	}
}
