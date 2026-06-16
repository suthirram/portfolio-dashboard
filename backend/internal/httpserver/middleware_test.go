package httpserver

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"portfolio-dashboard/internal/logging"
)

// newTestEcho wires RequestID + RequestLogger and returns the echo instance,
// the captured log buffer, and the base logger so tests can also install the
// HTTP error handler against the same sink.
func newTestEcho(t *testing.T) (*echo.Echo, *bytes.Buffer, *zap.Logger) {
	t.Helper()
	var buf bytes.Buffer
	enc := zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig())
	core := zapcore.NewCore(enc, zapcore.AddSync(&buf), zapcore.DebugLevel)
	logger := zap.New(core)
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.RequestID())
	e.Use(RequestLogger(logger))
	return e, &buf, logger
}

func TestRequestLogger_EmitsAccessLineWithRequestID(t *testing.T) {
	e, buf, _ := newTestEcho(t)
	e.GET("/ok", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ok", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	line := lastJSONLine(t, buf.Bytes())
	if line["msg"] != "http_request" {
		t.Errorf(`msg = %v, want "http_request"`, line["msg"])
	}
	if line["method"] != "GET" || line["path"] != "/ok" {
		t.Errorf("method/path mismatch: %v %v", line["method"], line["path"])
	}
	if got, want := line["status"].(float64), float64(http.StatusOK); got != want {
		t.Errorf("status = %v, want %v", got, want)
	}
	if id, ok := line["request_id"].(string); !ok || id == "" {
		t.Errorf("request_id missing or empty: %v", line["request_id"])
	}
}

func TestRequestLogger_InjectsRequestIDLoggerOnContext(t *testing.T) {
	e, buf, _ := newTestEcho(t)

	var headerID string
	e.GET("/probe", func(c echo.Context) error {
		l, ok := logging.FromContext(c.Request().Context())
		if !ok {
			t.Fatal("logger missing from request context")
		}
		l.Info("handler_log")
		headerID = c.Response().Header().Get(echo.HeaderXRequestID)
		return c.NoContent(http.StatusOK)
	})

	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if headerID == "" {
		t.Fatal("X-Request-ID header empty")
	}

	// Find the handler_log line and verify it carries the same request_id.
	for raw := range bytes.SplitSeq(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
		var line map[string]any
		if err := json.Unmarshal(raw, &line); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if line["msg"] == "handler_log" {
			if line["request_id"] != headerID {
				t.Errorf("handler_log request_id = %v, want %s", line["request_id"], headerID)
			}
			return
		}
	}
	t.Fatalf("handler_log line not found; got:\n%s", buf.String())
}

func TestRequestLogger_LevelTracksStatus(t *testing.T) {
	cases := []struct {
		name   string
		status int
		want   string
	}{
		{"2xx", http.StatusOK, "info"},
		{"4xx", http.StatusBadRequest, "warn"},
		{"5xx", http.StatusInternalServerError, "error"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, buf, _ := newTestEcho(t)
			e.GET("/x", func(c echo.Context) error {
				return c.NoContent(tc.status)
			})
			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))

			if !strings.Contains(buf.String(), `"level":"`+tc.want+`"`) {
				t.Errorf("log line missing level %s: %s", tc.want, buf.String())
			}
		})
	}
}

func lastJSONLine(t *testing.T, b []byte) map[string]any {
	t.Helper()
	lines := bytes.Split(bytes.TrimSpace(b), []byte("\n"))
	var line map[string]any
	if err := json.Unmarshal(lines[len(lines)-1], &line); err != nil {
		t.Fatalf("decode last line: %v\nraw: %s", err, string(b))
	}
	return line
}
