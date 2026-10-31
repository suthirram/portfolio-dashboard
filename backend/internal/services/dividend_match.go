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
func sheetName(raw string) string { return strings.Join(strings.Fields(raw), " ") }

// exactKey is the only normalisation an automatic match allows: letter case
// and extra spaces. Punctuation, legal suffixes (Ltd/Limited) and exchange
// suffixes (.NS/.BO) are differences the owner confirms in the popup
// (PRD-005 §6, owner decision 13). Aliases are stored as exactKey.
func exactKey(name string) string { return strings.ToLower(strings.Join(strings.Fields(name), " ")) }

// nameKey is the looser key for suggestions only: lower-case, exchange suffix
// dropped, punctuation → space, whitespace collapsed. Never used to auto-match.
func nameKey(name string) string {
	withoutSuffix := exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "")
	return strings.Join(strings.Fields(nonAlnum.ReplaceAllString(withoutSuffix, " ")), " ")
}

// corpKey is nameKey without corporate filler words; suggestions only.
func corpKey(name string) string {
	var kept []string
	for word := range strings.FieldsSeq(nameKey(name)) {
		if !corpWords[word] {
			kept = append(kept, word)
		}
	}
	return strings.Join(kept, " ")
}

func compact(phrase string) string { return strings.ReplaceAll(phrase, " ", "") }

// tokenPrefix reports whether every token of the shorter phrase prefixes the
// token at the same position in the longer ("jio" ↔ "jio platforms").
func tokenPrefix(first, second string) bool {
	firstTokens, secondTokens := strings.Fields(first), strings.Fields(second)
	if len(firstTokens) == 0 || len(secondTokens) == 0 {
		return false
	}
	short, long := firstTokens, secondTokens
	if len(firstTokens) > len(secondTokens) {
		short, long = secondTokens, firstTokens
	}
	for i, token := range short {
		if !strings.HasPrefix(long[i], token) {
			return false
		}
	}
	return true
}

// initials is the first letter of each token ("jio platforms ltd" → "jpl").
func initials(phrase string) string {
	var letters strings.Builder
	for word := range strings.FieldsSeq(phrase) {
		letters.WriteByte(word[0])
	}
	return letters.String()
}

// sameLetters reports whether first and second use the same letters in any
// order, so a shorthand like the owner's "JLP" still matches the initials "jpl".
func sameLetters(first, second string) bool {
	if len(first) != len(second) {
		return false
	}
	firstLetters, secondLetters := []byte(first), []byte(second)
	slices.Sort(firstLetters)
	slices.Sort(secondLetters)
	return string(firstLetters) == string(secondLetters)
}

