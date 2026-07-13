package persistence

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/domain"
)

const brandingDocumentID = "global"

// BrandingStore owns the singleton app-branding settings document.
type BrandingStore struct {
	col *mongo.Collection
}

func (s *BrandingStore) Get(ctx context.Context) (domain.BrandingSettings, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var out domain.BrandingSettings
	if err := s.col.FindOne(ctx, bson.M{"_id": brandingDocumentID}).Decode(&out); err != nil {
		return domain.BrandingSettings{}, translateFindErr(err)
	}
	if !out.Font.Valid() {
		out.Font = domain.DefaultBrandingFont
	}
	return out, nil
}

func (s *BrandingStore) SetFont(ctx context.Context, font domain.BrandingFont) (domain.BrandingSettings, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	now := time.Now().UTC()
	update := bson.M{
		"$set": bson.M{
			"font":       font,
			"updated_at": now,
		},
		"$setOnInsert": bson.M{
			"created_at": now,
		},
	}
	opts := options.Update().SetUpsert(true)
	if _, err := s.col.UpdateOne(ctx, bson.M{"_id": brandingDocumentID}, update, opts); err != nil {
		return domain.BrandingSettings{}, err
	}
	return domain.BrandingSettings{ID: brandingDocumentID, Font: font, UpdatedAt: now}, nil
}
