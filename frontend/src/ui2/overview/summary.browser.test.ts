// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, startFixtureServer } from '../../test/browser/harness'

const browser = await launchBrowser()
describe.skipIf(!browser)('UI_2.0 portfolio summary', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
  beforeAll(async () => { fixture = await startFixtureServer() })
  afterAll(async () => { await browser?.close(); await fixture?.server.close() })

  it.each([1280, 768, 390])('switches totals and restores dialog focus at %i px in every theme', async width => {
    const page = await browser!.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    try {
      const holdings = [{
        id: 'europe', script: 'European holding', symbol: 'EX.DE', currency: 'EUR',
        stocks_owned: 1, avg_cost_price: 80, cost_price: 8000, cost_price_eur: 80,
        current_value: 10000, current_value_eur: 100, current_price: 100,
        unrealized_pnl: 2000, unrealized_pnl_eur: 20, realized_pnl: 5, total_dividends: 2,
        previous_close_price: 100,
      }]
      await page.route(url => url.pathname.startsWith('/api/'), route => {
        const replies: Record<string, unknown> = {
          '/api/auth/me': { id: 'owner', name: 'Owner', role: 'user', premium: true, ui_mode: 'ui2', gold_enabled: true },
          '/api/branding': { font: 'roboto', allowed_fonts: [] },
          '/api/holdings': holdings, '/api/prices': { holdings },
          '/api/summary': { eur_rate: 0.01 }, '/api/gold/metrics': { invested: 4000, current: 5000 },
          '/api/xirr': { holdings: [], currencies: [] },
        }
        return route.fulfill({ json: replies[new URL(route.request().url()).pathname] ?? [] })
      })
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
      await page.goto(fixture.baseUrl, { waitUntil: 'domcontentloaded' })
      for (const theme of ['light', 'dark', 'cyberpunk']) {
        await page.evaluate(selected => {
          localStorage.setItem('pd_theme', selected)
          localStorage.setItem('pd_theme_chosen', '1')
        }, theme)
        await page.reload()
        const summary = page.getByRole('region', { name: 'Portfolio summary' })
        await summary.getByText('₹15,000.00', { exact: true }).waitFor()
        await summary.getByLabel('Display currency').selectOption('EUR')
        await summary.getByText('€150.00', { exact: true }).waitFor()
        const opener = summary.getByRole('button', { name: 'View breakdown · Portfolio value' })
        await opener.focus()
        await opener.press('Enter')
        const dialog = page.getByRole('dialog', { name: 'Invested and current value' })
        await dialog.getByRole('row', { name: /Physical gold/ }).getByText('₹5,000.00', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await expect.poll(() => opener.evaluate(element => element === document.activeElement)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      }
    } finally { await page.close() }
    // Three theme reloads per width: well past Vitest's 5 s default on a busy runner.
  }, 60_000)
})
