package services

import (
	"errors"
	"math"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func f64(v float64) *float64 { return &v }

// TestComputeColumns pins every derived column to the owner's spreadsheet
// formulas (PRD-003 §5, resolutions §9). The first case mirrors a real
// sheet row shape: 8 g at ₹7,275/g quoted ₹7,500, billed ₹61,000, paid
// ₹59,500.
func TestComputeColumns(t *testing.T) {
	cases := []struct {
		name string
		in   domain.GoldTransaction
		want domain.GoldComputed
	}{
		{
			name: "full bill reconciliation row",
			in: domain.GoldTransaction{
				GmPrice:     7275,
				GramsBought: 8,
				QuotePrice:  f64(7500),
				BillAmount:  f64(61000),
				ActualPaid:  59500,
			},
			want: domain.GoldComputed{
				GoldCost:      58200,     // 7275 × 8
				GstOnCost:     1746,      // 58200 × 0.03
				TotalExpected: 59946,     // 58200 + 1746
				GstOnQuote:    f64(225),  // 7500 × 0.03
				NettPerGram:   7437.5,    // 59500 ÷ 8
				NettReduction: f64(1500), // 61000 − 59500
				NimmiLoss:     1300,      // 59500 − 58200 (J − D)
			},
		},
		{
			name: "minimal row leaves optional columns null",
			in: domain.GoldTransaction{
				GmPrice:     6000,
				GramsBought: 2.5,
				ActualPaid:  15450,
			},
			want: domain.GoldComputed{
				GoldCost:      15000,
				GstOnCost:     450,
				TotalExpected: 15450,
				GstOnQuote:    nil,
				NettPerGram:   6180,
				NettReduction: nil,
				NimmiLoss:     450,
			},
		},
		{
			name: "paying under bill yields negative nimmi loss",
			in: domain.GoldTransaction{
				GmPrice:     5000,
				GramsBought: 1,
				BillAmount:  f64(4900),
				ActualPaid:  4800,
			},
			want: domain.GoldComputed{
				GoldCost:      5000,
				GstOnCost:     150,
				TotalExpected: 5150,
				NettPerGram:   4800,
				NettReduction: f64(100),
				NimmiLoss:     -200,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeColumns(tc.in)
			checkF := func(col string, got, want float64) {
				t.Helper()
				if math.Abs(got-want) > 1e-9 {
					t.Errorf("%s = %v, want %v", col, got, want)
				}
			}
			checkF("GoldCost", got.GoldCost, tc.want.GoldCost)
			checkF("GstOnCost", got.GstOnCost, tc.want.GstOnCost)
			checkF("TotalExpected", got.TotalExpected, tc.want.TotalExpected)
			checkF("NettPerGram", got.NettPerGram, tc.want.NettPerGram)
			checkF("NimmiLoss", got.NimmiLoss, tc.want.NimmiLoss)
			checkOpt := func(col string, got, want *float64) {
				t.Helper()
				switch {
				case (got == nil) != (want == nil):
					t.Errorf("%s = %v, want %v", col, got, want)
				case got != nil && math.Abs(*got-*want) > 1e-9:
					t.Errorf("%s = %v, want %v", col, *got, *want)
				}
			}
			checkOpt("GstOnQuote", got.GstOnQuote, tc.want.GstOnQuote)
			checkOpt("NettReduction", got.NettReduction, tc.want.NettReduction)
		})
	}
}

// TestValidateGoldInput pins the entered-field rules controllers surface
// as 400s.
func TestValidateGoldInput(t *testing.T) {
	valid := api.GoldTransactionInput{
		Date:        openapi_types.Date{Time: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)},
		GmPrice:     7275,
		GramsBought: 8,
		ActualPaid:  59500,
	}
	if err := validateGoldInput(valid); err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}

	cases := []struct {
		name   string
		mutate func(*api.GoldTransactionInput)
	}{
		{"zero date", func(in *api.GoldTransactionInput) { in.Date = openapi_types.Date{} }},
		{"zero gm_price", func(in *api.GoldTransactionInput) { in.GmPrice = 0 }},
		{"negative gm_price", func(in *api.GoldTransactionInput) { in.GmPrice = -1 }},
		{"zero grams_bought", func(in *api.GoldTransactionInput) { in.GramsBought = 0 }},
		{"negative actual_paid", func(in *api.GoldTransactionInput) { in.ActualPaid = -1 }},
		{"negative quote_price", func(in *api.GoldTransactionInput) { in.QuotePrice = f64(-1) }},
		{"negative bill_amount", func(in *api.GoldTransactionInput) { in.BillAmount = f64(-1) }},
		{"negative billed_weight", func(in *api.GoldTransactionInput) { in.BilledWeight = f64(-1) }},
		{"negative chennai_rate", func(in *api.GoldTransactionInput) { in.ChennaiRate = f64(-1) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := valid
			tc.mutate(&in)
			if err := validateGoldInput(in); !errors.Is(err, ErrInvalidGoldTransaction) {
				t.Errorf("err = %v, want ErrInvalidGoldTransaction", err)
			}
		})
	}
}
