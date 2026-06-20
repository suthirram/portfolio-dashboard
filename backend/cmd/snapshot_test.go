package cmd

import (
	"testing"
	"time"
)

func TestTradingDate_ISTCutover(t *testing.T) {
	day := func(y int, m time.Month, d int) time.Time {
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}
	istAt := func(y int, m time.Month, d, h, min int) time.Time {
		return time.Date(y, m, d, h, min, 0, 0, istZone)
	}

	cases := []struct {
		name string
		now  time.Time
		want time.Time
	}{
		{"start of window", istAt(2026, 6, 1, 8, 0), day(2026, 6, 1)},
		{"just before window", istAt(2026, 6, 1, 7, 59), day(2026, 5, 31)},
		{"midday", istAt(2026, 6, 1, 15, 30), day(2026, 6, 1)},
		{"late night same window", istAt(2026, 6, 1, 23, 59), day(2026, 6, 1)},
		{"early next day still same window", istAt(2026, 6, 2, 7, 59), day(2026, 6, 1)},
		{"next window opens", istAt(2026, 6, 2, 8, 0), day(2026, 6, 2)},
		// Cloud Scheduler fires 00:00 UTC = 05:30 IST → previous IST day.
		{"scheduled midnight utc", time.Date(2026, 6, 2, 0, 0, 0, 0, time.UTC), day(2026, 6, 1)},
		// Month boundary.
		{"month rollover before cutover", istAt(2026, 7, 1, 6, 0), day(2026, 6, 30)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := tradingDate(c.now)
			if !got.Equal(c.want) {
				t.Errorf("tradingDate(%s) = %s, want %s",
					c.now.Format(time.RFC3339), got.Format("2006-01-02"), c.want.Format("2006-01-02"))
			}
		})
	}
}
