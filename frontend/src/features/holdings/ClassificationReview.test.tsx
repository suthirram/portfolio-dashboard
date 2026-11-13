import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api/client'
import type { Holding, ProfileLookup } from '../../types'
import ClassificationReview from './ClassificationReview'
import AddEditModal from './AddEditModal'
import ProfilePreview from './ProfilePreview'

vi.mock('../../lib/api/client', () => ({ api: {
  getMarketProfile: vi.fn(), confirmClassification: vi.fn(), createHolding: vi.fn(), updateHolding: vi.fn(), getMarketPrice: vi.fn(),
} }))
const pending: Holding = { id: 'holding-1', script: 'Fund', symbol: 'FUND', currency: 'INR', type: 'etf',
  classification: { symbol: 'FUND', status: 'needs_review', suggested_type: 'etf' } }
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('profile preview', () => {
  it('debounces and ignores late responses for earlier symbols', async () => {
    vi.useFakeTimers()
    let resolveOld!: (profile: ProfileLookup) => void
    vi.mocked(api.getMarketProfile).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce({ symbol: 'NEW', lookup_status: 'found', sector: 'Energy' })
    const { rerender } = render(<ProfilePreview symbol="OLD" />)
    await act(() => vi.advanceTimersByTimeAsync(349))
    expect(api.getMarketProfile).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    rerender(<ProfilePreview symbol="NEW" />)
    expect(screen.queryByText(/Technology/)).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(350))
    expect(screen.getByText('Yahoo: Energy')).toBeInTheDocument()
    await act(async () => resolveOld({ symbol: 'OLD', lookup_status: 'found', sector: 'Technology' }))
    expect(screen.getByText('Yahoo: Energy')).toBeInTheDocument()
    expect(screen.queryByText(/Technology/)).not.toBeInTheDocument()
  })
})

describe('classification review', () => {
  it('requires an explicit fund confirmation and routes it to the act-as owner', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(api.confirmClassification).mockResolvedValue({ ...pending, classification: { symbol: 'FUND', source: 'user', status: 'resolved' } })
    render(<ClassificationReview holding={pending} ownerHoldings={[]} userId="owner-2" onClose={vi.fn()} onConfirmed={onConfirmed} />)
    expect(screen.queryByLabelText('Sector')).not.toBeInTheDocument()
    expect(api.confirmClassification).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm classification' }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(api.confirmClassification).toHaveBeenCalledWith('holding-1', { type: 'etf', sector: null }, 'owner-2')
  })

  it('uses only owner labels, keeps typed values after errors and permits unclassified stocks', async () => {
    const owner: Holding = { ...pending, type: 'stock', classification: { symbol: 'FUND', status: 'resolved', sector: 'Technology' } }
    vi.mocked(api.confirmClassification).mockRejectedValueOnce(new Error('reload and retry')).mockResolvedValueOnce(owner)
    render(<ClassificationReview holding={{ ...pending, type: 'stock' }} ownerHoldings={[owner]} onClose={vi.fn()} onConfirmed={vi.fn()} />)
    expect(document.querySelector('datalist option')).toHaveValue('Technology')
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'FMCG' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm classification' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('reload and retry')
    expect(screen.getByLabelText('Sector')).toHaveValue('FMCG')
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm classification' }))
    await waitFor(() => expect(api.confirmClassification).toHaveBeenLastCalledWith('holding-1', { type: 'stock', sector: null }, undefined))
  })

  it('traps focus, dismisses with Escape and restores the invoking control', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger); trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(<ClassificationReview holding={pending} ownerHoldings={[]} onClose={onClose} onConfirmed={vi.fn()} />)
    expect(screen.getByLabelText('Holding type')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Confirm classification' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByLabelText('Holding type')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(api.confirmClassification).not.toHaveBeenCalled()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('saves once, then allows review later without a second holding creation', async () => {
    const onSaved = vi.fn()
    vi.mocked(api.createHolding).mockResolvedValue(pending)
    render(<AddEditModal holding={null} ownerHoldings={[]} onClose={vi.fn()} onSaved={onSaved} userId="owner-2" />)
    fireEvent.change(screen.getByLabelText('Script Name *'), { target: { value: 'Fund' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Holding' }))
    expect(await screen.findByRole('dialog', { name: 'Review classification' })).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Review later' }))
    expect(onSaved).toHaveBeenCalledWith(pending)
    expect(api.createHolding).toHaveBeenCalledOnce()
    expect(api.confirmClassification).not.toHaveBeenCalled()
  })

  it('retains entered holding fields when saving fails and supports mutual fund input', async () => {
    vi.mocked(api.createHolding).mockRejectedValueOnce(new Error('save failed'))
    render(<AddEditModal holding={null} ownerHoldings={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Script Name *'), { target: { value: 'My fund' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'mutual_fund' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Holding' }))
    expect(await screen.findByText('save failed')).toBeInTheDocument()
    expect(screen.getByLabelText('Script Name *')).toHaveValue('My fund')
    expect(screen.getByLabelText('Type')).toHaveValue('mutual_fund')
  })

  it('confirms a newly saved holding by id without creating it again', async () => {
    const onSaved = vi.fn()
    vi.mocked(api.createHolding).mockResolvedValue(pending)
    const confirmed = { ...pending, classification: { symbol: 'FUND', status: 'resolved' as const, source: 'user' as const } }
    vi.mocked(api.confirmClassification).mockResolvedValue(confirmed)
    render(<AddEditModal holding={null} onClose={vi.fn()} onSaved={onSaved} userId="owner-2" />)
    fireEvent.change(screen.getByLabelText('Script Name *'), { target: { value: 'Fund' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Holding' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm classification' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(confirmed))
    expect(api.createHolding).toHaveBeenCalledOnce()
    expect(api.confirmClassification).toHaveBeenCalledWith('holding-1', { type: 'etf', sector: null }, 'owner-2')
  })

  it('lets an existing resolved holding open classification review after saving edits', async () => {
    const saved = { ...pending, type: 'stock' as const, classification: { symbol: 'FUND', status: 'resolved' as const, sector: 'Technology' } }
    vi.mocked(api.updateHolding).mockResolvedValue(saved)
    render(<AddEditModal holding={saved} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'keep these notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and review classification' }))
    expect(await screen.findByRole('dialog', { name: 'Review classification' })).toBeInTheDocument()
    expect(api.updateHolding).toHaveBeenCalledWith('holding-1', expect.objectContaining({ notes: 'keep these notes' }), undefined)
    expect(screen.getByLabelText('Sector')).toHaveValue('Technology')
    expect(api.createHolding).not.toHaveBeenCalled()
  })
})
