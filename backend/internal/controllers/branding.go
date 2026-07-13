package controllers

import (
	"context"
	"errors"

	"go.uber.org/zap"

	"github.com/samber/lo"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

var brandingFontOptions = []api.BrandingFontOption{
	{
		Id:        api.Roboto,
		Label:     "Roboto",
		CssFamily: "Roboto, Arial, sans-serif",
	},
	{
		Id:        api.JetbrainsMono,
		Label:     "JetBrains Mono",
		CssFamily: "\"JetBrains Mono\", monospace",
	},
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
	if request.Body == nil || !request.Body.Font.Valid() {
		return api.AdminUpdateBranding400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr("font must be one of roboto, jetbrains_mono")}}, nil
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
