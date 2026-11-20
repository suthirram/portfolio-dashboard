package controllers

import (
	"context"
	"errors"
	"strings"

	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// brandingFontOptions is the domain catalogue (domain.BrandingFonts) in API
// shape. Each stack names a metric-adjusted fallback face second ("<font>
// Fallback", an @font-face in the frontend's base.css). It is what renders
// while the web font loads, sized to the web font's metrics so the swap
// does not shift the layout.
var brandingFontOptions = func() []api.BrandingFontOption {
	options := make([]api.BrandingFontOption, 0, len(domain.BrandingFonts))
	for _, spec := range domain.BrandingFonts {
		options = append(options, api.BrandingFontOption{Id: api.BrandingFont(spec.ID), Label: spec.Label, CssFamily: spec.CSSFamily})
	}
	return options
}()

// allowedFontIDs lists the catalogue's ids for the 400 message.
func allowedFontIDs() string {
	ids := make([]string, 0, len(domain.BrandingFonts))
	for _, spec := range domain.BrandingFonts {
		ids = append(ids, string(spec.ID))
	}
	return strings.Join(ids, ", ")
}

func brandingToAPI(settings domain.BrandingSettings) api.BrandingSettings {
	font := api.BrandingFont(settings.Font)
	if !font.Valid() {
		font = api.Roboto
	}
	return api.BrandingSettings{
		AllowedFonts: brandingFontOptions,
		Font:         font,
	}
}

func (h *Controller) GetBranding(ctx context.Context, _ api.GetBrandingRequestObject) (api.GetBrandingResponseObject, error) {
	settings, err := h.store.Branding.Get(ctx)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			settings = domain.DefaultBrandingSettings()
		} else {
			h.reqLog(ctx).Error("branding lookup failed", zap.Error(err))
			return nil, err
		}
	}
	return api.GetBranding200JSONResponse(brandingToAPI(settings)), nil
}

func (h *Controller) AdminUpdateBranding(ctx context.Context, request api.AdminUpdateBrandingRequestObject) (api.AdminUpdateBrandingResponseObject, error) {
	caller, ok := superAdminCaller(ctx)
	if !ok {
		return api.AdminUpdateBranding403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
	}
	if request.Body == nil || !domain.BrandingFont(request.Body.Font).Valid() {
		return api.AdminUpdateBranding400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new("font must be one of " + allowedFontIDs())}}, nil
	}

	font := domain.BrandingFont(request.Body.Font)
	settings, err := h.store.Branding.SetFont(ctx, font)
	if err != nil {
		h.reqLog(ctx).Error("branding update failed", zap.Error(err))
		return nil, err
	}
	h.reqLog(ctx).Info("branding font updated",
		zap.String("by", caller.ID.Hex()), zap.String("font", string(font)))
	return api.AdminUpdateBranding200JSONResponse(brandingToAPI(settings)), nil
}
