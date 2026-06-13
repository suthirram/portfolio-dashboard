import { useEffect, useState } from 'react'
import { api, type SecurityAnswerInput, type SecurityQuestion } from '../../lib/api/client'
import { FormField, authInputStyle } from './AuthShell'

export interface AnswerDraft {
  question_id: string
  answer: string
}

export function emptyAnswers(): AnswerDraft[] {
  return [
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
    { question_id: '', answer: '' },
  ]
}

// validateAnswers mirrors the server rules so users get instant feedback:
// three distinct catalogue questions, none unanswered.
export function validateAnswers(drafts: AnswerDraft[]): string | null {
  if (drafts.some(d => !d.question_id)) return 'Pick all three security questions.'
  if (new Set(drafts.map(d => d.question_id)).size !== drafts.length) return 'Each security question must be different.'
  if (drafts.some(d => !d.answer.trim())) return 'Answer all three security questions.'
  return null
}

export function toAnswerInputs(drafts: AnswerDraft[]): SecurityAnswerInput[] {
  return drafts.map(d => ({ question_id: d.question_id, answer: d.answer.trim() }))
}

interface Props {
  value: AnswerDraft[]
  onChange: (next: AnswerDraft[]) => void
}

// Three question dropdowns + answer inputs. Questions already chosen in one
// slot disappear from the other dropdowns so duplicates are impossible.
export default function SecurityQuestionsFields({ value, onChange }: Props) {
  const [catalogue, setCatalogue] = useState<SecurityQuestion[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    api.getQuestions()
      .then(setCatalogue)
      .catch(e => setLoadError(e instanceof Error ? e.message : 'failed to load questions'))
  }, [])

  if (loadError) {
    return <div style={{ color: 'var(--red)', fontSize: 13 }}>Could not load the security questions: {loadError}</div>
  }

  const setSlot = (i: number, patch: Partial<AnswerDraft>) => {
    const next = value.map((d, idx) => (idx === i ? { ...d, ...patch } : d))
    onChange(next)
  }

  return (
    <>
      {value.map((draft, i) => {
        const takenElsewhere = new Set(value.filter((_, idx) => idx !== i).map(d => d.question_id))
        const options = catalogue.filter(q => q.id === draft.question_id || !takenElsewhere.has(q.id))
        return (
          <div key={i} style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            marginBottom: 12,
            background: 'var(--bg-card)',
          }}>
            <FormField label={`Security question ${i + 1}`}>
              <select
                value={draft.question_id}
                onChange={e => setSlot(i, { question_id: e.target.value })}
                required
                style={{ ...authInputStyle(), appearance: 'auto' }}>
                <option value="" disabled>Choose a question…</option>
                {options.map(q => (
                  <option key={q.id} value={q.id}>{q.prompt}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Your answer" hint="Not case-sensitive — extra spaces are ignored.">
              <input
                value={draft.answer}
                onChange={e => setSlot(i, { answer: e.target.value })}
                required
                autoComplete="off"
                style={authInputStyle()}
              />
            </FormField>
          </div>
        )
      })}
    </>
  )
}
