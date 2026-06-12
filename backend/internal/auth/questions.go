package auth

// SecurityQuestion is one entry of the fixed security-question catalogue.
// Only the ID is ever stored on a user document; prompts live here so a
// database read reveals no user-entered hints (DD-001 §12).
type SecurityQuestion struct {
	ID     string `json:"id"`
	Prompt string `json:"prompt"`
}

// questions is the single source of truth for the question catalogue.
var questions = []SecurityQuestion{
	{ID: "favourite_movie", Prompt: "What is a movie you can watch over and over again?"},
	{ID: "favourite_book", Prompt: "What is a book that left a lasting impression on you?"},
	{ID: "first_programming_lang", Prompt: "What was the first programming language you learned?"},
	{ID: "favourite_editor", Prompt: "Which code editor or IDE do you prefer?"},
	{ID: "favourite_food", Prompt: "What dish would you never get tired of?"},
	{ID: "favourite_game", Prompt: "What game did you spend the most hours playing?"},
	{ID: "dream_destination", Prompt: "What place have you always wanted to visit?"},
	{ID: "favourite_cartoon", Prompt: "Which cartoon do you remember most from childhood?"},
	{ID: "first_job", Prompt: "What was your first paid job title?"},
	{ID: "favourite_subject", Prompt: "Which school subject did you enjoy the most?"},
}

// SecurityQuestions returns the question catalogue in display order.
func SecurityQuestions() []SecurityQuestion {
	out := make([]SecurityQuestion, len(questions))
	copy(out, questions)
	return out
}

// ValidQuestionID reports whether id names a question in the catalogue.
func ValidQuestionID(id string) bool {
	for _, q := range questions {
		if q.ID == id {
			return true
		}
	}
	return false
}

// QuestionPrompt returns the prompt for a catalogue question id, or "" if
// the id is unknown.
func QuestionPrompt(id string) string {
	for _, q := range questions {
		if q.ID == id {
			return q.Prompt
		}
	}
	return ""
}
