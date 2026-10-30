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
	hs := matchHoldings()
	for _, name := range []string{"TCS", " tcs ", "Jio Platforms Ltd", "jio  platforms ltd"} {
		r := resolveOne(sheetName(name), hs, nil)
		if r.view.Status != nameAuto || r.view.MatchedBy == nil || *r.view.MatchedBy != "script" {
			t.Errorf("%q: status %s, want auto by script", name, r.view.Status)
		}
	}
	hs[0].Aliases = []string{exactKey("JIOPLA")}
	if r := resolveOne("JIOPLA", hs, nil); r.view.Status != nameAuto || *r.view.MatchedBy != "alias" {
		t.Errorf("confirmed alias: status %s, want auto by alias", r.view.Status)
	}
}

// The owner's own example (decision 13): with the holding Jio Platforms Ltd /
// JIOPLA.NS, the sheet names jio, JLP, Jio Platforms Limited and JIOPLA all go
// to the popup — including the symbol-shaped JIOPLA. Punctuation and exchange
// suffix differences do too.
func TestResolveNames_InconsistentNamesNeedConfirmation(t *testing.T) {
	hs := matchHoldings()
	jio, tcs := hs[0].ID.Hex(), hs[1].ID.Hex()
	for _, name := range []string{"jio", "Jio Platforms Limited", "JLP", "JIOPLA", "JIOPLA.NS", "Jio Platforms Ltd.", "tcs.ns"} {
		r := resolveOne(name, hs, nil)
		if r.view.Status != nameNeedsConfirmation || r.holding != nil {
			t.Errorf("%q: status %s holding %v, want needs_confirmation and no holding", name, r.view.Status, r.holding)
		}
	}
	if r := resolveOne("tcs.ns", hs, nil); r.view.Preselect == nil || *r.view.Preselect != tcs {
		t.Error(`"tcs.ns": want TCS pre-selected (symbol match), still awaiting confirmation`)
	}
	for _, name := range []string{"jio", "Jio Platforms Limited", "JIOPLA", "Jio Platforms Ltd."} {
		r := resolveOne(name, hs, nil)
		if len(r.view.Suggestions) == 0 || r.view.Suggestions[0].HoldingId != jio {
			t.Errorf("%q: suggestions %+v, want Jio Platforms first", name, r.view.Suggestions)
		}
		if r.view.Preselect == nil || *r.view.Preselect != jio {
			t.Errorf("%q: want Jio Platforms preselected (clear best)", name)
		}
	}
	// The owner's shorthand: letters of the initials in another order. Jio is
	// suggested first but, at 0.7, not pre-selected — the owner picks it.
	r := resolveOne("JLP", hs, nil)
	if len(r.view.Suggestions) == 0 || r.view.Suggestions[0].HoldingId != jio {
		t.Errorf(`"JLP": suggestions %+v, want Jio Platforms first`, r.view.Suggestions)
	}
	if r.view.Preselect != nil {
		t.Error(`"JLP": an initials match must not be pre-selected`)
	}
}

func TestResolveNames_NoPreselectWithoutClearBest(t *testing.T) {
	hs := append(matchHoldings(), domain.Holding{ID: primitive.NewObjectID(), Script: "Jio Financial", Symbol: "JIOFIN.NS", Currency: "INR"})
	if r := resolveOne("jio", hs, nil); r.view.Preselect != nil {
		t.Error("two equal suggestions must not pre-select one")
	}
}

func TestResolveNames_Ambiguous(t *testing.T) {
	hs := []domain.Holding{
		{ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.NS"},
		{ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.BO"},
	}
	r := resolveOne("Reliance", hs, nil)
	if r.view.Status != nameAmbiguous || r.view.Preselect != nil || len(r.view.Suggestions) != 2 {
		t.Errorf("got %s preselect=%v suggestions=%d, want ambiguous, none, 2", r.view.Status, r.view.Preselect, len(r.view.Suggestions))
	}
}

func TestResolveNames_Answers(t *testing.T) {
	hs := matchHoldings()
	jio := hs[0].ID.Hex()
	r := resolveOne("JLP", hs, map[string]*string{"JLP": &jio})
	if r.view.Status != nameConfirmed || r.holding == nil || !r.saveAlias {
		t.Errorf("confirmed answer: %+v saveAlias=%v", r.view, r.saveAlias)
	}
	if got := confirmedAliases([]nameResolution{r}); len(got[hs[0].ID]) != 1 || got[hs[0].ID][0] != "jlp" {
		t.Errorf("aliases = %v, want jlp on Jio", got)
	}
	if r := resolveOne("JLP", hs, map[string]*string{"JLP": nil}); r.view.Status != nameUnresolved {
		t.Errorf("nil answer: status %s, want unresolved", r.view.Status)
	}
	foreign := primitive.NewObjectID().Hex()
	if r := resolveOne("JLP", hs, map[string]*string{"JLP": &foreign}); r.view.Status != nameUnresolved {
		t.Error("an answer outside the tab's holdings must not resolve")
	}
	tcs := hs[1].ID.Hex()
	if r := resolveOne("TCS", hs, map[string]*string{"TCS": &tcs}); r.saveAlias {
		t.Error("confirming the exact match must not save a redundant alias")
	}
}
