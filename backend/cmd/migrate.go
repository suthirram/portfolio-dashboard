package cmd

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

var migrateOwner string

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "One-shot migrations for schema changes",
}

var migrateUsersCmd = &cobra.Command{
	Use:   "users",
	Short: "Stamp legacy holdings with a user_id (PRD-001 rollout step 2)",
	RunE:  runMigrateUsers,
}

// cliConnect dials Mongo for a one-shot command and returns the store, the
// underlying database (for index maintenance), and a disconnect func.
// Centralises the boilerplate shared by every CLI command.
func cliConnect(ctx context.Context, logger *slog.Logger, cfg config.Config) (*persistence.Store, *mongo.Database, func(), error) {
	client, err := db.Connect(ctx, cfg.MongoURI, logger)
	if err != nil {
		return nil, nil, nil, err
	}
	database := client.Database(cfg.MongoDB)
	disconnect := func() { _ = client.Disconnect(context.Background()) }
	return persistence.New(database), database, disconnect, nil
}

func runMigrateUsers(_ *cobra.Command, _ []string) error {
	if migrateOwner == "" {
		return errors.New("--owner is required")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()
	st, database, disconnect, err := cliConnect(ctx, logger, cfg)
	if err != nil {
		return err
	}
	defer disconnect()

	owner, err := st.Users.FindByUsername(ctx, migrateOwner)
	if err != nil {
		return fmt.Errorf("owner lookup: %w", err)
	}
	if owner == nil {
		return fmt.Errorf("owner %q does not exist", migrateOwner)
	}

	matched, modified, err := st.Holdings.AssignUnownedTo(ctx, owner.ID)
	if err != nil {
		return fmt.Errorf("backfilling user_id: %w", err)
	}
	logger.Info("legacy holdings reassigned",
		slog.Int64("matched", matched),
		slog.Int64("modified", modified),
		slog.String("owner", owner.Username),
	)

	// Rebuild indexes so the new {user_id, script} index exists.
	return db.EnsureIndexes(ctx, database, logger)
}

// adminCmd hosts the break-glass CLI for the super admin (DD-001 §8).
var adminCmd = &cobra.Command{
	Use:   "admin",
	Short: "Break-glass admin commands (super-admin only)",
}

var resetLockoutUser string

var resetLockoutCmd = &cobra.Command{
	Use:   "reset-lockout",
	Short: "Clear the lockout on a user (security_question_failures, locked, login_failures)",
	RunE:  runResetLockout,
}

func runResetLockout(_ *cobra.Command, _ []string) error {
	if resetLockoutUser == "" {
		return errors.New("--username is required")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()
	st, _, disconnect, err := cliConnect(ctx, logger, cfg)
	if err != nil {
		return err
	}
	defer disconnect()

	user, err := st.Users.FindByUsername(ctx, resetLockoutUser)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user %q not found", resetLockoutUser)
	}
	// The CLI clears login_failures too (unlike the admin endpoint), since a
	// stuck owner should recover in one step.
	if err := st.Users.Update(ctx, user.ID, bson.M{
		"locked":                     false,
		"security_question_failures": 0,
		"login_failures":             0,
	}); err != nil {
		return err
	}
	logger.Info("lockout cleared", slog.String("username", user.Username))
	return nil
}

var setPasswordUser string

var setPasswordCmd = &cobra.Command{
	Use:   "set-password",
	Short: "Set a new password for a user (reads new password from PD_NEW_PASSWORD)",
	Long: `Reads the new password from the PD_NEW_PASSWORD environment variable to
avoid recording it in shell history. Example:
  PD_NEW_PASSWORD='s3cret' ./portfolio-dashboard admin set-password --username admin`,
	RunE: runSetPassword,
}

func runSetPassword(_ *cobra.Command, _ []string) error {
	if setPasswordUser == "" {
		return errors.New("--username is required")
	}
	newPassword := os.Getenv("PD_NEW_PASSWORD")
	if newPassword == "" {
		return errors.New("PD_NEW_PASSWORD env var must be set with the new password")
	}
	if len(newPassword) < 8 {
		return errors.New("new password must be at least 8 characters")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()
	st, _, disconnect, err := cliConnect(ctx, logger, cfg)
	if err != nil {
		return err
	}
	defer disconnect()

	user, err := st.Users.FindByUsername(ctx, setPasswordUser)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user %q not found", setPasswordUser)
	}

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}
	// Clear the lockout counters at the same time so a stuck super admin
	// recovers in one step.
	if err := st.Users.Update(ctx, user.ID, bson.M{
		"password_hash":              hash,
		"must_change_password":       false,
		"locked":                     false,
		"security_question_failures": 0,
		"login_failures":             0,
	}); err != nil {
		return err
	}

	// Invalidate any active sessions; rotating the password must terminate
	// other devices (PRD-001 §6.3, DD-001 §2.2).
	if err := st.Sessions.DeleteByUser(ctx, user.ID); err != nil {
		logger.Warn("session purge failed", slog.String("error", err.Error()))
	}

	logger.Info("password reset", slog.String("username", user.Username))
	return nil
}

func init() {
	migrateUsersCmd.Flags().StringVar(&migrateOwner, "owner", "", "username (case-insensitive) to assume ownership of legacy holdings")
	migrateCmd.AddCommand(migrateUsersCmd)
	rootCmd.AddCommand(migrateCmd)

	resetLockoutCmd.Flags().StringVar(&resetLockoutUser, "username", "", "username to unlock")
	setPasswordCmd.Flags().StringVar(&setPasswordUser, "username", "", "username to update")
	adminCmd.AddCommand(resetLockoutCmd, setPasswordCmd)
	rootCmd.AddCommand(adminCmd)
}
