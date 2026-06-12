package auth

import "testing"

func TestValidateUsernameNormalizesAndRejectsInvalidValues(t *testing.T) {
	got, err := ValidateUsername("  Alice_01 ")
	if err != nil {
		t.Fatalf("ValidateUsername: %v", err)
	}
	if got != "alice_01" {
		t.Errorf("normalized username = %q, want alice_01", got)
	}

	for _, username := range []string{"ab", "has space", "bad!", "abcdefghijklmnopqrstuvwxyz0123456789"} {
		t.Run(username, func(t *testing.T) {
			if _, err := ValidateUsername(username); err == nil {
				t.Fatal("ValidateUsername() error = nil")
			}
		})
	}
}

func TestHashSecurityAnswersRequiresThreeUniqueKnownQuestions(t *testing.T) {
	questions := SecurityQuestions()
	valid := []SecurityAnswerInput{
		{QuestionID: questions[0].ID, Answer: " Alpha "},
		{QuestionID: questions[1].ID, Answer: "Beta"},
		{QuestionID: questions[2].ID, Answer: "Gamma"},
	}

	hashed, err := HashSecurityAnswers(valid)
	if err != nil {
		t.Fatalf("HashSecurityAnswers: %v", err)
	}
	if len(hashed) != 3 {
		t.Fatalf("hashed answers = %d, want 3", len(hashed))
	}
	if !CheckSecurityAnswers(hashed, []SecurityAnswerInput{
		{QuestionID: questions[0].ID, Answer: "alpha"},
		{QuestionID: questions[1].ID, Answer: " beta "},
		{QuestionID: questions[2].ID, Answer: "GAMMA"},
	}) {
		t.Fatal("CheckSecurityAnswers() = false for normalized matching answers")
	}
	if CheckSecurityAnswers(hashed, []SecurityAnswerInput{
		{QuestionID: questions[0].ID, Answer: "wrong"},
		{QuestionID: questions[1].ID, Answer: "Beta"},
		{QuestionID: questions[2].ID, Answer: "Gamma"},
	}) {
		t.Fatal("CheckSecurityAnswers() = true for a wrong answer")
	}

	cases := []struct {
		name   string
		inputs []SecurityAnswerInput
	}{
		{"too few", valid[:2]},
		{"duplicate", []SecurityAnswerInput{
			{QuestionID: questions[0].ID, Answer: "Alpha"},
			{QuestionID: questions[0].ID, Answer: "Beta"},
			{QuestionID: questions[1].ID, Answer: "Gamma"},
		}},
		{"unknown", []SecurityAnswerInput{
			{QuestionID: "unknown", Answer: "Alpha"},
			{QuestionID: questions[1].ID, Answer: "Beta"},
			{QuestionID: questions[2].ID, Answer: "Gamma"},
		}},
		{"blank answer", []SecurityAnswerInput{
			{QuestionID: questions[0].ID, Answer: "Alpha"},
			{QuestionID: questions[1].ID, Answer: " "},
			{QuestionID: questions[2].ID, Answer: "Gamma"},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := HashSecurityAnswers(tc.inputs); err == nil {
				t.Fatal("HashSecurityAnswers() error = nil")
			}
		})
	}
}

func TestRegionsCatalogueValidatesExpectedRegions(t *testing.T) {
	if !ValidRegion(RegionIndia) || !ValidRegion(RegionEurope) || !ValidRegion(RegionUS) {
		t.Fatal("expected regions are not all valid")
	}
	if ValidRegion("apac") {
		t.Fatal("unexpected region accepted")
	}
}
