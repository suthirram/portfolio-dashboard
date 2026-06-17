package controllers

import (
	"context"
	"errors"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// /api/history strict-server method bodies (PD-042 follow-up #5).
//
// These replace the PR6 plain-Echo handlers that lived in
// RegisterHistoryRoutes. Codegen runs from api/specs/history/history.yaml
// + api/specs/portfolio-api.yaml schemas via `go generate -tags tools ./...`.

func (h *Controller) ListHistory(ctx context.Context, req api.ListHistoryRequestObject) (api.ListHistoryResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	from := req.Params.From.Time
	to := req.Params.To.Time
	list, err := h.history.List(ctx, uid, from, to)
	if err != nil {
		if errors.Is(err, services.ErrInvalidDate) {
			return api.ListHistory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString(err.Error())}}, nil
		}
		return nil, err
	}
	return api.ListHistory200JSONResponse(toAPIHistoryList(list)), nil
}

func (h *Controller) AddHistoryRow(ctx context.Context, req api.AddHistoryRowRequestObject) (api.AddHistoryRowResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return api.AddHistoryRow400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString("empty body")}}, nil
	}
	in := services.AddRowInput{
		Date:    req.Body.Date.Format("2006-01-02"),
		Regions: fromAPIRegions(req.Body.Regions),
	}
	row, err := h.history.Add(ctx, uid, in)
	if err != nil {
		var conflict *services.ErrConflict
		if errors.As(err, &conflict) {
			msg := conflict.Error()
			return api.AddHistoryRow409JSONResponse{
				Error:     msg,
				Conflicts: toAPIConflictList(conflict.Conflicts),
			}, nil
		}
		if errors.Is(err, services.ErrInvalidDate) || errors.Is(err, services.ErrInvalidRegions) {
			return api.AddHistoryRow400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString(err.Error())}}, nil
		}
		return nil, err
	}
	return api.AddHistoryRow201JSONResponse(toAPIHistoryRow(row)), nil
}

func (h *Controller) PatchHistoryRegions(ctx context.Context, req api.PatchHistoryRegionsRequestObject) (api.PatchHistoryRegionsResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return api.PatchHistoryRegions400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString("empty body")}}, nil
	}
	row, err := h.history.PatchRegions(ctx, uid, req.Date.Format("2006-01-02"), services.PatchRegionsInput{
		Regions: fromAPIRegions(req.Body.Regions),
	})
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.PatchHistoryRegions404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: ptrString("not found")}}, nil
		}
		if errors.Is(err, services.ErrInvalidDate) || errors.Is(err, services.ErrInvalidRegions) {
			return api.PatchHistoryRegions400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString(err.Error())}}, nil
		}
		return nil, err
	}
	return api.PatchHistoryRegions200JSONResponse(toAPIHistoryRow(row)), nil
}

func (h *Controller) DeleteHistoryRow(ctx context.Context, req api.DeleteHistoryRowRequestObject) (api.DeleteHistoryRowResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	dateStr := req.Date.Format("2006-01-02")
	force := false
	if u, ok := auth.UserFromContext(ctx); ok && u.IsSuperAdmin() {
		force = true
	}
	if err := h.history.Delete(ctx, uid, dateStr, force); err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.DeleteHistoryRow404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: ptrString("not found")}}, nil
		}
		if errors.Is(err, persistence.ErrCronProtected) {
			msg := "cannot delete a cron-written row; override individual regions instead"
			return api.DeleteHistoryRow409JSONResponse{Error: &msg}, nil
		}
		if errors.Is(err, services.ErrInvalidDate) {
			return api.DeleteHistoryRow400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString(err.Error())}}, nil
		}
		return nil, err
	}
	return api.DeleteHistoryRow204Response{}, nil
}

func (h *Controller) PasteHistory(ctx context.Context, req api.PasteHistoryRequestObject) (api.PasteHistoryResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	if req.Body == nil {
		return api.PasteHistory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString("empty body")}}, nil
	}
	rows := make([]services.AddRowInput, 0, len(req.Body.Rows))
	for _, r := range req.Body.Rows {
		rows = append(rows, services.AddRowInput{
			Date:    r.Date.Format("2006-01-02"),
			Regions: fromAPIRegions(r.Regions),
		})
	}
	report, err := h.history.Paste(ctx, uid, services.PasteInput{
		Month: req.Body.Month,
		Rows:  rows,
	})
	if err != nil {
		if errors.Is(err, services.ErrInvalidDate) {
			return api.PasteHistory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: ptrString(err.Error())}}, nil
		}
		return nil, err
	}
	return api.PasteHistory200JSONResponse(toAPIPasteReport(report)), nil
}

// ---- mappers between services types and api.gen types ----

