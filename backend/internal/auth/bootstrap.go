package auth

import (
	"context"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func EnsureBootstrapSuperAdmin(ctx context.Context, db *mongo.Database, logger *slog.Logger) error {
	users := db.Collection("users")
	count, err := users.CountDocuments(ctx, bson.M{"role": RoleSuperAdmin})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	passwordHash, err := HashPassword("admin")
	if err != nil {
		return err
	}

	questions := SecurityQuestions()
	inputs := make([]SecurityAnswerInput, 0, 3)
	for i := range 3 {
		answer, err := RandomAnswer()
		if err != nil {
			return err
		}
		inputs = append(inputs, SecurityAnswerInput{QuestionID: questions[i].ID, Answer: answer})
	}
	answers, err := HashSecurityAnswers(inputs)
	if err != nil {
		return err
	}

	now := time.Now()
	_, err = users.InsertOne(ctx, User{
		Username:           "admin",
		UsernameDisplay:    "admin",
		Name:               "Super Admin",
		PasswordHash:       passwordHash,
		Role:               RoleSuperAdmin,
		SecurityQuestions:  answers,
		MustChangePassword: true,
		CreatedAt:          now,
		UpdatedAt:          now,
	})
	if err != nil {
		return err
	}
	logger.Info("bootstrap super admin created", slog.String("username", "admin"))
	return nil
}
