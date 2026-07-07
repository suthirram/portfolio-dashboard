package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Roles. An admin is a normal user with extra responsibilities (PRD-001 §4);
// there is exactly one super admin.
const (
	RoleUser       = "user"
	RoleAdmin      = "admin"
	RoleSuperAdmin = "superadmin"
)

// User is the MongoDB document for an account.
type User struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Username        string             `bson:"username" json:"username"`                 // lowercase; uniqueness + login
	UsernameDisplay string             `bson:"username_display" json:"username_display"` // as typed, for the UI
	Name            string             `bson:"name" json:"name"`
	PasswordHash    string             `bson:"password_hash" json:"-"`
	Role            string             `bson:"role" json:"role"`                           // user | admin | superadmin
	Region          string             `bson:"region,omitempty" json:"region"`             // india|europe|us; "" for super admin (= all)
	Disabled        bool               `bson:"disabled" json:"disabled"`                   // hide / soft-delete flag
	Locked          bool               `bson:"locked" json:"locked"`                       // security_question_failures >= 3
	GoldEnabled     bool               `bson:"gold_enabled,omitempty" json:"gold_enabled"` // gold-tracking access (PRD-003 §2.4); super-admin toggled, omitted = false

	LoginFailures            int  `bson:"login_failures" json:"-"`
	SecurityQuestionFailures int  `bson:"security_question_failures" json:"-"`
	MustChangePassword       bool `bson:"must_change_password" json:"must_change_password"`

	SecurityQuestions []SecurityAnswer `bson:"security_questions" json:"-"` // always len == 3

	CreatedAt   time.Time  `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time  `bson:"updated_at" json:"updated_at"`
	LastLoginAt *time.Time `bson:"last_login_at,omitempty" json:"last_login_at,omitempty"`
}

// SecurityAnswer stores one chosen catalogue question and the bcrypt hash of
// the normalized answer. Raw answers are never stored.
type SecurityAnswer struct {
	QuestionID string `bson:"question_id" json:"question_id"`
	AnswerHash string `bson:"answer_hash" json:"-"`
}

// IsAdmin reports whether the user has admin or super-admin powers.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin || u.Role == RoleSuperAdmin
}

// IsSuperAdmin reports whether the user is the super admin.
func (u *User) IsSuperAdmin() bool {
	return u.Role == RoleSuperAdmin
}

// Oversees reports whether u may act on target per DD-001 §6: the super
// admin oversees everyone except itself being modified by scope rules;
// an admin oversees plain users in their own region only.
func (u *User) Oversees(target *User) bool {
	switch u.Role {
	case RoleSuperAdmin:
		return target.ID != u.ID
	case RoleAdmin:
		return target.Role == RoleUser && target.Region == u.Region
	default:
		return false
	}
}
