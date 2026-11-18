package domain

import "testing"

func TestOverallFromBuckets(t *testing.T) {
	t.Parallel()
	rate := 90.0
	zeroRate := 0.0
	testCases := []struct {
		name         string
		buckets      map[string]RegionSnapshot
		rate         *float64
		wantInvested *float64
		wantCurrent  *float64
	}{
		{
			name:         "INR only needs no rate",
			buckets:      map[string]RegionSnapshot{CurrencyINR: {Invested: 1000, Current: 1200}},
			wantInvested: new(1000.0), wantCurrent: new(1200.0),
		},
		{
			name: "EUR converts at the day's rate",
			buckets: map[string]RegionSnapshot{
				CurrencyINR: {Invested: 1000, Current: 1200},
				CurrencyEUR: {Invested: 10, Current: 12.5},
			},
			rate:         &rate,
			wantInvested: new(1900.0), wantCurrent: new(2325.0),
		},
		{
			name:    "EUR without a rate is unknown, not zero",
			buckets: map[string]RegionSnapshot{CurrencyEUR: {Invested: 10, Current: 12}},
		},
		{
			name:    "a zero rate is treated as missing",
			buckets: map[string]RegionSnapshot{CurrencyEUR: {Invested: 10, Current: 12}},
			rate:    &zeroRate,
		},
		{
			name:         "legacy USD bucket is ignored",
			buckets:      map[string]RegionSnapshot{CurrencyINR: {Invested: 5, Current: 6}, CurrencyUSD: {Invested: 99, Current: 99}},
			wantInvested: new(5.0), wantCurrent: new(6.0),
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			invested, current := OverallFromBuckets(testCase.buckets, testCase.rate)
			if !sameAmount(invested, testCase.wantInvested) || !sameAmount(current, testCase.wantCurrent) {
				t.Errorf("OverallFromBuckets = %v, %v; want %v, %v", deref(invested), deref(current), deref(testCase.wantInvested), deref(testCase.wantCurrent))
			}
		})
	}
}

func sameAmount(got, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func deref(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}
