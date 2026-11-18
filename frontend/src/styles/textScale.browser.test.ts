// @vitest-environment node
/// <reference types="node" />

// Stylesheet text follows the user's text-size setting (PD-058 Task 14).
// Real Chromium: representative text is measured at the default 16px text
// size, then the browser's default text size is raised (the setting behind
// Chrome's Settings → Font size) and the same text must grow with it, in the
// current UI and the glass UI (data-ui="v2").
//
// <meta name="text-scale"> is not exercised: it ties 1rem to the OS text
// size, which only some platforms expose and desktop Chromium can't emulate.
// The browser setting drives rem the same way.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CDPSession, Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

const DEFAULT_TEXT_SIZE = 16
const LARGE_TEXT_SIZE = 24

// Fixture elements and their size at the default text size, in px. The
// glass-UI elements are only sized in that UI.
const TEXT = [
  { id: 'body-text', size: 14, glassOnly: false },
  { id: 'button', size: 13, glassOnly: false },
  { id: 'input', size: 13, glassOnly: false },
  { id: 'card-heading', size: 20, glassOnly: false },
  { id: 'shell-brand', size: 16, glassOnly: true },
  { id: 'kbd', size: 10, glassOnly: true },
]
const UIS = [['current UI', false], ['glass UI', true]] as const

let server: ViteDevServer
let page: Page
let cdp: CDPSession

// The browser's default text size, as the user's font-size setting sets it.
const setTextSize = (standard: number) => cdp.send('Page.setFontSizes', { fontSizes: { standard } })

const applyUi = (glass: boolean) => page.evaluate(glassUi => {
  if (glassUi) document.documentElement.dataset.ui = 'v2'
  else delete document.documentElement.dataset.ui
}, glass)

// The computed font size of each element, in px.
const textSizes = (ids: string[]) => page.evaluate(elementIds =>
  Object.fromEntries(elementIds.map(id => [id, parseFloat(getComputedStyle(document.getElementById(id)!).fontSize)])), ids)

describe.skipIf(!browser)('text scaling in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    cdp = await page.context().newCDPSession(page)
    await page.goto(`${fixture.baseUrl}/src/test/browser/textScale.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(UIS)('%s: text keeps its size at the default text size', async (_, glass) => {
    await applyUi(glass)
    await setTextSize(DEFAULT_TEXT_SIZE)
    const text = TEXT.filter(element => glass || !element.glassOnly)
    expect(await textSizes(text.map(element => element.id)))
      .toEqual(Object.fromEntries(text.map(element => [element.id, element.size])))
  })

  it.each(UIS)('%s: text grows with a larger text size', async (_, glass) => {
    await applyUi(glass)
    await setTextSize(LARGE_TEXT_SIZE)
    const text = TEXT.filter(element => glass || !element.glassOnly)
    const scale = LARGE_TEXT_SIZE / DEFAULT_TEXT_SIZE
    expect(await textSizes(text.map(element => element.id)))
      .toEqual(Object.fromEntries(text.map(element => [element.id, element.size * scale])))
  })
})
