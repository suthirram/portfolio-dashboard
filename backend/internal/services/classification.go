package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
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

// ErrInvalidClassification rejects a confirmation whose type or sector is not
// allowed; its message says why and is safe to show the user.
var ErrInvalidClassification = errors.New("invalid classification")

// ErrClassificationConflict means the holding's symbol changed while the owner
// was confirming; the confirmation was for the old symbol and is not saved.
var ErrClassificationConflict = errors.New("holding symbol changed while confirming its classification; reload and retry")

// ConfirmedClassification builds the owner's classification of holding
// (DD-013 §1–§2): resolved, source user, for the holding's current symbol. A
// stock takes a sector label (normalised, reusing the owner's existing
// spelling) or nil for an unclassified stock; a fund takes no sector. Yahoo's
// provider details are kept when they belong to the current symbol, so a
// rename still shows what Yahoo said.
func ConfirmedClassification(holdingType string, sector *string, holding domain.Holding, ownerSectors []string, confirmedAt time.Time) (domain.Classification, error) {
	if !domain.ValidHoldingType(holdingType) {
		return domain.Classification{}, fmt.Errorf("%w: type must be stock, etf or mutual_fund", ErrInvalidClassification)
	}
	confirmed := domain.Classification{
		Symbol:    domain.CanonicalSymbol(holding.Symbol),
		Status:    domain.ClassificationResolved,
		Source:    domain.ClassificationSourceUser,
		CheckedAt: confirmedAt.UTC(),
	}
	if sector != nil {
		if holdingType != domain.HoldingTypeStock {
			return domain.Classification{}, fmt.Errorf("%w: only a stock has a sector; send null for a fund", ErrInvalidClassification)
		}
		label, ok := domain.NormalizeSectorLabel(*sector)
		if !ok {
			return domain.Classification{}, fmt.Errorf("%w: sector must have 1–%d characters, or be null for an unclassified stock", ErrInvalidClassification, domain.SectorLabelLimit)
		}
		confirmed.Sector = domain.ReuseSectorLabel(label, ownerSectors)
	}
	if current := holding.Classification; current.CurrentFor(holding.Symbol) {
		confirmed.ProviderSector = current.ProviderSector
		confirmed.Industry = current.Industry
		confirmed.SuggestedType = current.SuggestedType
	}
	return confirmed, nil
}

// ConfirmClassification saves the owner's classification and chosen type on
// userId's holding, on that holding only. found=false when the id is invalid,
// missing, or owned by someone else. Returns ErrInvalidClassification for a
// disallowed type/sector and ErrClassificationConflict when the symbol changed
// meanwhile.
func (s *HoldingsService) ConfirmClassification(ctx context.Context, userId primitive.ObjectID, idHex string, holdingType string, sector *string) (_ api.Holding, _ bool, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.ConfirmClassification")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}
	holding, err := s.store.GetScoped(ctx, userId, id)
	if errors.Is(err, persistence.ErrNotFound) {
		return api.Holding{}, false, nil
	}
	if err != nil {
		logger.Error("load holding to confirm failed", zap.String("id", idHex), zap.Error(err))
		return api.Holding{}, false, err
	}
	var ownerSectors []string
	if sector != nil {
		holdings, err := s.store.ListByUser(ctx, userId)
		if err != nil {
			logger.Error("list owner sectors failed", zap.String("id", idHex), zap.Error(err))
			return api.Holding{}, false, err
		}
		// This holding's own label is being replaced, so it must not force
		// its old spelling back (a case-only rename of a lone holding).
		others := make([]domain.Holding, 0, len(holdings))
		for _, other := range holdings {
			if other.ID != id {
				others = append(others, other)
			}
		}
		ownerSectors = SectorLabels(others)
	}
	confirmed, err := ConfirmedClassification(holdingType, sector, holding, ownerSectors, time.Now())
	if err != nil {
		return api.Holding{}, true, err
	}
	updated, err := s.store.ConfirmClassification(ctx, userId, id, holding.Symbol, holdingType, confirmed)
	if errors.Is(err, persistence.ErrNotFound) {
		logger.Info("holding classification not confirmed", zap.String("id", idHex), zap.String("outcome", "symbol_changed"))
		return api.Holding{}, true, ErrClassificationConflict
	}
	if err != nil {
		logger.Error("confirm holding classification failed", zap.String("id", idHex), zap.Error(err))
		return api.Holding{}, true, err
	}
	logger.Info("holding classification confirmed", zap.String("id", idHex), zap.String("type", holdingType))
	return HoldingToAPI(updated), true, nil
}

// identityChanged reports whether an edit changed what the classification
// describes: the canonical symbol or the holding type (DD-013 §2).
func identityChanged(before, after domain.Holding) bool {
	return domain.CanonicalSymbol(before.Symbol) != domain.CanonicalSymbol(after.Symbol) || before.Type != after.Type
}
