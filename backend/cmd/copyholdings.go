package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"go.mongodb.org/mongo-driver/bson"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

var (
	copyToURI   string
	copyToDB    string
	copyDryRun  bool
	copyReplace bool
)

// copyHoldingsCmd mirrors the super admin's holdings from the source database
// (the usual MONGODB_URI / MONGODB_DATABASE, i.e. local) into a destination
// database (--to-uri, i.e. prod). The super admin is located by role in each
// database independently, so the two accounts need not share an _id; every
// copied holding is re-stamped with the destination super admin's _id. Writes
// are idempotent: a holding is matched by (user_id, script) and replaced, never
// duplicated.
var copyHoldingsCmd = &cobra.Command{
	Use:   "copy-holdings",
	Short: "Copy the super admin's holdings into another database (e.g. local → prod)",
	Long: `Copy the super admin's holdings from the source database (MONGODB_URI /
MONGODB_DATABASE, typically local) into a destination database (--to-uri,
typically prod).

The super admin is located by role in each database independently and the
copied holdings are re-stamped with the destination super admin's _id, so the
two accounts need not share an _id. Each holding is matched by (user_id, script)
and replaced in place, so re-running the command is safe and does not create
duplicates.

Example:
  MONGODB_URI='mongodb://localhost:27017/portfolio' \
    ./portfolio-dashboard migrate copy-holdings \
      --to-uri 'mongodb+srv://user:pass@cluster/portfolio' --to-db portfolio

Pass --dry-run to preview without writing, or --replace to first delete the
destination super admin's holdings so the copy is an exact mirror.`,
	RunE: runCopyHoldings,
}

func runCopyHoldings(_ *cobra.Command, _ []string) error {
	if copyToURI == "" {
		return errors.New("--to-uri is required (destination MongoDB connection string)")
	}

	cfg := config.Default()
	cfg.ApplyEnv()
	if copyToDB == "" {
		copyToDB = cfg.MongoDB
	}
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.StartupTimeout)
	defer cancel()

	// Source (local): reuse the standard single-DB connect helper.
	src, _, srcDisconnect, err := cliConnect(ctx, logger, cfg)
	if err != nil {
		return fmt.Errorf("connect source: %w", err)
	}
	defer srcDisconnect()

	// Destination (prod): dial separately so we never accidentally read and
	// write the same database.
	destClient, err := db.Connect(ctx, copyToURI, logger)
	if err != nil {
		return fmt.Errorf("connect destination: %w", err)
	}
	defer func() { _ = destClient.Disconnect(context.Background()) }()
	dest := persistence.New(destClient.Database(copyToDB))

	srcAdmin, err := findSuperAdmin(ctx, src)
	if err != nil {
		return fmt.Errorf("source super admin: %w", err)
	}
	destAdmin, err := findSuperAdmin(ctx, dest)
	if err != nil {
		return fmt.Errorf("destination super admin: %w", err)
	}

	holdings, err := src.Holdings.ListByUser(ctx, srcAdmin.ID)
	if err != nil {
		return fmt.Errorf("list source holdings: %w", err)
	}
	logger.Info("source holdings loaded",
		zap.String("source_admin", srcAdmin.Username),
		zap.String("dest_admin", destAdmin.Username),
		zap.Int("count", len(holdings)),
	)

	if copyDryRun {
		for _, h := range holdings {
			logger.Info("would copy holding",
				zap.String("script", h.Script),
				zap.String("symbol", h.Symbol),
				zap.Float64("stocks_owned", h.StocksOwned),
			)
		}
		logger.Info("dry run complete — no writes performed", zap.Int("count", len(holdings)))
		return nil
	}

	if copyReplace {
		if err := dest.Holdings.DeleteByUser(ctx, destAdmin.ID); err != nil {
			return fmt.Errorf("clearing destination holdings: %w", err)
		}
		logger.Info("destination holdings cleared", zap.String("dest_admin", destAdmin.Username))
	}

	var inserted, replaced int
	for _, h := range holdings {
		h.UserID = destAdmin.ID // re-stamp ownership for the destination account
		isNew, err := dest.Holdings.UpsertByScript(ctx, h)
		if err != nil {
			return fmt.Errorf("upsert %q: %w", h.Script, err)
		}
		if isNew {
			inserted++
		} else {
			replaced++
		}
	}

	logger.Info("holdings copied",
		zap.Int("inserted", inserted),
		zap.Int("replaced", replaced),
		zap.Int("total", len(holdings)),
	)
	return nil
}

// findSuperAdmin returns the single super admin in st, erroring if there is not
// exactly one (a database with zero or several is misconfigured for this copy).
func findSuperAdmin(ctx context.Context, st *persistence.Store) (*domain.User, error) {
	admins, err := st.Users.List(ctx, bson.M{"role": domain.RoleSuperAdmin}, bson.D{})
	if err != nil {
		return nil, err
	}
	switch len(admins) {
	case 1:
		return &admins[0], nil
	case 0:
		return nil, errors.New("no super admin found")
	default:
		return nil, fmt.Errorf("expected exactly one super admin, found %d", len(admins))
	}
}

func init() {
	copyHoldingsCmd.Flags().StringVar(&copyToURI, "to-uri", "", "destination MongoDB connection string (e.g. prod)")
	copyHoldingsCmd.Flags().StringVar(&copyToDB, "to-db", "", "destination database name (default: same as source MONGODB_DATABASE)")
	copyHoldingsCmd.Flags().BoolVar(&copyDryRun, "dry-run", false, "preview the copy without writing")
	copyHoldingsCmd.Flags().BoolVar(&copyReplace, "replace", false, "delete the destination super admin's holdings first (exact mirror)")
	migrateCmd.AddCommand(copyHoldingsCmd)
}

/*

cd backend
# preview
go run . migrate copy-holdings --to-uri '<PROD_URI>' --dry-run
# copy
go run . migrate copy-holdings --to-uri '<PROD_URI>'
# exact mirror
go run . migrate copy-holdings --to-uri '<PROD_URI>' --replace
*/
