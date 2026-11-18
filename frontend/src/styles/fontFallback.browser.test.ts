// @vitest-environment node
/// <reference types="node" />

// The web-font swap does not move the layout (PD-058 Task 15). Real
// Chromium, an uncached visit: the font files from Google Fonts are held
// back, text geometry is measured in the fallback, then the files are
// released and the same text is measured in the web font. Line count, block
// heights and line widths must match, for both selectable brand fonts.
//
// Needs network access to Google Fonts, like the app itself.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// The brand fonts, as useBranding names them and as CSS names the family.
const BRAND_FONTS = [['roboto', 'Roboto'], ['jetbrains_mono', 'JetBrains Mono']] as const
const MEASURED = ['regular', 'bold', 'normal-line-height']
// Largest line-width change allowed, as a share of the line, and the largest
// height change, in px. Fallback widths match the web font's on average, not
// glyph for glyph: this fixture's lines land within 1.4%. Unadjusted
// fallbacks re-wrap lines (13%+ on a line).
const WIDTH_TOLERANCE = 0.02
const HEIGHT_TOLERANCE_PX = 0.5

let server: ViteDevServer
let baseUrl: string

type Geometry = Record<string, { height: number; lineWidths: number[] }>

// Each measured block's height and the width of each of its lines.
const measure = (page: Page): Promise<Geometry> => page.evaluate(ids => Object.fromEntries(ids.map(id => {
  const block = document.getElementById(id)!
  const range = document.createRange()
  range.selectNodeContents(block)
  const lines = new Map<number, number>()
  for (const rect of range.getClientRects()) {
    const top = Math.round(rect.top)
    lines.set(top, Math.max(lines.get(top) ?? 0, rect.right) - block.getBoundingClientRect().left)
  }
  return [id, { height: block.getBoundingClientRect().height, lineWidths: [...lines.values()] }]
})), MEASURED)

// Whether the web font has loaded for both weights the fixture uses.
const webFontLoaded = (page: Page, family: string) => page.evaluate(name =>
  document.fonts.check(`400 20px "${name}"`) && document.fonts.check(`700 20px "${name}"`), family)

// Opens the fixture with the brand font and Google's font files held back;
// release() lets them through.
async function openWithFontFilesHeld(font: string) {
  const context = await browser!.newContext() // uncached
  const page = await context.newPage()
  let release!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  await page.route('https://fonts.gstatic.com/**', async route => {
    await released
    await route.continue()
  })
  await page.goto(`${baseUrl}/src/test/browser/fontFallback.fixture.html?font=${font}`)
  // The Google Fonts stylesheet has registered its faces and they are pending.
  await page.waitForFunction(() => document.fonts.status === 'loading')
  return { page, release }
}

describe.skipIf(!browser)('web-font swap in a real browser', () => {
  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer())
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(BRAND_FONTS)('%s: text keeps its geometry when the web font arrives', async (font, family) => {
    const { page, release } = await openWithFontFilesHeld(font)
    expect(await webFontLoaded(page, family)).toBe(false)
    const fallback = await measure(page)

    release()
    await page.evaluate(name => Promise.all([document.fonts.load(`400 20px "${name}"`), document.fonts.load(`700 20px "${name}"`)]), family)
    await page.evaluate(() => document.fonts.ready)
    expect(await webFontLoaded(page, family)).toBe(true)
    const loaded = await measure(page)

    for (const id of MEASURED) {
      expect(loaded[id].lineWidths.length, `${id}: line count`).toBe(fallback[id].lineWidths.length)
      expect(Math.abs(loaded[id].height - fallback[id].height), `${id}: height ${fallback[id].height} → ${loaded[id].height}`)
        .toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX)
      loaded[id].lineWidths.forEach((width, line) => {
        const before = fallback[id].lineWidths[line]
        expect(Math.abs(width - before) / width, `${id} line ${line + 1}: width ${before} → ${width}`)
          .toBeLessThanOrEqual(WIDTH_TOLERANCE)
      })
    }
    await page.context().close()
  }, 30_000)
})
