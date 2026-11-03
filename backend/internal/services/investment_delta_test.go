package services

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func mustDate(value string) time.Time {
	parsed, err := time.Parse(time.DateOnly, value)
	if err != nil {
		panic(err)
	}
	return parsed
}

// The chart reads 31 Dec of the year before, then every month end; the
// current month ends today and later months have no day.
func TestMonthEnds(t *testing.T) {
	past := monthEnds(2025, mustDate("2026-11-03"))
	if len(past) != 13 || !past[0].Equal(mustDate("2024-12-31")) || !past[2].Equal(mustDate("2025-02-28")) || !past[12].Equal(mustDate("2025-12-31")) {
		t.Errorf("2025 days = %v; want 31 Dec 2024 then the 12 month ends", past)
	}
	current := monthEnds(2026, mustDate("2026-11-03"))
	if len(current) != 12 || !current[10].Equal(mustDate("2026-10-31")) || !current[11].Equal(mustDate("2026-11-03")) {
		t.Errorf("2026 days = %v; want up to 31 Oct, then today for November", current)
	}
}

// Cost basis per currency at the end of a day: average cost (a sell removes
// its shares at the average), events up to and including the day, and an
// opening counted from its declared date.
func TestInvestedOn(t *testing.T) {
	india := domain.Holding{ID: primitive.NewObjectID(), Currency: "INR"}
	europe := domain.Holding{ID: primitive.NewObjectID(), Currency: "EUR"}
	openingDate := mustDate("2026-02-01")
	ledgers := map[primitive.ObjectID][]domain.Transaction{
		india.ID: {
			{Type: domain.TxnBuy, Date: mustDate("2026-01-10"), Quantity: 10, Amount: 1000},
			{Type: domain.TxnSell, Date: mustDate("2026-02-05"), Quantity: 4, Amount: 600},
			{Type: domain.TxnBuy, Date: mustDate("2026-03-01"), Quantity: 5, Amount: 800},
		},
		europe.ID: {{Type: domain.TxnOpening, Date: openingDate, OpeningDate: &openingDate, Quantity: 2, Amount: 300}},
	}
	holdings := []domain.Holding{india, europe}
	for day, want := range map[string]map[string]float64{
		"2026-01-31": {"INR": 1000},
		"2026-02-28": {"INR": 600, "EUR": 300},
		"2026-03-01": {"INR": 1400, "EUR": 300},
	} {
		got := investedOn(holdings, ledgers, mustDate(day))
		if !approx(got["INR"], want["INR"]) || !approx(got["EUR"], want["EUR"]) {
			t.Errorf("%s: invested %v; want %v", day, got, want)
		}
	}
}

// Each month's figure is the month-end cost basis and its change from the
// previous month end; a column with nothing invested in the year is left
// out, and months after today stay empty.
func TestDeltaColumns(t *testing.T) {
	columns := deltaColumns(map[string][]float64{
		"INR":  {100, 150, 150, 120},
		"EUR":  {0, 0, 0, 0},
		"GOLD": {0, 0, 50, 50},
	})
	if len(columns) != 2 || columns[0].Column != api.InvestmentDeltaColumnColumnINR || columns[1].Column != api.InvestmentDeltaColumnColumnGOLD {
		t.Fatalf("columns = %v; want INR then GOLD (EUR has nothing invested)", columns)
	}
	india := columns[0].Months
	if len(india) != 12 || *india[0].Invested != 150 || *india[0].Delta != 50 || *india[2].Invested != 120 || *india[2].Delta != -30 {
		t.Errorf("INR months = %+v; want Jan 150 (+50) … Mar 120 (−30)", india)
	}
	if india[3].Invested != nil || india[3].Delta != nil || india[11].Month0 != 11 {
		t.Errorf("April onwards = %+v; want empty months 3–11", india[3:])
	}
	// On the wire an empty month says so: null, not a missing key.
	if wire, _ := json.Marshal(india[11]); string(wire) != `{"delta":null,"invested":null,"month0":11}` {
		t.Errorf("December JSON = %s; want explicit nulls", wire)
	}
}

