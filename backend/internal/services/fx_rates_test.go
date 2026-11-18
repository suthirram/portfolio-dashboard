package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateOn(t *testing.T) {
	t.Parallel()
	closes := map[string]float64{"2026-11-12": 89.5, "2026-11-13": 90}
	days := sortedDays(closes)
	testCases := []struct {
		name        string
		date        string
		wantRate    float64
		wantFxDate  string
		wantCarried bool
	}{
		{name: "trading day uses its close", date: "2026-11-13", wantRate: 90, wantFxDate: "2026-11-13"},
		{name: "weekend carries Friday unflagged", date: "2026-11-15", wantRate: 90, wantFxDate: "2026-11-13"},
		{name: "before the series is unknown", date: "2026-11-01", wantCarried: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			got := rateOn(days, closes, testCase.date)
			if testCase.wantCarried {
				if got.EurInr != nil || !got.Carried {
					t.Errorf("rateOn = %+v; want unknown and flagged", got)
				}
				return
			}
			if got.EurInr == nil || *got.EurInr != testCase.wantRate || got.FxDate != testCase.wantFxDate || got.Carried {
				t.Errorf("rateOn = %+v; want %v on %s unflagged", got, testCase.wantRate, testCase.wantFxDate)
			}
		})
	}
}

func TestGetDailyCloses(t *testing.T) {
	t.Parallel()
	body := `{"chart":{"result":[{"meta":{"currency":"INR","regularMarketPrice":90,"gmtoffset":0},
		"timestamp":[1762992000,1763078400,1763337600],
		"indicators":{"quote":[{"close":[90.5,null,91.25]}]}}],"error":null}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("period1") == "" || r.URL.Query().Get("interval") != "1d" {
			t.Errorf("query = %s; want interval=1d with period1/period2", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()

	closes, err := newTestPriceService(server.URL).GetDailyCloses(context.Background(), "EURINR=X",
		time.Date(2025, 11, 13, 0, 0, 0, 0, time.UTC), time.Date(2025, 11, 17, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("GetDailyCloses: %v", err)
	}
	want := map[string]float64{"2025-11-13": 90.5, "2025-11-17": 91.25}
	if len(closes) != len(want) {
		t.Fatalf("closes = %v; want %v (a null close is absent, not zero)", closes, want)
	}
	for day, rate := range want {
		if closes[day] != rate {
			t.Errorf("closes[%s] = %v; want %v", day, closes[day], rate)
		}
	}
}
