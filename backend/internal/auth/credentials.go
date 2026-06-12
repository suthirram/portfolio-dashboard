package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{3,32}$`)

func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func ValidateUsername(username string) (string, error) {
	trimmed := strings.TrimSpace(username)
	if !usernamePattern.MatchString(trimmed) {
		return "", fmt.Errorf("username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens")
	}
	return strings.ToLower(trimmed), nil
}

func ValidateName(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || len(trimmed) > 80 {
		return fmt.Errorf("name must be 1-80 characters")
	}
	return nil
}

func ValidatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	return nil
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func NormalizeSecurityAnswer(answer string) string {
	return strings.ToLower(strings.TrimSpace(answer))
}

func HashSecurityAnswers(inputs []SecurityAnswerInput) ([]SecurityAnswer, error) {
	if len(inputs) != 3 {
		return nil, fmt.Errorf("exactly 3 security questions are required")
	}

	seen := map[string]struct{}{}
	out := make([]SecurityAnswer, 0, len(inputs))
	for _, input := range inputs {
		if _, ok := SecurityQuestionByID(input.QuestionID); !ok {
			return nil, fmt.Errorf("unknown security question %q", input.QuestionID)
		}
		if _, ok := seen[input.QuestionID]; ok {
			return nil, fmt.Errorf("security questions must be unique")
		}
		seen[input.QuestionID] = struct{}{}

		normalized := NormalizeSecurityAnswer(input.Answer)
		if normalized == "" {
			return nil, fmt.Errorf("security answers are required")
		}
		hash, err := HashPassword(normalized)
		if err != nil {
			return nil, err
		}
		out = append(out, SecurityAnswer{QuestionID: input.QuestionID, AnswerHash: hash})
	}
	return out, nil
}

func CheckSecurityAnswers(stored []SecurityAnswer, inputs []SecurityAnswerInput) bool {
	if len(stored) != 3 || len(inputs) != 3 {
		return false
	}
	answers := make(map[string]string, len(inputs))
	for _, input := range inputs {
		answers[input.QuestionID] = NormalizeSecurityAnswer(input.Answer)
	}
	for _, storedAnswer := range stored {
		answer, ok := answers[storedAnswer.QuestionID]
		if !ok || !CheckPassword(storedAnswer.AnswerHash, answer) {
			return false
		}
	}
	return true
}

func NewSessionID() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

func RandomAnswer() (string, error) {
	return NewSessionID()
}
