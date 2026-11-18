package cmd

import (
	"context"

	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
)

// uiModeStep stamps ui_mode = glass on the accounts that already use the
// glass UI (PD-059). One batch: the update is a single idempotent UpdateMany.
type uiModeStep struct {
	users  *persistence.UserStore
	logger *zap.Logger
}

func newUiModeStep(store *persistence.Store, logger *zap.Logger) uiModeStep {
	return uiModeStep{users: store.Users, logger: logger}
}

func (uiModeStep) Version() string { return "20261118_01" }

func (s uiModeStep) Run(ctx context.Context, _ *string) (*string, error) {
	stamped, err := s.users.StampGlassUiMode(ctx)
	if err != nil {
		return nil, err
	}
	s.logger.Info("ui mode stamped on glass accounts", zap.Int64("accounts", stamped))
	return nil, nil
}
