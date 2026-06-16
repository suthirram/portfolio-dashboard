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

// Known snapshot bucket keys. PR7 design review (2026-06-16) switched the
// snapshot key from region (india|europe|us) to currency (INR|EUR|USD).
// Holdings whose buy price is in EUR live in the EUR bucket regardless of
// which exchange they were bought on (PD-042 §3.x follow-up: PD-042 plan
// records this decision and the "no migration of dev data" note).
const (
	CurrencyINR = "INR"
	CurrencyEUR = "EUR"
	CurrencyUSD = "USD"
)

// AllCurrencies is the canonical iteration order for chart series and
// zero-row initialisation (PRD-002 §6).
var AllCurrencies = []string{CurrencyINR, CurrencyEUR, CurrencyUSD}

// RegionSnapshot is one region's contribution to a portfolio snapshot. Both
// monetary fields are in the row's currency (PortfolioSnapshot.Currency).
//
// OriginalCronInvested / OriginalCronCurrent are populated when the user
// first overrides a cron-written bucket — they preserve the values the
// snapshot job recorded so the override is reversible (PD-042 §3.3 audit
// trail). Subsequent overrides do not clobber them; nil on both means
// "no override has ever happened on this bucket".
type RegionSnapshot struct {
	Invested float64        `bson:"invested" json:"invested"`
	Current  float64        `bson:"current" json:"current"`
	Source   SnapshotSource `bson:"source" json:"source"`

	OriginalCronInvested *float64 `bson:"original_cron_invested,omitempty" json:"original_cron_invested,omitempty"`
	OriginalCronCurrent  *float64 `bson:"original_cron_current,omitempty"  json:"original_cron_current,omitempty"`
}

// PortfolioSnapshot is the cumulative state of one user's portfolio at one
// UTC midnight. Totals are derived at read time so a manual override of one
// region cannot drift the stored totals (DD-002 §2.1).
type PortfolioSnapshot struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"-"`
	UserID   primitive.ObjectID `bson:"user_id" json:"-"`
	Date     time.Time          `bson:"date" json:"date"`         // UTC midnight
	Currency string             `bson:"currency" json:"currency"` // e.g. "INR"
	// Buckets is the per-currency map (keys: "INR" | "EUR" | "USD"). The
	// bson + json tags still say "regions" for backwards-compat with
	// PR4-era documents that used the same field name; PR7 design-review
	// switched the dimension from region to currency, and PD-042 §3.6/§6
	// flagged the field-name rename as a v2 follow-up. Do not rename the
	// tags without writing a Mongo migration.
	Buckets   map[string]RegionSnapshot `bson:"regions" json:"regions"`
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

// Totals derives the headline aggregate from the per-bucket map. It
// rounds PnLPct to two decimals; callers should not round again.
func (p PortfolioSnapshot) Totals() SnapshotTotals {
	var invested, current float64
	for _, r := range p.Buckets {
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
