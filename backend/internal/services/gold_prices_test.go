package services

import (
	"errors"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func goldDay(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func priceRows(dates ...string) []domain.GoldPrice {
	out := make([]domain.GoldPrice, 0, len(dates))
	for _, d := range dates {
		out = append(out, domain.GoldPrice{Date: goldDay(d), PricePerGram: 7000})
	}
	return out
}

// TestMissingDates pins the gap rule (PRD-003 §7): every calendar day from
// the first purchase through today owes a price, weekends included; days
// before the first purchase never prompt.
func TestMissingDates(t *testing.T) {
	cases := []struct {
		name  string
		first string
		have  []domain.GoldPrice
		today string
		want  []string
	}{
		{
			name:  "no prices at all — every day gaps, weekend included",
			first: "2026-07-03", // Friday
			have:  nil,
			today: "2026-07-06", // Monday
			want:  []string{"2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"},
		},
		{
			name:  "holes in the middle only",
			first: "2026-07-01",
			have:  priceRows("2026-07-01", "2026-07-03", "2026-07-04"),
			today: "2026-07-05",
			want:  []string{"2026-07-02", "2026-07-05"},
		},
		{
			name:  "fully caught up",
			first: "2026-07-04",
			have:  priceRows("2026-07-04", "2026-07-05", "2026-07-06"),
			today: "2026-07-06",
			want:  nil,
		},
		{
			name:  "first purchase today, price missing",
			first: "2026-07-06",
			have:  nil,
			today: "2026-07-06",
			want:  []string{"2026-07-06"},
		},
		{
			name:  "clock noise on inputs does not shift the calendar",
			first: "2026-07-05",
			have:  priceRows("2026-07-05"),
			today: "2026-07-06",
			want:  []string{"2026-07-06"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			first := goldDay(tc.first).Add(9*time.Hour + 30*time.Minute) // simulate stray clock parts
			got := missingDates(first, tc.have, goldDay(tc.today))
			if len(got) != len(tc.want) {
				t.Fatalf("gaps = %v, want %v", got, tc.want)
			}
			for i, w := range tc.want {
				if got[i].Format("2006-01-02") != w {
					t.Errorf("gap[%d] = %s, want %s", i, got[i].Format("2006-01-02"), w)
				}
			}
		})
	}
}

// TestPutPricesValidation pins the 400 rules for the bulk upsert body.
func TestPutPricesValidation(t *testing.T) {
	svc := &GoldService{} // validation fails before any store access

	apiPrice := func(d string, v float64) api.GoldPrice {
		return api.GoldPrice{Date: openapi_types.Date{Time: goldDay(d)}, PricePerGram: v}
	}

	cases := []struct {
		name  string
		input []api.GoldPrice
	}{
		{"empty payload", nil},
		{"zero price", []api.GoldPrice{apiPrice("2026-07-01", 0)}},
		{"negative price", []api.GoldPrice{apiPrice("2026-07-01", -5)}},
		{"zero date", []api.GoldPrice{{PricePerGram: 7000}}},
		{"duplicate dates", []api.GoldPrice{apiPrice("2026-07-01", 7000), apiPrice("2026-07-01", 7100)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := svc.PutPrices(t.Context(), "u1", tc.input); !errors.Is(err, ErrInvalidGoldPrice) {
				t.Errorf("err = %v, want ErrInvalidGoldPrice", err)
			}
		})
	}
}

// TestPricesRangeValidation pins the from/to sanity check.
func TestPricesRangeValidation(t *testing.T) {
	svc := &GoldService{}
	from := openapi_types.Date{Time: goldDay("2026-07-06")}
	to := openapi_types.Date{Time: goldDay("2026-07-01")}
	if _, err := svc.Prices(t.Context(), "u1", &from, &to); !errors.Is(err, ErrInvalidGoldPrice) {
		t.Errorf("err = %v, want ErrInvalidGoldPrice (to before from)", err)
	}
}
