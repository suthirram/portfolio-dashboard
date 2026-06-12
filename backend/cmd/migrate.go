package cmd

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
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
	client, err := db.Connect(ctx, cfg.MongoURI, logger)
	if err != nil {
		return err
	}
	defer func() { _ = client.Disconnect(context.Background()) }()
	database := client.Database(cfg.MongoDB)

	username := auth.NormalizeUsername(migrateOwner)
	var owner domain.User
	if err := database.Collection("users").FindOne(ctx, bson.M{"username": username}).Decode(&owner); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return fmt.Errorf("owner %q does not exist", migrateOwner)
		}
		return fmt.Errorf("owner lookup: %w", err)
	}

	res, err := database.Collection("holdings").UpdateMany(ctx,
		bson.M{"user_id": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"user_id": owner.ID}},
	)
	if err != nil {
		return fmt.Errorf("backfilling user_id: %w", err)
	}
	logger.Info("legacy holdings reassigned",
		slog.Int64("matched", res.MatchedCount),
		slog.Int64("modified", res.ModifiedCount),
		slog.String("owner", owner.Username),
	)
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
	client, err := db.Connect(ctx, cfg.MongoURI, logger)
	if err != nil {
		return err
	}
	defer func() { _ = client.Disconnect(context.Background()) }()
	database := client.Database(cfg.MongoDB)

	username := auth.NormalizeUsername(resetLockoutUser)
	res, err := database.Collection("users").UpdateOne(ctx,
		bson.M{"username": username},
		bson.M{"$set": bson.M{
			"locked":                     false,
			"security_question_failures": 0,
			"login_failures":             0,
		}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("user %q not found", resetLockoutUser)
	}
	logger.Info("lockout cleared", slog.String("username", username))
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
	client, err := db.Connect(ctx, cfg.MongoURI, logger)
	if err != nil {
		return err
	}
	defer func() { _ = client.Disconnect(context.Background()) }()
	database := client.Database(cfg.MongoDB)

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}
	username := auth.NormalizeUsername(setPasswordUser)
	// Clear the lockout counters at the same time so a stuck super admin
	// recovers in one step.
	updateRes, err := database.Collection("users").UpdateOne(ctx,
		bson.M{"username": username},
		bson.M{"$set": bson.M{
			"password_hash":              hash,
			"must_change_password":       false,
			"locked":                     false,
			"security_question_failures": 0,
			"login_failures":             0,
		}},
	)
	if err != nil {
		return err
	}
	if updateRes.MatchedCount == 0 {
		return fmt.Errorf("user %q not found", setPasswordUser)
	}

	// Invalidate any active sessions for this user; rotating the password
	// must terminate other devices (PRD-001 §6.3, DD-001 §2.2).
	var owner struct {
		ID primitive.ObjectID `bson:"_id"`
	}
	if err := database.Collection("users").FindOne(ctx, bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{"_id": 1})).Decode(&owner); err == nil {
		if _, err := database.Collection("sessions").DeleteMany(ctx, bson.M{"user_id": owner.ID}); err != nil {
			logger.Warn("session purge failed", slog.String("error", err.Error()))
		}
	}

	logger.Info("password reset", slog.String("username", username))
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
