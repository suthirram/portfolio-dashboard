package domain

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestAmountCents(t *testing.T) {
	if AmountCents(300) != AmountCents(300.004) {
		t.Error("300 and 300.004 must round to the same cents")
	}
	var sum int64
	for range 3 {
		sum += AmountCents(0.1)
	}
	if CentsToMoney(sum) != 0.3 {
		t.Errorf("3 × 0.1 = %v, want 0.3", CentsToMoney(sum))
	}
}

func TestDividendKeyOf(t *testing.T) {
	holdingId := primitive.NewObjectID()
	day := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	morning := Transaction{HoldingID: holdingId, Date: day, Amount: 300}
	afternoon := Transaction{HoldingID: holdingId, Date: day.Add(13 * time.Hour), Amount: 300.004}
	if DividendKeyOf(morning) != DividendKeyOf(afternoon) {
		t.Error("same holding, day and amount at 2 dp must share a key")
	}
	if DividendKeyOf(morning) == DividendKeyOf(Transaction{HoldingID: holdingId, Date: day.AddDate(0, 0, 1), Amount: 300}) {
		t.Error("a different day is a different dividend")
	}
	if DividendKeyOf(morning) == DividendKeyOf(Transaction{HoldingID: primitive.NewObjectID(), Date: day, Amount: 300}) {
		t.Error("a different holding is a different dividend")
	}
}
