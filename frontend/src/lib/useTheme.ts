import { useEffect, useState } from 'react'

// useTheme owns the global theme for the app. The current value is
// mirrored to <html data-theme="..."> so CSS rules in the styles layer
// can flip variables without React having to thread props through every
// component. Persisted to localStorage so the choice survives a reload.
//
// Added in PD-042 PR7 (initially a /history-local toggle, then promoted
// to global per the design review note "if simple give it for entire
// app"). PD-046 adds the premium-only cyberpunk theme: callers pass
// `premium` (from the session user) and toggle() cycles through the
// themes that account is entitled to. `premium: false` also acts as the
// revocation fallback — a stored cyberpunk theme downgrades to dark.

export type ThemeName = 'light' | 'dark' | 'cyberpunk'

const STORAGE_KEY = 'pd_theme'
// Set the moment the user explicitly picks a theme (toggle or set). The
// current theme is persisted passively on every mount, so key presence
// alone can't distinguish "chose dark" from "never chose anything" — and
// the premium cyber default must only apply to the latter.
const CHOSEN_KEY = 'pd_theme_chosen'
const THEMES: ThemeName[] = ['dark', 'light', 'cyberpunk']

function readStored(): ThemeName {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = window.localStorage?.getItem(STORAGE_KEY)
    return THEMES.includes(v as ThemeName) ? (v as ThemeName) : 'dark'
  } catch {
    // jsdom or private-mode browsers may throw — default to dark.
    return 'dark'
  }
}

function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

// In-memory shadow of the chosen marker so an explicit pick still sticks
// for the session when localStorage is unavailable (private mode, jsdom).
let chosenThisSession = false

function themeChosen(): boolean {
  if (chosenThisSession) return true
  try { return window.localStorage?.getItem(CHOSEN_KEY) === '1' } catch { return false }
}

function markThemeChosen() {
  chosenThisSession = true
  try { window.localStorage?.setItem(CHOSEN_KEY, '1') } catch { /* private mode / jsdom */ }
}

// Test-only: clears the in-memory marker between cases.
export function __resetThemeChoiceForTests() {
  chosenThisSession = false
}

export interface UseThemeOptions {
  /** Cyberpunk entitlement. true = offer it in the toggle cycle; false =
   * hide it AND downgrade a stored cyberpunk theme to dark (flag revoked);
   * undefined = unknown (user not loaded) — don't offer, don't downgrade. */
  premium?: boolean
}

// initTheme applies the stored theme at app boot so pages that don't mount
// useTheme (login, signup) still render in the chosen theme. Safe to call
// once from main.tsx before React renders.
export function initTheme() {
  applyTheme(readStored())
}

// nextThemeLabel names the theme toggle() switches to, for button labels.
export function nextThemeLabel(theme: ThemeName, premium?: boolean): string {
  if (theme === 'dark') return '☀ Light'
  if (theme === 'light' && premium) return '⚡ Cyber'
  return '🌙 Dark'
}

export function useTheme(opts: UseThemeOptions = {}): { theme: ThemeName; toggle: () => void; set: (t: ThemeName) => void } {
  const { premium } = opts
  const [theme, setTheme] = useState<ThemeName>(readStored)

  useEffect(() => {
    applyTheme(theme)
    try { window.localStorage?.setItem(STORAGE_KEY, theme) } catch { /* private mode / jsdom */ }
  }, [theme])

  // Entitlement fallback: an explicitly non-premium account never renders
  // cyberpunk, even if it was stored while the flag was on.
  useEffect(() => {
    if (premium === false && theme === 'cyberpunk') setTheme('dark')
  }, [premium, theme])

  // Premium default: an account with the flag and no explicit theme choice
  // lands on cyberpunk. Once the user picks any theme the marker blocks
  // this permanently.
  useEffect(() => {
    if (premium && !themeChosen() && theme !== 'cyberpunk') setTheme('cyberpunk')
  }, [premium, theme])

  const cycle = premium ? THEMES : THEMES.filter(t => t !== 'cyberpunk')

  return {
    theme,
    toggle: () => {
      markThemeChosen()
      setTheme(t => {
        const i = cycle.indexOf(t)
        return cycle[(i + 1) % cycle.length] ?? 'dark'
      })
    },
    set: (t: ThemeName) => {
      markThemeChosen()
      setTheme(t)
    },
  }
}
