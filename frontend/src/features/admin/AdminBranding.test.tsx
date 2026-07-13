import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminBranding from './AdminBranding'

const mockBranding = vi.hoisted(() => ({
  setFont: vi.fn(),
  state: {
    settings: {
      font: 'roboto',
      allowed_fonts: [
        { id: 'roboto', label: 'Roboto', css_family: 'Roboto, Arial, sans-serif' },
        { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", monospace' },
      ],
    },
    font: 'roboto',
    loading: false,
    error: null,
    refresh: vi.fn(),
  },
}))

vi.mock('../../lib/useBranding', () => ({
  useBranding: () => ({
    ...mockBranding.state,
    setFont: mockBranding.setFont,
  }),
}))

vi.mock('./AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('AdminBranding', () => {
  it('renders the allowed font choices and marks the active font', () => {
    render(<AdminBranding />)

    expect(screen.getByRole('heading', { name: 'Branding' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Roboto' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'JetBrains Mono' })).toHaveAttribute('aria-checked', 'false')
  })

  it('saves a new font choice', async () => {
    mockBranding.setFont.mockResolvedValue(undefined)

    render(<AdminBranding />)
    fireEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))

    await waitFor(() => expect(mockBranding.setFont).toHaveBeenCalledWith('jetbrains_mono'))
  })
})
