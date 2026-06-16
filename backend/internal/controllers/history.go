package controllers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// RegisterHistoryRoutes wires /api/history endpoints on e. These routes do
// not go through the OpenAPI strict-server because PR6 shipped them as
// plain Echo handlers to keep scope contained — migration to the strict
// surface is tracked as a follow-up in PD-042 §3.6. The AuthGate +
// CSRFCheck middlewares already running on the root echo apply.
func (h *Controller) RegisterHistoryRoutes(e *echo.Echo) {
	g := e.Group("/api/history")
	g.GET("", h.listHistory)
	g.GET("/range", h.historyRange)
	g.POST("", h.addHistoryRow)
	g.PUT("/:date/regions", h.patchHistoryRegions)
	g.DELETE("/:date", h.deleteHistoryRow)
	g.POST("/paste", h.pasteHistory)
}

func (h *Controller) listHistory(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	from, err := parseRequiredDate(c.QueryParam("from"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid 'from' date")
	}
	to, err := parseRequiredDate(c.QueryParam("to"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid 'to' date")
	}

	list, err := h.history.List(c.Request().Context(), uid, from, to)
	if err != nil {
		if errors.Is(err, services.ErrInvalidDate) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return err
	}
	return c.JSON(http.StatusOK, list)
}

func (h *Controller) historyRange(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	info, err := h.history.Range(c.Request().Context(), uid)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, info)
}

func (h *Controller) addHistoryRow(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	var in services.AddRowInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}
	row, err := h.history.Add(c.Request().Context(), uid, in)
	if err != nil {
		return mapHistoryErr(err)
	}
	return c.JSON(http.StatusCreated, row)
}

func (h *Controller) patchHistoryRegions(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	var in services.PatchRegionsInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}
	row, err := h.history.PatchRegions(c.Request().Context(), uid, c.Param("date"), in)
	if err != nil {
		return mapHistoryErr(err)
	}
	return c.JSON(http.StatusOK, row)
}

func (h *Controller) deleteHistoryRow(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	if err := h.history.Delete(c.Request().Context(), uid, c.Param("date")); err != nil {
		return mapHistoryErr(err)
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *Controller) pasteHistory(c echo.Context) error {
	uid, err := currentUserID(c.Request().Context())
	if err != nil {
		return err
	}
	var in services.PasteInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}
	report, err := h.history.Paste(c.Request().Context(), uid, in)
	if err != nil {
		return mapHistoryErr(err)
	}
	return c.JSON(http.StatusOK, report)
}

func parseRequiredDate(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, errors.New("empty")
	}
	return time.Parse("2006-01-02", s)
}

func mapHistoryErr(err error) error {
	var conflict *services.ErrConflict
	if errors.As(err, &conflict) {
		return echo.NewHTTPError(http.StatusConflict, conflict)
	}
	switch {
	case errors.Is(err, persistence.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	case errors.Is(err, persistence.ErrCronProtected):
		return echo.NewHTTPError(http.StatusConflict, "cannot delete a cron-written row; override instead")
	case errors.Is(err, services.ErrInvalidDate),
		errors.Is(err, services.ErrInvalidRegions):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	default:
		return err
	}
}

// Unused import shield: the controllers package only uses context via the
// signatures imported elsewhere. Keep the linter quiet without rewriting
// imports if the file shape changes.
var _ = context.Background
