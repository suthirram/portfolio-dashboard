import { useEffect } from 'react'
import { useAuthOptional } from '../features/auth/AuthContext'
import type { User } from './api/client'

// The account's interface (PD-059) is a per-account value the super admin
// sets in the admin panel (`user.ui_mode`): classic, glass (PD-054) or ui2.
// It is mirrored to <html data-ui>: "v2" for glass (every rule in
// styles/glass.css is scoped under it), "ui2" for UI_2.0 (ui2/ui2.css), and
// no attribute for classic. The last account's value is kept in
// localStorage, so the login screen after a logout (and the first paint
// before /auth/me answers) keeps the look that account had.

export type UiMode = User['ui_mode']

export const UI_V2 = 'v2'
export const UI_2 = 'ui2'
const STORAGE_KEY = 'pd_ui'
const ATTRIBUTE: Record<UiMode, string> = { classic: '', glass: UI_V2, ui2: UI_2 }

export const UI_MODE_LABELS: Record<UiMode, string> = { classic: 'Classic', glass: 'Glass', ui2: 'UI_2.0' }

export function applyUiMode(mode: UiMode) {
  if (typeof document === 'undefined') return
  const attribute = ATTRIBUTE[mode] ?? ''
  if (attribute) document.documentElement.dataset.ui = attribute
  else delete document.documentElement.dataset.ui
  try { window.localStorage?.setItem(STORAGE_KEY, attribute) } catch { /* private mode / jsdom */ }
}

// initUiMode applies the stored mode before first paint (main.tsx).
export function initUiMode() {
  let stored: string | null = null
  try { stored = window.localStorage?.getItem(STORAGE_KEY) ?? null } catch { /* private mode / jsdom */ }
  if (stored === UI_V2 || stored === UI_2) document.documentElement.dataset.ui = stored
}

// isUiV2 reads the live glass mode, for code outside React (notify).
export function isUiV2(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.ui === UI_V2
}

// useUiRevamp is true when the signed-in account has the glass UI.
export function useUiRevamp(): boolean {
  return Boolean(useAuthOptional()?.user?.ui_revamp)
}

// useUiMode is the signed-in account's interface; classic while signed out.
export function useUiMode(): UiMode {
  return useAuthOptional()?.user?.ui_mode ?? 'classic'
}

// UiModeSync keeps <html data-ui> in step with the signed-in account. While
// signed out it leaves the stored mode alone.
export function UiModeSync() {
  const auth = useAuthOptional()
  const user = auth?.user
  const loading = auth?.loading ?? true
  useEffect(() => {
    if (!loading && user) applyUiMode(user.ui_mode ?? 'classic')
  }, [loading, user])
  return null
}
