package controllers

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
)

func brandingNS(mt *mtest.T) string { return mt.DB.Name() + ".app_branding" }

func TestGetBranding_DefaultsToRobotoWhenUnset(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("missing branding doc", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, brandingNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetBranding(userCtx(scopedUser()), api.GetBrandingRequestObject{})
		if err != nil {
			t.Fatalf("GetBranding: %v", err)
		}

		got := resp.(api.GetBranding200JSONResponse)
		if got.Font != api.Roboto {
			t.Errorf("font = %q, want roboto", got.Font)
		}
		if len(got.AllowedFonts) != 2 {
			t.Fatalf("allowed fonts = %d, want 2", len(got.AllowedFonts))
		}
		if got.AllowedFonts[0].Id != api.Roboto || got.AllowedFonts[1].Id != api.JetbrainsMono {
			t.Errorf("allowed fonts = %#v, want Roboto then JetBrains Mono", got.AllowedFonts)
		}
	})
}

func TestGetBranding_ReturnsStoredFont(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("stored jetbrains mono", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, brandingNS(mt), mtest.FirstBatch, bson.D{
			{Key: "_id", Value: "global"},
			{Key: "font", Value: "jetbrains_mono"},
		}))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetBranding(userCtx(scopedUser()), api.GetBrandingRequestObject{})
		if err != nil {
			t.Fatalf("GetBranding: %v", err)
		}

		got := resp.(api.GetBranding200JSONResponse)
		if got.Font != api.JetbrainsMono {
			t.Errorf("font = %q, want jetbrains_mono", got.Font)
		}
	})
}

func TestAdminUpdateBranding_SuperAdminSetsFont(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("set jetbrains mono", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminUpdateBranding(userCtx(superAdmin()), api.AdminUpdateBrandingRequestObject{
			Body: &api.BrandingUpdateRequest{Font: api.JetbrainsMono},
		})
		if err != nil {
			t.Fatalf("AdminUpdateBranding: %v", err)
		}

		got := resp.(api.AdminUpdateBranding200JSONResponse)
		if got.Font != api.JetbrainsMono {
			t.Errorf("font = %q, want jetbrains_mono", got.Font)
		}

		set := firstUpdateSet(t, mt)
		if font := set.Lookup("font").StringValue(); font != "jetbrains_mono" {
			t.Errorf("stored font = %q, want jetbrains_mono", font)
		}
	})
}

func TestAdminUpdateBranding_RejectsUnsupportedFont(t *testing.T) {
	h := &Controller{}

	resp, err := h.AdminUpdateBranding(userCtx(superAdmin()), api.AdminUpdateBrandingRequestObject{
		Body: &api.BrandingUpdateRequest{Font: api.BrandingFont("comic_sans")},
	})
	if err != nil {
		t.Fatalf("AdminUpdateBranding: %v", err)
	}
	if _, ok := resp.(api.AdminUpdateBranding400JSONResponse); !ok {
		t.Fatalf("response = %T, want 400", resp)
	}
}

func TestAdminUpdateBranding_RequiresSuperAdmin(t *testing.T) {
	h := &Controller{}

	resp, err := h.AdminUpdateBranding(userCtx(regionalAdmin("india")), api.AdminUpdateBrandingRequestObject{
		Body: &api.BrandingUpdateRequest{Font: api.Roboto},
	})
	if err != nil {
		t.Fatalf("AdminUpdateBranding: %v", err)
	}
	if _, ok := resp.(api.AdminUpdateBranding403JSONResponse); !ok {
		t.Fatalf("response = %T, want 403", resp)
	}
}
