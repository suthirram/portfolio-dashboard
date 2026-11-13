package domain

import "strings"

// SectorKey is a canonical company sector (DD-013 §1). The taxonomy is closed:
// an unrecognised provider value needs review rather than a new key.
type SectorKey string

const (
	SectorBasicMaterials        SectorKey = "basic_materials"
	SectorCommunicationServices SectorKey = "communication_services"
	SectorConsumerCyclical      SectorKey = "consumer_cyclical"
	SectorConsumerDefensive     SectorKey = "consumer_defensive"
	SectorEnergy                SectorKey = "energy"
	SectorFinancialServices     SectorKey = "financial_services"
	SectorHealthcare            SectorKey = "healthcare"
	SectorIndustrials           SectorKey = "industrials"
	SectorRealEstate            SectorKey = "real_estate"
	SectorTechnology            SectorKey = "technology"
	SectorUtilities             SectorKey = "utilities"
)

// Holding types. A fund (etf, mutual_fund) never carries a company sector.
const (
	HoldingTypeStock      = "stock"
	HoldingTypeETF        = "etf"
	HoldingTypeMutualFund = "mutual_fund"
)

// Sector is one catalogue entry: the stored key and its display label.
type Sector struct {
	Key   SectorKey
	Label string
}

// SectorCatalogue lists every accepted sector in display order. The profile
// lookup returns it so the UI never invents accepted values.
var SectorCatalogue = []Sector{
	{SectorBasicMaterials, "Basic Materials"},
	{SectorCommunicationServices, "Communication Services"},
	{SectorConsumerCyclical, "Consumer Cyclical"},
	{SectorConsumerDefensive, "Consumer Defensive"},
	{SectorEnergy, "Energy"},
	{SectorFinancialServices, "Financial Services"},
	{SectorHealthcare, "Healthcare"},
	{SectorIndustrials, "Industrials"},
	{SectorRealEstate, "Real Estate"},
	{SectorTechnology, "Technology"},
	{SectorUtilities, "Utilities"},
}

// sectorAliases maps normalised provider spellings that differ from a key.
var sectorAliases = map[string]SectorKey{
	"financial":   SectorFinancialServices,
	"health_care": SectorHealthcare,
}

// ValidSector reports whether key is in the catalogue.
func ValidSector(key SectorKey) bool {
	for _, sector := range SectorCatalogue {
		if sector.Key == key {
			return true
		}
	}
	return false
}

// SectorFromProvider maps Yahoo's sector values ("Financial Services" or its
// "financial-services" key) onto the catalogue. The first recognised value
// wins; ok is false when none is recognised.
func SectorFromProvider(values ...string) (SectorKey, bool) {
	for _, value := range values {
		normalised := strings.Join(strings.FieldsFunc(strings.ToLower(value), func(char rune) bool {
			return char == ' ' || char == '-' || char == '_'
		}), "_")
		if normalised == "" {
			continue
		}
		if key, ok := sectorAliases[normalised]; ok {
			return key, true
		}
		if key := SectorKey(normalised); ValidSector(key) {
			return key, true
		}
	}
	return "", false
}