func toAPIHistoryList(list services.HistoryList) api.HistoryList {
	rows := make([]api.HistoryRow, 0, len(list.Rows))
	for _, r := range list.Rows {
		rows = append(rows, toAPIHistoryRow(r))
	}
	return api.HistoryList{Currency: list.Currency, Rows: rows}
}

func toAPIHistoryRow(r services.HistoryRow) api.HistoryRow {
	return api.HistoryRow{
		Date:    mustParseAPIDate(r.Date),
		Regions: toAPIRegionMap(r.Regions),
		Totals:  toAPITotals(r.Totals),
	}
}

func toAPIRegionMap(in map[string]domain.RegionSnapshot) map[string]api.HistoryRegionSnapshot {
	out := make(map[string]api.HistoryRegionSnapshot, len(in))
	for k, v := range in {
		out[k] = toAPIRegion(v)
	}
	return out
}

func toAPIRegion(v domain.RegionSnapshot) api.HistoryRegionSnapshot {
	r := api.HistoryRegionSnapshot{
		Invested: v.Invested,
		Current:  v.Current,
		Source:   api.HistoryRegionSnapshotSource(v.Source),
	}
	if v.OriginalCronInvested != nil {
		r.OriginalCronInvested = v.OriginalCronInvested
	}
	if v.OriginalCronCurrent != nil {
		r.OriginalCronCurrent = v.OriginalCronCurrent
	}
	if v.WriteCurrency != "" {
		wc := v.WriteCurrency
		r.WriteCurrency = &wc
	}
	return r
}

func toAPITotals(t domain.SnapshotTotals) api.HistoryTotals {
	return api.HistoryTotals{
		InvestedTotal: t.InvestedTotal,
		CurrentTotal:  t.CurrentTotal,
		PnlPct:        t.PnLPct,
	}
}

func toAPIConflictList(in []services.HistoryConflict) []struct {
	Existing api.HistoryRegionSnapshot `json:"existing"`
	Incoming api.HistoryRegionInput    `json:"incoming"`
	Region   string                    `json:"region"`
} {
	out := make([]struct {
		Existing api.HistoryRegionSnapshot `json:"existing"`
		Incoming api.HistoryRegionInput    `json:"incoming"`
		Region   string                    `json:"region"`
	}, 0, len(in))
	for _, c := range in {
		out = append(out, struct {
			Existing api.HistoryRegionSnapshot `json:"existing"`
			Incoming api.HistoryRegionInput    `json:"incoming"`
			Region   string                    `json:"region"`
		}{
			Region:   c.Region,
			Existing: toAPIRegion(c.Existing),
			Incoming: api.HistoryRegionInput{Invested: c.Incoming.Invested, Current: c.Incoming.Current},
		})
	}
	return out
}

func toAPIPasteReport(r services.PasteReport) api.PasteHistoryReport {
	applied := make([]openapi_types.Date, 0, len(r.Applied))
	for _, d := range r.Applied {
		applied = append(applied, mustParseAPIDate(d))
	}
	conflicts := make([]api.HistoryDateConflict, 0, len(r.Conflicts))
	for _, c := range r.Conflicts {
		conflicts = append(conflicts, api.HistoryDateConflict{
			Date:     mustParseAPIDate(c.Date),
			Existing: toAPIRegionMap(c.Existing),
			Incoming: regionsToInputMap(c.Incoming),
		})
	}
	rejected := make([]api.RejectedPasteRow, 0, len(r.Rejected))
	for _, rr := range r.Rejected {
		rejected = append(rejected, api.RejectedPasteRow{Date: rr.Date, Reason: rr.Reason})
	}
	return api.PasteHistoryReport{
		Applied:   applied,
		Conflicts: conflicts,
		Rejected:  rejected,
	}
}

func fromAPIRegions(in map[string]api.HistoryRegionInput) map[string]domain.RegionSnapshot {
	out := make(map[string]domain.RegionSnapshot, len(in))
	for k, v := range in {
		out[k] = domain.RegionSnapshot{Invested: v.Invested, Current: v.Current}
	}
	return out
}

func regionsToInputMap(in map[string]domain.RegionSnapshot) map[string]api.HistoryRegionInput {
	out := make(map[string]api.HistoryRegionInput, len(in))
	for k, v := range in {
		out[k] = api.HistoryRegionInput{Invested: v.Invested, Current: v.Current}
	}
	return out
}

func mustParseAPIDate(s string) openapi_types.Date {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		// Caller has already validated; surface as zero date so the JSON
		// encoder writes something rather than panicking. Service-layer
		// dates are always YYYY-MM-DD, so this path is unreachable.
		return openapi_types.Date{}
	}
	return openapi_types.Date{Time: t}
}

func ptrString(s string) *string { return &s }
