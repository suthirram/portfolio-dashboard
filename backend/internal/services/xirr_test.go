package services

import (
	"math"
	"testing"
)

func flow(d string, amt float64) cashFlow {
	return cashFlow{Date: goldDay(d), Amount: amt}
}

// TestXIRR pins the solver against spreadsheet XIRR() results — the same
// function the owner's sheet uses (DD-003 §2).
func TestXIRR(t *testing.T) {
	cases := []struct {
		name  string
		flows []cashFlow
		want  float64
	}{
		{
			// The canonical XIRR example from the Excel documentation.
			name: "excel documentation example",
			flows: []cashFlow{
				flow("2008-01-01", -10000),
				flow("2008-03-01", 2750),
				flow("2008-10-30", 4250),
				flow("2009-02-15", 3250),
				flow("2009-04-01", 2750),
			},
			want: 0.373362535,
		},
		{
			name:  "10% over exactly one year",
			flows: []cashFlow{flow("2025-07-06", -100), flow("2026-07-06", 110)},
			want:  0.10,
		},
		{
			name:  "loss position solves to a negative rate",
			flows: []cashFlow{flow("2025-07-06", -100), flow("2026-07-06", 80)},
			want:  -0.20,
		},
		{
			name: "unsorted input is sorted internally",
			flows: []cashFlow{
				flow("2026-07-06", 110),
				flow("2025-07-06", -100),
			},
			want: 0.10,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := xirr(tc.flows)
			if !ok {
				t.Fatal("xirr did not converge")
			}
			if math.Abs(got-tc.want) > 1e-4 {
				t.Errorf("xirr = %.9f, want %.9f", got, tc.want)
			}
		})
	}
}

// TestXIRR_NoRate pins the ok=false cases the UI renders as "—".
func TestXIRR_NoRate(t *testing.T) {
	cases := []struct {
		name  string
		flows []cashFlow
	}{
		{"empty", nil},
		{"single flow", []cashFlow{flow("2026-01-01", -100)}},
		{"all outflows", []cashFlow{flow("2026-01-01", -100), flow("2026-02-01", -50)}},
		{"all inflows", []cashFlow{flow("2026-01-01", 100), flow("2026-02-01", 50)}},
		// Bought today, valued today: npv is rate-independent (all year
		// offsets zero); zero-netting flows used to return the 0.1 Newton
		// guess as a "10%" rate (#105 follow-up).
		{"same-day flows netting to zero", []cashFlow{flow("2026-07-07", -7200), flow("2026-07-07", 7200)}},
		{"same-day flows netting positive", []cashFlow{flow("2026-07-07", -7200), flow("2026-07-07", 7500)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if rate, ok := xirr(tc.flows); ok {
				t.Errorf("xirr = %v ok=true, want no rate", rate)
			}
		})
	}
}
