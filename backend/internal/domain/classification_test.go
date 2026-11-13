package domain

import (
	"strings"
	"testing"
)

func TestClassificationCurrentFor(t *testing.T) {
	t.Parallel()
	var missing *Classification
	if missing.CurrentFor("TCS.NS") {
		t.Error("nil classification reported current")
	}
	classification := &Classification{Symbol: "TCS.NS"}
	if !classification.CurrentFor(" tcs.ns ") {
		t.Error("same symbol in another case/spacing reported stale")
	}
	if classification.CurrentFor("INFY.NS") {
		t.Error("classification for another symbol reported current")
	}
}

func TestReuseSectorLabel(t *testing.T) {
	t.Parallel()
	existing := []string{"FMCG", "Technology"}
	if got := ReuseSectorLabel("technology", existing); got != "Technology" {
		t.Errorf("ReuseSectorLabel(technology) = %q, want the existing Technology", got)
	}
	if got := ReuseSectorLabel("Banking", existing); got != "Banking" {
		t.Errorf("ReuseSectorLabel(Banking) = %q, want a new label kept as typed", got)
	}
}

func TestNormalizeSectorLabel(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name  string
		label string
		want  string
		ok    bool
	}{
		{name: "Yahoo text kept as given", label: "Consumer Defensive", want: "Consumer Defensive", ok: true},
		{name: "owner label kept as given", label: "FMCG", want: "FMCG", ok: true},
		{name: "whitespace trimmed and collapsed", label: "  Financial \t Services ", want: "Financial Services", ok: true},
		{name: "control characters removed", label: "Tech\nnology\x00", want: "Tech nology", ok: true},
		{name: "capped at the limit", label: strings.Repeat("a", SectorLabelLimit+5), want: strings.Repeat("a", SectorLabelLimit), ok: true},
		{name: "multi-byte characters counted as one", label: strings.Repeat("é", SectorLabelLimit+1), want: strings.Repeat("é", SectorLabelLimit), ok: true},
		{name: "empty", label: "", ok: false},
		{name: "only whitespace", label: " \t\n ", ok: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, ok := NormalizeSectorLabel(testCase.label)
			if got != testCase.want || ok != testCase.ok {
				t.Errorf("NormalizeSectorLabel(%q) = %q, %v; want %q, %v", testCase.label, got, ok, testCase.want, testCase.ok)
			}
		})
	}
}
