package services

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

// ClassifyFromProfile derives a holding's classification from a Yahoo profile
// lookup (DD-013 §1). A stock resolves automatically only when Yahoo gives a
// sector and no conflicting quote type; fund suggestions and type mismatches
// stay needs-review so the owner confirms them. Funds never get a sector. The
// sector reuses the owner's existing spelling of the same label.
func ClassifyFromProfile(holdingType string, profile CompanyProfile, ownerSectors []string, checkedAt time.Time) domain.Classification {
	classification := domain.Classification{
		Symbol:    profile.Symbol,
		Status:    domain.ClassificationNeedsReview,
		CheckedAt: checkedAt.UTC(),
	}
	if profile.Status == ProfileUnavailable {
		return classification
	}
	classification.Source = domain.ClassificationSourceYahoo
	classification.ProviderSector = profile.Sector
	classification.Industry = profile.Industry
	classification.SuggestedType = profile.SuggestedType
	compatibleType := profile.SuggestedType == "" || profile.SuggestedType == domain.HoldingTypeStock
	if holdingType == domain.HoldingTypeStock && profile.Sector != "" && compatibleType {
		classification.Status = domain.ClassificationResolved
		classification.Sector = domain.ReuseSectorLabel(profile.Sector, ownerSectors)
	}
	return classification
}

// SectorLabels returns the sector labels currently shown on holdings: the
// owner's derived sector set (DD-013 §1), possibly with repeats.
func SectorLabels(holdings []domain.Holding) []string {
	var labels []string
	for _, holding := range holdings {
		if holding.Classification.CurrentFor(holding.Symbol) && holding.Classification.Sector != "" {
			labels = append(labels, holding.Classification.Sector)
		}
	}
	return labels
}

// classify looks up symbol and derives its classification for userId's
// holding. nil when no profile fetcher is configured (the holding then reads
// as needs-review). A provider outage is a needs-review classification, never
// an error, so creating or editing a holding is never blocked by Yahoo.
func (s *HoldingsService) classify(ctx context.Context, userId primitive.ObjectID, symbol, holdingType string) (_ *domain.Classification, retErr error) {
	if s.profiles == nil {
		return nil, nil
	}
	ctx, span := tracer.Start(ctx, "HoldingsService.classify")
	defer endSpan(span, &retErr)
	checkedAt := time.Now()
	profile, err := s.profiles.LookupProfile(ctx, symbol)
	if errors.Is(err, ErrInvalidSymbol) {
		return &domain.Classification{Symbol: domain.CanonicalSymbol(symbol), Status: domain.ClassificationNeedsReview, CheckedAt: checkedAt.UTC()}, nil
	}
	if err != nil {
		return nil, err
	}
	var ownerSectors []string
	if profile.Sector != "" {
		holdings, err := s.store.ListByUser(ctx, userId)
		if err != nil {
			return nil, err
		}
		ownerSectors = SectorLabels(holdings)
	}
	classification := ClassifyFromProfile(holdingType, profile, ownerSectors, checkedAt)
	return &classification, nil
}

// identityChanged reports whether an edit changed what the classification
// describes: the canonical symbol or the holding type (DD-013 §2).
func identityChanged(before, after domain.Holding) bool {
	return domain.CanonicalSymbol(before.Symbol) != domain.CanonicalSymbol(after.Symbol) || before.Type != after.Type
}
