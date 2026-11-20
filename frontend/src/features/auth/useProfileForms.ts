import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'

export interface QAState { questionId: string; answer: string }
export type FormMessage = { kind: 'ok' | 'err'; text: string } | null

const emptyAnswers = (): QAState[] => [
  { questionId: '', answer: '' },
  { questionId: '', answer: '' },
  { questionId: '', answer: '' },
]

// useProfileForms owns the three account forms for every interface
// (PD-059 slice 25): profile details, password, security questions. Each
// form keeps its own fields, message and saving flag; every write needs the
// current password and goes through the same API calls and rules.
export function useProfileForms() {
  const { user, refresh } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMsg, setProfileMsg] = useState<FormMessage>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState<FormMessage>(null)
  const [savingPw, setSavingPw] = useState(false)

  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [qas, setQas] = useState<QAState[]>(emptyAnswers)
  const [sqPassword, setSqPassword] = useState('')
  const [sqMsg, setSqMsg] = useState<FormMessage>(null)
  const [savingSQ, setSavingSQ] = useState(false)

  useEffect(() => {
    void api.getQuestions().then(setQuestions).catch(console.error)
  }, [])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    setSavingProfile(true)
    try {
      await api.updateProfile({
        name: name.trim(),
        username: username.trim(),
        current_password: profilePassword,
      })
      setProfilePassword('')
      await refresh()
      setProfileMsg({ kind: 'ok', text: 'Profile updated.' })
    } catch (error) {
      setProfileMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to update' })
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 8) { setPwMsg({ kind: 'err', text: 'New password must be at least 8 chars' }); return }
    if (newPw !== newPwConfirm) { setPwMsg({ kind: 'err', text: 'Passwords do not match' }); return }
    setSavingPw(true)
    try {
      await api.updatePassword({ current_password: currentPw, new_password: newPw })
      setCurrentPw(''); setNewPw(''); setNewPwConfirm('')
      setPwMsg({ kind: 'ok', text: 'Password changed. Other sessions were signed out.' })
    } catch (error) {
      setPwMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to change password' })
    } finally {
      setSavingPw(false)
    }
  }

  const usedIds = new Set(qas.map(qa => qa.questionId).filter(Boolean))
  const updateQA = (index: number, patch: Partial<QAState>) =>
    setQas(previous => previous.map((qa, position) => (position === index ? { ...qa, ...patch } : qa)))

  const saveQuestions = async (e: FormEvent) => {
    e.preventDefault()
    setSqMsg(null)
    if (qas.some(qa => !qa.questionId || !qa.answer.trim())) { setSqMsg({ kind: 'err', text: 'All three are required' }); return }
    if (new Set(qas.map(qa => qa.questionId)).size !== 3) { setSqMsg({ kind: 'err', text: 'Choose three different questions' }); return }
    setSavingSQ(true)
    try {
      await api.updateSecurityQs({
        current_password: sqPassword,
        security_answers: qas.map(qa => ({ question_id: qa.questionId, answer: qa.answer })),
      })
      setSqPassword('')
      setQas(emptyAnswers())
      setSqMsg({ kind: 'ok', text: 'Security questions updated.' })
    } catch (error) {
      setSqMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to update' })
    } finally {
      setSavingSQ(false)
    }
  }

  return {
    user,
    profile: { name, setName, username, setUsername, password: profilePassword, setPassword: setProfilePassword, msg: profileMsg, saving: savingProfile, save: saveProfile },
    password: { current: currentPw, setCurrent: setCurrentPw, next: newPw, setNext: setNewPw, confirm: newPwConfirm, setConfirm: setNewPwConfirm, msg: pwMsg, saving: savingPw, save: changePassword },
    security: { questions, qas, usedIds, updateQA, password: sqPassword, setPassword: setSqPassword, msg: sqMsg, saving: savingSQ, save: saveQuestions },
  }
}
