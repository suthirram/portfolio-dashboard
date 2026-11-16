package cmd

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/migration"
	"portfolio-dashboard/internal/persistence"
)

// migrationSteps is the registry `migrate` runs (DD-014 §2), in version
// order. Add a step by appending it with a version dated the day it is
// written ("YYYYMMDD_NN"); never change or remove a shipped version.
func migrationSteps(store *persistence.Store, logger *zap.Logger) []migration.Step {
	return []migration.Step{
		newSectorBackfillStep(store, logger), // 20261116_01
	}
}

// runMigratePending runs every registered step not yet done, recording each
// step's status in the migrations collection. A failed step exits non-zero;
// the next run retries it from its saved cursor.
func runMigratePending(cmd *cobra.Command, _ []string) error {
	ctx, store, logger, closeSession, err := cliSession(cmd)
	if err != nil {
		return err
	}
	defer closeSession()

	report, err := migration.NewRunner(store.Migrations, logger).RunPending(ctx, migrationSteps(store, logger))
	logger.Info("migrations finished",
		zap.Strings("ran", report.Ran),
		zap.Strings("skipped", report.Skipped),
		zap.String("held", report.Held),
		zap.String("failed", report.Failed),
	)
	return err
}

// cliSession loads config, builds the logger and connects Mongo for a
// long-running one-shot command. ctx is cancelled on Ctrl-C or SIGTERM so the
// command stops before its next write; closeSession disconnects and releases
// the signal handler.
func cliSession(cmd *cobra.Command) (_ context.Context, _ *persistence.Store, _ *zap.Logger, closeSession func(), _ error) {
	cfg := config.Default()
	cfg.ApplyEnv()
	logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	connectCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
	defer cancel()
	store, _, disconnect, err := cliConnect(connectCtx, logger, cfg)
	if err != nil {
		stop()
		return nil, nil, nil, nil, err
	}
	return ctx, store, logger, func() { disconnect(); stop() }, nil
}
