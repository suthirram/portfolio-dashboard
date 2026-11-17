// Every modal keeps keyboard focus inside itself and closes on Escape
// (PD-058 Task 1). One table so a new modal is one more row.
import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DividendRow, Holding, HoldingWithPrice } from '../types'
import type { HistoryRow } from '../lib/api/client'
import { AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal } from './history/HistoryModals'
import TransactionsModal from './holdings/TransactionsModal'
import OpeningDateModal from './holdings/OpeningDateModal'
import GoldTxnModal from './gold/GoldTxnModal'
import MissingPricesModal from './gold/MissingPricesModal'
import DividendModal, { DeleteDividendDialog } from './dividends/DividendModal'
import DeleteAllDialog from './dividends/DeleteAllDialog'
import DividendImportModal from './dividends/DividendImportModal'
import TradeImportModal from './transactions/TradeImportModal'
import NameConfirmDialog from './imports/NameConfirmDialog'

vi.mock('../lib/api/client', () => ({
  api: { listTransactions: vi.fn().mockResolvedValue([]) },
  ApiError: class extends Error {},
}))

const historyRow = { date: '2026-11-03', regions: {}, holdings: [] } as unknown as HistoryRow
const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as Holding
const dividendRow = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1' } as DividendRow

const modals: Array<[string, (close: () => void) => ReactElement]> = [
  ['AddRowModal', close => <AddRowModal onSubmit={async () => {}} onCancel={close} />],
  ['EditRowModal', close => <EditRowModal row={historyRow} onSubmit={async () => {}} onCancel={close} />],
  ['PasteModal', close => <PasteModal monthLabel="2026-11" onSubmit={async () => ({ applied: [], conflicts: [], rejected: [] })} onCancel={close} />],
  ['ConflictDialog', close => <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={close} />],
  ['HoldingsModal', close => <HoldingsModal row={historyRow} prev={null} region="INR" onClose={close} />],
  ['TransactionsModal', close => <TransactionsModal holding={holding as HoldingWithPrice} onClose={close} onChanged={() => {}} />],
  ['OpeningDateModal', close => <OpeningDateModal holdings={[holding]} onSkip={close} onSaved={() => {}} />],
  ['GoldTxnModal', close => <GoldTxnModal txn={null} onClose={close} onSaved={() => {}} />],
  ['MissingPricesModal', close => <MissingPricesModal missing={['2026-11-01']} onSkip={close} onSaved={() => {}} />],
  ['DividendModal', close => <DividendModal currency="INR" holdings={[]} editing={null} onClose={close} onSaved={() => {}} />],
  ['DeleteDividendDialog', close => <DeleteDividendDialog row={dividendRow} currency="INR" onClose={close} onDeleted={() => {}} />],
  ['DeleteAllDialog', close => <DeleteAllDialog currency="INR" count={2} onClose={close} onDeleted={() => {}} />],
  ['DividendImportModal', close => <DividendImportModal currency="INR" holdings={[]} onClose={close} onImported={() => {}} />],
  ['TradeImportModal', close => <TradeImportModal holdings={[]} onClose={close} onImported={() => {}} />],
  ['NameConfirmDialog', close => <NameConfirmDialog names={[]} holdings={[]} heading="Confirm names" intro="" onBack={close} onConfirm={() => {}} />],
]

// The focusable controls of the dialog that currently holds focus.
const dialogControls = () => {
  const dialog = (document.activeElement as HTMLElement).closest('[tabindex="-1"]')!
  return Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
}

describe.each(modals)('%s', (_, renderModal) => {
  it('moves focus inside on open and closes on Escape', async () => {
    const close = vi.fn()
    render(renderModal(close))
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last control back to the first', async () => {
    render(renderModal(() => {}))
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    const controls = dialogControls()
    controls[controls.length - 1].focus()

    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(controls[0]).toHaveFocus()
  })
})
