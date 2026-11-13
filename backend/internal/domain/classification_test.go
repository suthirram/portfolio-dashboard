package domain

import "testing"

func TestSectorFromProvider(t *testing.T) {
	testCases := []struct {
		name   string
		values []string
		want   SectorKey
		ok     bool
	}{
		{name: "display label", values: []string{"Consumer Defensive"}, want: SectorConsumerDefensive, ok: true},
		{name: "hyphenated key", values: []string{"real-estate"}, want: SectorRealEstate, ok: true},
		{name: "first recognised wins", values: []string{"", "Communication Services"}, want: SectorCommunicationServices, ok: true},
		{name: "alias", values: []string{"Financial"}, want: SectorFinancialServices, ok: true},
		{name: "spaced alias", values: []string{"Health Care"}, want: SectorHealthcare, ok: true},
		{name: "unknown taxonomy", values: []string{"Conglomerates"}},
		{name: "empty", values: []string{"", "  "}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, ok := SectorFromProvider(testCase.values...)
			if got != testCase.want || ok != testCase.ok {
				t.Errorf("SectorFromProvider(%q) = %q, %v; want %q, %v", testCase.values, got, ok, testCase.want, testCase.ok)
			}
		})
	}
}

func TestSectorCatalogueKeysAreValid(t *testing.T) {
	if len(SectorCatalogue) != 11 {
		t.Fatalf("catalogue has %d sectors, want 11", len(SectorCatalogue))
	}
	for _, sector := range SectorCatalogue {
		if !ValidSector(sector.Key) || sector.Label == "" {
			t.Errorf("invalid catalogue entry %+v", sector)
		}
	}
	if ValidSector("conglomerates") {
		t.Error("ValidSector accepted a key outside the catalogue")
	}
}
