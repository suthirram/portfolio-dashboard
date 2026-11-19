import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Ui2MiniChart, type MiniChartPoint } from './Ui2MiniChart'

const points: MiniChartPoint[] = [
  { date: '2026-11-14', invested: null, current: null, pnl_pct: null, daily_vol: null },
  { date: '2026-11-15', invested: 80, current: 100, pnl_pct: null, daily_vol: null },
  { date: '2026-11-16', invested: null, current: null, pnl_pct: null, daily_vol: null },
]

describe('Ui2MiniChart isolated values', () => {
  it('marks isolated current and invested values when dense markers are disabled', () => {
    const { container } = render(<Ui2MiniChart points={points} kind="value" unit="INR" label="India · INR" markers={false} />)
    const circles = [...container.querySelectorAll('circle')]
    expect(circles).toHaveLength(2)
    expect(circles.map(circle => circle.querySelector('title')?.textContent)).toEqual([
      '2026-11-15 · 100 INR',
      '2026-11-15 · 80 INR invested',
    ])
  })

  it('omits dense markers for connected points when disabled', () => {
    const connected = points.map((point, index) => ({
      ...point,
      current: 100 + index,
      invested: 80 + index,
    }))
    const { container } = render(<Ui2MiniChart points={connected} kind="value" unit="INR" label="India · INR" markers={false} />)
    expect(container.querySelectorAll('circle')).toHaveLength(0)
  })
})
