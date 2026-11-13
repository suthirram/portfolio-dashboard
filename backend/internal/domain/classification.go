package domain

import (
	"strings"
	"unicode"
)

// Holding types. A fund (etf, mutual_fund) never carries a company sector.
const (
	HoldingTypeStock      = "stock"
	HoldingTypeETF        = "etf"
	HoldingTypeMutualFund = "mutual_fund"
)

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
