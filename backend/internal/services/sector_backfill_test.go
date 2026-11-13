package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// memoryHoldings is an in-memory backfill store whose SetClassification
// applies the same compare-and-set predicates as the Mongo store.
type memoryHoldings struct {
	byOwner map[primitive.ObjectID][]domain.Holding
	writes  int
	// beforeWrite lets a test change a holding between the read and the write.
	beforeWrite func(holding *domain.Holding)
}

func (m *memoryHoldings) ListByUser(_ context.Context, userId primitive.ObjectID) ([]domain.Holding, error) {
	return append([]domain.Holding(nil), m.byOwner[userId]...), nil
}

func (m *memoryHoldings) SetClassification(_ context.Context, userId, id primitive.ObjectID, symbol, holdingType string, expected *domain.Classification, classification domain.Classification) (domain.Holding, error) {
	for index := range m.byOwner[userId] {
		holding := &m.byOwner[userId][index]
		if holding.ID != id {
			continue
		}
		if m.beforeWrite != nil {
			m.beforeWrite(holding)
		}
		var storedCheckedAt, expectedCheckedAt time.Time
		if holding.Classification != nil {
			storedCheckedAt = holding.Classification.CheckedAt
		}
		if expected != nil {
			expectedCheckedAt = expected.CheckedAt
		}
		if holding.Symbol != symbol || holding.Type != holdingType || !storedCheckedAt.Equal(expectedCheckedAt) {
			return domain.Holding{}, persistence.ErrNotFound
		}
		m.writes++
		holding.Classification = &classification
		return *holding, nil
	}
	return domain.Holding{}, persistence.ErrNotFound
}

// scriptedProfiles answers lookups from profiles by symbol (unknown symbols
// are missing), and turns rate-limited after rateLimitAfter lookups.
type scriptedProfiles struct {
	profiles       map[string]CompanyProfile
	rateLimitAfter int // 0: never
	lookups        []string
}

func (p *scriptedProfiles) LookupProfile(_ context.Context, symbol string) (CompanyProfile, error) {
	normalized, err := NormalizeProfileSymbol(symbol)
	if err != nil {
		return CompanyProfile{}, err
	}
	p.lookups = append(p.lookups, normalized)
	if p.RateLimited() {
		return CompanyProfile{Symbol: normalized, Status: ProfileUnavailable}, nil
	}
	profile, ok := p.profiles[normalized]
	if !ok {
		profile = CompanyProfile{Status: ProfileMissing}
	}
	profile.Symbol = normalized
	return profile, nil
}

func (p *scriptedProfiles) RateLimited() bool {
	return p.rateLimitAfter > 0 && len(p.lookups) > p.rateLimitAfter
}

var backfillProfiles = map[string]CompanyProfile{
	"TCS.NS":  {Status: ProfileFound, Sector: "Technology", SuggestedType: "stock"},
	"INFY.NS": {Status: ProfileFound, Sector: "Technology", SuggestedType: "stock"},
	"ITC.NS":  {Status: ProfileFound, Sector: "Consumer Defensive", SuggestedType: "stock"},
}

func stockHolding(symbol string, classification *domain.Classification) domain.Holding {
	return domain.Holding{ID: primitive.NewObjectID(), Symbol: symbol, Type: "stock", StocksOwned: 10, AvgCostPrice: 100, Classification: classification}
}

func newTestBackfill(holdings *memoryHoldings, profiles *scriptedProfiles) (*SectorBackfill, *int) {
	paces := 0
	backfill := &SectorBackfill{holdings: holdings, profiles: profiles, now: func() time.Time { return classifiedAt }, pace: func(context.Context) error {
		paces++
		return nil
	}}
	return backfill, &paces
}

