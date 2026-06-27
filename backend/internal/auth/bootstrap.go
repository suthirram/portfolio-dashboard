package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/domain"
)

// EnsureSuperAdmin creates the bootstrap super admin when no
// super admin exists yet. The placeholder security answers are random
// crypto-rand bytes, so the recover flow cannot bypass onboarding (PRD-001
// §6.5, DD-001 §7).
func EnsureSuperAdmin(ctx context.Context, db *mongo.Database, logger *zap.Logger) error {
	users := db.Collection("users")
	count, err := users.CountDocuments(ctx, bson.M{"role": domain.RoleSuperAdmin})
	if err != nil {
		return fmt.Errorf("counting super admins: %w", err)
	}
	if count > 0 {
		return nil
	}

	pwHash, err := HashPassword("admin")
	if err != nil {
		return fmt.Errorf("hashing bootstrap password: %w", err)
	}

	// First three questions from the catalogue. Each answer is 32 random
	// bytes hex-encoded, so nobody can guess it and the recover flow stays
	// closed until onboarding picks real questions.
	catalogue := SecurityQuestions()
	answers := make([]domain.SecurityAnswer, 0, 3)
	for i := range 3 {
		secret, err := randomSecret()
		if err != nil {
			return fmt.Errorf("generating placeholder answer: %w", err)
		}
		hash, err := HashPassword(secret)
		if err != nil {
			return fmt.Errorf("hashing placeholder answer: %w", err)
		}
		answers = append(answers, domain.SecurityAnswer{
			QuestionID: catalogue[i].ID,
			AnswerHash: hash,
		})
	}

	now := time.Now()
	user := domain.User{
		ID:                 primitive.NewObjectID(),
		Username:           "admin",
		UsernameDisplay:    "admin",
		Name:               "Super Admin",
		PasswordHash:       pwHash,
		Role:               domain.RoleSuperAdmin,
		Region:             "", // super admin has no region.
		MustChangePassword: true,
		SecurityQuestions:  answers,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if _, err := users.InsertOne(ctx, user); err != nil {
		return fmt.Errorf("inserting bootstrap super admin: %w", err)
	}
	logger.Info("bootstrap super admin created", zap.String("username", "admin"))
	return nil
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
