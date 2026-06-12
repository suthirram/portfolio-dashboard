package cmd

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/db"
)

var migrateOwner string

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "One-shot data migrations",
}

var migrateUsersCmd = &cobra.Command{
	Use:   "users",
	Short: "Assign legacy holdings to an owner user",
	RunE: func(cmd *cobra.Command, _ []string) error {
		if migrateOwner == "" {
			return fmt.Errorf("--owner is required")
		}
		return withDatabase(cmd.Context(), func(database *mongo.Database, logger *slog.Logger) error {
			var owner auth.User
			if err := database.Collection("users").FindOne(cmd.Context(), bson.M{"username": auth.NormalizeUsername(migrateOwner)}).Decode(&owner); err != nil {
				return fmt.Errorf("find owner: %w", err)
			}
			res, err := database.Collection("holdings").UpdateMany(cmd.Context(),
				bson.M{"user_id": bson.M{"$exists": false}},
				bson.M{"$set": bson.M{"user_id": owner.ID, "updated_at": time.Now()}},
			)
			if err != nil {
				return err
			}
			if err := db.EnsureIndexes(cmd.Context(), database, logger); err != nil {
				return err
			}
			logger.Info("legacy holdings assigned",
				slog.String("owner", owner.Username),
				slog.Int64("matched", res.MatchedCount),
				slog.Int64("modified", res.ModifiedCount),
			)
			return nil
		})
	},
}

func init() {
	migrateUsersCmd.Flags().StringVar(&migrateOwner, "owner", "", "Username that owns legacy holdings")
	migrateCmd.AddCommand(migrateUsersCmd)
	rootCmd.AddCommand(migrateCmd)
}
