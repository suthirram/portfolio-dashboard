// Package handlers implements the strict OpenAPI server interface.
package handlers

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// priceFetcher abstracts PriceService for testing.
type priceFetcher interface {
	GetPrice(ctx context.Context, symbol string) (float64, string, error)
	GetForexRate(ctx context.Context, from, to string) (float64, error)
}

// Handler implements api.StrictServerInterface. All persistence goes through
// store; the handler owns HTTP/authz concerns only.
type Handler struct {
	store        *persistence.Store
	priceService priceFetcher
	logger       *slog.Logger
}

// New builds a Handler with the default PriceService.
func New(db *mongo.Database, logger *slog.Logger) *Handler {
	return &Handler{
		store:        persistence.New(db),
		priceService: services.NewPriceService(logger),
		logger:       logger,
	}
}

func (h *Handler) log() *slog.Logger {
	if h.logger == nil {
		return slog.New(slog.DiscardHandler)
	}
	return h.logger
}

// reqLog returns the per-request logger stashed on ctx by the RequestLogger
// middleware (carrying request_id). Falls back to the handler-scoped logger
// for unit tests that bypass the HTTP stack.
func (h *Handler) reqLog(ctx context.Context) *slog.Logger {
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	return h.log()
}
