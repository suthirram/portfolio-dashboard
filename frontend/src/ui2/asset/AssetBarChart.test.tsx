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

  it('thins axis labels on a long series so they never overlap, keeping every bar and tooltip', () => {
    const months = Array.from({ length: 49 }, (_, index) => ({ label: `M${index + 1}`, value: index + 1 }))
    const { container } = render(<AssetBarChart currency="INR" label="Dividend income by month in INR" data={months} />)
    expect(container.querySelectorAll('rect')).toHaveLength(49)
    expect(container.querySelectorAll('title')).toHaveLength(49)
    const labels = [...container.querySelectorAll('text[y="220"]')]
    expect(labels.at(-1)?.textContent).toBe('M49')
    const positions = labels.map(text => Number(text.getAttribute('x')))
    const gaps = positions.slice(1).map((position, index) => position - positions[index])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(44)
  })

  it('labels every bar when they fit', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by year in INR"
        data={['2022', '2023', '2024', '2025', '2026'].map(year => ({ label: year, value: 1 }))} />)
    expect(container.querySelectorAll('text[y="220"]')).toHaveLength(5)
  })

  it('renders no bars for an empty series', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by year in INR" data={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })
})
