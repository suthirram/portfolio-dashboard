package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SnapshotSource marks who wrote a region's values. A cron-written region
// can be overridden by the user, at which point its source flips to manual
// and subsequent cron runs leave it alone (DD-002 §6).
type SnapshotSource string

const (
	SnapshotSourceCron   SnapshotSource = "cron"
	SnapshotSourceManual SnapshotSource = "manual"
)

// IsValid reports whether s is one of the recognised sources.
func (s SnapshotSource) IsValid() bool {
	return s == SnapshotSourceCron || s == SnapshotSourceManual
}

// Known region slugs for the snapshot map. Mirrors the auth-side catalogue
// but lives here so the persistence and service layers do not import auth.
const (
	RegionIndia  = "india"
	RegionEurope = "europe"
	RegionUS     = "us"
)

// AllRegions is the canonical iteration order for chart series and zero-row
// initialisation (PRD-002 §6).
var AllRegions = []string{RegionIndia, RegionEurope, RegionUS}

// RegionSnapshot is one region's contribution to a portfolio snapshot. Both
// monetary fields are in the row's currency (PortfolioSnapshot.Currency).
type RegionSnapshot struct {
	Invested float64        `bson:"invested" json:"invested"`
	Current  float64        `bson:"current" json:"current"`
	Source   SnapshotSource `bson:"source" json:"source"`
}

// PortfolioSnapshot is the cumulative state of one user's portfolio at one
// UTC midnight. Totals are derived at read time so a manual override of one
// region cannot drift the stored totals (DD-002 §2.1).
type PortfolioSnapshot struct {
	ID        primitive.ObjectID        `bson:"_id,omitempty" json:"-"`
	UserID    primitive.ObjectID        `bson:"user_id" json:"-"`
	Date      time.Time                 `bson:"date" json:"date"`         // UTC midnight
	Currency  string                    `bson:"currency" json:"currency"` // e.g. "INR"
	Regions   map[string]RegionSnapshot `bson:"regions" json:"regions"`
	CreatedAt time.Time                 `bson:"created_at" json:"-"`
	UpdatedAt time.Time                 `bson:"updated_at" json:"-"`
}

// SnapshotTotals is the derived aggregate over a PortfolioSnapshot. PnLPct
// is a pointer so an undefined value (invested_total == 0) serialises to
// JSON null rather than the misleading 0 (PRD-002 §6).
type SnapshotTotals struct {
	InvestedTotal float64  `json:"invested_total"`
	CurrentTotal  float64  `json:"current_total"`
	PnLPct        *float64 `json:"pnl_pct"`
}

// Totals derives the headline aggregate from the per-region map. It rounds
// PnLPct to two decimals; callers should not round again.
func (p PortfolioSnapshot) Totals() SnapshotTotals {
	var invested, current float64
	for _, r := range p.Regions {
		invested += r.Invested
		current += r.Current
	}
	t := SnapshotTotals{InvestedTotal: invested, CurrentTotal: current}
	if invested > 0 {
		pct := (current - invested) / invested * 100
		// Round to two decimals via integer math; avoids math.Round import
		// just for one call.
		pct = float64(int(pct*100+sign(pct)*0.5)) / 100
		t.PnLPct = &pct
	}
	return t
}

func sign(x float64) float64 {
	if x < 0 {
		return -1
	}
	return 1
}

// UTCDate truncates t to its UTC midnight. Snapshot rows are keyed by this
// value, never by the raw time the job happened to run.
func UTCDate(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}
