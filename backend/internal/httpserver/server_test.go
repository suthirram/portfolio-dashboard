package httpserver

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestErrorHandler_HTTPErrorRendersOpenAPIShape(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = errorHandler(logger)
	e.GET("/boom", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusBadRequest, "bad input")
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/boom", nil))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] != "bad input" {
		t.Errorf(`body["error"] = %q, want "bad input"`, body["error"])
	}
	if _, hasMessage := body["message"]; hasMessage {
		t.Error(`body should not contain "message" key (OpenAPI shape uses "error")`)
	}
}

func TestErrorHandler_UnknownErrorReturns500WithStatusText(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = errorHandler(logger)
	e.GET("/explode", func(c echo.Context) error {
		return io.ErrUnexpectedEOF
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/explode", nil))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["error"] != http.StatusText(http.StatusInternalServerError) {
		t.Errorf(`body["error"] = %q, want %q`, body["error"], http.StatusText(http.StatusInternalServerError))
	}
}
