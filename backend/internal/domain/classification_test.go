package domain

import (
	"strings"
	"testing"
)

func TestNormalizeSectorLabel(t *testing.T) {
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
