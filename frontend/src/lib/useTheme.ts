import { useEffect, useState } from 'react'

// useTheme owns the global light/dark mode for the app. The current
// value is mirrored to <html data-theme="..."> so CSS rules in
// index.css can flip variables without React having to thread props
// through every component. Persisted to localStorage so the choice
// survives a reload.
//
// Added in PD-042 PR7 (initially a /history-local toggle, then
// promoted to global per the design review note "if simple give it
// for entire app").

export type ThemeName = 'light' | 'dark'

const STORAGE_KEY = 'pd_theme'

function readStored(): ThemeName {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = window.localStorage?.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'dark'
  } catch {
    // jsdom or private-mode browsers may throw — default to dark.
    return 'dark'
  }
}

function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function useTheme(): { theme: ThemeName; toggle: () => void; set: (t: ThemeName) => void } {
  const [theme, setTheme] = useState<ThemeName>(readStored)

  useEffect(() => {
    applyTheme(theme)
    try { window.localStorage?.setItem(STORAGE_KEY, theme) } catch { /* private mode / jsdom */ }
  }, [theme])

  return {
    theme,
    toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
    set: setTheme,
  }
}
