// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

// PD-059 R24, cutover readiness: every route a UI_2.0 account can reach
// renders a UI_2.0 page (no Classic-only screen left), fits the viewport at
// phone and desktop width with no horizontal scroll, and every paged list uses
// the same shared Pager (owner, Q-5a-1).

const ROUTES = [
  '/', '/history', '/history/chart/INR', '/transactions', '/transactions/delta', '/dividends', '/gold',
  '/admin', '/admin/admins', '/admin/branding', '/profile',
  '/admin/users/u1', '/admin/users/u1/transactions', '/admin/users/u1/dividends',
]
const WIDTHS = [390, 1280]

const holding = {
  id: 'h1', script: 'TCS', symbol: 'TCS.NS', exchange: 'NSE', currency: 'INR',
  stocks_owned: 10, avg_cost_price: 3000, cost_price: 30000, current_value: 35000, current_price: 3500,
  unrealized_pnl: 5000, realized_pnl: 0, total_dividends: 800, previous_close_price: 3450,
}
const day = (index: number) => `2026-${String(1 + (index % 10)).padStart(2, '0')}-${String(1 + index).padStart(2, '0')}`
// More than one page (15) of each, so both paged lists show their Pager.
const transactions = Array.from({ length: 20 }, (_, index) => ({
  id: `t${index}`, holding_id: 'h1', type: 'buy', date: day(index), amount: 1000 + index, quantity: 1,
  currency: 'INR', script: 'TCS', symbol: 'TCS.NS',
}))
const dividendRows = Array.from({ length: 20 }, (_, index) => ({
  id: `d${index}`, holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: day(index), amount: 40,
  currency: 'INR', cumulative: 40 * (index + 1), holding_cumulative: 40 * (index + 1),
}))
const owner = {
  id: 'owner', username: 'owner', name: 'Owner', role: 'superadmin', region: '', premium: true,
  ui_mode: 'ui2', gold_enabled: true,
}
const target = { id: 'u1', username: 'alice', name: 'Alice', role: 'user', region: 'india', ui_mode: 'ui2' }

// reply answers by path, most specific first; anything unknown is an empty list.
function reply(path: string): unknown {
  const api = path.replace(/^\/api/, '')
  if (api === '/auth/me') return owner
  if (api === '/branding') return { font: 'roboto', allowed_fonts: [] }
  if (api === '/regions') return [{ id: 'india', label: 'India' }]
  if (api === '/gold/missing-dates') return { missing: [] }
  if (api === '/gold/metrics') return { invested: 0, grams: 0 }
  if (api.startsWith('/gold/')) return []
  if (api.endsWith('/investment-delta')) return { year: 2026, columns: [] }
  if (api.includes('/dividends')) {
    return {
      rows: dividendRows, summary: { total: 800, count: 20, holdings: 1, first_date: day(0), last_date: day(19) },
      by_year: [{ period: '2026', total: 800, count: 20 }], by_month: [{ period: '2026-01', total: 800, count: 20 }],
      by_holding: [{ holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 800, count: 20, share: 1 }],
    }
  }
  if (api.endsWith('/transactions') || api.endsWith('/transactions/all')) return transactions
  if (api.endsWith('/holdings')) return [holding]
  if (api.endsWith('/prices')) return { holdings: [holding], eur_rate: 0.011 }
  if (api.endsWith('/summary')) return { eur_rate: 0.011, total_current_value: 35000, total_cost: 30000 }
  if (api.endsWith('/xirr')) return { as_of: '2026-11-20', currencies: [], holdings: [] }
  if (api.startsWith('/history/overall')) return { points: [], gold_unavailable: false }
  if (api.startsWith('/history/fx-missing')) return { dates: [] }
  if (api.startsWith('/history')) return { currency: 'INR', rows: [] }
  if (api === '/admin/users/u1') return target
  if (api.startsWith('/admin/users')) return [owner, target]
  if (api === '/admin/admins') return [owner]
  return []
}

async function open(page: Page, baseUrl: string, route: string) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.ui2-intro h1').first().waitFor({ state: 'visible', timeout: 15_000 })
  // Let data-driven panels (tables, charts) settle before measuring.
  await page.waitForLoadState('networkidle')
}

const browser = await launchBrowser()
describe.skipIf(!browser)('UI_2.0 cutover readiness (R24)', () => {
  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
  beforeAll(async () => { fixture = await startFixtureServer() })
  afterAll(async () => { await browser?.close(); await fixture?.server.close() })

  async function newPage(width: number) {
    const page = await browser!.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await page.route(url => url.pathname.startsWith('/api/'), route =>
      route.fulfill({ json: reply(new URL(route.request().url()).pathname) }))
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
    return page
  }

  it.each(WIDTHS)('renders every route as a UI_2.0 page without horizontal scroll at %i px', async width => {
    const page = await newPage(width)
    const problems: string[] = []
    page.on('pageerror', error => problems.push(`${new URL(page.url()).pathname}: ${error.message}`))
    try {
      for (const route of ROUTES) {
        await open(page, fixture.baseUrl, route)
        const state = await page.evaluate(() => ({
          shell: Boolean(document.querySelector('.ui2-shell')),
          overflow: document.documentElement.scrollWidth - innerWidth,
        }))
        if (!state.shell) problems.push(`${route}: not inside the UI_2.0 shell`)
        if (state.overflow > 0) problems.push(`${route}: ${state.overflow}px horizontal overflow`)
      }
    } finally { await page.close() }
    expect(problems).toEqual([])
  }, 240_000)

  it('uses one identical Pager on every paged list', async () => {
    const page = await newPage(1280)
    const signatures: Record<string, string> = {}
    try {
      for (const route of ['/transactions', '/dividends']) {
        await open(page, fixture.baseUrl, route)
        const pager = page.locator('nav.pager').first()
        await pager.waitFor({ state: 'visible' })
        // The pager's structure: tags, classes and accessible names, with the
        // counts stripped so only the component itself is compared.
        signatures[route] = await pager.evaluate(nav => {
          const describe = (element: Element): string => `${element.tagName.toLowerCase()}.${[...element.classList].sort().join('.')}`
            + `[${element.getAttribute('aria-label')?.replace(/^\w+ pages$/, 'list pages') ?? ''}]`
            + `(${[...element.children].map(describe).join(',')})`
          return describe(nav)
        })
      }
    } finally { await page.close() }
    expect(Object.keys(signatures)).toHaveLength(2)
    expect(signatures['/dividends']).toBe(signatures['/transactions'])
  }, 120_000)
})
