package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

var (
	migrateSectorsUser     string
	migrateSectorsAllUsers bool
	migrateSectorsApply    bool
	migrateSectorsRetry    bool
	migrateSectorsLimit    int
)

var migrateSectorsCmd = &cobra.Command{
	Use:   "sectors",
	Short: "Classify existing holdings by Yahoo sector (PD-056)",
	Long: `Looks up each holding that has no classification for its current symbol
and records Yahoo's sector, or needs-review when Yahoo gives none or fails.

Dry run by default: Yahoo is asked but nothing is written. Pass --apply to
write. Requires exactly one of --user <id> or --all-users.

Holdings already resolved, including owner confirmations, are always skipped;
needs-review ones are skipped unless --retry-unresolved. A holding edited or
confirmed during the run is left alone (counted as a conflict). Lookups run
one at a time, at most one new symbol per second. A Yahoo rate limit stops the
batch with a non-zero exit; rerun later to resume where it stopped.`,
	RunE: runMigrateSectors,
}

// sectorBackfillScope validates the scope flags: exactly one of a user id or
// all users. userId is zero for all users.
func sectorBackfillScope(user string, allUsers bool) (primitive.ObjectID, error) {
	switch {
	case user != "" && allUsers:
		return primitive.ObjectID{}, errors.New("pass either --user or --all-users, not both")
	case allUsers:
		return primitive.ObjectID{}, nil
	case user == "":
		return primitive.ObjectID{}, errors.New("pass --user <id> or --all-users")
	}
	userId, err := primitive.ObjectIDFromHex(user)
	if err != nil {
		return primitive.ObjectID{}, fmt.Errorf("--user %q is not a user id", user)
	}
	return userId, nil
}

// sectorBackfillUsers resolves the scope to the user ids to process.
func sectorBackfillUsers(ctx context.Context, users *persistence.UserStore, userId primitive.ObjectID) ([]primitive.ObjectID, error) {
	if !userId.IsZero() {
		if _, err := users.FindByID(ctx, userId); err != nil {
			return nil, fmt.Errorf("user %s: %w", userId.Hex(), err)
		}
		return []primitive.ObjectID{userId}, nil
	}
	all, err := users.ListAllByID(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	userIds := make([]primitive.ObjectID, 0, len(all))
	for _, user := range all {
		userIds = append(userIds, user.ID)
	}
	return userIds, nil
}

func runMigrateSectors(cmd *cobra.Command, _ []string) error {
	userId, err := sectorBackfillScope(migrateSectorsUser, migrateSectorsAllUsers)
	if err != nil {
		return err
	}
	if migrateSectorsLimit < 0 {
		return errors.New("--limit must be 0 (all) or more")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}
	// Ctrl-C or SIGTERM stops the run before its next write.
	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	connectCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()
	store, _, disconnect, err := cliConnect(connectCtx, logger, cfg)
	if err != nil {
		return err
	}
	defer disconnect()

	userIds, err := sectorBackfillUsers(ctx, store.Users, userId)
	if err != nil {
		return err
	}
	backfill := services.NewSectorBackfill(store.Holdings, services.NewCompanyProfileService(logger), logger)
	report, runErr := backfill.Run(ctx, services.SectorBackfillOptions{
		UserIds:         userIds,
		Apply:           migrateSectorsApply,
		RetryUnresolved: migrateSectorsRetry,
		Limit:           migrateSectorsLimit,
	})
	logger.Info("sector backfill finished",
		zap.Bool("applied", migrateSectorsApply),
		zap.Int("users", len(userIds)),
		zap.Int("eligible", report.Eligible),
		zap.Int("resolved", report.Resolved),
		zap.Int("needs_review", report.NeedsReview),
		zap.Int("skipped", report.Skipped),
		zap.Int("conflicts", report.Conflicts),
		zap.Int("errors", report.Errors),
		zap.Int("remaining", report.Remaining),
		zap.Bool("rate_limited", report.RateLimited),
	)
	switch {
	case runErr != nil:
		return fmt.Errorf("sector backfill stopped early: %w", runErr)
	case report.RateLimited:
		return errors.New("sector backfill stopped: Yahoo rate-limited the lookups; rerun later to resume")
	}
	return nil
}

func init() {
	migrateSectorsCmd.Flags().StringVar(&migrateSectorsUser, "user", "", "backfill one user's holdings (user id, hex)")
	migrateSectorsCmd.Flags().BoolVar(&migrateSectorsAllUsers, "all-users", false, "backfill every user's holdings")
	migrateSectorsCmd.Flags().BoolVar(&migrateSectorsApply, "apply", false, "write classifications (default is a dry run that writes nothing)")
	migrateSectorsCmd.Flags().BoolVar(&migrateSectorsRetry, "retry-unresolved", false, "also retry holdings already marked needs-review")
	migrateSectorsCmd.Flags().IntVar(&migrateSectorsLimit, "limit", 100, "holdings to process this run; 0 processes all")
	migrateCmd.AddCommand(migrateSectorsCmd)
}