func TestNeedsBackfill(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name    string
		holding domain.Holding
		retry   bool
		want    bool
	}{
		{name: "never classified", holding: stockHolding("TCS.NS", nil), want: true},
		{name: "classified for an earlier symbol", holding: stockHolding("TCS.NS", &domain.Classification{Symbol: "INFY.NS", Status: "resolved"}), want: true},
		{name: "already attempted", holding: stockHolding("TCS.NS", &domain.Classification{Symbol: "TCS.NS", Status: "needs_review"}), want: false},
		{name: "already attempted, retrying", holding: stockHolding("TCS.NS", &domain.Classification{Symbol: "TCS.NS", Status: "needs_review"}), retry: true, want: true},
		{name: "resolved is never redone", holding: stockHolding("TCS.NS", &domain.Classification{Symbol: "TCS.NS", Status: "resolved"}), retry: true, want: false},
		{name: "owner confirmation is never redone", holding: stockHolding("ITC.NS", &domain.Classification{Symbol: "ITC.NS", Status: "resolved", Source: "user", Sector: "FMCG"}), retry: true, want: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := NeedsBackfill(testCase.holding, testCase.retry); got != testCase.want {
				t.Errorf("NeedsBackfill = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestSectorBackfill_DryRunWritesNothing(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil), stockHolding("UNKNOWN.NS", nil)}}}
	backfill, _ := newTestBackfill(holdings, &scriptedProfiles{profiles: backfillProfiles})

	report, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if holdings.writes != 0 || holdings.byOwner[owner][0].Classification != nil {
		t.Errorf("dry run wrote %d classifications", holdings.writes)
	}
	if report.Eligible != 2 || report.Resolved != 1 || report.NeedsReview != 1 {
		t.Errorf("report = %+v, want 2 eligible: 1 resolved, 1 needs review", report)
	}
}

func TestSectorBackfill_ApplyThenRerunIsIdempotent(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil), stockHolding("UNKNOWN.NS", nil)}}}
	profiles := &scriptedProfiles{profiles: backfillProfiles}
	backfill, _ := newTestBackfill(holdings, profiles)
	options := SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true}

	first, err := backfill.Run(context.Background(), options)
	if err != nil {
		t.Fatalf("first Run: %v", err)
	}
	if first.Resolved != 1 || first.NeedsReview != 1 || holdings.writes != 2 {
		t.Fatalf("first run = %+v with %d writes, want 1 resolved + 1 needs review written", first, holdings.writes)
	}
	tcs := holdings.byOwner[owner][0]
	if tcs.Classification.Sector != "Technology" || tcs.StocksOwned != 10 || tcs.AvgCostPrice != 100 {
		t.Errorf("TCS after backfill = %+v, want Technology with its position unchanged", tcs)
	}

	second, err := backfill.Run(context.Background(), options)
	if err != nil {
		t.Fatalf("second Run: %v", err)
	}
	if second.Eligible != 0 || second.Skipped != 2 || holdings.writes != 2 || len(profiles.lookups) != 2 {
		t.Errorf("rerun = %+v, writes %d, lookups %d; want everything skipped and no new lookups", second, holdings.writes, len(profiles.lookups))
	}
}

func TestSectorBackfill_RetryUnresolvedRedoesNeedsReviewOnly(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	attempted := &domain.Classification{Symbol: "ITC.NS", Status: "needs_review", CheckedAt: classifiedAt.Add(-time.Hour)}
	confirmed := &domain.Classification{Symbol: "HUL.NS", Status: "resolved", Source: "user", Sector: "FMCG", CheckedAt: classifiedAt.Add(-time.Hour)}
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("ITC.NS", attempted), stockHolding("HUL.NS", confirmed)}}}
	profiles := &scriptedProfiles{profiles: backfillProfiles}
	backfill, _ := newTestBackfill(holdings, profiles)

	report, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true, RetryUnresolved: true})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Resolved != 1 || report.Skipped != 1 || holdings.byOwner[owner][0].Classification.Sector != "Consumer Defensive" {
		t.Errorf("report = %+v, ITC = %+v; want ITC retried to Consumer Defensive", report, holdings.byOwner[owner][0].Classification)
	}
	if got := holdings.byOwner[owner][1].Classification; got != confirmed {
		t.Errorf("owner's FMCG confirmation replaced by %+v", got)
	}
	if len(profiles.lookups) != 1 {
		t.Errorf("lookups = %v, want only ITC", profiles.lookups)
	}
}

func TestSectorBackfill_LimitLeavesTheRestForTheNextRun(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil), stockHolding("INFY.NS", nil), stockHolding("ITC.NS", nil)}}}
	backfill, _ := newTestBackfill(holdings, &scriptedProfiles{profiles: backfillProfiles})

	report, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true, Limit: 2})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Eligible != 2 || report.Remaining != 1 || holdings.writes != 2 {
		t.Errorf("report = %+v with %d writes, want 2 processed and 1 remaining", report, holdings.writes)
	}
}

