package config

import (
	"strings"
	"testing"
	"time"
)

func TestDefaultProducesValidConfig(t *testing.T) {
	cfg := Default()

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Default().Validate(): %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.ReadTimeout != 10*time.Second {
		t.Errorf("ReadTimeout = %s, want 10s", cfg.ReadTimeout)
	}
	if cfg.ShutdownTimeout != 20*time.Second {
		t.Errorf("ShutdownTimeout = %s, want 20s", cfg.ShutdownTimeout)
	}
}

func TestApplyEnvOverridesConfiguredValuesAndTrimsCORSOrigins(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("MONGODB_URI", "mongodb://mongo:27017/app")
	t.Setenv("MONGODB_DATABASE", "investments")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("LOG_FORMAT", "text")
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example.com, ,https://admin.example.com ")

	cfg := Default()
	cfg.ApplyEnv()

	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want 9090", cfg.Port)
	}
	if cfg.MongoURI != "mongodb://mongo:27017/app" {
		t.Errorf("MongoURI = %q", cfg.MongoURI)
	}
	if cfg.MongoDB != "investments" {
		t.Errorf("MongoDB = %q, want investments", cfg.MongoDB)
	}
	if cfg.LogLevel != "debug" || cfg.LogFormat != "text" {
		t.Errorf("log config = %s/%s, want debug/text", cfg.LogLevel, cfg.LogFormat)
	}
	wantOrigins := []string{"https://app.example.com", "https://admin.example.com"}
	if len(cfg.CORSAllowedOrigins) != len(wantOrigins) {
		t.Fatalf("CORSAllowedOrigins = %#v, want %#v", cfg.CORSAllowedOrigins, wantOrigins)
	}
	for i, want := range wantOrigins {
		if cfg.CORSAllowedOrigins[i] != want {
			t.Errorf("CORSAllowedOrigins[%d] = %q, want %q", i, cfg.CORSAllowedOrigins[i], want)
		}
	}
}

func TestApplyEnvParsesCookieSecure(t *testing.T) {
	cases := []struct {
		raw  string
		want bool
	}{
		{"true", true},
		{"TRUE", true},
		{"1", true},
		{"yes", true},
		{"on", true},
		{"false", false},
		{"0", false},
		{"no", false},
		{"off", false},
		{"", false},
		{"garbage", false},
	}
	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			t.Setenv("COOKIE_SECURE", tc.raw)
			cfg := Default()
			cfg.ApplyEnv()
			if cfg.CookieSecure != tc.want {
				t.Errorf("CookieSecure for %q = %v, want %v", tc.raw, cfg.CookieSecure, tc.want)
			}
		})
	}
}

func TestApplyEnvLeavesDefaultsWhenVariablesAreEmpty(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("MONGODB_URI", "")
	t.Setenv("MONGODB_DATABASE", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("LOG_FORMAT", "")
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	cfg := Default()
	cfg.ApplyEnv()

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate after empty env: %v", err)
	}
	if len(cfg.CORSAllowedOrigins) != 0 {
		t.Errorf("CORSAllowedOrigins = %#v, want empty", cfg.CORSAllowedOrigins)
	}
}

func TestValidateRejectsMissingRequiredFields(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*Config)
		wantErr string
	}{
		{"port", func(c *Config) { c.Port = "" }, "port is required"},
		{"mongo uri", func(c *Config) { c.MongoURI = "" }, "mongo URI is required"},
		{"mongo database", func(c *Config) { c.MongoDB = "" }, "mongo database name is required"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := Default()
			tc.mutate(&cfg)

			err := cfg.Validate()
			if err == nil {
				t.Fatal("Validate() error = nil")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("Validate() error = %q, want substring %q", err.Error(), tc.wantErr)
			}
		})
	}
}

func TestValidateRejectsUnsupportedLogConfig(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(*Config)
		wantErr string
	}{
		{"format", func(c *Config) { c.LogFormat = "xml" }, "log format"},
		{"level", func(c *Config) { c.LogLevel = "trace" }, "log level"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := Default()
			tc.mutate(&cfg)

			err := cfg.Validate()
			if err == nil {
				t.Fatal("Validate() error = nil")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("Validate() error = %q, want substring %q", err.Error(), tc.wantErr)
			}
		})
	}
}
