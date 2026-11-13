package services

import (
	"context"
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

// stubProfiles answers every lookup with profile after the real symbol
// validation, recording the symbols it was asked for.
type stubProfiles struct {
	profile CompanyProfile
	symbols []string
}

func (s *stubProfiles) LookupProfile(_ context.Context, symbol string) (CompanyProfile, error) {
	normalized, err := NormalizeProfileSymbol(symbol)
	if err != nil {
		return CompanyProfile{}, err
	}
	s.symbols = append(s.symbols, normalized)
	profile := s.profile
	profile.Symbol = normalized
	return profile, nil
}

var classifiedAt = time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)

func TestClassifyFromProfile(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name         string
		holdingType  string
		profile      CompanyProfile
		ownerSectors []string
		want         domain.Classification
	}{
		{
			name:        "stock with Yahoo sector resolves",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileFound, Sector: "Technology", Industry: "IT Services", SuggestedType: "stock"},
			want:        domain.Classification{Status: "resolved", Source: "yahoo", Sector: "Technology", ProviderSector: "Technology", Industry: "IT Services", SuggestedType: "stock"},
		},
		{
			name:        "sector without quote type still resolves",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileFound, Sector: "Energy"},
			want:        domain.Classification{Status: "resolved", Source: "yahoo", Sector: "Energy", ProviderSector: "Energy"},
		},
		{
			name:         "owner's existing spelling is reused",
			holdingType:  "stock",
			profile:      CompanyProfile{Status: ProfileFound, Sector: "Technology", SuggestedType: "stock"},
			ownerSectors: []string{"FMCG", "technology"},
			want:         domain.Classification{Status: "resolved", Source: "yahoo", Sector: "technology", ProviderSector: "Technology", SuggestedType: "stock"},
		},
		{
			name:        "fund suggestion on a stock needs review",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileFound, SuggestedType: "etf"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", SuggestedType: "etf"},
		},
		{
			name:        "conflicting quote type keeps Yahoo's sector only as provider text",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileFound, Sector: "Technology", SuggestedType: "mutual_fund"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", ProviderSector: "Technology", SuggestedType: "mutual_fund"},
		},
		{
			name:        "ETF holding confirmed by Yahoo still needs the owner's confirmation",
			holdingType: "etf",
			profile:     CompanyProfile{Status: ProfileFound, SuggestedType: "etf"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", SuggestedType: "etf"},
		},
		{
			name:        "matching mutual fund still needs the owner's confirmation",
			holdingType: "mutual_fund",
			profile:     CompanyProfile{Status: ProfileFound, SuggestedType: "mutual_fund"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", SuggestedType: "mutual_fund"},
		},
		{
			name:        "a fund never gets a company sector",
			holdingType: "mutual_fund",
			profile:     CompanyProfile{Status: ProfileFound, Sector: "Financial Services", SuggestedType: "stock"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", ProviderSector: "Financial Services", SuggestedType: "stock"},
		},
		{
			name:        "missing sector needs review",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileMissing, SuggestedType: "stock"},
			want:        domain.Classification{Status: "needs_review", Source: "yahoo", SuggestedType: "stock"},
		},
		{
			name:        "unavailable needs review with no provenance",
			holdingType: "stock",
			profile:     CompanyProfile{Status: ProfileUnavailable},
			want:        domain.Classification{Status: "needs_review"},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			testCase.profile.Symbol = "TCS.NS"
			testCase.want.Symbol = "TCS.NS"
			testCase.want.CheckedAt = classifiedAt

			got := ClassifyFromProfile(testCase.holdingType, testCase.profile, testCase.ownerSectors, classifiedAt.In(time.FixedZone("IST", 19800)))
			if got != testCase.want {
				t.Errorf("classification = %+v\nwant %+v", got, testCase.want)
			}
		})
	}
}

func TestSectorLabels_CurrentSectorsOnly(t *testing.T) {
	t.Parallel()
	holdings := []domain.Holding{
		{Symbol: "TCS.NS", Classification: &domain.Classification{Symbol: "TCS.NS", Sector: "Technology"}},
		{Symbol: "itc.ns", Classification: &domain.Classification{Symbol: "ITC.NS", Sector: "FMCG"}},
		{Symbol: "INFY.NS", Classification: &domain.Classification{Symbol: "WIPRO.NS", Sector: "Stale"}},
		{Symbol: "NIFTYBEES.NS", Classification: &domain.Classification{Symbol: "NIFTYBEES.NS"}},
		{Symbol: "LEGACY.NS"},
	}
	got := SectorLabels(holdings)
	if len(got) != 2 || got[0] != "Technology" || got[1] != "FMCG" {
		t.Errorf("SectorLabels = %v, want [Technology FMCG]", got)
	}
}

