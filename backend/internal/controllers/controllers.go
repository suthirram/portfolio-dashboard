// Package controllers implements the strict OpenAPI server interface.
// Controllers translate between HTTP transport (echo.Context, cookies,
// request/response wrappers) and the per-domain services in
// portfolio-dashboard/internal/services — they own no business logic of
// their own beyond auth-context reads and api↔service marshalling.
package controllers

import (
	"context"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// Controller implements api.StrictServerInterface. Business logic lives on
// the per-domain services; the controller owns HTTP/authz concerns only.
type Controller struct {
	store        *persistence.Store
	priceService services.PriceFetcher
	holdings     *services.HoldingsService
	portfolio    *services.PortfolioService
	history      *services.HistoryService
	logger       *zap.Logger
	cookieSecure bool
}

// New builds a Controller with the default PriceService. cookieSecure controls
// whether the session cookie is emitted with Secure + SameSite=None
// (cross-origin prod) or with SameSite=Lax (local dev). Sourced from
// Config.CookieSecure; do not derive from the request scheme.
func New(db *mongo.Database, logger *zap.Logger, cookieSecure bool) *Controller {
	return newWithDeps(persistence.New(db), services.NewPriceService(logger), logger, cookieSecure)
}

// newWithDeps assembles the per-domain services around a pre-built store and
// price service. Used by New and by tests that supply an in-memory mock store
// or a stub price fetcher.
func newWithDeps(store *persistence.Store, priceService services.PriceFetcher, logger *zap.Logger, cookieSecure bool) *Controller {
	return &Controller{
		store:        store,
		priceService: priceService,
		holdings:     services.NewHoldingsService(store.Holdings, logger),
		portfolio:    services.NewPortfolioService(store.Holdings, store.Snapshots, priceService, logger),
		history:      services.NewHistoryService(store.Snapshots, logger),
		logger:       logger,
		cookieSecure: cookieSecure,
	}
}

// CookieSecure reports the configured session-cookie hardening.
func (h *Controller) CookieSecure() bool { return h.cookieSecure }

func (h *Controller) log() *zap.Logger {
	if h.logger == nil {
		return zap.NewNop()
	}
	return h.logger
}

// reqLog returns the per-request logger stashed on ctx by the RequestLogger
// middleware (carrying request_id). Falls back to the controller-scoped logger
// for unit tests that bypass the HTTP stack.
func (h *Controller) reqLog(ctx context.Context) *zap.Logger {
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	return h.log()
}
