package auth

import (
	"strings"
	"testing"
)

func TestHashPassword_RoundTrip(t *testing.T) {
	hash, err := HashPassword("s3cret-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "s3cret-password" {
		t.Fatal("hash equals plaintext")
	}
	if !CheckPassword(hash, "s3cret-password") {
		t.Error("CheckPassword(correct) = false, want true")
	}
	if CheckPassword(hash, "wrong-password") {
		t.Error("CheckPassword(wrong) = true, want false")
	}
}

func TestHashPassword_DistinctSalts(t *testing.T) {
	h1, err := HashPassword("same")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	h2, err := HashPassword("same")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if h1 == h2 {
		t.Error("two hashes of same password are identical (no salt?)")
	}
}

func TestNormalizeAnswer(t *testing.T) {
	cases := map[string]string{
		"  Fluffy  ":      "fluffy",
		"FLUFFY":          "fluffy",
		"fluffy":          "fluffy",
		"\tThe Matrix \n": "the matrix",
	}
	for in, want := range cases {
		if got := NormalizeAnswer(in); got != want {
			t.Errorf("NormalizeAnswer(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHashAnswer_CaseAndSpaceInsensitive(t *testing.T) {
	hash, err := HashAnswer("  The Matrix ")
	if err != nil {
		t.Fatalf("HashAnswer: %v", err)
	}
	for _, ok := range []string{"the matrix", "THE MATRIX", " The Matrix  "} {
		if !CheckAnswer(hash, ok) {
			t.Errorf("CheckAnswer(%q) = false, want true", ok)
		}
	}
	if CheckAnswer(hash, "the matrix reloaded") {
		t.Error("CheckAnswer(different answer) = true, want false")
	}
}

func TestNewSessionID_OpaqueAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for range 50 {
		id, err := NewSessionID()
		if err != nil {
			t.Fatalf("NewSessionID: %v", err)
		}
		// 32 random bytes → 43 chars of unpadded base64url
		if len(id) < 40 {
			t.Fatalf("session id too short: %d chars", len(id))
		}
		if strings.ContainsAny(id, "+/=") {
			t.Errorf("session id %q not base64url-safe", id)
		}
		if seen[id] {
			t.Fatalf("duplicate session id generated")
		}
		seen[id] = true
	}
}
