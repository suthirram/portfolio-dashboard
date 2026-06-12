package auth

import "testing"

func TestRegions_ContainsExactlyThree(t *testing.T) {
	regions := Regions()
	if len(regions) != 3 {
		t.Fatalf("len(Regions()) = %d, want 3", len(regions))
	}
	want := map[string]string{
		"india":  "India",
		"europe": "Europe",
		"us":     "US",
	}
	for _, r := range regions {
		label, ok := want[r.ID]
		if !ok {
			t.Errorf("unexpected region %q", r.ID)
			continue
		}
		if r.Label != label {
			t.Errorf("region %q label = %q, want %q", r.ID, r.Label, label)
		}
		delete(want, r.ID)
	}
	for id := range want {
		t.Errorf("missing region %q", id)
	}
}

func TestValidRegion(t *testing.T) {
	for _, id := range []string{"india", "europe", "us"} {
		if !ValidRegion(id) {
			t.Errorf("ValidRegion(%q) = false, want true", id)
		}
	}
	for _, id := range []string{"", "asia", "India", "USA"} {
		if ValidRegion(id) {
			t.Errorf("ValidRegion(%q) = true, want false", id)
		}
	}
}

func TestSecurityQuestions_CatalogueComplete(t *testing.T) {
	qs := SecurityQuestions()
	if len(qs) != 10 {
		t.Fatalf("len(SecurityQuestions()) = %d, want 10", len(qs))
	}
	seen := map[string]bool{}
	for _, q := range qs {
		if q.ID == "" || q.Prompt == "" {
			t.Errorf("question with empty fields: %+v", q)
		}
		if seen[q.ID] {
			t.Errorf("duplicate question id %q", q.ID)
		}
		seen[q.ID] = true
	}
	for _, id := range []string{"favourite_movie", "first_programming_lang", "favourite_subject"} {
		if !seen[id] {
			t.Errorf("missing question id %q", id)
		}
	}
}

func TestValidQuestionID(t *testing.T) {
	if !ValidQuestionID("favourite_movie") {
		t.Error("ValidQuestionID(favourite_movie) = false, want true")
	}
	if ValidQuestionID("mother_maiden_name") {
		t.Error("ValidQuestionID(mother_maiden_name) = true, want false")
	}
}
