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
