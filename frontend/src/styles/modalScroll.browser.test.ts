// @vitest-environment node
/// <reference types="node" />

// An open modal never scrolls the page behind it (PD-058 Task 3). jsdom has
// no layout or wheel scrolling, so this drives real Chromium: a scrolled
// page, a real app modal on top, real wheel input over the backdrop and at
// the card's scroll boundary, then the page's scroll position is checked.
//
// Skips when Playwright's Chromium is not installed (CI does not install it
// yet — issue #321). Install locally: npx playwright install chromium
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const PAGE_SCROLL = 1000
// A launch probe, not a path check: headless runs use Playwright's headless
// shell, which may be installed without the full browser.
const hasChromium = await chromium.launch().then(probe => probe.close().then(() => true), () => false)

let server: ViteDevServer
let browser: Browser
let baseUrl: string

// Lets the wheel's scroll (and any smooth-scroll animation) finish.
const settle = (page: Page) => page.evaluate(() => new Promise(done => setTimeout(done, 400)))

async function openOverScrolledPage(modal: string) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 420 } })
  await page.goto(`${baseUrl}/src/test/browser/modalScroll.fixture.html?modal=${modal}`)
  await page.getByRole('dialog').waitFor()
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), PAGE_SCROLL)
  expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
  return page
}

describe.skipIf(!hasChromium)('modal scroll containment in a real browser', () => {
  beforeAll(async () => {
    server = await createServer({
      root: resolve(process.cwd()),
      configFile: false,
      plugins: [react()],
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
    })
    await server.listen()
    baseUrl = server.resolvedUrls!.local[0].replace(/\/$/, '')
    browser = await chromium.launch()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(['add-row', 'opening-date'])('%s: wheeling over the backdrop leaves the page where it was', async modal => {
    const page = await openOverScrolledPage(modal)
    await page.mouse.move(4, 4) // the dimmed backdrop corner, outside the card
    await page.mouse.wheel(0, 600)
    await settle(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
    await page.close()
  })

  it('add-row: wheeling past the end of a scrolled card leaves the page where it was', async () => {
    const page = await openOverScrolledPage('add-row')
    const card = page.getByRole('dialog')
    const overflows = await card.evaluate(element => element.scrollHeight > element.clientHeight)
    expect(overflows).toBe(true) // the 420px viewport makes this card scroll

    await card.evaluate(element => { element.scrollTop = element.scrollHeight })
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await settle(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
    await page.close()
  })

  it('opening-date: wheeling over a card that does not overflow leaves the page where it was', async () => {
    const page = await openOverScrolledPage('opening-date')
    const box = (await page.getByRole('dialog').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await settle(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
    await page.close()
  })
}, 60_000)
