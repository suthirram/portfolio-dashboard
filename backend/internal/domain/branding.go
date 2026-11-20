package domain

import "time"

type BrandingFont string

const (
	BrandingFontRoboto        BrandingFont = "roboto"
	BrandingFontJetBrainsMono BrandingFont = "jetbrains_mono"
)

const DefaultBrandingFont = BrandingFontRoboto

// BrandingFontSpec is one deployment font the super admin may choose. Each
// CSS stack names the web font, then its metric-adjusted fallback face
// ("<label> Fallback", an @font-face in the frontend's base.css, measured
// from the font file's hhea/hmtx tables), then a system font, so text does
// not shift when the web font finishes loading.
type BrandingFontSpec struct {
	ID        BrandingFont
	Label     string
	CSSFamily string
}

// sansStack is a proportional font's stack: web font, its fallback face, Arial.
func sansStack(label string) string {
	return `"` + label + `", "` + label + ` Fallback", Arial, sans-serif`
}

// BrandingFonts is the allowed catalogue, in the order Branding offers it.
var BrandingFonts = []BrandingFontSpec{
	{ID: BrandingFontRoboto, Label: "Roboto", CSSFamily: `Roboto, "Roboto Fallback", Arial, sans-serif`},
	{ID: BrandingFontJetBrainsMono, Label: "JetBrains Mono", CSSFamily: `"JetBrains Mono", "JetBrains Mono Fallback", monospace`},
	{ID: "dm_sans", Label: "DM Sans", CSSFamily: sansStack("DM Sans")},
	{ID: "manrope", Label: "Manrope", CSSFamily: sansStack("Manrope")},
	{ID: "inter", Label: "Inter", CSSFamily: sansStack("Inter")},
	{ID: "source_sans_3", Label: "Source Sans 3", CSSFamily: sansStack("Source Sans 3")},
	{ID: "lato", Label: "Lato", CSSFamily: sansStack("Lato")},
	{ID: "nunito_sans", Label: "Nunito Sans", CSSFamily: sansStack("Nunito Sans")},
	{ID: "ibm_plex_sans", Label: "IBM Plex Sans", CSSFamily: sansStack("IBM Plex Sans")},
	{ID: "open_sans", Label: "Open Sans", CSSFamily: sansStack("Open Sans")},
	{ID: "poppins", Label: "Poppins", CSSFamily: sansStack("Poppins")},
	{ID: "work_sans", Label: "Work Sans", CSSFamily: sansStack("Work Sans")},
}

func (f BrandingFont) Valid() bool {
	for _, spec := range BrandingFonts {
		if spec.ID == f {
			return true
		}
	}
	return false
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
