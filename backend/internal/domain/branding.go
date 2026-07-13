package domain

import "time"

type BrandingFont string

const (
	BrandingFontRoboto        BrandingFont = "roboto"
	BrandingFontJetBrainsMono BrandingFont = "jetbrains_mono"
)

const DefaultBrandingFont = BrandingFontRoboto

func (f BrandingFont) Valid() bool {
	switch f {
	case BrandingFontRoboto, BrandingFontJetBrainsMono:
		return true
	default:
		return false
	}
}

type BrandingSettings struct {
	ID        string       `bson:"_id,omitempty" json:"id,omitempty"`
	Font      BrandingFont `bson:"font" json:"font"`
	CreatedAt time.Time    `bson:"created_at,omitzero" json:"created_at,omitzero"`
	UpdatedAt time.Time    `bson:"updated_at,omitzero" json:"updated_at,omitzero"`
}

func DefaultBrandingSettings() BrandingSettings {
	return BrandingSettings{
		ID:   "global",
		Font: DefaultBrandingFont,
	}
}