func TestSectorBackfill_RateLimitStopsWithoutRecordingIt(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil), stockHolding("INFY.NS", nil), stockHolding("ITC.NS", nil)}}}
	profiles := &scriptedProfiles{profiles: backfillProfiles, rateLimitAfter: 1}
	backfill, _ := newTestBackfill(holdings, profiles)

	report, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !report.RateLimited || report.Eligible != 1 || holdings.writes != 1 {
		t.Errorf("report = %+v with %d writes, want a stop after the first holding", report, holdings.writes)
	}
	if holdings.byOwner[owner][1].Classification != nil {
		t.Error("rate-limited holding was recorded; a rerun would skip it")
	}
	if len(profiles.lookups) != 2 {
		t.Errorf("lookups = %v, want no lookups after the rate limit", profiles.lookups)
	}
}

func TestSectorBackfill_ConcurrentEditIsAConflict(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("ITC.NS", nil)}}}
	// The owner confirms FMCG between the backfill's read and its write.
	holdings.beforeWrite = func(holding *domain.Holding) {
		holding.Classification = &domain.Classification{Symbol: "ITC.NS", Status: "resolved", Source: "user", Sector: "FMCG", CheckedAt: classifiedAt.Add(time.Minute)}
	}
	backfill, _ := newTestBackfill(holdings, &scriptedProfiles{profiles: backfillProfiles})

	report, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.Conflicts != 1 || report.Resolved != 0 || holdings.byOwner[owner][0].Classification.Sector != "FMCG" {
		t.Errorf("report = %+v, ITC = %+v; want a conflict and the owner's FMCG kept", report, holdings.byOwner[owner][0].Classification)
	}
}

func TestSectorBackfill_ScopedToTheGivenOwners(t *testing.T) {
	t.Parallel()
	owner, other := primitive.NewObjectID(), primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil)}, other: {stockHolding("ITC.NS", nil)}}}
	profiles := &scriptedProfiles{profiles: backfillProfiles}
	backfill, _ := newTestBackfill(holdings, profiles)

	if _, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true}); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if holdings.byOwner[other][0].Classification != nil || len(profiles.lookups) != 1 {
		t.Errorf("another owner's holding was touched; lookups %v", profiles.lookups)
	}
}

func TestSectorBackfill_PacesNewSymbolsAndReusesLabels(t *testing.T) {
	t.Parallel()
	first, second := primitive.NewObjectID(), primitive.NewObjectID()
	ownLabel := &domain.Classification{Symbol: "WIPRO.NS", Status: "resolved", Source: "user", Sector: "technology"}
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{
		first:  {stockHolding("TCS.NS", nil), stockHolding("WIPRO.NS", ownLabel)},
		second: {stockHolding("TCS.NS", nil), stockHolding("ITC.NS", nil)},
	}}
	backfill, paces := newTestBackfill(holdings, &scriptedProfiles{profiles: backfillProfiles})

	if _, err := backfill.Run(context.Background(), SectorBackfillOptions{UserIds: []primitive.ObjectID{first, second}, Apply: true}); err != nil {
		t.Fatalf("Run: %v", err)
	}
	// TCS twice and ITC once: two distinct symbols, so one wait between them.
	if *paces != 1 {
		t.Errorf("paces = %d, want 1 (a repeated symbol is not new)", *paces)
	}
	if got := holdings.byOwner[first][0].Classification.Sector; got != "technology" {
		t.Errorf("first owner's TCS sector = %q, want their existing spelling technology", got)
	}
	if got := holdings.byOwner[second][0].Classification.Sector; got != "Technology" {
		t.Errorf("second owner's TCS sector = %q, want Yahoo's Technology (labels are per owner)", got)
	}
}

func TestSectorBackfill_CancelStopsBeforeWriting(t *testing.T) {
	t.Parallel()
	owner := primitive.NewObjectID()
	holdings := &memoryHoldings{byOwner: map[primitive.ObjectID][]domain.Holding{owner: {stockHolding("TCS.NS", nil), stockHolding("ITC.NS", nil)}}}
	ctx, cancel := context.WithCancel(context.Background())
	backfill, _ := newTestBackfill(holdings, &scriptedProfiles{profiles: backfillProfiles})
	backfill.pace = func(context.Context) error {
		cancel()
		return context.Canceled
	}

	_, err := backfill.Run(ctx, SectorBackfillOptions{UserIds: []primitive.ObjectID{owner}, Apply: true})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if holdings.writes != 1 || holdings.byOwner[owner][1].Classification != nil {
		t.Errorf("writes = %d, want only the holding before the cancel", holdings.writes)
	}
}
