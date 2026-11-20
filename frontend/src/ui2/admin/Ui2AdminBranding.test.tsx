import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Ui2AdminBranding } from './Ui2AdminBranding'

const branding = vi.hoisted(() => ({
  font: 'roboto' as string,
  setFont: vi.fn(),
  allowed: [
    { id: 'roboto', label: 'Roboto', css_family: 'Roboto, "Roboto Fallback", Arial, sans-serif' },
    { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", "JetBrains Mono Fallback", monospace' },
  ],
}))

vi.mock('../../lib/useBranding', () => ({
  FONT_CATALOG: [],
  useBranding: () => ({
    settings: { font: branding.font, allowed_fonts: branding.allowed },
    font: branding.font,
    loading: false,
    error: null,
    setFont: branding.setFont,
  }),
}))

const show = () => render(<MemoryRouter initialEntries={['/admin/branding']}><Ui2AdminBranding /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  branding.setFont.mockResolvedValue(undefined)
})

describe('Ui2AdminBranding', () => {
  it('offers every server-allowed font with the applied one marked', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Make Portfolio feel like yours.' })).toBeInTheDocument()
    expect(screen.getByText('2 FONTS')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Applied: Roboto')
    expect(screen.getByRole('radio', { name: 'Roboto' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Apply font' })).toBeDisabled()
  })

  it('applies the chosen font for every user', async () => {
    show()
    await userEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply font' }))
    await waitFor(() => expect(branding.setFont).toHaveBeenCalledWith('jetbrains_mono'))
  })

  it('shows a save failure without losing the choice', async () => {
    const { ApiError } = await import('../../lib/api/client')
    branding.setFont.mockRejectedValueOnce(new ApiError(403, 'super admin only'))
    show()
    await userEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply font' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('super admin only')
    expect(screen.getByRole('radio', { name: 'JetBrains Mono' })).toBeChecked()
  })
})
