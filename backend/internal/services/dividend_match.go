package services

import (
	"cmp"
	"regexp"
	"slices"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// Share-name → holding resolution for dividend imports (PRD-005 §6, DD-005
// §2.3). Pure: no store access.

var (
	exchangeSuffix = regexp.MustCompile(`\.(ns|bo)$`)
	nonAlnum       = regexp.MustCompile(`[^a-z0-9]+`)
	corpWords      = map[string]bool{"limited": true, "ltd": true, "inc": true, "plc": true, "corp": true, "corporation": true, "company": true, "co": true, "the": true}
)

const (
	minSuggestionScore = 0.3
	preselectScore     = 0.8
	preselectLead      = 0.15
	maxSuggestions     = 3
)

// Resolution statuses (DividendNameResolution.status).
const (
	nameAuto              = "auto"
	nameConfirmed         = "confirmed"
	nameNeedsConfirmation = "needs_confirmation"
	nameAmbiguous         = "ambiguous"
	nameUnresolved        = "unresolved"
)

// sheetName is a Share Name as displayed and as the mappings key: trimmed,
// inner whitespace collapsed.
func sheetName(s string) string { return strings.Join(strings.Fields(s), " ") }

// exactKey is the only normalisation an automatic match allows: letter case
// and extra spaces. Punctuation, legal suffixes (Ltd/Limited) and exchange
// suffixes (.NS/.BO) are differences the owner confirms in the popup
// (PRD-005 §6, owner decision 13). Aliases are stored as exactKey.
func exactKey(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

// nameKey is the looser key for suggestions only: lower-case, exchange suffix
// dropped, punctuation → space, whitespace collapsed. Never used to auto-match.
func nameKey(s string) string {
	k := exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
	return strings.Join(strings.Fields(nonAlnum.ReplaceAllString(k, " ")), " ")
}

// corpKey is nameKey without corporate filler words; suggestions only.
func corpKey(s string) string {
	var kept []string
	for w := range strings.FieldsSeq(nameKey(s)) {
		if !corpWords[w] {
			kept = append(kept, w)
		}
	}
	return strings.Join(kept, " ")
}

func compact(s string) string { return strings.ReplaceAll(s, " ", "") }

// tokenPrefix reports whether every token of the shorter phrase prefixes the
// token at the same position in the longer ("jio" ↔ "jio platforms").
func tokenPrefix(a, b string) bool {
	ta, tb := strings.Fields(a), strings.Fields(b)
	if len(ta) == 0 || len(tb) == 0 {
		return false
	}
	short, long := ta, tb
	if len(ta) > len(tb) {
		short, long = tb, ta
	}
	for i, t := range short {
		if !strings.HasPrefix(long[i], t) {
			return false
		}
	}
	return true
}

// initials is the first letter of each token ("jio platforms ltd" → "jpl").
func initials(s string) string {
	var b strings.Builder
	for w := range strings.FieldsSeq(s) {
		b.WriteByte(w[0])
	}
	return b.String()
}

// sameLetters reports whether a and b use the same letters in any order, so
// a shorthand like the owner's "JLP" still matches the initials "jpl".
func sameLetters(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	x, y := []byte(a), []byte(b)
	slices.Sort(x)
	slices.Sort(y)
	return string(x) == string(y)
}

// trigramJaccard is |A∩B| / |A∪B| over padded character trigrams.
func trigramJaccard(a, b string) float64 {
	grams := func(s string) map[string]bool {
		p := "  " + compact(s) + " "
		out := map[string]bool{}
		for i := 0; i+3 <= len(p); i++ {
			out[p[i:i+3]] = true
		}
		return out
	}
	ga, gb := grams(a), grams(b)
	inter := 0
	for g := range ga {
		if gb[g] {
			inter++
		}
	}
	union := len(ga) + len(gb) - inter
	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

// suggestionScore rates how likely a sheet name means holding h (0–1). A
// score is only ever a suggestion; it is never applied without the user —
// not even a sheet name equal to the symbol ("JIOPLA" ↔ "JIOPLA.NS"), which
// scores highest and is pre-selected but still waits for confirmation.
func suggestionScore(name string, h domain.Holding) float64 {
	s, script, symbol := corpKey(name), corpKey(h.Script), compact(nameKey(h.Symbol))
	best := trigramJaccard(s, script)
	if sym := compact(nameKey(name)); sym != "" && sym == symbol {
		best = max(best, 0.98)
	}
	if s != "" && s == script {
		best = max(best, 0.95)
	}
	if tokenPrefix(s, script) || (len(compact(s)) >= 4 && strings.HasPrefix(symbol, compact(s))) {
		best = max(best, 0.8)
	}
	// Initials in order ("JPL") or as a shuffled shorthand ("JLP", the owner's
	// example). Kept below preselectScore: a suggestion, not a pre-selection.
	if ini := initials(nameKey(h.Script)); len(compact(s)) >= 2 && (compact(s) == ini || sameLetters(compact(s), ini)) {
		best = max(best, 0.7)
	}
	return best
}

// nameCount is one distinct sheet name and how many rows use it.
type nameCount struct {
	name string
	rows int
}

// countNames lists distinct sheet names in first-appearance order.
func countNames(rows []api.DividendImportRow) []nameCount {
	index := map[string]int{}
	var out []nameCount
	for _, r := range rows {
		n := sheetName(r.ShareName)
		if n == "" {
			continue
		}
		if i, ok := index[n]; ok {
			out[i].rows++
			continue
		}
		index[n] = len(out)
		out = append(out, nameCount{name: n, rows: 1})
	}
	return out
}

// nameResolution is one sheet name's outcome. holding is set for auto and
// confirmed; a confirmed answer becomes an alias when the import commits.
type nameResolution struct {
	view      api.DividendNameResolution
	holding   *domain.Holding
	saveAlias bool
}

type exactMatch struct {
	holding *domain.Holding
	by      string
}

// resolveNames resolves each sheet name against candidates (the tab's
// currency only), honouring the user's popup answers in mappings: a holding
// id confirms, nil leaves the name unresolved.
func resolveNames(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
	exact := map[string][]exactMatch{}
	holdingsById := map[string]*domain.Holding{}
	for i := range candidates {
		h := &candidates[i]
		holdingsById[h.ID.Hex()] = h
		add := func(key, by string) {
			if key == "" {
				return
			}
			for _, m := range exact[key] {
				if m.holding.ID == h.ID {
					return
				}
			}
			exact[key] = append(exact[key], exactMatch{holding: h, by: by})
		}
		// Automatic matches: the display name (case/space-insensitive) or a name
		// the owner confirmed before. The symbol is deliberately absent — a
		// symbol-shaped sheet name is a suggestion (suggestionScore), not a match.
		add(exactKey(h.Script), "script")
		for _, alias := range h.Aliases {
			add(alias, "alias")
		}
	}

	out := make([]nameResolution, 0, len(names))
	for _, n := range names {
		res := nameResolution{view: api.DividendNameResolution{SheetName: n.name, Rows: n.rows, Suggestions: []api.DividendSuggestion{}}}
		matches := exact[exactKey(n.name)]

		if answer, answered := mappings[n.name]; answered {
			if h := lookupAnswer(answer, holdingsById); h == nil {
				res.view.Status = nameUnresolved
			} else {
				id := h.ID.Hex()
				res.view.Status, res.view.HoldingId, res.holding = nameConfirmed, &id, h
				res.saveAlias = len(matches) != 1 || matches[0].holding.ID != h.ID
			}
			out = append(out, res)
			continue
		}

		switch {
		case len(matches) == 1:
			id, by := matches[0].holding.ID.Hex(), matches[0].by
			res.view.Status, res.holding = nameAuto, matches[0].holding
			res.view.HoldingId, res.view.MatchedBy = &id, &by
		case len(matches) > 1:
			res.view.Status = nameAmbiguous
			for _, m := range matches {
				res.view.Suggestions = append(res.view.Suggestions, suggestionOf(m.holding, 1))
			}
		default:
			res.view.Status = nameNeedsConfirmation
			res.view.Suggestions, res.view.Preselect = suggest(n.name, candidates)
		}
		out = append(out, res)
	}
	return out
}

func lookupAnswer(answer *string, holdingsById map[string]*domain.Holding) *domain.Holding {
	if answer == nil {
		return nil
	}
	return holdingsById[*answer]
}

func suggestionOf(h *domain.Holding, score float64) api.DividendSuggestion {
	return api.DividendSuggestion{HoldingId: h.ID.Hex(), Script: h.Script, Symbol: h.Symbol, Score: score}
}

// suggest ranks candidates for a non-exact name and pre-selects the top one
// only when it is a clear best (≥ preselectScore and ahead by preselectLead).
func suggest(name string, candidates []domain.Holding) ([]api.DividendSuggestion, *string) {
	out := []api.DividendSuggestion{}
	for i := range candidates {
		if score := suggestionScore(name, candidates[i]); score >= minSuggestionScore {
			out = append(out, suggestionOf(&candidates[i], score))
		}
	}
	slices.SortStableFunc(out, func(a, b api.DividendSuggestion) int { return cmp.Compare(b.Score, a.Score) })
	if len(out) > maxSuggestions {
		out = out[:maxSuggestions]
	}
	if len(out) == 0 || out[0].Score < preselectScore || (len(out) > 1 && out[0].Score-out[1].Score < preselectLead) {
		return out, nil
	}
	id := out[0].HoldingId
	return out, &id
}

// confirmedAliases groups the names to save as aliases by holding.
func confirmedAliases(names []nameResolution) map[primitive.ObjectID][]string {
	out := map[primitive.ObjectID][]string{}
	for _, n := range names {
		if n.saveAlias && n.holding != nil {
			out[n.holding.ID] = append(out[n.holding.ID], exactKey(n.view.SheetName))
		}
	}
	return out
}
