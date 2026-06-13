package auth

import (
	"crypto/rand"
	"encoding/base64"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// NormalizeUsername canonicalises a username for lookup and uniqueness: the
// trimmed lowercase form. Display casing is preserved separately on the
// user document.
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// HashPassword bcrypt-hashes a plaintext password at the default cost.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword reports whether password matches the stored bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// NormalizeAnswer canonicalises a security-question answer so that casing
// and surrounding whitespace never lock a user out (DD-001 §4.1).
func NormalizeAnswer(answer string) string {
	return strings.ToLower(strings.TrimSpace(answer))
}

// HashAnswer bcrypt-hashes a normalized security-question answer.
func HashAnswer(answer string) (string, error) {
	return HashPassword(NormalizeAnswer(answer))
}

// CheckAnswer reports whether answer (after normalization) matches the
// stored answer hash.
func CheckAnswer(hash, answer string) bool {
	return CheckPassword(hash, NormalizeAnswer(answer))
}

// NewSessionID returns an opaque session identifier: 32 bytes from
// crypto/rand, base64url-encoded without padding (DD-001 §5).
func NewSessionID() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
