// Package auth holds the static auth catalogues (regions, security
// questions) and the credential primitives (password/answer hashing,
// session id generation) shared by handlers, middleware, and CLI commands.
package auth

// Region is an oversight grouping for users and admins. It is not data
// residency: all data lives in one database (see DD-001 §12).
type Region struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// regions is the single source of truth for the region catalogue.
var regions = []Region{
	{ID: "india", Label: "India"},
	{ID: "europe", Label: "Europe"},
	{ID: "us", Label: "US"},
}

// Regions returns the region catalogue in display order.
func Regions() []Region {
	out := make([]Region, len(regions))
	copy(out, regions)
	return out
}

// ValidRegion reports whether id names a region in the catalogue.
func ValidRegion(id string) bool {
	for _, r := range regions {
		if r.ID == id {
			return true
		}
	}
	return false
}
