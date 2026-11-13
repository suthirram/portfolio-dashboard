package domain

import (
	"strings"
	"time"
	"unicode"
)

// Classification status and source values (DD-013 §1).
const (
	ClassificationResolved    = "resolved"
	ClassificationNeedsReview = "needs_review"
	ClassificationSourceYahoo = "yahoo"
	ClassificationSourceUser  = "user"
)

// Classification is a holding's sector/type metadata. It belongs to Symbol: a
// holding whose symbol has since changed reads as needs-review. Sector is the
// label the owner sees (Yahoo's text unless the owner renamed this holding);
// ProviderSector keeps Yahoo's text. Empty strings mean "none".
type Classification struct {
	Symbol         string    `bson:"symbol"`
	Status         string    `bson:"status"`
	Source         string    `bson:"source,omitempty"` // empty when the lookup failed without metadata
	Sector         string    `bson:"sector,omitempty"`
	ProviderSector string    `bson:"provider_sector,omitempty"`
	Industry       string    `bson:"industry,omitempty"`
	SuggestedType  string    `bson:"suggested_type,omitempty"`
	CheckedAt      time.Time `bson:"checked_at"`
}

// CurrentFor reports whether the classification was made for symbol.
func (c *Classification) CurrentFor(symbol string) bool {
	return c != nil && c.Symbol == CanonicalSymbol(symbol)
}

// CanonicalSymbol is the form a classification is keyed on: trimmed and
// upper-cased.
func CanonicalSymbol(symbol string) string {
	return strings.ToUpper(strings.TrimSpace(symbol))
}

// ReuseSectorLabel returns the owner's existing spelling of label when one
// matches case-insensitively, so one sector never splits into two groups.
func ReuseSectorLabel(label string, existing []string) string {
	for _, candidate := range existing {
		if strings.EqualFold(candidate, label) {
			return candidate
		}
	}
	return label
}

// Holding types. A fund (etf, mutual_fund) never carries a company sector.
const (
	HoldingTypeStock      = "stock"
	HoldingTypeETF        = "etf"
	HoldingTypeMutualFund = "mutual_fund"
)

// ValidHoldingType reports whether holdingType is stock, etf or mutual_fund.
func ValidHoldingType(holdingType string) bool {
	return holdingType == HoldingTypeStock || holdingType == HoldingTypeETF || holdingType == HoldingTypeMutualFund
}

// SectorLabelLimit caps a sector label in characters (DD-013 §1).
const SectorLabelLimit = 60

// NormalizeSectorLabel cleans a sector label from Yahoo or the owner: control
// characters dropped, whitespace trimmed and collapsed, capped at
// SectorLabelLimit characters. There is no fixed sector set; ok is false only
// when nothing is left.
func NormalizeSectorLabel(label string) (string, bool) {
	cleaned := strings.Map(func(char rune) rune {
		if unicode.IsControl(char) {
			return ' '
		}
		return char
	}, label)
	runes := []rune(strings.Join(strings.Fields(cleaned), " "))
	if len(runes) > SectorLabelLimit {
		runes = []rune(strings.TrimSpace(string(runes[:SectorLabelLimit])))
	}
	return string(runes), len(runes) > 0
}
