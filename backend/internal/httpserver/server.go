// Package httpserver wires HTTP routes, middleware, and graceful shutdown.
package httpserver

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/api"
	"portfolio-dashboard/handlers"
	"portfolio-dashboard/internal/config"
)

// New builds an *echo.Echo with routes and middleware wired up.
func New(cfg config.Config, logger *slog.Logger, db *mongo.Database, h *handlers.Handler) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.StdLogger = slog.NewLogLogger(logger.Handler(), slog.LevelError)
	e.HTTPErrorHandler = errorHandler(logger)

	e.Server.ReadTimeout = cfg.ReadTimeout
	e.Server.WriteTimeout = cfg.WriteTimeout
	e.Server.IdleTimeout = cfg.IdleTimeout

	e.Use(middleware.RequestID())
	e.Use(RequestLogger(logger))
	e.Use(middleware.Recover())
	e.Use(middleware.ContextTimeoutWithConfig(middleware.ContextTimeoutConfig{
		Timeout: cfg.RequestTimeout,
	}))
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderAccept, echo.HeaderAuthorization, echo.HeaderContentType, "X-CSRF-Token"},
		MaxAge:       300,
	}))

	e.GET("/api/healthz", healthHandler(db))
	e.File("/api/openapi.yaml", "api/openapi.yaml")

	strict := api.NewStrictHandler(h, nil)
	api.RegisterHandlersWithBaseURL(e, strict, "/api")

	return e
}

// Run starts e and blocks until ctx is cancelled or the server fails.
// On ctx cancellation it performs a graceful shutdown bounded by cfg.ShutdownTimeout.
func Run(ctx context.Context, e *echo.Echo, cfg config.Config, logger *slog.Logger) error {
	errCh := make(chan error, 1)
	go func() {
		addr := ":" + cfg.Port
		logger.Info("http server listening", slog.String("addr", addr))
		if err := e.Start(addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received, draining connections",
			slog.Duration("timeout", cfg.ShutdownTimeout))
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := e.Shutdown(shutdownCtx); err != nil {
			if listenErr := <-errCh; listenErr != nil {
				logger.Error("listener error during shutdown", slog.String("error", listenErr.Error()))
			}
			return err
		}
		return <-errCh
	}
}

// errorHandler renders errors in the OpenAPI Error shape ({"error": "..."})
// so non-strict routes match the contract used by generated handlers.
func errorHandler(logger *slog.Logger) echo.HTTPErrorHandler {
	return func(err error, c echo.Context) {
		if c.Response().Committed {
			return
		}

		status := http.StatusInternalServerError
		message := http.StatusText(status)

		var httpErr *echo.HTTPError
		if errors.As(err, &httpErr) {
			status = httpErr.Code
			if m, ok := httpErr.Message.(string); ok && m != "" {
				message = m
			} else if httpErr.Message != nil {
				message = http.StatusText(status)
			}
		} else {
			logger.ErrorContext(c.Request().Context(), "unhandled error",
				slog.String("path", c.Request().URL.Path),
				slog.String("error", err.Error()),
			)
		}

		if writeErr := c.JSON(status, map[string]string{"error": message}); writeErr != nil {
			logger.ErrorContext(c.Request().Context(), "failed writing error response",
				slog.String("error", writeErr.Error()),
			)
		}
	}
}

func healthHandler(db *mongo.Database) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
		defer cancel()
		if err := db.Client().Ping(ctx, nil); err != nil {
			return c.JSON(http.StatusServiceUnavailable, map[string]string{
				"status": "unhealthy",
				"error":  err.Error(),
			})
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}
}
