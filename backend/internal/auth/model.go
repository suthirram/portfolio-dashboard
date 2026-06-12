package auth

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	RoleUser       = "user"
	RoleAdmin      = "admin"
	RoleSuperAdmin = "superadmin"
)

type SecurityAnswer struct {
	QuestionID string `bson:"question_id"`
	AnswerHash string `bson:"answer_hash"`
}

type User struct {
	ID                       primitive.ObjectID `bson:"_id,omitempty"`
	Username                 string             `bson:"username"`
	UsernameDisplay          string             `bson:"username_display"`
	Name                     string             `bson:"name"`
	PasswordHash             string             `bson:"password_hash"`
	Role                     string             `bson:"role"`
	Region                   string             `bson:"region,omitempty"`
	Disabled                 bool               `bson:"disabled"`
	Locked                   bool               `bson:"locked"`
	LoginFailures            int                `bson:"login_failures"`
	SecurityQuestionFailures int                `bson:"security_question_failures"`
	SecurityQuestions        []SecurityAnswer   `bson:"security_questions"`
	MustChangePassword       bool               `bson:"must_change_password"`
	CreatedAt                time.Time          `bson:"created_at"`
	UpdatedAt                time.Time          `bson:"updated_at"`
	LastLoginAt              *time.Time         `bson:"last_login_at,omitempty"`
}

type Session struct {
	ID        string             `bson:"_id"`
	UserID    primitive.ObjectID `bson:"user_id"`
	CreatedAt time.Time          `bson:"created_at"`
	ExpiresAt time.Time          `bson:"expires_at"`
	UserAgent string             `bson:"user_agent,omitempty"`
}

type SecurityAnswerInput struct {
	QuestionID string
	Answer     string
}

func (u User) IsAdmin() bool {
	return u.Role == RoleAdmin || u.Role == RoleSuperAdmin
}

func (u User) IsSuperAdmin() bool {
	return u.Role == RoleSuperAdmin
}