// Gold invested counts each purchase from its own day, with no price: a
// January purchase is January's even when no price exists, or the first
// price is only entered in March (History's overlay has no row value until
// then, which would push the purchase into March).
func TestGoldInvestedOn_NeedsNoPrice(t *testing.T) {
	purchases := []domain.GoldTransaction{
		{Date: mustDate("2026-01-05"), ActualPaid: 70000},
		{Date: mustDate("2026-05-20"), ActualPaid: 36000},
	}
	days := []time.Time{mustDate("2025-12-31"), mustDate("2026-01-31"), mustDate("2026-02-28"), mustDate("2026-03-31"), mustDate("2026-05-20")}
	got := goldInvestedOn(purchases, days)
	want := []float64{0, 70000, 70000, 70000, 106000}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("invested on %v = %v; want %v (no price needed; the day inclusive)", days, got, want)
		}
	}

	firstPriceInMarch := []domain.GoldPrice{{Date: mustDate("2026-03-10"), PricePerGram: 7000}}
	overlay := goldOverlay(purchases, firstPriceInMarch, days)
	if _, ok := overlay["2026-01-31"]; ok {
		t.Errorf("goldOverlay valued 31 Jan before any price; this test's premise changed")
	}
}

// fakeGold stands in for GoldService.InvestedOn.
type fakeGold struct {
	invested map[string]float64
	err      error
}

func (gold fakeGold) InvestedOn(_ context.Context, _ string, days []time.Time) ([]float64, error) {
	if gold.err != nil {
		return nil, gold.err
	}
	values := make([]float64, len(days))
	for i, day := range days {
		values[i] = gold.invested[day.Format(time.DateOnly)]
	}
	return values, nil
}

func TestTransactionsService_InvestmentDelta(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
	service := func(mt *mtest.T) *TransactionsService {
		store := persistence.New(mt.DB)
		transactions := NewTransactionsService(store.Transactions, store.Holdings, nil, nil)
		transactions.now = func() time.Time { return time.Date(2026, 2, 15, 9, 0, 0, 0, time.UTC) }
		return transactions
	}
	ledger := func(mt *mtest.T) []bson.D {
		buy := func(day string, amount float64) bson.D {
			return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: holdingId},
				{Key: "type", Value: "buy"}, {Key: "date", Value: mustDate(day)}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: amount}}
		}
		return []bson.D{
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
				bson.D{{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "INR"}}),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, buy("2026-01-10", 1000), buy("2026-02-02", 500)),
		}
	}

	mt.Run("INR from the ledger, GOLD from the gold ledger, nothing after today", func(mt *mtest.T) {
		mt.AddMockResponses(ledger(mt)...)
		gold := fakeGold{invested: map[string]float64{"2026-01-31": 7000, "2026-02-15": 7500}}
		delta, err := service(mt).InvestmentDelta(context.Background(), userId, 2026, gold)
		if err != nil {
			t.Fatalf("InvestmentDelta: %v", err)
		}
		if len(delta.Columns) != 2 || delta.Columns[0].Column != api.InvestmentDeltaColumnColumnINR || delta.Columns[1].Column != api.InvestmentDeltaColumnColumnGOLD {
			t.Fatalf("columns = %+v; want INR and GOLD", delta.Columns)
		}
		india, gilt := delta.Columns[0].Months, delta.Columns[1].Months
		if *india[0].Invested != 1000 || *india[0].Delta != 1000 || *india[1].Invested != 1500 || *india[1].Delta != 500 || india[2].Invested != nil {
			t.Errorf("INR = Jan %v (+%v), Feb %v (+%v), Mar %v; want 1000 (+1000), 1500 (+500), none",
				*india[0].Invested, *india[0].Delta, *india[1].Invested, *india[1].Delta, india[2].Invested)
		}
		if *gilt[0].Invested != 7000 || *gilt[1].Delta != 500 {
			t.Errorf("GOLD = Jan %v, Feb delta %v; want 7000, +500 (February reads today)", *gilt[0].Invested, *gilt[1].Delta)
		}
	})

	mt.Run("a gold failure leaves GOLD out, not the chart", func(mt *mtest.T) {
		mt.AddMockResponses(ledger(mt)...)
		delta, err := service(mt).InvestmentDelta(context.Background(), userId, 2026, fakeGold{err: errors.New("postgres down")})
		if err != nil || len(delta.Columns) != 1 || delta.Columns[0].Column != api.InvestmentDeltaColumnColumnINR {
			t.Fatalf("delta = %+v, err %v; want INR only", delta, err)
		}
	})

	mt.Run("a year before 2020 or after this year is invalid", func(mt *mtest.T) {
		for _, year := range []int{2019, 2027} {
			if _, err := service(mt).InvestmentDelta(context.Background(), userId, year, nil); !errors.Is(err, ErrValidation) {
				t.Errorf("year %d: err %v; want ErrValidation", year, err)
			}
		}
	})
}
