// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, startFixtureServer } from '../../test/browser/harness'

// A holding whose XIRR carries a caveat renders a visually-hidden note
// (.sr-only, absolutely positioned) inside the wide holdings table. Its
// scroller was not a positioned element, so the note escaped the scroller's
// clip and stretched the whole page to the table's width. A phone then widened
// its layout viewport to match, and every fixed dialog (the ledger, for one)
// was centred on that wider canvas and landed partly off-screen.
const browser = await launchBrowser()
describe.skipIf(!browser)('UI_2.0 Overview width', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
  beforeAll(async () => { fixture = await startFixtureServer() })
  afterAll(async () => { await browser?.close(); await fixture?.server.close() })

  it.each([390, 768])('is not stretched past the viewport by hidden table text at %i px', async width => {
    const page = await browser!.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
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
          '/api/auth/me': { id: 'owner', name: 'Owner', role: 'user', premium: true, ui_mode: 'ui2', gold_enabled: false },
          '/api/branding': { font: 'roboto', allowed_fonts: [] },
          '/api/holdings': holdings, '/api/prices': { holdings },
          '/api/summary': { eur_rate: 0.01 },
          // An undated opening adds a caveat note to the XIRR cell.
          '/api/xirr': { as_of: '2026-11-19', currencies: [],
            holdings: [{ holding_id: 'europe', xirr: 0.1, since: '2026-06-01', undated_opening: true }] },
        }
        return route.fulfill({ json: replies[new URL(route.request().url()).pathname] ?? [] })
      })
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
      await page.goto(fixture.baseUrl, { waitUntil: 'domcontentloaded' })
      // The caveat note is on the page, so the check below is not vacuous.
      await page.locator('.holdings-table-wrap .sr-only').first().waitFor({ state: 'attached' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await page.close() }
  }, 60_000)
})
