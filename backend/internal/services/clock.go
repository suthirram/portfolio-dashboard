package services

import "time"

// istZone is Indian Standard Time. The owner's ledgers (gold prices,
// dividends) and the snapshot job roll their calendar on Indian time, not UTC.
var istZone = time.FixedZone("IST", 5*60*60+30*60)

// istToday returns the current IST calendar day as a bare UTC-midnight date,
// so it compares cleanly with stored dates.
func istToday() time.Time {
	return istDayOf(time.Now())
}

// istDayOf is the IST calendar day of instant as a bare UTC-midnight date.
func istDayOf(instant time.Time) time.Time {
	local := instant.In(istZone)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

// SnapshotTradingDay maps a wall-clock instant to the snapshot date it
// belongs to, using the job's 08:00 IST cut-over: every instant from the
// 1st 08:00 IST up to the 2nd 07:59 IST records the 1st. Returned as a
// bare UTC-midnight date, matching how snapshot rows are keyed (PD-059:
// shared by cmd/snapshot and the job's live-versus-historical rate choice).
func SnapshotTradingDay(now time.Time) time.Time {
	return istDayOf(now.Add(-8 * time.Hour))
}
