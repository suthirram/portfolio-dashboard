import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// Whether the signed-in account has the glass UI (PD-054).
const glass = vi.hoisted(() => ({ on: false }))
vi.mock('../../lib/uiMode', () => ({ useUiRevamp: () => glass.on }))

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

describe('AdminBranding in the glass UI', () => {
  beforeEach(() => { glass.on = true })
  afterEach(() => {
    glass.on = false
    mockBranding.state.error = null
  })

  it('lists the branding groups and shows the fonts as preview tiles', () => {
    render(<AdminBranding />)
    const groups = screen.getByRole('complementary', { name: 'Branding settings' })
    expect(within(groups).getByRole('button', { name: /Font/ })).toHaveAttribute('aria-current', 'true')
    expect(within(groups).getByText('Roboto')).toBeInTheDocument() // the current font, under the group
    const tiles = screen.getByRole('radiogroup', { name: 'Brand font' })
    expect(within(tiles).getByRole('radio', { name: 'Roboto' })).toHaveAttribute('aria-checked', 'true')
    expect(within(tiles).getByRole('radio', { name: 'JetBrains Mono' })).toHaveAttribute('aria-checked', 'false')
  })

  it('saves a new font from its tile', async () => {
    mockBranding.setFont.mockResolvedValue(undefined)
    render(<AdminBranding />)
    fireEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))
    await waitFor(() => expect(mockBranding.setFont).toHaveBeenCalledWith('jetbrains_mono'))
  })

  it('shows a load error above the tiles', () => {
    mockBranding.state.error = 'Could not load branding' as unknown as null
    render(<AdminBranding />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load branding')
  })
})
