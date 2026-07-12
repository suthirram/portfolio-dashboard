import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurrencySprinkle, { sprinkleLayout } from './CurrencySprinkle'

const GLYPHS = ['₹', '€', '$', '£', '¥', '₩', '₣', '₿']

const renderAt = (path: string, ui: React.ReactElement) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('CurrencySprinkle', () => {
  it('renders the requested number of glyphs from the currency set', () => {
    const { container } = renderAt('/history', <CurrencySprinkle count={20} />)
    const spans = container.querySelectorAll('.currency-sprinkle span')
    expect(spans.length).toBe(20)
    for (const s of spans) expect(GLYPHS).toContain(s.textContent)
  })

  it('is decorative: hidden from assistive tech, behind content', () => {
    const { container } = renderAt('/history', <CurrencySprinkle />)
    const layer = container.querySelector('.currency-sprinkle')!
    expect(layer.getAttribute('aria-hidden')).toBe('true')
  })

  it('animates the glyphs in (staggered) on the dashboard route only', () => {
    const dash = renderAt('/', <CurrencySprinkle count={6} />)
    const layer = dash.container.querySelector('.currency-sprinkle')!
    expect(layer.classList.contains('sprinkle-animate')).toBe(true)
    const delays = Array.from(dash.container.querySelectorAll('.currency-sprinkle span'))
      .map(s => (s as HTMLElement).style.animationDelay)
    expect(new Set(delays).size).toBeGreaterThan(1) // randomised stagger
    dash.unmount()

    const other = renderAt('/history', <CurrencySprinkle count={6} />)
    expect(other.container.querySelector('.sprinkle-animate')).toBeNull()
  })

  it('layout is deterministic per seed and varies across seeds', () => {
    const a = sprinkleLayout(12, 46)
    const b = sprinkleLayout(12, 46)
    const c = sprinkleLayout(12, 47)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    // Positions stay inside the viewport box.
    for (const it of a) {
      expect(it.left).toBeGreaterThanOrEqual(0)
      expect(it.left).toBeLessThanOrEqual(96)
      expect(it.top).toBeGreaterThanOrEqual(0)
      expect(it.top).toBeLessThanOrEqual(94)
      expect(it.opacity).toBeGreaterThanOrEqual(0.12)
      expect(it.opacity).toBeLessThan(0.29)
      expect(it.delay).toBeGreaterThanOrEqual(0)
      expect(it.delay).toBeLessThan(0.9)
    }
  })
})
