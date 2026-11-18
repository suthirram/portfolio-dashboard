package cmd

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
)

func TestUiModeStepIsRegistered(t *testing.T) {
	t.Parallel()
	for _, step := range migrationSteps(&persistence.Store{}, zap.NewNop()) {
		if step.Version() == "20261118_01" {
			return
		}
	}
	t.Fatal("ui mode step 20261118_01 is not in the migration registry")
}

func TestUiModeStepStampsOnlyUnstampedGlassAccounts(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("update shape", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse())
		next, err := newUiModeStep(persistence.New(mt.DB), zap.NewNop()).Run(context.Background(), nil)
		if err != nil || next != nil {
			t.Fatalf("Run = %v, %v; want done in one batch", next, err)
		}
		update := mt.GetStartedEvent().Command.Lookup("updates").Array().Index(0).Value().Document()
		if glass, _ := update.Lookup("q", "ui_revamp").BooleanOK(); !glass {
			t.Error("filter must select ui_revamp: true")
		}
		if exists, ok := update.Lookup("q", "ui_mode", "$exists").BooleanOK(); !ok || exists {
			t.Error("filter must skip accounts that already have ui_mode")
		}
		if mode := update.Lookup("u", "$set", "ui_mode").StringValue(); mode != "glass" {
			t.Errorf("$set ui_mode = %q; want glass", mode)
		}
		if multi, _ := update.Lookup("multi").BooleanOK(); !multi {
			t.Error("must update every matching account")
		}
	})
}
