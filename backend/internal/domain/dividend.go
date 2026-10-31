package domain

import "math"

// AmountCents converts a money amount to integer minor units (2 dp). Running
// totals and duplicate keys use it so float noise never changes a result.
func AmountCents(amount float64) int64 { return int64(math.Round(amount * 100)) }

// CentsToMoney converts integer minor units back to a money amount.
func CentsToMoney(cents int64) float64 { return float64(cents) / 100 }

// RoundCents rounds a money amount to cent precision — the stored precision
// of a dividend, so what is written is exactly what every total sums.
func RoundCents(amount float64) float64 { return CentsToMoney(AmountCents(amount)) }
