import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrandingProvider, initBranding, useBranding } from './useBranding'

const mockApi = vi.hoisted(() => ({
  getBranding: vi.fn(),
  adminUpdateBranding: vi.fn(),
}))

vi.mock('./api/client', () => ({ api: mockApi }))

const settings = (font: 'roboto' | 'jetbrains_mono') => ({
  font,
  allowed_fonts: [
    { id: 'roboto', label: 'Roboto', css_family: 'Roboto, Arial, sans-serif' },
    { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", monospace' },
  ],
})

function installLocalStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
      clear: () => { values.clear() },
    },
  })
}

function Probe() {
  const branding = useBranding()
  return (
    <div>
      <span data-testid="font">{branding.font}</span>
      <button onClick={() => void branding.setFont('jetbrains_mono')}>JetBrains Mono</button>
    </div>
  )
}

describe('useBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installLocalStorage()
    document.documentElement.removeAttribute('data-brand-font')
    document.documentElement.style.removeProperty('--brand-font-family')
  })

  it('applies the cached font before React mounts', () => {
    window.localStorage.setItem('pd_brand_font', 'jetbrains_mono')
    initBranding()
    expect(document.documentElement.dataset.brandFont).toBe('jetbrains_mono')
    expect(document.documentElement.style.getPropertyValue('--brand-font-family')).toContain('JetBrains Mono')
  })

  it('loads branding settings and applies the server font', async () => {
    mockApi.getBranding.mockResolvedValue(settings('jetbrains_mono'))

    render(<BrandingProvider><Probe /></BrandingProvider>)

    await waitFor(() => expect(screen.getByTestId('font')).toHaveTextContent('jetbrains_mono'))
    expect(document.documentElement.dataset.brandFont).toBe('jetbrains_mono')
    expect(window.localStorage.getItem('pd_brand_font')).toBe('jetbrains_mono')
  })

  it('updates branding through the admin endpoint', async () => {
    mockApi.getBranding.mockResolvedValue(settings('roboto'))
    mockApi.adminUpdateBranding.mockResolvedValue(settings('jetbrains_mono'))

    render(<BrandingProvider><Probe /></BrandingProvider>)
    await waitFor(() => expect(screen.getByTestId('font')).toHaveTextContent('roboto'))

    fireEvent.click(screen.getByRole('button', { name: 'JetBrains Mono' }))

    await waitFor(() => expect(screen.getByTestId('font')).toHaveTextContent('jetbrains_mono'))
    expect(mockApi.adminUpdateBranding).toHaveBeenCalledWith({ font: 'jetbrains_mono' })
  })
})
