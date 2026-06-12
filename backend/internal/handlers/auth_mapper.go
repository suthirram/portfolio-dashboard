package handlers

import (
	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
)

func authUserToAPI(user auth.User) api.AuthUser {
	id := user.ID.Hex()
	role := api.AuthUserRole(user.Role)
	disabled := user.Disabled
	locked := user.Locked
	loginFailures := user.LoginFailures
	securityFailures := user.SecurityQuestionFailures
	mustChange := user.MustChangePassword

	out := api.AuthUser{
		Id:                       &id,
		Username:                 &user.UsernameDisplay,
		Name:                     &user.Name,
		Role:                     &role,
		Disabled:                 &disabled,
		Locked:                   &locked,
		LoginFailures:            &loginFailures,
		SecurityQuestionFailures: &securityFailures,
		MustChangePassword:       &mustChange,
		CreatedAt:                &user.CreatedAt,
		UpdatedAt:                &user.UpdatedAt,
		LastLoginAt:              user.LastLoginAt,
	}
	if user.Region != "" {
		region := api.AuthUserRegion(user.Region)
		out.Region = &region
	}
	return out
}

func regionToAPI(region auth.Region) api.Region {
	return api.Region{
		Id:    api.RegionId(region.ID),
		Label: region.Label,
	}
}

func securityQuestionToAPI(question auth.SecurityQuestion) api.SecurityQuestion {
	return api.SecurityQuestion{Id: question.ID, Prompt: question.Prompt}
}

func securityAnswerInputsFromAPI(inputs []api.SecurityAnswerInput) []auth.SecurityAnswerInput {
	out := make([]auth.SecurityAnswerInput, 0, len(inputs))
	for _, input := range inputs {
		out = append(out, auth.SecurityAnswerInput{
			QuestionID: input.QuestionId,
			Answer:     input.Answer,
		})
	}
	return out
}

func userQuestionsToAPI(user auth.User) []api.SecurityQuestion {
	out := make([]api.SecurityQuestion, 0, len(user.SecurityQuestions))
	for _, answer := range user.SecurityQuestions {
		if question, ok := auth.SecurityQuestionByID(answer.QuestionID); ok {
			out = append(out, securityQuestionToAPI(question))
		}
	}
	return out
}

func messageResponse(message string) api.MessageResponse {
	return api.MessageResponse{Message: &message}
}
