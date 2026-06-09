package cmd

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/db"
	"portfolio-dashboard/handlers"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/httpserver"
	"portfolio-dashboard/internal/logging"
)

var (
	flagPort      string
	flagMongoURI  string
	flagMongoDB   string
	flagLogLevel  string
	flagLogFormat string
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Run the HTTP API server",
	Long: `Connects to MongoDB and starts the HTTP API server.

Configuration precedence: built-in defaults < environment variables < CLI flags.`,
	RunE: runServe,
}

func init() {
	defaults := config.Default()
	serveCmd.Flags().StringVar(&flagPort, "port", defaults.Port, "HTTP listen port ($PORT)")
	serveCmd.Flags().StringVar(&flagMongoURI, "mongo-uri", defaults.MongoURI, "MongoDB connection URI ($MONGODB_URI)")
	serveCmd.Flags().StringVar(&flagMongoDB, "mongo-db", defaults.MongoDB, "MongoDB database name ($MONGODB_DATABASE)")
	serveCmd.Flags().StringVar(&flagLogLevel, "log-level", defaults.LogLevel, "Log level: debug|info|warn|error ($LOG_LEVEL)")
	serveCmd.Flags().StringVar(&flagLogFormat, "log-format", defaults.LogFormat, "Log format: json|text ($LOG_FORMAT)")
}

func runServe(cmd *cobra.Command, _ []string) error {
	cfg := buildConfig(cmd)
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return fmt.Errorf("init logger: %w", err)
	}
	slog.SetDefault(logger)

	logger.Info("starting portfolio-dashboard",
		slog.String("port", cfg.Port),
		slog.String("mongo_db", cfg.MongoDB),
		slog.String("log_level", cfg.LogLevel),
		slog.String("log_format", cfg.LogFormat),
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, disconnect, err := connectMongo(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer disconnect()

	h := handlers.New(database, logger)
	srv := httpserver.New(cfg, logger, database, h)

	if err := httpserver.Run(ctx, srv, logger, cfg.ShutdownTimeout); err != nil {
		logger.Error("server terminated with error", slog.String("error", err.Error()))
		return err
	}
	logger.Info("server stopped cleanly")
	return nil
}

// buildConfig assembles config from defaults, environment, and CLI flags
// (in that order of precedence — later overrides earlier).
func buildConfig(cmd *cobra.Command) config.Config {
	cfg := config.Default()
	cfg.ApplyEnv()

	if cmd.Flags().Changed("port") {
		cfg.Port = flagPort
	}
	if cmd.Flags().Changed("mongo-uri") {
		cfg.MongoURI = flagMongoURI
	}
	if cmd.Flags().Changed("mongo-db") {
		cfg.MongoDB = flagMongoDB
	}
	if cmd.Flags().Changed("log-level") {
		cfg.LogLevel = flagLogLevel
	}
	if cmd.Flags().Changed("log-format") {
		cfg.LogFormat = flagLogFormat
	}
	return cfg
}

func connectMongo(ctx context.Context, cfg config.Config, logger *slog.Logger) (*mongo.Database, func(), error) {
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()

	client, err := db.Connect(startCtx, cfg.MongoURI, logger)
	if err != nil {
		return nil, nil, fmt.Errorf("connect mongodb: %w", err)
	}

	disconnect := func() {
		discCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := client.Disconnect(discCtx); err != nil {
			logger.Error("mongodb disconnect failed", slog.String("error", err.Error()))
		}
	}

	database := client.Database(cfg.MongoDB)
	if err := db.EnsureIndexes(startCtx, database, logger); err != nil {
		logger.Warn("index creation failed", slog.String("error", err.Error()))
	}
	return database, disconnect, nil
}
