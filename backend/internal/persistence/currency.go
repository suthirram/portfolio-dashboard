package persistence

import (
	"go.mongodb.org/mongo-driver/bson"

	"portfolio-dashboard/internal/domain"
)

// nonCanonicalCurrency matches documents whose currency is not already a
// canonical code: missing, blank, lower/mixed case, or padded with spaces.
// Canonical codes (INR, EUR, a legacy USD) do not match, so a second run of
// the migration touches nothing.
var nonCanonicalCurrency = bson.M{"currency": bson.M{"$not": bson.M{"$regex": `^[A-Z]+$`}}}

// canonicalCurrencyUpdate rewrites currency server-side with the same rule
// as services.ledgerCurrency: trimmed and upper-cased, blank/missing → INR.
var canonicalCurrencyUpdate = bson.A{bson.M{"$set": bson.M{"currency": bson.M{"$let": bson.M{
	"vars": bson.M{"c": bson.M{"$toUpper": bson.M{"$trim": bson.M{"input": bson.M{"$ifNull": bson.A{"$currency", ""}}}}}},
	"in":   bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$$c", ""}}, domain.CurrencyINR, "$$c"}},
}}}}}
