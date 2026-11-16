package cmd

import (
	"testing"

	"go.uber.org/zap"

	"portfolio-dashboard/internal/migration"
	"portfolio-dashboard/internal/persistence"
)

func TestMigrationStepsRegistryIsValid(t *testing.T) {
	t.Parallel()
	if err := migration.Validate(migrationSteps(&persistence.Store{}, zap.NewNop())); err != nil {
		t.Fatalf("registry: %v", err)
	}
}

func TestMigrateRejectsUnknownSubcommand(t *testing.T) {
	t.Parallel()
	// A typo such as `migrate sector` must not silently run every pending
	// step instead of the intended manual subcommand.
	if err := migrateCmd.Args(migrateCmd, []string{"sector"}); err == nil {
		t.Error("migrate accepted an unknown argument; want an error")
	}
}
