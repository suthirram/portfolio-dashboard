import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetBarChart } from './AssetBarChart'

describe('AssetBarChart', () => {
  it('draws one bar per datum with a money tooltip and a label', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by month in INR"
        data={[{ label: 'Oct 26', value: 500 }, { label: 'Nov 26', value: 300 }]} />)
    expect(screen.getByRole('img', { name: 'Dividend income by month in INR' })).toBeInTheDocument()
    const bars = container.querySelectorAll('rect')
    expect(bars).toHaveLength(2)
    // The tallest value fills the 160px plot; the other scales against it.
    expect(bars[0].getAttribute('height')).toBe('160')
    expect(bars[1].getAttribute('height')).toBe('96')
    expect(container.querySelectorAll('title')[0].textContent).toContain('Oct 26')
  })

  it('produces finite geometry for an all-zero series', () => {
    const { container } = render(
      <AssetBarChart currency="EUR" label="Dividend income by year in EUR"
        data={[{ label: '2026', value: 0 }]} />)
    const bar = container.querySelector('rect')!
    expect(Number(bar.getAttribute('height'))).toBe(0)
    expect(Number(bar.getAttribute('y'))).toBe(195)
  })

  it('renders no bars for an empty series', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by year in INR" data={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })
})
