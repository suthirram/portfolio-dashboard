import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type BrandingFont, type BrandingSettings } from './api/client'

const STORAGE_KEY = 'pd_brand_font'
const DEFAULT_FONT: BrandingFont = 'roboto'

const FONT_STACKS: Record<BrandingFont, string> = {
  roboto: 'Roboto, Arial, sans-serif',
  jetbrains_mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

function normaliseFont(raw: unknown): BrandingFont {
  return raw === 'jetbrains_mono' || raw === 'roboto' ? raw : DEFAULT_FONT
}

function readStoredFont(): BrandingFont {
  if (typeof window === 'undefined') return DEFAULT_FONT
  try {
    return normaliseFont(window.localStorage?.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_FONT
  }
}

function storeFont(font: BrandingFont) {
  try { window.localStorage?.setItem(STORAGE_KEY, font) } catch { /* private mode / jsdom */ }
}

function stackFor(font: BrandingFont, settings: BrandingSettings | null): string {
  return settings?.allowed_fonts.find(f => f.id === font)?.css_family ?? FONT_STACKS[font]
}

export function applyBrandFont(font: BrandingFont, cssFamily = FONT_STACKS[font]) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.brandFont = font
  document.documentElement.style.setProperty('--brand-font-family', cssFamily)
}

export function initBranding() {
  applyBrandFont(readStoredFont())
}

interface BrandingContextValue {
  settings: BrandingSettings | null
  font: BrandingFont
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setFont: (font: BrandingFont) => Promise<void>
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BrandingSettings | null>(null)
  const [font, setFontState] = useState<BrandingFont>(readStoredFont)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    applyBrandFont(font, stackFor(font, settings))
    storeFont(font)
  }, [font, settings])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await api.getBranding()
      setSettings(next)
      setFontState(next.font)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load branding')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const updateFont = useCallback(async (nextFont: BrandingFont) => {
    setError(null)
    const next = await api.adminUpdateBranding({ font: nextFont })
    setSettings(next)
    setFontState(next.font)
  }, [])

  const value = useMemo<BrandingContextValue>(() => ({
    settings,
    font,
    loading,
    error,
    refresh,
    setFont: updateFont,
  }), [settings, font, loading, error, refresh, updateFont])

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  const ctx = useContext(BrandingContext)
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider')
  return ctx
}
