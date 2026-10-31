package services

import "time"

// istZone is Indian Standard Time. The owner's ledgers (gold prices,
// dividends) and the snapshot job roll their calendar on Indian time, not UTC.
var istZone = time.FixedZone("IST", 5*60*60+30*60)

// istToday returns the current IST calendar day as a bare UTC-midnight date,
// so it compares cleanly with stored dates.
func istToday() time.Time {
	now := time.Now().In(istZone)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
