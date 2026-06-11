package cmd

import (
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"portfolio-dashboard/internal/config"
)

func newTestServeCommand(t *testing.T) *cobra.Command {
	t.Helper()
	defaults := config.Default()
	flagPort = defaults.Port
	flagMongoURI = defaults.MongoURI
	flagMongoDB = defaults.MongoDB
	flagLogLevel = defaults.LogLevel
	flagLogFormat = defaults.LogFormat

	cmd := &cobra.Command{Use: "serve"}
	cmd.Flags().StringVar(&flagPort, "port", defaults.Port, "")
	cmd.Flags().StringVar(&flagMongoURI, "mongo-uri", defaults.MongoURI, "")
	cmd.Flags().StringVar(&flagMongoDB, "mongo-db", defaults.MongoDB, "")
	cmd.Flags().StringVar(&flagLogLevel, "log-level", defaults.LogLevel, "")
	cmd.Flags().StringVar(&flagLogFormat, "log-format", defaults.LogFormat, "")
	return cmd
}

func TestBuildConfigAppliesEnvThenFlags(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("MONGODB_URI", "mongodb://env:27017/app")
	t.Setenv("MONGODB_DATABASE", "envdb")
	t.Setenv("LOG_LEVEL", "warn")
	t.Setenv("LOG_FORMAT", "json")

	cmd := newTestServeCommand(t)
	if err := cmd.Flags().Set("port", "7070"); err != nil {
		t.Fatalf("set port flag: %v", err)
	}
	if err := cmd.Flags().Set("log-format", "text"); err != nil {
		t.Fatalf("set log-format flag: %v", err)
	}

	cfg := buildConfig(cmd)

	if cfg.Port != "7070" {
		t.Errorf("Port = %q, want flag value 7070", cfg.Port)
	}
	if cfg.MongoURI != "mongodb://env:27017/app" {
		t.Errorf("MongoURI = %q, want env value", cfg.MongoURI)
	}
	if cfg.MongoDB != "envdb" {
		t.Errorf("MongoDB = %q, want envdb", cfg.MongoDB)
	}
	if cfg.LogLevel != "warn" {
		t.Errorf("LogLevel = %q, want warn", cfg.LogLevel)
	}
	if cfg.LogFormat != "text" {
		t.Errorf("LogFormat = %q, want flag value text", cfg.LogFormat)
	}
}

func TestRunServeReturnsValidationErrorBeforeSideEffects(t *testing.T) {
	cmd := newTestServeCommand(t)
	if err := cmd.Flags().Set("port", ""); err != nil {
		t.Fatalf("set port flag: %v", err)
	}

	err := runServe(cmd, nil)
	if err == nil {
		t.Fatal("runServe() error = nil")
	}
	if !strings.Contains(err.Error(), "invalid configuration: port is required") {
		t.Errorf("error = %q", err.Error())
	}
}