// trigramJaccard is |A∩B| / |A∪B| over padded character trigrams.
func trigramJaccard(first, second string) float64 {
	trigrams := func(phrase string) map[string]bool {
		padded := "  " + compact(phrase) + " "
		out := map[string]bool{}
		for i := 0; i+3 <= len(padded); i++ {
			out[padded[i:i+3]] = true
		}
		return out
	}
	firstTrigrams, secondTrigrams := trigrams(first), trigrams(second)
	intersection := 0
	for trigram := range firstTrigrams {
		if secondTrigrams[trigram] {
			intersection++
		}
	}
	union := len(firstTrigrams) + len(secondTrigrams) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

// suggestionScore rates how likely a sheet name means the holding (0–1). A
// score is only ever a suggestion; it is never applied without the user —
// not even a sheet name equal to the symbol ("JIOPLA" ↔ "JIOPLA.NS"), which
// scores highest and is pre-selected but still waits for confirmation.
func suggestionScore(name string, holding domain.Holding) float64 {
	sheetKey, script, symbol := corpKey(name), corpKey(holding.Script), compact(nameKey(holding.Symbol))
	best := trigramJaccard(sheetKey, script)
	if sheetSymbol := compact(nameKey(name)); sheetSymbol != "" && sheetSymbol == symbol {
		best = max(best, 0.98)
	}
	if sheetKey != "" && sheetKey == script {
		best = max(best, 0.95)
	}
	if tokenPrefix(sheetKey, script) || (len(compact(sheetKey)) >= 4 && strings.HasPrefix(symbol, compact(sheetKey))) {
		best = max(best, 0.8)
	}
	// Initials in order ("JPL") or as a shuffled shorthand ("JLP", the owner's
	// example). Kept below preselectScore: a suggestion, not a pre-selection.
	if scriptInitials := initials(nameKey(holding.Script)); len(compact(sheetKey)) >= 2 && (compact(sheetKey) == scriptInitials || sameLetters(compact(sheetKey), scriptInitials)) {
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
	for _, row := range rows {
		name := sheetName(row.ShareName)
		if name == "" {
			continue
		}
		if position, seen := index[name]; seen {
			out[position].rows++
			continue
		}
		index[name] = len(out)
		out = append(out, nameCount{name: name, rows: 1})
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
		holding := &candidates[i]
		holdingsById[holding.ID.Hex()] = holding
		addMatch := func(key, by string) {
			if key == "" {
				return
			}
			for _, match := range exact[key] {
				if match.holding.ID == holding.ID {
					return
				}
			}
			exact[key] = append(exact[key], exactMatch{holding: holding, by: by})
		}
		// Automatic matches: the display name (case/space-insensitive) or a name
		// the owner confirmed before. The symbol is deliberately absent — a
		// symbol-shaped sheet name is a suggestion (suggestionScore), not a match.
		addMatch(exactKey(holding.Script), "script")
		for _, alias := range holding.Aliases {
			addMatch(alias, "alias")
		}
	}

	out := make([]nameResolution, 0, len(names))
	for _, sheet := range names {
		resolution := nameResolution{view: api.DividendNameResolution{SheetName: sheet.name, Rows: sheet.rows, Suggestions: []api.DividendSuggestion{}}}
		matches := exact[exactKey(sheet.name)]

		if answer, answered := mappings[sheet.name]; answered {
			if holding := lookupAnswer(answer, holdingsById); holding == nil {
				resolution.view.Status = nameUnresolved
			} else {
				holdingId := holding.ID.Hex()
				resolution.view.Status, resolution.view.HoldingId, resolution.holding = nameConfirmed, &holdingId, holding
				resolution.saveAlias = len(matches) != 1 || matches[0].holding.ID != holding.ID
			}
			out = append(out, resolution)
			continue
		}

		switch {
		case len(matches) == 1:
			holdingId, by := matches[0].holding.ID.Hex(), matches[0].by
			resolution.view.Status, resolution.holding = nameAuto, matches[0].holding
			resolution.view.HoldingId, resolution.view.MatchedBy = &holdingId, &by
		case len(matches) > 1:
			resolution.view.Status = nameAmbiguous
			for _, match := range matches {
				resolution.view.Suggestions = append(resolution.view.Suggestions, suggestionOf(match.holding, 1))
			}
		default:
			resolution.view.Status = nameNeedsConfirmation
			resolution.view.Suggestions, resolution.view.Preselect = suggest(sheet.name, candidates)
		}
		out = append(out, resolution)
	}
	return out
}

func lookupAnswer(answer *string, holdingsById map[string]*domain.Holding) *domain.Holding {
	if answer == nil {
		return nil
	}
	return holdingsById[*answer]
}

func suggestionOf(holding *domain.Holding, score float64) api.DividendSuggestion {
	return api.DividendSuggestion{HoldingId: holding.ID.Hex(), Script: holding.Script, Symbol: holding.Symbol, Score: score}
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
	slices.SortStableFunc(out, func(first, second api.DividendSuggestion) int { return cmp.Compare(second.Score, first.Score) })
	if len(out) > maxSuggestions {
		out = out[:maxSuggestions]
	}
	if len(out) == 0 || out[0].Score < preselectScore || (len(out) > 1 && out[0].Score-out[1].Score < preselectLead) {
		return out, nil
	}
	preselectId := out[0].HoldingId
	return out, &preselectId
}

// confirmedAliases groups the names to save as aliases by holding.
func confirmedAliases(names []nameResolution) map[primitive.ObjectID][]string {
	out := map[primitive.ObjectID][]string{}
	for _, resolution := range names {
		if resolution.saveAlias && resolution.holding != nil {
			out[resolution.holding.ID] = append(out[resolution.holding.ID], exactKey(resolution.view.SheetName))
		}
	}
	return out
}
