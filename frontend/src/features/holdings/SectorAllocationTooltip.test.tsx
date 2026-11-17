import { render } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import SectorAllocation from './SectorAllocation'

interface CapturedTooltip { contentStyle?: object; itemStyle?: object }

// jsdom has no layout, so ResponsiveContainer measures 0×0 and renders nothing;
// give the chart a fixed size and capture the props the pie hands its Tooltip.
const tooltipProps = vi.hoisted(() => [] as CapturedTooltip[])
vi.mock('recharts', async importOriginal => {
  const recharts = await importOriginal<typeof import('recharts')>()
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 400, height: 280 }),
    Tooltip: (props: CapturedTooltip) => { tooltipProps.push(props); return null },
  }
})

const rows: HoldingWithPrice[] = [
  { symbol: 'TCS', script: 'TCS', currency: 'INR', stocks_owned: 1, current_price: 60, current_value: 60,
    classification: { symbol: 'TCS', status: 'resolved', sector: 'Technology' } },
]

describe('sector allocation tooltip', () => {
  it('uses theme text on the card surface, so it stays readable in dark and cyberpunk', () => {
    render(<SectorAllocation holdings={rows} />)
    const props = tooltipProps[tooltipProps.length - 1]
    expect(props.contentStyle).toMatchObject({ background: 'var(--bg-card)', color: 'var(--text-primary)' })
    expect(props.itemStyle).toMatchObject({ color: 'var(--text-primary)' })
  })
})
