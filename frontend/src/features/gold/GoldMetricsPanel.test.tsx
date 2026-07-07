import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GoldMetrics } from '../../lib/api/client'
import GoldMetricsPanel from './GoldMetricsPanel'

const base: GoldMetrics = {
  invested: 59500,
  grams: 8,
  latest_price: 7350,
  current: 58800,
  bees_pl: 1200,
  nett_ex_bees: -700,
  nett_in_bees: 500,
  avg_per_gram: 7437.5,
  xirr: -0.0432,
}

const rowValue = (label: string) => {
  const cell = screen.getByText(label).closest('tr')!.querySelectorAll('td')[1]
  return cell.textContent
}

describe('GoldMetricsPanel', () => {
  it('renders every PRD §6 metric with rupee / gram / percent formatting', () => {
    render(<GoldMetricsPanel metrics={base} />)
    expect(rowValue('Total amount invested')).toBe('₹59,500')
    expect(rowValue('Current value')).toBe('₹58,800')
    expect(rowValue('Total gold')).toBe('8 g')
    expect(rowValue('Avg cost per gram')).toBe('₹7,437.5')
    expect(rowValue('Nett P/L excluding bees')).toBe('-₹700')
    // XIRR is a fraction on the wire; shown as a percent.
    expect(rowValue('XIRR of physical')).toBe('-4.32%')
  })

  it('renders em dashes for null (unknowable) metrics, never zeros', () => {
    render(<GoldMetricsPanel metrics={{
      ...base, current: null, latest_price: null, bees_pl: null,
      nett_ex_bees: null, nett_in_bees: null, xirr: null,
    }} />)
    expect(rowValue('Current value')).toBe('—')
    expect(rowValue('P/L from GOLDBEES (excl. tax)')).toBe('—')
    expect(rowValue('Nett P/L including bees')).toBe('—')
    expect(rowValue('XIRR of physical')).toBe('—')
    // Entered totals still present.
    expect(rowValue('Total amount invested')).toBe('₹59,500')
  })
})
