export interface ProfileUpdateUser {
  name?: string | null
  username?: string | null
}

export interface SecurityAnswerDraft {
  question_id?: string | null
  answer?: string | null
}

export interface ProfileUpdatePlan {
  error: string
  profile: {
    current_password: string
    name: string
    username: string
  } | null
  password: {
    current_password: string
    new_password: string
  } | null
  securityQuestions: {
    current_password: string
    security_questions: Array<{ question_id: string; answer: string }>
  } | null
}

export const securityAnswerInputType = 'text'

export function planProfileUpdates({
  user,
  currentPassword,
  name,
  username,
  newPassword,
  answers,
  forced,
}: {
  user: ProfileUpdateUser
  currentPassword: string
  name: string
  username: string
  newPassword: string
  answers: SecurityAnswerDraft[]
  forced: boolean
}): ProfileUpdatePlan {
  const nextName = name.trim()
  const nextUsername = username.trim()
  const currentName = (user.name || '').trim()
  const currentUsername = (user.username || '').trim()
  const profileChanged = nextName !== currentName || nextUsername !== currentUsername
  const passwordChanged = newPassword.trim().length > 0
  const hasSecurityAnswerInput = answers.some(answer => (answer.answer || '').trim().length > 0)
  const updateSecurityQuestions = forced || hasSecurityAnswerInput
  const hasChanges = profileChanged || passwordChanged || updateSecurityQuestions

  if (!hasChanges) {
    return emptyPlan('Make a change before saving.')
  }
  if (!currentPassword.trim()) {
    return emptyPlan('Current password is required.')
  }
  if (forced && !passwordChanged) {
    return emptyPlan('Enter a new password.')
  }
  if (updateSecurityQuestions) {
    const questionError = validateSecurityAnswers(answers)
    if (questionError) return emptyPlan(questionError)
  }

  return {
    error: '',
    profile: profileChanged
      ? { current_password: currentPassword, name: nextName, username: nextUsername }
      : null,
    password: passwordChanged
      ? { current_password: currentPassword, new_password: newPassword }
      : null,
    securityQuestions: updateSecurityQuestions
      ? {
          current_password: currentPassword,
          security_questions: answers.map(answer => ({
            question_id: answer.question_id || '',
            answer: answer.answer || '',
          })),
        }
      : null,
  }
}

function validateSecurityAnswers(answers: SecurityAnswerDraft[]) {
  if (answers.length !== 3 || answers.some(answer => !answer.question_id || !(answer.answer || '').trim())) {
    return 'Choose three security questions and answer each one.'
  }
  if (new Set(answers.map(answer => answer.question_id)).size !== answers.length) {
    return 'Choose three different security questions.'
  }
  return ''
}

function emptyPlan(error: string): ProfileUpdatePlan {
  return {
    error,
    profile: null,
    password: null,
    securityQuestions: null,
  }
}
