package services

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func TestPickRate(t *testing.T) {
	t.Parallel()
	friday := time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)
	saturday := friday.AddDate(0, 0, 1)
	monday := friday.AddDate(0, 0, 3)
	live, fridayRate, storedRate, closeRate := 91.0, 90.0, 89.0, 88.5
	fridayDay := &domain.OverallDay{EurInr: &fridayRate, FxDate: "2026-11-13"}
	carriedDay := &domain.OverallDay{EurInr: &fridayRate, FxDate: "2026-11-13", FxCarried: true}
	storedDay := &domain.OverallDay{EurInr: &storedRate, FxDate: "2026-11-16"}
	historical := &domain.FxRate{EurInr: &closeRate, FxDate: "2026-11-16"}
	testCases := []struct {
		name        string
		date        time.Time
		sources     rateSources
		existing    *domain.OverallDay
		prior       *domain.OverallDay
		wantRate    *float64
		wantFxDate  string
		wantCarried bool
	}{
		{name: "weekday with a live rate", date: monday, sources: rateSources{Live: &live}, prior: fridayDay, wantRate: &live, wantFxDate: "2026-11-16"},
		{name: "a stored good rate is never overwritten", date: monday, sources: rateSources{Live: &live}, existing: storedDay, wantRate: &storedRate, wantFxDate: "2026-11-16"},
		{name: "a stored carried rate is replaced", date: monday, sources: rateSources{Live: &live}, existing: carriedDay, wantRate: &live, wantFxDate: "2026-11-16"},
		{name: "a past day uses its historical close", date: monday, sources: rateSources{Historical: historical}, prior: fridayDay, wantRate: &closeRate, wantFxDate: "2026-11-16"},
		{name: "weekend carries Friday unflagged", date: saturday, prior: fridayDay, wantRate: &fridayRate, wantFxDate: "2026-11-13"},
		{name: "weekend keeps a carried flag", date: saturday, prior: carriedDay, wantRate: &fridayRate, wantFxDate: "2026-11-13", wantCarried: true},
		{name: "weekday fetch failed carries and flags", date: monday, prior: fridayDay, wantRate: &fridayRate, wantFxDate: "2026-11-13", wantCarried: true},
		{name: "nothing to carry is unknown and flagged", date: monday, wantCarried: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			got := pickRate(testCase.date, testCase.sources, testCase.existing, testCase.prior)
			if (got.EurInr == nil) != (testCase.wantRate == nil) || (got.EurInr != nil && *got.EurInr != *testCase.wantRate) {
				t.Errorf("rate = %v; want %v", got.EurInr, testCase.wantRate)
			}
			if got.FxDate != testCase.wantFxDate || got.Carried != testCase.wantCarried {
				t.Errorf("fx_date, carried = %q, %v; want %q, %v", got.FxDate, got.Carried, testCase.wantFxDate, testCase.wantCarried)
			}
		})
	}
}

// eurQuote is a PriceFetcher that only answers the EUR→INR quote and counts calls.
type eurQuote struct {
	rate  float64
	calls *int
}

func (quote eurQuote) GetPrice(context.Context, string) (float64, string, error) {
	*quote.calls++
	return quote.rate, "INR", nil
}

func (quote eurQuote) GetQuote(context.Context, string) (Quote, error) { return Quote{}, nil }

func (quote eurQuote) GetForexRate(context.Context, string, string) (float64, error) {
	return 0, nil
}

// eurCloses is a DailyCloser that counts calls.
type eurCloses struct {
	closes map[string]float64
	calls  *int
}

func (closer eurCloses) GetDailyCloses(context.Context, string, time.Time, time.Time) (map[string]float64, error) {
	*closer.calls++
	return closer.closes, nil
}

func TestRateSourcesForPicksLiveOnlyForTheCurrentTradingDay(t *testing.T) {
	t.Parallel()
	ist := time.FixedZone("IST", 5*60*60+30*60)
	monday := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	tuesday := monday.AddDate(0, 0, 1)
	testCases := []struct {
		name           string
		now            time.Time
		date           time.Time
		wantLive       bool
		wantHistorical bool
	}{
		{name: "before the cut-over Monday is still the current day", now: time.Date(2026, 11, 17, 7, 0, 0, 0, ist), date: monday, wantLive: true},
		{name: "after the cut-over yesterday is a past day", now: time.Date(2026, 11, 17, 9, 0, 0, 0, ist), date: monday, wantHistorical: true},
		{name: "after the cut-over today is the current day", now: time.Date(2026, 11, 17, 9, 0, 0, 0, ist), date: tuesday, wantLive: true},
		{name: "an older past day uses its close", now: time.Date(2026, 11, 17, 9, 0, 0, 0, ist), date: monday.AddDate(0, 0, -7), wantHistorical: true},
		{name: "a weekend fetches nothing", now: time.Date(2026, 11, 17, 9, 0, 0, 0, ist), date: monday.AddDate(0, 0, -1)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			liveCalls, closeCalls := 0, 0
			service := &SnapshotService{
				prices:  eurQuote{rate: 91, calls: &liveCalls},
				Overall: &persistence.OverallStore{},
				Closes:  eurCloses{closes: map[string]float64{testCase.date.Format("2006-01-02"): 88.5}, calls: &closeCalls},
				Now:     func() time.Time { return testCase.now },
			}
			sources := service.rateSourcesFor(context.Background(), zap.NewNop(), testCase.date)
			if (sources.Live != nil) != testCase.wantLive || (liveCalls == 1) != testCase.wantLive {
				t.Errorf("live = %v after %d quote calls; want live %v", sources.Live, liveCalls, testCase.wantLive)
			}
			if (sources.Historical != nil) != testCase.wantHistorical || (closeCalls == 1) != testCase.wantHistorical {
				t.Errorf("historical = %v after %d close calls; want historical %v", sources.Historical, closeCalls, testCase.wantHistorical)
			}
			if testCase.wantHistorical && (sources.Historical.EurInr == nil || *sources.Historical.EurInr != 88.5) {
				t.Errorf("historical rate = %+v; want that day's close 88.5", sources.Historical)
			}
		})
	}
}

func TestRateForKeepsAStoredGoodRate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("stored rate beats a live quote", func(mt *mtest.T) {
		monday := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
		stored := bson.D{
			{Key: "user_id", Value: primitive.NewObjectID()}, {Key: "date", Value: monday},
			{Key: "eur_inr", Value: 89.0}, {Key: "fx_date", Value: "2026-11-16"}, {Key: "fx_carried", Value: false},
		}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, stored),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch),
		)
		store := persistence.New(mt.DB)
		store.AttachOverall()
		service := &SnapshotService{Overall: store.Overall}
		live := 91.0
		rate, err := service.rateFor(context.Background(), primitive.NewObjectID(), monday, rateSources{Live: &live})
		if err != nil {
			t.Fatalf("rateFor: %v", err)
		}
		if rate.EurInr == nil || *rate.EurInr != 89 || rate.Carried {
			t.Errorf("rate = %+v; want the stored 89 kept, not today's 91", rate)
		}
	})
}
