package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

var (
	flagOverallDryRun  bool
	flagOverallRebuild bool
	flagOverallUser    string
)

// migrateOverallCmd builds portfolio_overall from stored snapshots (PD-059,
// DD-015 §2.6): --dry-run reports only, the default inserts missing days,
// --rebuild recomputes every day keeping stored rates. Reads
// portfolio_snapshots only.
var migrateOverallCmd = &cobra.Command{
	Use:   "overall",
	Short: "Backfill or rebuild the overall-worth collection from snapshots",
	Args:  cobra.NoArgs,
	RunE:  runMigrateOverall,
}

func init() {
	migrateOverallCmd.Flags().BoolVar(&flagOverallDryRun, "dry-run", false, "report what would be written; write nothing")
	migrateOverallCmd.Flags().BoolVar(&flagOverallRebuild, "rebuild", false, "recompute every day's totals, keeping stored rates")
	migrateOverallCmd.Flags().StringVar(&flagOverallUser, "user", "", "restrict to one user id")
	migrateCmd.AddCommand(migrateOverallCmd)
}

func runMigrateOverall(cmd *cobra.Command, _ []string) error {
	ctx, store, logger, closeSession, err := cliSession(cmd)
	if err != nil {
		return err
	}
	defer closeSession()
	userIds, err := overallBackfillUsers(ctx, store, flagOverallUser)
	if err != nil {
		return err
	}
	backfill := services.NewOverallBackfill(store.Snapshots, store.Overall, services.NewPriceService(logger), logger)
	opts := services.OverallBackfillOptions{DryRun: flagOverallDryRun, Rebuild: flagOverallRebuild}
	for _, userId := range userIds {
		report, err := backfill.RunUser(ctx, userId, opts)
		logOverallBackfillReport(logger, userId, opts, report)
		if err != nil {
			return fmt.Errorf("user %s: %w", userId.Hex(), err)
		}
	}
	return nil
}

// overallBackfillUsers is every user by _id, disabled ones included (their
// history is kept), or the one --user names.
func overallBackfillUsers(ctx context.Context, store *persistence.Store, only string) ([]primitive.ObjectID, error) {
	if only != "" {
		userId, err := primitive.ObjectIDFromHex(only)
		if err != nil {
			return nil, fmt.Errorf("parse --user %q: %w", only, err)
		}
		return []primitive.ObjectID{userId}, nil
	}
	users, err := store.Users.ListAllByID(ctx)
	if err != nil {
		return nil, err
	}
	userIds := make([]primitive.ObjectID, 0, len(users))
	for _, user := range users {
		userIds = append(userIds, user.ID)
	}
	return userIds, nil
}

func logOverallBackfillReport(logger *zap.Logger, userId primitive.ObjectID, opts services.OverallBackfillOptions, report services.OverallBackfillReport) {
	logger.Info("overall backfill",
		zap.String("user_id", userId.Hex()),
		zap.Bool("dry_run", opts.DryRun),
		zap.Bool("rebuild", opts.Rebuild),
		zap.Int("rows", report.Rows),
		zap.Int("skipped_rated", report.SkippedRated),
		zap.Int("to_write", report.ToWrite),
		zap.Int("written", report.Written),
		zap.Int("without_rate", report.WithoutRate),
		zap.Float64("min_current_inr", report.MinCurrent),
		zap.Float64("max_current_inr", report.MaxCurrent),
		zap.String("currency", domain.CurrencyINR),
	)
}
