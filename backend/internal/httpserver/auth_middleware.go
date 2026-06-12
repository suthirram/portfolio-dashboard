package httpserver

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/auth"
)

const (
	sessionCookieName = "pd_session"
	csrfHeaderName    = "X-Requested-With"
	csrfHeaderValue   = "portfolio-dashboard"
)

func requireCSRF(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		switch c.Request().Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			return next(c)
		}
		if c.Request().Header.Get(csrfHeaderName) != csrfHeaderValue {
			return echo.NewHTTPError(http.StatusForbidden, "missing CSRF header")
		}
		return next(c)
	}
}

func requireAuth(db *mongo.Database, logger *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(sessionCookieName)
			if err != nil || cookie.Value == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
			}

			ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
			defer cancel()

			var session auth.Session
			err = db.Collection("sessions").FindOne(ctx, bson.M{
				"_id":        cookie.Value,
				"expires_at": bson.M{"$gt": time.Now()},
			}).Decode(&session)
			if err != nil {
				if errors.Is(err, mongo.ErrNoDocuments) {
					return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
				}
				return err
			}

			var user auth.User
			err = db.Collection("users").FindOne(ctx, bson.M{"_id": session.UserID}).Decode(&user)
			if err != nil {
				if errors.Is(err, mongo.ErrNoDocuments) {
					return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
				}
				return err
			}
			if user.Disabled {
				if _, err := db.Collection("sessions").DeleteOne(ctx, bson.M{"_id": session.ID}); err != nil {
					logger.WarnContext(ctx, "failed deleting disabled user session", slog.String("error", err.Error()))
				}
				return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
			}

			newExpiry := time.Now().Add(30 * 24 * time.Hour)
			if _, err := db.Collection("sessions").UpdateByID(ctx, session.ID, bson.M{"$set": bson.M{"expires_at": newExpiry}}); err != nil {
				return err
			}

			req := c.Request()
			req = req.WithContext(auth.IntoContext(req.Context(), user, session.ID))
			c.SetRequest(req)
			return next(c)
		}
	}
}
