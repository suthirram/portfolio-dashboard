// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, startFixtureServer } from '../../test/browser/harness'

const browser = await launchBrowser()
describe.skipIf(!browser)('Overview at the handoff widths', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
  beforeAll(async () => { fixture = await startFixtureServer() })
  afterAll(async () => { await browser?.close(); await fixture?.server.close() })
  it.each([1280, 768, 390])('keeps selection accessible at %i px', async width => {
    const page = await browser!.newPage({ viewport: { width, height: 900 } })
    try {
      const holdings = [{ id: 'one', script: 'Example', symbol: 'EX.NS', currency: 'INR', current_price: 100,
        stocks_owned: 1, current_value: 100, avg_cost_price: 50, cost_price: 50, unrealized_pnl: 50 }]
      await page.route((url: URL) => url.pathname.startsWith('/api/'), (route: { request: () => { url: () => string }; fulfill: (options: { json: unknown }) => Promise<void> }) => {
        const path = new URL(route.request().url()).pathname
        const replies: Record<string, unknown> = {
          '/api/auth/me': { id: 'owner', username: 'owner', name: 'Owner', ui_mode: 'ui2', role: 'user' },
          '/api/branding': { font: 'roboto', allowed_fonts: [] },
          '/api/holdings': holdings, '/api/prices': { holdings }, '/api/summary': { eur_rate: 0.01 },
          '/api/xirr': { as_of: '2026-11-16', holdings: [], currencies: [] },
        }
        return route.fulfill({ json: replies[path] ?? [] })
      })
      await page.route('https://fonts.googleapis.com/**', (route: { fulfill: (options: { contentType: string; body: string }) => Promise<void> }) => route.fulfill({ contentType: 'text/css', body: '' }))
      await page.goto(fixture.baseUrl, { waitUntil: 'domcontentloaded' })
      const opener = page.getByRole('table', { name: 'Holdings' }).getByRole('button', { name: 'Example' })
      await opener.focus()
      await opener.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Example' })
      await dialog.waitFor()
      await dialog.getByRole('button', { name: 'Ledger' }).waitFor()
      await page.keyboard.press('Escape')
      await expect.poll(() => opener.evaluate((element: Element) => element === document.activeElement)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await page.close() }
  })
})
