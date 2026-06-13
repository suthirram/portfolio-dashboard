package cmd

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/domain"
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
	Short: "Stamp local legacy holdings with the super admin user_id",
	RunE:  runMigrateUsers,
}

var (
	cliConnectFn    = cliConnect
	ensureIndexesFn = db.EnsureIndexes
)

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
	if runningInCI() {
		return errors.New("migrate users is local-only and must not run in CI")
	}
	cfg := config.Default()
	cfg.ApplyEnv()
	if err := validateLocalMongoURI(cfg.MongoURI); err != nil {
		return err
	}
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()
	st, database, disconnect, err := cliConnectFn(ctx, logger, cfg)
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
	if owner.Role != domain.RoleSuperAdmin {
		return fmt.Errorf("owner %q must be superadmin, got %q", owner.Username, owner.Role)
	}
	if owner.Disabled || owner.Locked {
		logger.Warn("migration owner account is disabled or locked",
			slog.String("owner", owner.Username),
			slog.Bool("disabled", owner.Disabled),
			slog.Bool("locked", owner.Locked),
		)
	}

	invalidOwners, err := st.Holdings.CountInvalidOwners(ctx)
	if err != nil {
		return fmt.Errorf("counting invalid holding owners: %w", err)
	}
	danglingOwners, err := st.Holdings.CountDanglingOwners(ctx, st.Users)
	if err != nil {
		return fmt.Errorf("counting dangling holding owners: %w", err)
	}
	if invalidOwners > 0 || danglingOwners > 0 {
		return fmt.Errorf("invalid holding owners found: malformed=%d dangling=%d", invalidOwners, danglingOwners)
	}

	legacyBefore, err := st.Holdings.CountLegacy(ctx)
	if err != nil {
		return fmt.Errorf("counting legacy holdings before migration: %w", err)
	}
	ownerBefore, err := st.Holdings.CountByUser(ctx, owner.ID)
	if err != nil {
		return fmt.Errorf("counting owner holdings before migration: %w", err)
	}

	matched, modified, err := st.Holdings.AssignUnownedTo(ctx, owner.ID)
	if err != nil {
		return fmt.Errorf("backfilling user_id: %w", err)
	}

	legacyAfter, err := st.Holdings.CountLegacy(ctx)
	if err != nil {
		return fmt.Errorf("counting legacy holdings after migration: %w", err)
	}
	ownerAfter, err := st.Holdings.CountByUser(ctx, owner.ID)
	if err != nil {
		return fmt.Errorf("counting owner holdings after migration: %w", err)
	}
	logger.Info("legacy holdings reassigned",
		slog.String("owner", owner.Username),
		slog.String("owner_id", owner.ID.Hex()),
		slog.Int64("legacy_before", legacyBefore),
		slog.Int64("matched", matched),
		slog.Int64("modified", modified),
		slog.Int64("legacy_after", legacyAfter),
		slog.Int64("owner_before", ownerBefore),
		slog.Int64("owner_after", ownerAfter),
		slog.Int64("invalid_owner_shape_count", invalidOwners),
		slog.Int64("dangling_owner_count", danglingOwners),
	)
	if legacyAfter != 0 {
		return fmt.Errorf("legacy holdings remain after migration: %d", legacyAfter)
	}

	// Rebuild indexes so the new {user_id, script} index exists.
	return ensureIndexesFn(ctx, database, logger)
}

func runningInCI() bool {
	for _, key := range []string{"CI", "GITHUB_ACTIONS", "BUILDKITE", "CIRCLECI", "GITLAB_CI"} {
		if isTruthy(os.Getenv(key)) {
			return true
		}
	}
	return false
}

func isTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func validateLocalMongoURI(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid mongo URI: %w", err)
	}
	if u.Scheme != "mongodb" {
		return fmt.Errorf("migrate users is local-only: mongo URI scheme must be mongodb")
	}
	if u.Host == "" {
		return errors.New("migrate users is local-only: mongo URI host is required")
	}
	for endpoint := range strings.SplitSeq(u.Host, ",") {
		host := mongoEndpointHost(endpoint)
		if !isAllowedLocalMongoHost(host) {
			return fmt.Errorf("migrate users is local-only: mongo host %q is not allowed", host)
		}
	}
	return nil
}

func mongoEndpointHost(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(endpoint); err == nil {
		return strings.Trim(strings.ToLower(host), "[]")
	}
	if strings.HasPrefix(endpoint, "[") {
		if end := strings.Index(endpoint, "]"); end >= 0 {
			return strings.ToLower(endpoint[1:end])
		}
	}
	if strings.Count(endpoint, ":") == 1 {
		host, _, _ := strings.Cut(endpoint, ":")
		return strings.ToLower(host)
	}
	return strings.Trim(strings.ToLower(endpoint), "[]")
}

func isAllowedLocalMongoHost(host string) bool {
	switch host {
	case "localhost", "127.0.0.1", "::1", "mongodb", "host.docker.internal":
		return true
	default:
		return false
	}
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
