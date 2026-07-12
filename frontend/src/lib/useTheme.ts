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

  const cycle = premium ? THEMES : THEMES.filter(t => t !== 'cyberpunk')

  return {
    theme,
    toggle: () => setTheme(t => {
      const i = cycle.indexOf(t)
      return cycle[(i + 1) % cycle.length] ?? 'dark'
    }),
    set: setTheme,
  }
}
