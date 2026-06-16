package cmd

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

var (
	flagSnapshotDate   string
	flagSnapshotUser   string
	flagSnapshotDryRun bool
)

var snapshotCmd = &cobra.Command{
	Use:   "snapshot",
	Short: "Run the daily portfolio snapshot job",
	Long: `Builds a daily portfolio snapshot for every non-disabled user on
the configured date and persists it in the portfolio_snapshots collection.

Defaults to today (UTC) and every active user. The job is idempotent: a
re-run for the same (user, date) overwrites cron-sourced regions and
preserves manual overrides (PRD-002 / DD-002).

This subcommand is what the external cron / Cloud Scheduler invokes; the
web 'serve' process does not own any schedule.`,
	RunE: runSnapshot,
}

func init() {
	snapshotCmd.Flags().StringVar(&flagSnapshotDate, "date", "",
		"UTC date in YYYY-MM-DD; defaults to today")
	snapshotCmd.Flags().StringVar(&flagSnapshotUser, "user", "",
		"restrict the run to one user id (hex); defaults to all active users")
	snapshotCmd.Flags().BoolVar(&flagSnapshotDryRun, "dry-run", false,
		"build snapshots and print the report, but do not write to MongoDB")

	rootCmd.AddCommand(snapshotCmd)
}

func runSnapshot(cmd *cobra.Command, _ []string) error {
	cfg := buildSnapshotConfig(cmd)
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return fmt.Errorf("init logger: %w", err)
	}
	undo := zap.ReplaceGlobals(logger)
	defer undo()

	date := time.Now().UTC()
	if flagSnapshotDate != "" {
		parsed, err := time.Parse("2006-01-02", flagSnapshotDate)
		if err != nil {
			return fmt.Errorf("parse --date %q: %w", flagSnapshotDate, err)
		}
		date = parsed.UTC()
	}

	var userID primitive.ObjectID
	if flagSnapshotUser != "" {
		uid, err := primitive.ObjectIDFromHex(flagSnapshotUser)
		if err != nil {
			return fmt.Errorf("parse --user %q: %w", flagSnapshotUser, err)
		}
		userID = uid
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout+10*time.Minute)
	defer cancel()

	database, disconnect, err := connectMongo(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer disconnect()

	store := persistence.New(database)
	priceSvc := services.NewPriceService(logger)
	snapSvc := services.NewSnapshotService(store.Holdings, store.Snapshots, store.Users, priceSvc, logger)

	report, err := snapSvc.Run(ctx, services.RunOptions{
		Date:   date,
		UserID: userID,
		DryRun: flagSnapshotDryRun,
	})
	if err != nil {
		return fmt.Errorf("snapshot run: %w", err)
	}

	logger.Info("snapshot run complete",
		zap.String("date", domain.UTCDate(report.Date).Format("2006-01-02")),
		zap.Int("total", report.Total),
		zap.Int("succeeded", report.Succeeded),
		zap.Int("failed", len(report.UserErrors)),
		zap.Bool("dry_run", flagSnapshotDryRun),
	)

	if report.HasErrors() {
		return fmt.Errorf("snapshot run had %d user-level failures", len(report.UserErrors))
	}
	return nil
}

// buildSnapshotConfig reuses serve's flags. The snapshot subcommand
// piggybacks on the same defaults+env+flags layering as serve so a single
// container image can run either path with one config set.
func buildSnapshotConfig(cmd *cobra.Command) config.Config {
	cfg := config.Default()
	cfg.ApplyEnv()
	// Snapshot does not own port / log overrides on the CLI surface in
	// v1, but inherits MongoDB-related env. If we add overrides later
	// we layer them here the same way serve does.
	_ = cmd
	return cfg
}
