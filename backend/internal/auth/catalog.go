package auth

type Region struct {
	ID    string
	Label string
}

type SecurityQuestion struct {
	ID     string
	Prompt string
}

const (
	RegionIndia  = "india"
	RegionEurope = "europe"
	RegionUS     = "us"
)

var regions = []Region{
	{ID: RegionIndia, Label: "India"},
	{ID: RegionEurope, Label: "Europe"},
	{ID: RegionUS, Label: "US"},
}

var securityQuestions = []SecurityQuestion{
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

func Regions() []Region {
	out := make([]Region, len(regions))
	copy(out, regions)
	return out
}

func ValidRegion(id string) bool {
	for _, region := range regions {
		if region.ID == id {
			return true
		}
	}
	return false
}

func SecurityQuestions() []SecurityQuestion {
	out := make([]SecurityQuestion, len(securityQuestions))
	copy(out, securityQuestions)
	return out
}

func SecurityQuestionByID(id string) (SecurityQuestion, bool) {
	for _, question := range securityQuestions {
		if question.ID == id {
			return question, true
		}
	}
	return SecurityQuestion{}, false
}
