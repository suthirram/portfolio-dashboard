package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/mongo"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/controllers"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/httpserver"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/telemetry"
)

var (
	flagPort        string
	flagMongoURI    string
	flagMongoDB     string
	flagPostgresURI string
	flagLogLevel    string
	flagLogFormat   string
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
	serveCmd.Flags().StringVar(&flagPostgresURI, "postgres-uri", defaults.PostgresURI, "Postgres connection URI for gold tracking; empty disables ($POSTGRES_URI)")
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
	undo := zap.ReplaceGlobals(logger)
	defer undo()

	logger.Info("starting portfolio-dashboard",
		zap.String("port", cfg.Port),
		zap.String("mongo_db", cfg.MongoDB),
		zap.String("log_level", cfg.LogLevel),
		zap.String("log_format", cfg.LogFormat),
	)

	traceShutdown, _, err := telemetry.Setup(context.Background(), cfg, logger)
	if err != nil {
		return fmt.Errorf("init tracing: %w", err)
	}
	defer func() {
		shutCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := traceShutdown(shutCtx); err != nil {
			logger.Error("trace shutdown failed", zap.Error(err))
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, disconnect, err := connectMongo(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer disconnect()

	// Postgres backs gold tracking only (DD-003 §1.1). It is optional at
	// boot: when absent the rest of the app must keep serving, so failures
	// log and degrade instead of aborting startup. The pool is wired into
	// the gold store in a later PD-043 slice.
	pgPool := connectPostgres(ctx, cfg, logger)
	if pgPool != nil {
		defer pgPool.Close()
	}

	h := controllers.New(database, logger, cfg.CookieSecure)
	h.AttachGold(pgPool)
	e := httpserver.New(cfg, logger, database, h)

	if err := httpserver.Run(ctx, e, cfg, logger); err != nil {
		logger.Error("server terminated with error", zap.String("error", err.Error()))
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
	if cmd.Flags().Changed("postgres-uri") {
		cfg.PostgresURI = flagPostgresURI
	}
	if cmd.Flags().Changed("log-level") {
		cfg.LogLevel = flagLogLevel
	}
	if cmd.Flags().Changed("log-format") {
		cfg.LogFormat = flagLogFormat
	}
	return cfg
}

// connectPostgres connects and migrates the gold database. Never fatal: any
// failure returns nil (gold features off) and the server boots without it.
func connectPostgres(ctx context.Context, cfg config.Config, logger *zap.Logger) *pgxpool.Pool {
	if cfg.PostgresURI == "" {
		logger.Info("postgres not configured; gold features disabled")
		return nil
	}
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()

	pool, err := db.ConnectPostgres(startCtx, cfg.PostgresURI, logger)
	if err != nil {
		logger.Warn("postgres unavailable; gold features disabled", zap.String("error", err.Error()))
		return nil
	}
	// Migration uses a separate 60-second context so the advisory-lock wait
	// (serialising concurrent Cloud Run boots) does not race against the
	// shorter startup ping timeout.
	migrCtx, migrCancel := context.WithTimeout(ctx, 60*time.Second)
	defer migrCancel()
	if err := db.MigratePostgres(migrCtx, pool, logger); err != nil {
		logger.Error("postgres migration failed; gold features disabled", zap.String("error", err.Error()))
		pool.Close()
		return nil
	}
	return pool
}

func connectMongo(ctx context.Context, cfg config.Config, logger *zap.Logger) (*mongo.Database, func(), error) {
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
			logger.Error("mongodb disconnect failed", zap.String("error", err.Error()))
		}
	}

	database := client.Database(cfg.MongoDB)
	if err := db.EnsureIndexes(startCtx, database, logger); err != nil {
		logger.Warn("index creation failed", zap.String("error", err.Error()))
	}
	if err := auth.EnsureSuperAdmin(startCtx, database, logger); err != nil {
		logger.Warn("super admin bootstrap failed", zap.String("error", err.Error()))
	}
	return database, disconnect, nil
}
