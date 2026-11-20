package controllers

import (
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
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
		wantIDs := []api.BrandingFont{
			api.Roboto, api.JetbrainsMono, api.DmSans, api.Manrope, api.Inter, api.SourceSans3,
			api.Lato, api.NunitoSans, api.IbmPlexSans, api.OpenSans, api.Poppins, api.WorkSans,
		}
		if len(got.AllowedFonts) != len(wantIDs) {
			t.Fatalf("allowed fonts = %d, want %d", len(got.AllowedFonts), len(wantIDs))
		}
		for index, id := range wantIDs {
			if got.AllowedFonts[index].Id != id {
				t.Errorf("allowed font %d = %q, want %q", index, got.AllowedFonts[index].Id, id)
			}
		}
	})
}

// Each stack falls back to its metric-adjusted face first, so the text
// shown while the web font loads takes the web font's size.
func TestGetBranding_StacksFallBackToMetricAdjustedFace(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("missing branding doc", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, brandingNS(mt), mtest.FirstBatch))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.GetBranding(userCtx(scopedUser()), api.GetBrandingRequestObject{})
		if err != nil {
			t.Fatalf("GetBranding: %v", err)
		}

		for _, option := range resp.(api.GetBranding200JSONResponse).AllowedFonts {
			families := strings.Split(option.CssFamily, ", ")
			web := strings.Trim(families[0], `"`)
			if len(families) < 3 || web != option.Label || families[1] != `"`+option.Label+` Fallback"` {
				t.Errorf("%s stack = %q, want %q then %q, then a system fallback", option.Id, option.CssFamily, option.Label, option.Label+" Fallback")
			}
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

func TestAdminUpdateBranding_AcceptsAnAddedFont(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("set manrope", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}))

		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminUpdateBranding(userCtx(superAdmin()), api.AdminUpdateBrandingRequestObject{
			Body: &api.BrandingUpdateRequest{Font: api.Manrope},
		})
		if err != nil {
			t.Fatalf("AdminUpdateBranding: %v", err)
		}
		if got := resp.(api.AdminUpdateBranding200JSONResponse); got.Font != api.Manrope {
			t.Errorf("font = %q, want manrope", got.Font)
		}
		if font := firstUpdateSet(t, mt).Lookup("font").StringValue(); font != "manrope" {
			t.Errorf("stored font = %q, want manrope", font)
		}
	})
}

// The OpenAPI enum and the domain catalogue must list the same fonts, or a
// font could be offered but rejected (or accepted but never offered).
func TestBrandingCatalogueMatchesTheAPIEnum(t *testing.T) {
	for _, spec := range domain.BrandingFonts {
		if !api.BrandingFont(spec.ID).Valid() {
			t.Errorf("catalogue font %q is missing from the API enum", spec.ID)
		}
	}
	if api.BrandingFont("comic_sans").Valid() {
		t.Errorf("the API enum accepts an unknown font")
	}
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
