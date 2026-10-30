package domain

import "testing"

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
