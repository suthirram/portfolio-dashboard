package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"time"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

var (
	copyHistoryFrom   string
	copyHistoryTo     string
	copyHistoryDryRun bool
)

// copyHistoryCmd copies one user's History rows (the daily snapshots) to
// another user in the same database. Only dates the target does not have are
// written, so the target's own rows are never touched and a re-run copies
// nothing new. Holdings and transactions are not copied.
var copyHistoryCmd = &cobra.Command{
	Use:   "copy-history",
	Short: "Copy one user's History rows to another user (same database)",
	Long: `Copy one user's History rows (daily snapshots: per-currency totals,
per-stock lines, manual overrides) to another user in the database named by
MONGODB_URI / MONGODB_DATABASE.

Only the dates the target user does not have are copied; the target's
existing rows are left as they are, so re-running the command is safe.
Holdings and transactions are not copied. Build the target's ledger FIRST
(holdings, Import CSV, ledger edits), then copy: any backdated ledger write
on the target re-heals its History from that date with the target's own
ledger, so a copy made before the ledger would be recalculated. Cron-sourced
rows heal; manual rows are kept.

Example:
  go run . migrate copy-history --from alice --to bob --dry-run
  go run . migrate copy-history --from alice --to bob`,
	RunE: runCopyHistory,
}

func runCopyHistory(_ *cobra.Command, _ []string) error {
	if copyHistoryFrom == "" || copyHistoryTo == "" {
		return errors.New("--from and --to are required (usernames)")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()

	store, _, disconnect, err := cliConnect(ctx, logger, cfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer disconnect()

	source, err := findUserByUsername(ctx, store, copyHistoryFrom)
	if err != nil {
		return fmt.Errorf("source user: %w", err)
	}
	target, err := findUserByUsername(ctx, store, copyHistoryTo)
	if err != nil {
		return fmt.Errorf("target user: %w", err)
	}
	if source.ID == target.ID {
		return errors.New("--from and --to are the same user")
	}

	everything := time.Date(9999, 12, 31, 0, 0, 0, 0, time.UTC)
	sourceRows, err := store.Snapshots.List(ctx, source.ID, time.Time{}, everything)
	if err != nil {
		return fmt.Errorf("list source history: %w", err)
	}
	targetRows, err := store.Snapshots.List(ctx, target.ID, time.Time{}, everything)
	if err != nil {
		return fmt.Errorf("list target history: %w", err)
	}
	rows := historyToCopy(sourceRows, targetRows, target.ID)
	logger.Info("history to copy", zap.String("from", source.Username), zap.String("to", target.Username),
		zap.Int("source_rows", len(sourceRows)), zap.Int("target_rows", len(targetRows)), zap.Int("to_copy", len(rows)))

	if copyHistoryDryRun {
		for _, row := range rows {
			logger.Info("would copy row", zap.String("date", row.Date.Format(time.DateOnly)), zap.Int("lines", len(row.Lines)))
		}
		logger.Info("dry run complete — no writes performed", zap.Int("to_copy", len(rows)))
		return nil
	}
	for _, row := range rows {
		if err := store.Snapshots.Upsert(ctx, row); err != nil {
			return fmt.Errorf("copy %s: %w", row.Date.Format(time.DateOnly), err)
		}
	}
	logger.Info("history copied", zap.Int("copied", len(rows)), zap.Int("skipped", len(sourceRows)-len(rows)))
	return nil
}

// historyToCopy is the source rows whose date the target does not have,
// re-owned by targetId with a fresh id, oldest first. Buckets (with their
// manual / cron source) and per-stock lines are copied as they are.
func historyToCopy(source, target []domain.PortfolioSnapshot, targetId primitive.ObjectID) []domain.PortfolioSnapshot {
	held := make(map[string]bool, len(target))
	for _, row := range target {
		held[domain.UTCDate(row.Date).Format(time.DateOnly)] = true
	}
	copies := make([]domain.PortfolioSnapshot, 0, len(source))
	for _, row := range slices.Backward(source) { // List is newest first
		if held[domain.UTCDate(row.Date).Format(time.DateOnly)] || len(row.Buckets) == 0 {
			continue
		}
		row.ID, row.UserID = primitive.NilObjectID, targetId
		copies = append(copies, row)
	}
	return copies
}

// findUserByUsername returns the user named username, or an error when there
// is none.
func findUserByUsername(ctx context.Context, store *persistence.Store, username string) (*domain.User, error) {
	user, err := store.Users.FindByUsername(ctx, username)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("no user %q", username)
	}
	return user, nil
}

func init() {
	copyHistoryCmd.Flags().StringVar(&copyHistoryFrom, "from", "", "username whose History rows are copied")
	copyHistoryCmd.Flags().StringVar(&copyHistoryTo, "to", "", "username that receives them")
	copyHistoryCmd.Flags().BoolVar(&copyHistoryDryRun, "dry-run", false, "list the rows that would be copied without writing")
	migrateCmd.AddCommand(copyHistoryCmd)
}
