// @vitest-environment node
/// <reference types="node" />

// An open modal never scrolls the page behind it (PD-058 Task 3). jsdom has
// no layout or wheel scrolling, so this drives real Chromium: a scrolled
// page, a real app modal on top, real wheel input over the backdrop and at
// the card's scroll boundary, then the page's scroll position is checked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const PAGE_SCROLL = 1000

const browser = await launchBrowser()

let server: ViteDevServer
let baseUrl: string

// Resolves once the page has stopped scrolling: its scroll position held
// steady for 10 consecutive frames (about 160ms), capped at 2s. A wheel's
// scroll (smooth or not) starts within a frame or two, so a page that is
// still at rest after this has not been scrolled.
const settle = (page: Page) => page.evaluate(() => new Promise<void>(done => {
  let last = window.scrollY
  let steadyFrames = 0
  const deadline = performance.now() + 2000
  const tick = () => {
    steadyFrames = window.scrollY === last ? steadyFrames + 1 : 0
    last = window.scrollY
    if (steadyFrames >= 10 || performance.now() > deadline) done()
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}))

async function openOverScrolledPage(modal: string, height = 420) {
  const page = await browser!.newPage({ viewport: { width: 1000, height } })
  await page.goto(`${baseUrl}/src/test/browser/modalScroll.fixture.html?modal=${modal}`)
  await page.getByRole('dialog').waitFor()
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), PAGE_SCROLL)
  expect(await page.evaluate(() => window.scrollY)).toBe(PAGE_SCROLL)
  return page
}

// Wheels down over a point and reports where the page ended up.
async function wheelAt(page: Page, left: number, top: number) {
  await page.mouse.move(left, top)
  await page.mouse.wheel(0, 600)
  await settle(page)
  return page.evaluate(() => window.scrollY)
}

// The card is the modal's focus-trap root (tabindex="-1"). It is not always
// the role="dialog" element: some modals put the role on the backdrop.
const card = (page: Page) => page.locator('[tabindex="-1"]').first()

async function cardCentre(page: Page) {
  const box = (await card(page).boundingBox())!
  return [box.x + box.width / 2, box.y + box.height / 2] as const
}

const cardOverflows = (page: Page) =>
  card(page).evaluate(element => element.scrollHeight > element.clientHeight)

describe.skipIf(!browser)('modal scroll containment in a real browser', () => {
  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer())
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(['delete-all', 'opening-date', 'add-row', 'palette'])(
    '%s: wheeling over the backdrop leaves the page where it was', async modal => {
      const page = await openOverScrolledPage(modal)
      expect(await wheelAt(page, 4, 4)).toBe(PAGE_SCROLL) // the backdrop corner, outside the card
      await page.close()
    })

  it.each([['delete-all', 220], ['add-row', 420]] as const)(
    '%s: wheeling past the end of a scrolled card leaves the page where it was', async (modal, height) => {
      const page = await openOverScrolledPage(modal, height)
      expect(await cardOverflows(page)).toBe(true) // the short viewport makes this card scroll
      await card(page).evaluate(element => { element.scrollTop = element.scrollHeight })

      const [left, top] = await cardCentre(page)
      expect(await wheelAt(page, left, top)).toBe(PAGE_SCROLL)
      await page.close()
    })

  it.each(['delete-all', 'opening-date'])(
    '%s: wheeling over a card that does not overflow leaves the page where it was', async modal => {
      const page = await openOverScrolledPage(modal)
      expect(await cardOverflows(page)).toBe(false)

      const [left, top] = await cardCentre(page)
      expect(await wheelAt(page, left, top)).toBe(PAGE_SCROLL)
      await page.close()
    })
}, 60_000)