func TestIdentityChanged(t *testing.T) {
	t.Parallel()
	base := domain.Holding{Symbol: "TCS.NS", Type: "stock", Script: "TCS", Notes: "a"}
	testCases := []struct {
		name  string
		after domain.Holding
		want  bool
	}{
		{name: "notes and name edits", after: domain.Holding{Symbol: "TCS.NS", Type: "stock", Script: "Tata Consultancy", Notes: "b"}, want: false},
		{name: "same symbol in another case", after: domain.Holding{Symbol: " tcs.ns", Type: "stock"}, want: false},
		{name: "symbol change", after: domain.Holding{Symbol: "INFY.NS", Type: "stock"}, want: true},
		{name: "type change", after: domain.Holding{Symbol: "TCS.NS", Type: "etf"}, want: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := identityChanged(base, testCase.after); got != testCase.want {
				t.Errorf("identityChanged = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestClassificationToAPI(t *testing.T) {
	t.Parallel()
	classification := &domain.Classification{
		Symbol: "ITC.NS", Status: "resolved", Source: "user", Sector: "FMCG",
		ProviderSector: "Consumer Defensive", Industry: "Tobacco", SuggestedType: "stock", CheckedAt: classifiedAt,
	}
	t.Run("current classification maps every field", func(t *testing.T) {
		got := ClassificationToAPI(domain.Holding{Symbol: "itc.ns", Classification: classification})
		if got.Status != api.ClassificationStatusResolved || *got.Symbol != "ITC.NS" || *got.Source != api.ClassificationSourceUser ||
			*got.Sector != "FMCG" || *got.ProviderSector != "Consumer Defensive" || *got.Industry != "Tobacco" ||
			*got.SuggestedType != api.SuggestedStock || !got.CheckedAt.Equal(classifiedAt) {
			t.Errorf("classification = %+v", got)
		}
	})
	for name, holding := range map[string]domain.Holding{
		"legacy holding without classification": {Symbol: "ITC.NS"},
		"classification for an earlier symbol":  {Symbol: "HUL.NS", Classification: classification},
	} {
		t.Run(name+" reads as needs review", func(t *testing.T) {
			got := ClassificationToAPI(holding)
			if got.Status != api.ClassificationStatusNeedsReview || got.Symbol != nil || got.Source != nil || got.Sector != nil || got.CheckedAt != nil {
				t.Errorf("classification = %+v, want bare needs_review", got)
			}
		})
	}
	t.Run("empty optional fields stay absent", func(t *testing.T) {
		got := ClassificationToAPI(domain.Holding{Symbol: "X", Classification: &domain.Classification{Symbol: "X", Status: "needs_review", CheckedAt: classifiedAt}})
		if got.Source != nil || got.Sector != nil || got.ProviderSector != nil || got.Industry != nil || got.SuggestedType != nil {
			t.Errorf("classification = %+v, want only status/symbol/checked_at", got)
		}
	})
	t.Run("prices response carries the classification", func(t *testing.T) {
		got := HoldingWithPriceToAPI(context.Background(), domain.Holding{Symbol: "ITC.NS", Classification: classification}, &stubPriceFetcher{price: 400}, 0.01)
		if got.Classification == nil || *got.Classification.Sector != "FMCG" {
			t.Errorf("HoldingWithPrice.Classification = %+v, want FMCG", got.Classification)
		}
	})
}

func classifiedHoldingDoc(userId, holdingId primitive.ObjectID, symbol string, classification bson.D) bson.D {
	doc := bson.D{
		{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "script", Value: "TCS"},
		{Key: "symbol", Value: symbol}, {Key: "exchange", Value: "NSE"}, {Key: "type", Value: "stock"}, {Key: "currency", Value: "INR"},
	}
	if classification != nil {
		doc = append(doc, bson.E{Key: "classification", Value: classification})
	}
	return doc
}

// classificationWriteQueries returns the filter of every findAndModify that
// set a classification, in order.
func classificationWriteQueries(mt *mtest.T) []bson.Raw {
	var queries []bson.Raw
	for _, started := range mt.GetAllStartedEvents() {
		if _, err := started.Command.LookupErr("update", "$set", "classification"); started.CommandName == "findAndModify" && err == nil {
			queries = append(queries, started.Command.Lookup("query").Document())
		}
	}
	return queries
}

// withHoldingType sets the document's type field, e.g. to make an ETF.
func withHoldingType(doc bson.D, holdingType string) bson.D {
	for index := range doc {
		if doc[index].Key == "type" {
			doc[index].Value = holdingType
		}
	}
	return doc
}

func insertedClassification(t *testing.T, mt *mtest.T) bson.Raw {
	t.Helper()
	for _, started := range mt.GetAllStartedEvents() {
		if started.CommandName == "insert" {
			classification, err := started.Command.Lookup("documents").Array().Index(0).Value().Document().LookupErr("classification")
			if err != nil {
				t.Fatalf("inserted holding has no classification: %v", err)
			}
			return classification.Document()
		}
	}
	t.Fatal("no insert issued")
	return nil
}

func TestHoldingsService_Create_ClassifiesBeforeInsert(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("Yahoo sector reuses the owner's spelling", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		profiles := &stubProfiles{profile: CompanyProfile{Status: ProfileFound, Sector: "Technology", SuggestedType: "stock"}}
		mt.AddMockResponses(
			// ListByUser — the owner's sectors for label reuse.
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
				classifiedHoldingDoc(userId, primitive.NewObjectID(), "INFY.NS", bson.D{{Key: "symbol", Value: "INFY.NS"}, {Key: "status", Value: "resolved"}, {Key: "sector", Value: "technology"}})),
			mtest.CreateSuccessResponse(), // insert
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		got, err := service.Create(context.Background(), userId, api.HoldingInput{Script: "TCS", Symbol: new("tcs.ns"), Exchange: "NSE", Type: "stock"})
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		stored := insertedClassification(t, mt)
		if stored.Lookup("status").StringValue() != "resolved" || stored.Lookup("sector").StringValue() != "technology" ||
			stored.Lookup("provider_sector").StringValue() != "Technology" || stored.Lookup("symbol").StringValue() != "TCS.NS" {
			t.Errorf("stored classification = %v", stored)
		}
		if got.Classification == nil || *got.Classification.Sector != "technology" {
			t.Errorf("response classification = %+v, want technology", got.Classification)
		}
	})

	mt.Run("Yahoo outage still creates the holding as needs review", func(mt *mtest.T) {
		profiles := &stubProfiles{profile: CompanyProfile{Status: ProfileUnavailable, SessionUnavailable: true}}
		mt.AddMockResponses(mtest.CreateSuccessResponse()) // insert only: no sector, no owner lookup
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		got, err := service.Create(context.Background(), primitive.NewObjectID(), api.HoldingInput{Script: "TCS", Symbol: new("TCS.NS"), Exchange: "NSE", Type: "stock"})
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		stored := insertedClassification(t, mt)
		if stored.Lookup("status").StringValue() != "needs_review" {
			t.Errorf("stored status = %v, want needs_review", stored.Lookup("status"))
		}
		if _, err := stored.LookupErr("source"); err == nil {
			t.Error("unavailable lookup stored a source")
		}
		if got.Classification.Status != api.ClassificationStatusNeedsReview {
			t.Errorf("response status = %q, want needs_review", got.Classification.Status)
		}
	})

	mt.Run("holding without a symbol is saved as needs review", func(mt *mtest.T) {
		profiles := &stubProfiles{}
		mt.AddMockResponses(mtest.CreateSuccessResponse())
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		if _, err := service.Create(context.Background(), primitive.NewObjectID(), api.HoldingInput{Script: "Private", Exchange: "OTHER", Type: "stock"}); err != nil {
			t.Fatalf("Create: %v", err)
		}
		if stored := insertedClassification(t, mt); stored.Lookup("status").StringValue() != "needs_review" {
			t.Errorf("stored status = %v, want needs_review", stored.Lookup("status"))
		}
		if len(profiles.symbols) != 0 {
			t.Errorf("invalid symbol reached the provider: %v", profiles.symbols)
		}
	})
}

func TestHoldingsService_Update_Reclassification(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	renamed := bson.D{{Key: "symbol", Value: "ITC.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "user"}, {Key: "sector", Value: "FMCG"}, {Key: "provider_sector", Value: "Consumer Defensive"}, {Key: "checked_at", Value: classifiedAt}}

	mt.Run("notes edit keeps the owner's rename and skips Yahoo", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		profiles := &stubProfiles{profile: CompanyProfile{Status: ProfileFound, Sector: "Consumer Defensive"}}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, classifiedHoldingDoc(userId, holdingId, "ITC.NS", renamed)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: classifiedHoldingDoc(userId, holdingId, "ITC.NS", renamed)}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		got, found, err := service.Update(context.Background(), userId, holdingId.Hex(), api.HoldingInput{Script: "ITC", Symbol: new("ITC.NS"), Exchange: "NSE", Type: "stock", Notes: new("long term")})
		if err != nil || !found {
			t.Fatalf("Update: found=%v err=%v", found, err)
		}
		if len(profiles.symbols) != 0 {
			t.Errorf("notes edit looked up %v", profiles.symbols)
		}
		if *got.Classification.Sector != "FMCG" || *got.Classification.Source != api.ClassificationSourceUser {
			t.Errorf("classification = %+v, want the owner's FMCG rename", got.Classification)
		}
	})

	mt.Run("symbol change reclassifies with compare-and-set on the new symbol", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		profiles := &stubProfiles{profile: CompanyProfile{Status: ProfileFound, Sector: "Consumer Defensive", SuggestedType: "stock"}}
		reclassified := bson.D{{Key: "symbol", Value: "HINDUNILVR.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "yahoo"}, {Key: "sector", Value: "Consumer Defensive"}, {Key: "provider_sector", Value: "Consumer Defensive"}}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, classifiedHoldingDoc(userId, holdingId, "ITC.NS", renamed)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: classifiedHoldingDoc(userId, holdingId, "HINDUNILVR.NS", renamed)}),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, classifiedHoldingDoc(userId, holdingId, "HINDUNILVR.NS", renamed)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: classifiedHoldingDoc(userId, holdingId, "HINDUNILVR.NS", reclassified)}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		got, found, err := service.Update(context.Background(), userId, holdingId.Hex(), api.HoldingInput{Script: "HUL", Symbol: new("HINDUNILVR.NS"), Exchange: "NSE", Type: "stock"})
		if err != nil || !found {
			t.Fatalf("Update: found=%v err=%v", found, err)
		}
		if len(profiles.symbols) != 1 || profiles.symbols[0] != "HINDUNILVR.NS" {
			t.Errorf("looked up %v, want [HINDUNILVR.NS]", profiles.symbols)
		}
		writes := classificationWriteQueries(mt)
		if len(writes) != 1 {
			t.Fatalf("classification writes = %d, want 1", len(writes))
		}
		query := writes[0]
		if symbol := query.Lookup("symbol").StringValue(); symbol != "HINDUNILVR.NS" {
			t.Errorf("compare-and-set symbol = %q, want HINDUNILVR.NS", symbol)
		}
		if holdingType, _ := query.Lookup("type").StringValueOK(); holdingType != "stock" {
			t.Errorf("compare-and-set type = %q, want stock", holdingType)
		}
		// The classification read before the lookup must still be there.
		if checkedAt, ok := query.Lookup("classification.checked_at").TimeOK(); !ok || !checkedAt.Equal(classifiedAt) {
			t.Errorf("compare-and-set checked_at = %v, want %v", checkedAt, classifiedAt)
		}
		if _, err := query.LookupErr("user_id"); err != nil {
			t.Error("classification write is not owner-scoped")
		}
		if *got.Classification.Sector != "Consumer Defensive" || *got.Classification.Source != api.ClassificationSourceYahoo {
			t.Errorf("classification = %+v, want Yahoo's Consumer Defensive", got.Classification)
		}
	})

	mt.Run("type change reclassifies with compare-and-set on the new type", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		profiles := &stubProfiles{profile: CompanyProfile{Status: ProfileFound, SuggestedType: "etf"}}
		fundReview := bson.D{{Key: "symbol", Value: "NIFTYBEES.NS"}, {Key: "status", Value: "needs_review"}, {Key: "source", Value: "yahoo"}, {Key: "suggested_type", Value: "etf"}}
		stock := classifiedHoldingDoc(userId, holdingId, "NIFTYBEES.NS", nil)
		etf := withHoldingType(classifiedHoldingDoc(userId, holdingId, "NIFTYBEES.NS", nil), "etf")
		reclassified := withHoldingType(classifiedHoldingDoc(userId, holdingId, "NIFTYBEES.NS", fundReview), "etf")
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, stock),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: etf}),
			// No sector from Yahoo, so no owner-sector read before the write.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: reclassified}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		got, found, err := service.Update(context.Background(), userId, holdingId.Hex(), api.HoldingInput{Script: "Nifty BeES", Symbol: new("NIFTYBEES.NS"), Exchange: "NSE", Type: "etf"})
		if err != nil || !found {
			t.Fatalf("Update: found=%v err=%v", found, err)
		}
		writes := classificationWriteQueries(mt)
		if len(writes) != 1 {
			t.Fatalf("classification writes = %d, want 1", len(writes))
		}
		if checkedType, _ := writes[0].Lookup("type").StringValueOK(); checkedType != "etf" {
			t.Errorf("compare-and-set type = %q, want etf so a racing stock lookup cannot overwrite it", writes[0].Lookup("type"))
		}
		if got.Classification.Status != api.ClassificationStatusNeedsReview || got.Classification.Sector != nil {
			t.Errorf("classification = %+v, want needs_review with no sector", got.Classification)
		}
	})

	mt.Run("missing holding is not found before any lookup", func(mt *mtest.T) {
		profiles := &stubProfiles{}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, profiles, nil)

		_, found, err := service.Update(context.Background(), primitive.NewObjectID(), primitive.NewObjectID().Hex(), api.HoldingInput{Script: "X", Symbol: new("X.NS"), Exchange: "NSE", Type: "stock"})
		if err != nil || found {
			t.Errorf("Update: found=%v err=%v, want not found", found, err)
		}
		if len(profiles.symbols) != 0 {
			t.Errorf("missing holding looked up %v", profiles.symbols)
		}
	})
}

