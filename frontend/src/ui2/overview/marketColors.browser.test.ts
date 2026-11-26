// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, startFixtureServer } from '../../test/browser/harness'

const browser = await launchBrowser()
describe.skipIf(!browser)('UI_2.0 market panel colours', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
  beforeAll(async () => { fixture = await startFixtureServer() })
  afterAll(async () => { await browser?.close(); await fixture?.server.close() })

  it('paints gains green, losses red and zero blue over the panel text colour in every theme', async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    try {
      const holdings = [{
        id: 'europe', script: 'European holding', symbol: 'EX.DE', currency: 'EUR',
        stocks_owned: 1, avg_cost_price: 80, cost_price: 8000, cost_price_eur: 80,
        current_value: 10000, current_value_eur: 100, current_price: 100, previous_close_price: 120,
        unrealized_pnl: 2000, unrealized_pnl_eur: 20, realized_pnl: 0, realized_pnl_eur: 0,
      }]
      await page.route(url => url.pathname.startsWith('/api/'), route => {
        const replies: Record<string, unknown> = {
          '/api/auth/me': { id: 'owner', name: 'Owner', role: 'user', ui_mode: 'ui2' },
          '/api/branding': { font: 'roboto', allowed_fonts: [] },
          '/api/holdings': holdings, '/api/prices': { holdings }, '/api/summary': { eur_rate: 0.01 },
          '/api/xirr': { as_of: '2026-11-26', holdings: [], currencies: [] },
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
        const panel = page.getByRole('region', { name: /^Euro/ })
        await panel.getByText('Unrealised', { exact: true }).waitFor()
        const colour = (label: string) => panel.getByText(label, { exact: true })
          .evaluate(element => getComputedStyle(element.nextElementSibling!).color)
        const [plain, gain, zero, loss] = await Promise.all(['Cost', 'Unrealised', 'Realised', 'Today'].map(colour))
        expect(new Set([plain, gain, zero, loss]).size, theme).toBe(4)
        expect(await colour('Current value'), theme).toBe(zero)
      }
    } finally { await page.close() }
  }, 60_000)
})
