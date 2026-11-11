import { useEffect } from 'react'
import { useAuthOptional } from '../features/auth/AuthContext'

// The glass UI (PD-054) is a per-account switch the super admin flips in
// the admin panel (`user.ui_revamp`). It is mirrored to
// <html data-ui="v2"> so every v2 rule in styles/glass.css is scoped under
// that attribute and the current UI stays byte-for-byte as it is for
// everyone else. The last account's choice is kept in localStorage, so the
// login screen after a logout (and the first paint before /auth/me
// answers) keeps the look that account had.

export const UI_V2 = 'v2'
const STORAGE_KEY = 'pd_ui'

export function applyUiMode(revamp: boolean) {
  if (typeof document === 'undefined') return
  if (revamp) document.documentElement.dataset.ui = UI_V2
  else delete document.documentElement.dataset.ui
  try { window.localStorage?.setItem(STORAGE_KEY, revamp ? UI_V2 : '') } catch { /* private mode / jsdom */ }
}

// initUiMode applies the stored mode before first paint (main.tsx).
export function initUiMode() {
  let stored: string | null = null
  try { stored = window.localStorage?.getItem(STORAGE_KEY) ?? null } catch { /* private mode / jsdom */ }
  if (stored === UI_V2) document.documentElement.dataset.ui = UI_V2
}

// isUiV2 reads the live mode, for code outside React (notify).
export function isUiV2(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.ui === UI_V2
}

// useUiRevamp is true when the signed-in account has the glass UI.
export function useUiRevamp(): boolean {
  return Boolean(useAuthOptional()?.user?.ui_revamp)
}

// UiModeSync keeps <html data-ui> in step with the signed-in account. While
// signed out it leaves the stored mode alone.
export function UiModeSync() {
  const auth = useAuthOptional()
  const user = auth?.user
  const loading = auth?.loading ?? true
  useEffect(() => {
    if (!loading && user) applyUiMode(Boolean(user.ui_revamp))
  }, [loading, user])
  return null
}