func TestConfirmedClassification(t *testing.T) {
	t.Parallel()
	yahooITC := domain.Holding{Symbol: "itc.ns", Classification: &domain.Classification{
		Symbol: "ITC.NS", Status: "resolved", Source: "yahoo", Sector: "Consumer Defensive",
		ProviderSector: "Consumer Defensive", Industry: "Tobacco", SuggestedType: "stock", CheckedAt: classifiedAt,
	}}
	testCases := []struct {
		name         string
		holdingType  string
		sector       *string
		holding      domain.Holding
		ownerSectors []string
		want         domain.Classification
		wantErr      bool
	}{
		{
			name: "rename keeps Yahoo's text as provider sector", holdingType: "stock", sector: new("  FMCG "), holding: yahooITC,
			want: domain.Classification{Status: "resolved", Source: "user", Sector: "FMCG", ProviderSector: "Consumer Defensive", Industry: "Tobacco", SuggestedType: "stock"},
		},
		{
			name: "label reuses the owner's spelling", holdingType: "stock", sector: new("fmcg"), holding: yahooITC, ownerSectors: []string{"FMCG"},
			want: domain.Classification{Status: "resolved", Source: "user", Sector: "FMCG", ProviderSector: "Consumer Defensive", Industry: "Tobacco", SuggestedType: "stock"},
		},
		{
			name: "null sector is an unclassified stock", holdingType: "stock", holding: yahooITC,
			want: domain.Classification{Status: "resolved", Source: "user", ProviderSector: "Consumer Defensive", Industry: "Tobacco", SuggestedType: "stock"},
		},
		{
			name: "fund confirmation carries no sector", holdingType: "etf", holding: domain.Holding{Symbol: "NIFTYBEES.NS"},
			want: domain.Classification{Status: "resolved", Source: "user"},
		},
		{
			name: "provider details for an earlier symbol are dropped", holdingType: "stock", sector: new("FMCG"),
			holding: domain.Holding{Symbol: "HINDUNILVR.NS", Classification: yahooITC.Classification},
			want:    domain.Classification{Status: "resolved", Source: "user", Sector: "FMCG"},
		},
		{name: "fund with a sector is rejected", holdingType: "mutual_fund", sector: new("Banking"), holding: yahooITC, wantErr: true},
		{name: "blank sector is rejected", holdingType: "stock", sector: new("   "), holding: yahooITC, wantErr: true},
		{name: "unknown type is rejected", holdingType: "bond", holding: yahooITC, wantErr: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := ConfirmedClassification(testCase.holdingType, testCase.sector, testCase.holding, testCase.ownerSectors, classifiedAt)
			if testCase.wantErr {
				if !errors.Is(err, ErrInvalidClassification) {
					t.Errorf("err = %v, want ErrInvalidClassification", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("ConfirmedClassification: %v", err)
			}
			testCase.want.Symbol = domain.CanonicalSymbol(testCase.holding.Symbol)
			testCase.want.CheckedAt = classifiedAt
			if got != testCase.want {
				t.Errorf("classification = %+v\nwant %+v", got, testCase.want)
			}
		})
	}
}

func TestHoldingsService_ConfirmClassification(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	yahoo := bson.D{{Key: "symbol", Value: "ITC.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "yahoo"}, {Key: "sector", Value: "Consumer Defensive"}, {Key: "provider_sector", Value: "Consumer Defensive"}, {Key: "checked_at", Value: classifiedAt}}

	mt.Run("rename reuses another holding's label, not this holding's own", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		itc := classifiedHoldingDoc(userId, holdingId, "ITC.NS", yahoo)
		hul := classifiedHoldingDoc(userId, primitive.NewObjectID(), "HINDUNILVR.NS", bson.D{{Key: "symbol", Value: "HINDUNILVR.NS"}, {Key: "status", Value: "resolved"}, {Key: "sector", Value: "FMCG"}})
		confirmed := classifiedHoldingDoc(userId, holdingId, "ITC.NS", bson.D{{Key: "symbol", Value: "ITC.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "user"}, {Key: "sector", Value: "FMCG"}, {Key: "provider_sector", Value: "Consumer Defensive"}})
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, itc),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, hul, itc),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: confirmed}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, nil, nil)

		got, found, err := service.ConfirmClassification(context.Background(), userId, holdingId.Hex(), "stock", new("fmcg"))
		if err != nil || !found {
			t.Fatalf("ConfirmClassification: found=%v err=%v", found, err)
		}
		var written bson.Raw
		for _, started := range mt.GetAllStartedEvents() {
			if started.CommandName == "findAndModify" {
				written = started.Command.Lookup("update", "$set", "classification").Document()
			}
		}
		if written.Lookup("sector").StringValue() != "FMCG" || written.Lookup("source").StringValue() != "user" || written.Lookup("provider_sector").StringValue() != "Consumer Defensive" {
			t.Errorf("written classification = %v, want user FMCG over Yahoo's Consumer Defensive", written)
		}
		if *got.Classification.Sector != "FMCG" {
			t.Errorf("response sector = %v, want FMCG", got.Classification.Sector)
		}
	})

	mt.Run("case-only rename of a lone holding keeps the new spelling", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		itc := classifiedHoldingDoc(userId, holdingId, "ITC.NS", yahoo)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, itc),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, itc),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: itc}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, nil, nil)

		if _, _, err := service.ConfirmClassification(context.Background(), userId, holdingId.Hex(), "stock", new("consumer defensive")); err != nil {
			t.Fatalf("ConfirmClassification: %v", err)
		}
		for _, started := range mt.GetAllStartedEvents() {
			if started.CommandName == "findAndModify" {
				if sector := started.Command.Lookup("update", "$set", "classification", "sector").StringValue(); sector != "consumer defensive" {
					t.Errorf("written sector = %q, want the owner's new spelling", sector)
				}
			}
		}
	})

	mt.Run("another owner's holding is not found", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, nil, nil)

		_, found, err := service.ConfirmClassification(context.Background(), primitive.NewObjectID(), primitive.NewObjectID().Hex(), "stock", nil)
		if err != nil || found {
			t.Errorf("ConfirmClassification: found=%v err=%v, want not found", found, err)
		}
	})

	mt.Run("symbol changed meanwhile is a conflict", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, classifiedHoldingDoc(userId, holdingId, "ITC.NS", yahoo)),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}),
		)
		store := persistence.New(mt.DB)
		service := NewHoldingsService(store.Holdings, store.Transactions, nil, nil)

		_, _, err := service.ConfirmClassification(context.Background(), userId, holdingId.Hex(), "etf", nil)
		if !errors.Is(err, ErrClassificationConflict) {
			t.Errorf("err = %v, want ErrClassificationConflict", err)
		}
	})
}
