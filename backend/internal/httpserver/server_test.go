package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.uber.org/zap"

	"github.com/labstack/echo/v4"

	"portfolio-dashboard/internal/config"
)

func TestRunReturnsServerStartupError(t *testing.T) {
	e := echo.New()
	cfg := config.Default()
	cfg.Port = "not-a-valid-port"
	logger := zap.NewNop()

	err := Run(context.Background(), e, cfg, logger)
	if err == nil {
		t.Fatal("Run() error = nil")
	}
	if !strings.Contains(err.Error(), "unknown port") && !strings.Contains(err.Error(), "too many colons") {
		t.Errorf("Run() error = %q, want listen/startup error", err.Error())
	}
}

func TestErrorHandler_HTTPErrorRendersOpenAPIShape(t *testing.T) {
	e, _, logger := newTestEcho(t)
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
	e, buf, logger := newTestEcho(t)
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
	if !strings.Contains(buf.String(), `"msg":"unhandled error"`) {
		t.Errorf("expected 'unhandled error' log line; got:\n%s", buf.String())
	}
}

func TestErrorHandler_NonStringMessageFormatsValue(t *testing.T) {
	e, _, logger := newTestEcho(t)
	e.HTTPErrorHandler = errorHandler(logger)
	e.GET("/struct-msg", func(c echo.Context) error {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, map[string]string{"field": "value"})
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/struct-msg", nil))

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// fmt %v on a map renders deterministically as map[field:value].
	if !strings.Contains(body["error"], "field:value") {
		t.Errorf("error = %q, want substring 'field:value'", body["error"])
	}
}

func TestErrorHandler_LogsInternalCauseWhenPresent(t *testing.T) {
	e, buf, logger := newTestEcho(t)
	e.HTTPErrorHandler = errorHandler(logger)
	e.GET("/wrapped", func(c echo.Context) error {
		httpErr := echo.NewHTTPError(http.StatusBadGateway, "upstream failed")
		httpErr.Internal = errors.New("dial tcp: connection refused")
		return httpErr
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/wrapped", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	if !strings.Contains(buf.String(), `"msg":"http error with internal cause"`) {
		t.Fatalf("expected 'http error with internal cause' log line; got:\n%s", buf.String())
	}
	if !strings.Contains(buf.String(), `dial tcp: connection refused`) {
		t.Errorf("expected internal error text in log line; got:\n%s", buf.String())
	}
}

func TestErrorHandler_UsesRequestScopedLoggerWithRequestID(t *testing.T) {
	e, buf, logger := newTestEcho(t)
	e.HTTPErrorHandler = errorHandler(logger)
	e.GET("/scoped", func(c echo.Context) error {
		return io.ErrUnexpectedEOF
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/scoped", nil))

	headerID := rec.Header().Get(echo.HeaderXRequestID)
	if headerID == "" {
		t.Fatal("X-Request-ID header empty")
	}

	// The 'unhandled error' line must carry the request_id from context.
	for raw := range strings.SplitSeq(strings.TrimSpace(buf.String()), "\n") {
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if line["msg"] == "unhandled error" {
			if line["request_id"] != headerID {
				t.Errorf("unhandled error request_id = %v, want %s", line["request_id"], headerID)
			}
			return
		}
	}
	t.Fatalf("'unhandled error' line not found; got:\n%s", buf.String())
}
