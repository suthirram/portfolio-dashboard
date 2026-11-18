// @vitest-environment node
/// <reference types="node" />

// Native controls follow the app theme, not the OS (PD-058 Task 9). Checked
// on what Chromium resolves: each theme's computed color-scheme, and the
// Canvas system colour the date picker and select paint with. The OS is
// emulated as the opposite scheme, so a theme that doesn't set its own
// falls back to the OS and fails.
//
// index.html is loaded with every subresource blocked, so only its meta can
// pick the scheme: before the stylesheet arrives, the canvas follows the OS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

let server: ViteDevServer
let baseUrl: string

// Canvas as the browser resolves it for an element, in rgb(). System colours
// resolve per element by its used color-scheme; caret-color carries it
// because a date input or select can't hold a child probe.
const canvasIn = (page: Page, selector: string) => page.evaluate(elementSelector => {
  const element = document.querySelector<HTMLElement>(elementSelector)!
  element.style.caretColor = 'Canvas'
  const color = getComputedStyle(element).caretColor
  element.style.removeProperty('caret-color')
  return color
}, selector)

// Canvas in a bare page that sets only the given color-scheme: the colour
// each scheme's controls must match.
async function referenceCanvas(scheme: 'dark' | 'light') {
  const reference = await browser!.newPage()
  await reference.setContent(`<html style="color-scheme: ${scheme}"><body></body></html>`)
  const color = await canvasIn(reference, 'body')
  await reference.close()
  return color
}

describe.skipIf(!browser)('color-scheme in a real browser', () => {
  beforeAll(async () => {
    ({ server, baseUrl } = await startFixtureServer())
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  // Guards the cases below: the two schemes must resolve Canvas differently,
  // or matching a reference proves nothing.
  it('dark and light resolve Canvas differently', async () => {
    expect(await referenceCanvas('dark')).not.toBe(await referenceCanvas('light'))
  })

  describe('per theme', () => {
    let page: Page

    beforeAll(async () => {
      page = await browser!.newPage()
      await page.goto(`${baseUrl}/src/test/browser/colorScheme.fixture.html`)
      await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
    })

    afterAll(() => page.close())

    // [theme, its scheme, the opposite OS preference]. Dark is the default
    // theme: no data-theme, as useTheme leaves it.
    it.each([
      ['dark', 'dark', 'light'],
      ['cyberpunk', 'dark', 'light'],
      ['light', 'light', 'dark'],
    ] as const)('%s: native controls use the %s scheme', async (theme, scheme, osScheme) => {
      await page.emulateMedia({ colorScheme: osScheme })
      await page.evaluate(themeName => {
        if (themeName === 'dark') delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = themeName
      }, theme)

      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(scheme)
      const expected = await referenceCanvas(scheme)
      expect(await canvasIn(page, '#date')).toBe(expected)
      expect(await canvasIn(page, '#select')).toBe(expected)
    })
  })

  it.each(['dark', 'light'] as const)(
    'index.html: before the stylesheet loads, the canvas follows an OS %s preference', async osScheme => {
      const page = await browser!.newPage()
      await page.emulateMedia({ colorScheme: osScheme })
      await page.route('**/*', route => (route.request().resourceType() === 'document' ? route.continue() : route.abort()))
      await page.goto(`${baseUrl}/index.html`)
      const canvas = await canvasIn(page, 'body')
      await page.close()
      expect(canvas).toBe(await referenceCanvas(osScheme))
    })
})
