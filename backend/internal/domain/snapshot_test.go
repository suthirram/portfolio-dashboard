package domain

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func TestSnapshotSourceIsValid(t *testing.T) {
	cases := map[string]struct {
		in   SnapshotSource
		want bool
	}{
		"cron":   {SnapshotSourceCron, true},
		"manual": {SnapshotSourceManual, true},
		"empty":  {"", false},
		"auto":   {"auto", false},
		"upper":  {"CRON", false},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			if got := c.in.IsValid(); got != c.want {
				t.Errorf("IsValid(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestRegionSnapshotJSONRoundTrip(t *testing.T) {
	in := RegionSnapshot{Invested: 100.5, Current: 198.25, Source: SnapshotSourceManual}
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out RegionSnapshot
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if out != in {
		t.Errorf("round trip = %+v, want %+v", out, in)
	}
}

func TestUTCDateTruncatesToMidnight(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata") // UTC+5:30
	in := time.Date(2026, 6, 16, 5, 30, 1, 0, loc)
	got := UTCDate(in)
	// 2026-06-16 05:30 IST == 2026-06-16 00:00 UTC.
	want := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("UTCDate(%v) = %v, want %v", in, got, want)
	}
}

func TestUTCDateBeforeMidnightUTCMovesToPreviousUTCDay(t *testing.T) {
	// 2026-06-16 02:00 IST is still 2026-06-15 in UTC.
	loc, _ := time.LoadLocation("Asia/Kolkata")
	in := time.Date(2026, 6, 16, 2, 0, 0, 0, loc)
	got := UTCDate(in)
	want := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("UTCDate(%v) = %v, want %v", in, got, want)
	}
}

func TestPortfolioSnapshotTotalsHappyPath(t *testing.T) {
	p := PortfolioSnapshot{
		Regions: map[string]RegionSnapshot{
			CurrencyINR: {Invested: 100, Current: 198, Source: SnapshotSourceCron},
			CurrencyEUR: {Invested: 50, Current: 60, Source: SnapshotSourceCron},
			CurrencyUSD: {Invested: 0, Current: 0, Source: SnapshotSourceCron},
		},
	}
	got := p.Totals()
	if got.InvestedTotal != 150 || got.CurrentTotal != 258 {
		t.Fatalf("totals = (%v, %v), want (150, 258)", got.InvestedTotal, got.CurrentTotal)
	}
	if got.PnLPct == nil {
		t.Fatalf("PnLPct = nil, want 72.00")
	}
	if *got.PnLPct != 72.00 {
		t.Errorf("PnLPct = %v, want 72.00", *got.PnLPct)
	}
}

func TestPortfolioSnapshotTotalsZeroInvestedReturnsNilPnL(t *testing.T) {
	p := PortfolioSnapshot{
		Regions: map[string]RegionSnapshot{
			CurrencyINR: {Invested: 0, Current: 0, Source: SnapshotSourceCron},
		},
	}
	got := p.Totals()
	if got.PnLPct != nil {
		t.Errorf("PnLPct = %v, want nil for zero invested", *got.PnLPct)
	}
}

func TestPortfolioSnapshotTotalsNegativePnL(t *testing.T) {
	p := PortfolioSnapshot{
		Regions: map[string]RegionSnapshot{
			CurrencyINR: {Invested: 200, Current: 150, Source: SnapshotSourceCron},
		},
	}
	got := p.Totals()
	if got.PnLPct == nil {
		t.Fatalf("PnLPct = nil, want -25.00")
	}
	if math.Abs(*got.PnLPct-(-25.00)) > 0.001 {
		t.Errorf("PnLPct = %v, want -25.00", *got.PnLPct)
	}
}

func TestAllCurrenciesHasINREURUSD(t *testing.T) {
	want := []string{"INR", "EUR", "USD"}
	if len(AllCurrencies) != len(want) {
		t.Fatalf("AllCurrencies = %v, want %v", AllCurrencies, want)
	}
	for i, w := range want {
		if AllCurrencies[i] != w {
			t.Errorf("AllCurrencies[%d] = %q, want %q", i, AllCurrencies[i], w)
		}
	}
}
