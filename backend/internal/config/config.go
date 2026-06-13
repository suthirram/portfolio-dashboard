// Package config defines the runtime configuration for the API server.
//
// Precedence: defaults < environment variables < explicit CLI flags.
package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	Port      string
	MongoURI  string
	MongoDB   string
	LogLevel  string
	LogFormat string

	CORSAllowedOrigins []string

	// CookieSecure controls whether the session cookie is emitted with
	// Secure + SameSite=None (cross-origin auth) or with SameSite=Lax
	// (same-origin dev). Set explicitly via the COOKIE_SECURE env var; do
	// not derive from the request scheme — proxy header drift would break
	// auth silently.
	CookieSecure bool

	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	IdleTimeout     time.Duration
	RequestTimeout  time.Duration
	StartupTimeout  time.Duration
	ShutdownTimeout time.Duration
}

// Default returns the baseline configuration.
func Default() Config {
	return Config{
		Port:            "8080",
		MongoURI:        "mongodb://localhost:27017/portfolio",
		MongoDB:         "portfolio",
		LogLevel:        "info",
		LogFormat:       "json",
		ReadTimeout:     10 * time.Second,
		WriteTimeout:    30 * time.Second,
		IdleTimeout:     120 * time.Second,
		RequestTimeout:  60 * time.Second,
		StartupTimeout:  15 * time.Second,
		ShutdownTimeout: 20 * time.Second,
	}
}

// ApplyEnv overrides fields whose corresponding env var is set.
func (c *Config) ApplyEnv() {
	if v := os.Getenv("PORT"); v != "" {
		c.Port = v
	}
	if v := os.Getenv("MONGODB_URI"); v != "" {
		c.MongoURI = v
	}
	if v := os.Getenv("MONGODB_DATABASE"); v != "" {
		c.MongoDB = v
	}
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		c.LogLevel = v
	}
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		c.LogFormat = v
	}
	if v := os.Getenv("COOKIE_SECURE"); v != "" {
		c.CookieSecure = parseBool(v)
	}
	if v := os.Getenv("CORS_ALLOWED_ORIGINS"); v != "" {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if t := strings.TrimSpace(p); t != "" {
				out = append(out, t)
			}
		}
		c.CORSAllowedOrigins = out
	}
}

// parseBool reads a permissive boolean env value. Unknown strings are
// treated as false so a malformed COOKIE_SECURE never silently enables a
// production setting.
func parseBool(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// Validate returns an error if the config is not usable.
func (c *Config) Validate() error {
	if c.Port == "" {
		return fmt.Errorf("port is required")
	}
	if c.MongoURI == "" {
		return fmt.Errorf("mongo URI is required")
	}
	if c.MongoDB == "" {
		return fmt.Errorf("mongo database name is required")
	}
	switch strings.ToLower(c.LogFormat) {
	case "json", "text":
	default:
		return fmt.Errorf("log format must be 'json' or 'text', got %q", c.LogFormat)
	}
	switch strings.ToLower(c.LogLevel) {
	case "debug", "info", "warn", "warning", "error":
	default:
		return fmt.Errorf("log level must be debug|info|warn|error, got %q", c.LogLevel)
	}
	return nil
}
