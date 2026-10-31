package services

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

func matchHoldings() []domain.Holding {
	return []domain.Holding{
		{ID: primitive.NewObjectID(), Script: "Jio Platforms Ltd", Symbol: "JIOPLA.NS", Currency: "INR"},
		{ID: primitive.NewObjectID(), Script: "TCS", Symbol: "TCS.NS", Currency: "INR"},
	}
}

func resolveOne(name string, candidates []domain.Holding, mappings map[string]*string) nameResolution {
	return resolveNames([]nameCount{{name: name, rows: 1}}, candidates, mappings)[0]
}

// Only the display name (case/space-insensitive) or a confirmed alias maps
// without the popup.
func TestResolveNames_ExactIsAuto(t *testing.T) {
	holdings := matchHoldings()
	for _, name := range []string{"TCS", " tcs ", "Jio Platforms Ltd", "jio  platforms ltd"} {
		resolution := resolveOne(sheetName(name), holdings, nil)
		if resolution.view.Status != nameAuto || resolution.view.MatchedBy == nil || *resolution.view.MatchedBy != "script" {
			t.Errorf("%q: status %s, want auto by script", name, resolution.view.Status)
		}
	}
	holdings[0].Aliases = []string{exactKey("JIOPLA")}
	if resolution := resolveOne("JIOPLA", holdings, nil); resolution.view.Status != nameAuto || *resolution.view.MatchedBy != "alias" {
		t.Errorf("confirmed alias: status %s, want auto by alias", resolution.view.Status)
	}
}

// The owner's own example (decision 13): with the holding Jio Platforms Ltd /
// JIOPLA.NS, the sheet names jio, JLP, Jio Platforms Limited and JIOPLA all go
// to the popup — including the symbol-shaped JIOPLA. Punctuation and exchange
// suffix differences do too.
func TestResolveNames_InconsistentNamesNeedConfirmation(t *testing.T) {
	holdings := matchHoldings()
	jio, tcs := holdings[0].ID.Hex(), holdings[1].ID.Hex()
	for _, name := range []string{"jio", "Jio Platforms Limited", "JLP", "JIOPLA", "JIOPLA.NS", "Jio Platforms Ltd.", "tcs.ns"} {
		resolution := resolveOne(name, holdings, nil)
		if resolution.view.Status != nameNeedsConfirmation || resolution.holding != nil {
			t.Errorf("%q: status %s holding %v, want needs_confirmation and no holding", name, resolution.view.Status, resolution.holding)
		}
	}
	if resolution := resolveOne("tcs.ns", holdings, nil); resolution.view.Preselect == nil || *resolution.view.Preselect != tcs {
		t.Error(`"tcs.ns": want TCS pre-selected (symbol match), still awaiting confirmation`)
	}
	for _, name := range []string{"jio", "Jio Platforms Limited", "JIOPLA", "Jio Platforms Ltd."} {
		resolution := resolveOne(name, holdings, nil)
		if len(resolution.view.Suggestions) == 0 || resolution.view.Suggestions[0].HoldingId != jio {
			t.Errorf("%q: suggestions %+v, want Jio Platforms first", name, resolution.view.Suggestions)
		}
		if resolution.view.Preselect == nil || *resolution.view.Preselect != jio {
			t.Errorf("%q: want Jio Platforms preselected (clear best)", name)
		}
	}
	// The owner's shorthand: letters of the initials in another order. Jio is
	// suggested first but, at 0.7, not pre-selected — the owner picks it.
	resolution := resolveOne("JLP", holdings, nil)
	if len(resolution.view.Suggestions) == 0 || resolution.view.Suggestions[0].HoldingId != jio {
		t.Errorf(`"JLP": suggestions %+v, want Jio Platforms first`, resolution.view.Suggestions)
	}
	if resolution.view.Preselect != nil {
		t.Error(`"JLP": an initials match must not be pre-selected`)
	}
}

func TestResolveNames_NoPreselectWithoutClearBest(t *testing.T) {
	holdings := append(matchHoldings(), domain.Holding{ID: primitive.NewObjectID(), Script: "Jio Financial", Symbol: "JIOFIN.NS", Currency: "INR"})
	if resolution := resolveOne("jio", holdings, nil); resolution.view.Preselect != nil {
		t.Error("two equal suggestions must not pre-select one")
	}
}

func TestResolveNames_Ambiguous(t *testing.T) {
	holdings := []domain.Holding{
		{ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.NS"},
		{ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.BO"},
	}
	resolution := resolveOne("Reliance", holdings, nil)
	if resolution.view.Status != nameAmbiguous || resolution.view.Preselect != nil || len(resolution.view.Suggestions) != 2 {
		t.Errorf("got %s preselect=%v suggestions=%d, want ambiguous, none, 2", resolution.view.Status, resolution.view.Preselect, len(resolution.view.Suggestions))
	}
}

func TestResolveNames_Answers(t *testing.T) {
	holdings := matchHoldings()
	jio := holdings[0].ID.Hex()
	resolution := resolveOne("JLP", holdings, map[string]*string{"JLP": &jio})
	if resolution.view.Status != nameConfirmed || resolution.holding == nil || !resolution.saveAlias {
		t.Errorf("confirmed answer: %+v saveAlias=%v", resolution.view, resolution.saveAlias)
	}
	if aliases := confirmedAliases([]nameResolution{resolution}); len(aliases[holdings[0].ID]) != 1 || aliases[holdings[0].ID][0] != "jlp" {
		t.Errorf("aliases = %v, want jlp on Jio", aliases)
	}
	if unresolved := resolveOne("JLP", holdings, map[string]*string{"JLP": nil}); unresolved.view.Status != nameUnresolved {
		t.Errorf("nil answer: status %s, want unresolved", unresolved.view.Status)
	}
	foreign := primitive.NewObjectID().Hex()
	if outside := resolveOne("JLP", holdings, map[string]*string{"JLP": &foreign}); outside.view.Status != nameUnresolved {
		t.Error("an answer outside the tab's holdings must not resolve")
	}
	tcs := holdings[1].ID.Hex()
	if exact := resolveOne("TCS", holdings, map[string]*string{"TCS": &tcs}); exact.saveAlias {
		t.Error("confirming the exact match must not save a redundant alias")
	}
}
