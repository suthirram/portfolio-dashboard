package cmd

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/logging"
)

var (
	adminUsername string
	adminPassword string
)

var adminCmd = &cobra.Command{
	Use:   "admin",
	Short: "Owner-only account recovery commands",
}

var adminResetLockoutCmd = &cobra.Command{
	Use:   "reset-lockout",
	Short: "Clear recovery lockout for a user",
	RunE: func(cmd *cobra.Command, _ []string) error {
		if adminUsername == "" {
			return fmt.Errorf("--username is required")
		}
		return withDatabase(cmd.Context(), func(database *mongo.Database, logger *slog.Logger) error {
			res, err := database.Collection("users").UpdateOne(cmd.Context(),
				bson.M{"username": auth.NormalizeUsername(adminUsername)},
				bson.M{"$set": bson.M{
					"locked":                     false,
					"security_question_failures": 0,
					"updated_at":                 time.Now(),
				}},
			)
			if err != nil {
				return err
			}
			if res.MatchedCount == 0 {
				return fmt.Errorf("user %q not found", adminUsername)
			}
			logger.Info("user lockout reset", slog.String("username", adminUsername))
			return nil
		})
	},
}

var adminSetPasswordCmd = &cobra.Command{
	Use:   "set-password",
	Short: "Set a user's password",
	RunE: func(cmd *cobra.Command, _ []string) error {
		if adminUsername == "" {
			return fmt.Errorf("--username is required")
		}
		password := adminPassword
		if password == "" {
			fmt.Fprint(os.Stderr, "New password: ")
			line, err := bufio.NewReader(os.Stdin).ReadString('\n')
			if err != nil {
				return err
			}
			password = strings.TrimSpace(line)
		}
		if err := auth.ValidatePassword(password); err != nil {
			return err
		}
		passwordHash, err := auth.HashPassword(password)
		if err != nil {
			return err
		}
		return withDatabase(cmd.Context(), func(database *mongo.Database, logger *slog.Logger) error {
			res, err := database.Collection("users").UpdateOne(cmd.Context(),
				bson.M{"username": auth.NormalizeUsername(adminUsername)},
				bson.M{"$set": bson.M{
					"password_hash":              passwordHash,
					"must_change_password":       false,
					"locked":                     false,
					"security_question_failures": 0,
					"updated_at":                 time.Now(),
				}},
			)
			if err != nil {
				return err
			}
			if res.MatchedCount == 0 {
				return fmt.Errorf("user %q not found", adminUsername)
			}
			var user auth.User
			if err := database.Collection("users").FindOne(cmd.Context(), bson.M{"username": auth.NormalizeUsername(adminUsername)}).Decode(&user); err != nil {
				return err
			}
			if _, err := database.Collection("sessions").DeleteMany(cmd.Context(), bson.M{"user_id": user.ID}); err != nil {
				return err
			}
			logger.Info("user password set", slog.String("username", adminUsername))
			return nil
		})
	},
}

func init() {
	adminResetLockoutCmd.Flags().StringVar(&adminUsername, "username", "", "Username to reset")
	adminSetPasswordCmd.Flags().StringVar(&adminUsername, "username", "", "Username to update")
	adminSetPasswordCmd.Flags().StringVar(&adminPassword, "password", "", "New password; prompts when omitted")
	adminCmd.AddCommand(adminResetLockoutCmd, adminSetPasswordCmd)
	rootCmd.AddCommand(adminCmd)
}

func withDatabase(ctx context.Context, fn func(database *mongo.Database, logger *slog.Logger) error) error {
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}
	startCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()
	client, err := db.Connect(startCtx, cfg.MongoURI, logger)
	if err != nil {
		return err
	}
	defer func() {
		discCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = client.Disconnect(discCtx)
	}()
	return fn(client.Database(cfg.MongoDB), logger)
}
