import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { GOLD_LABEL, Ui2SummaryCards, signedMoney, type AssetLine } from './Ui2SummaryCards'

const euroEquities: AssetLine = { label: 'EUR equities', currency: 'EUR', current: 100, invested: 80, unrealised: 20, realised: 3, income: 5 }
const gold: AssetLine = { label: GOLD_LABEL, currency: 'INR', current: 5000, invested: 4000, unrealised: 1000, realised: 0, income: 0 }
const card = (title: string) => within(screen.getByRole('heading', { name: title }).closest('article') as HTMLElement)
const dialogOpener = (title: string) => screen.getByRole('button', { name: 'View breakdown · ' + title })

it('shows the four handoff cards under one bold rate and the display currency', () => {
  render(<Ui2SummaryCards summary={{ eur_rate: 0.01, previous_close_date: '2026-11-16' }} daily={{ EUR: null }}
    assets={[euroEquities, gold]} />)
  expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual([
    'Portfolio value', 'Daily movement', 'Total profit & loss', 'Dividend income',
  ])
  expect(screen.getByText('1 EUR = ₹100.00').tagName).toBe('STRONG')
  expect(screen.getByText('Equities + physical gold')).toBeVisible()
  expect(card('Portfolio value').getByText('₹15,000.00')).toBeVisible()
  expect(card('Portfolio value').getByText('₹12,000.00')).toBeVisible() // 80 EUR (₹8,000) + ₹4,000 gold
  expect(card('Daily movement').getByText('vs 16 Nov 2026 close')).toBeVisible()
  expect(card('Daily movement').getAllByText('—')).toHaveLength(4) // INR and EUR, gain and percent
  // Combined P/L = unrealised + realised: 1,000 + 20 EUR (₹2,000) + 3 EUR (₹300).
  expect(card('Total profit & loss').getByText('+₹3,300.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('Unrealised (25.00%)')).toBeVisible() // ₹3,000 on ₹12,000
  expect(card('Dividend income').getByText('₹500.00')).toBeVisible()
})

it('switches every total with the display currency and keeps breakdowns in native currencies', () => {
  render(<Ui2SummaryCards summary={{ eur_rate: 0.01 }} daily={{}} assets={[euroEquities, gold]} />)
  fireEvent.change(screen.getByLabelText('Display currency'), { target: { value: 'EUR' } })
  expect(card('Portfolio value').getByText('€150.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('+€33.00')).toBeVisible()
  expect(card('Dividend income').getByText('€5.00')).toBeVisible()
  const opener = dialogOpener('Portfolio value')
  opener.focus()
  fireEvent.click(opener)
  const dialog = within(screen.getByRole('dialog', { name: 'Invested and current value' }))
  expect(dialog.getByRole('row', { name: /EUR equities/ })).toHaveTextContent('€80.00€100.00')
  expect(dialog.getByRole('row', { name: new RegExp(GOLD_LABEL) })).toHaveTextContent('₹4,000.00₹5,000.00')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(opener).toHaveFocus()
})

it('opens a breakdown dialog for every card', () => {
  render(<Ui2SummaryCards summary={{ eur_rate: 0.01, per_currency: [{ currency: 'INR', previous_close: 1000 }, { currency: 'EUR', previous_close: 90 }] }}
    daily={{}} assets={[euroEquities, gold]} />)
  fireEvent.click(dialogOpener('Daily movement'))
  let dialog = within(screen.getByRole('dialog', { name: 'Daily movement details' }))
  expect(dialog.getByText('India previous close').nextElementSibling).toHaveTextContent('₹1,000.00')
  expect(dialog.getByText('Europe previous close').nextElementSibling).toHaveTextContent('€90.00')
  expect(dialog.getByText('Gold daily movement')).toBeVisible()
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(dialogOpener('Total profit & loss'))
  dialog = within(screen.getByRole('dialog', { name: 'Profit and loss breakdown' }))
  expect(dialog.getByRole('row', { name: /EUR equities/ })).toHaveTextContent('+€20.00€3.00')
  expect(dialog.getByText(/Total P\/L = unrealised \+ realised gains/)).toBeVisible()
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.click(dialogOpener('Dividend income'))
  dialog = within(screen.getByRole('dialog', { name: 'Dividend income by currency' }))
  expect(dialog.getByText('Indian Rupee · INR').nextElementSibling).toHaveTextContent('₹0.00')
  expect(dialog.getByText('Euro · EUR').nextElementSibling).toHaveTextContent('€5.00')
})

it('keeps native totals available when conversion has no usable rate', () => {
  render(<Ui2SummaryCards summary={{}} daily={{}} assets={[
    { label: 'INR equities', currency: 'INR', current: 100, invested: 80, unrealised: 20, realised: -5, income: 0 },
  ]} />)
  expect(card('Portfolio value').getByText('₹100.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('+₹15.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('Realised').nextElementSibling).toHaveTextContent('−₹5.00')
  expect(screen.getByText('Conversion rate unavailable')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Display currency'), { target: { value: 'EUR' } })
  expect(screen.queryByText('€100.00')).toBeNull()
  expect(card('Portfolio value').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
})

it('withholds an incomplete valuation while keeping realised gains and income', () => {
  render(<Ui2SummaryCards summary={{ eur_rate: 0.01 }} daily={{ INR: null, EUR: { gain: 0, previousValue: 100, pct: 0 } }} assets={[
    { label: 'INR equities', currency: 'INR', current: null, invested: 80, unrealised: null, realised: 5, income: 2 },
    euroEquities,
  ]} />)
  expect(card('Portfolio value').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
  expect(card('Total profit & loss').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
  expect(card('Total profit & loss').getByText('Realised').nextElementSibling).toHaveTextContent('+₹305.00')
  expect(card('Dividend income').getByText('₹502.00')).toBeVisible()
  expect(card('Daily movement').getByText('EUR equities').parentElement).toHaveTextContent('+€0.00+0.00%')
  expect(card('Daily movement').getByText('INR equities').parentElement).toHaveTextContent('——')
})

it.each([0, -1, NaN, Infinity])('treats rate %s as unavailable', rate => {
  render(<Ui2SummaryCards summary={{ eur_rate: rate }} daily={{}} assets={[euroEquities]} />)
  expect(screen.getByText('Conversion rate unavailable')).toBeVisible()
  expect(screen.queryByText(/Infinity|NaN/)).toBeNull()
})

it('signs gains and losses like the handoff and never signs an unknown amount', () => {
  expect(signedMoney(1888, 'INR')).toBe('+₹1,888.00')
  expect(signedMoney(-594.2, 'INR')).toBe('−₹594.20')
  expect(signedMoney(0, 'EUR')).toBe('+€0.00')
  expect(signedMoney(null, 'INR')).toBe('—')
  expect(signedMoney(Number.NaN, 'INR')).toBe('—')
})
