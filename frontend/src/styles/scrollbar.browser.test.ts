// @vitest-environment node
/// <reference types="node" />

// Every scroller gets the theme's thin scrollbar (PD-058 Task 10). Checked
// on the styles Chromium computes, for the root and a nested scroll
// container, in every theme: an undefined token, a later overriding rule or
// a theme that doesn't reach the scrollbar fails, a reformatted stylesheet
// doesn't.
//
// The ::-webkit-scrollbar fallback is not covered: it applies only where
// scrollbar-color is unsupported, and Playwright's Chromium supports it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// Each theme, in the current UI and the glass UI (data-ui="v2"), which
// redefines the token the thumb uses.
const THEMES = ['dark', 'light', 'cyberpunk'].flatMap(theme => [[theme, false], [theme, true]] as const)

let server: ViteDevServer
let page: Page

// Switches the theme the way useTheme and applyUiMode do: attributes on <html>.
const applyTheme = (theme: string, glass: boolean) => page.evaluate(([themeName, glassUi]) => {
  document.documentElement.dataset.theme = themeName
  if (glassUi) document.documentElement.dataset.ui = 'v2'
  else delete document.documentElement.dataset.ui
}, [theme, glass] as const)

// The scrollbar styles Chromium computes for the root and the nested container.
const scrollbarStyles = () => page.evaluate(() =>
  [document.documentElement, document.getElementById('nested')!].map(element => {
    const style = getComputedStyle(element)
    return { width: style.scrollbarWidth, color: style.scrollbarColor }
  }))

// The current theme's thumb token, resolved by the browser to rgb(). An
// undefined token leaves scrollbar-color at auto, so it still fails.
const thumbColor = () => page.evaluate(() => {
  const probe = document.createElement('span')
  probe.style.color = 'var(--scrollbar-thumb)'
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
})

describe.skipIf(!browser)('scrollbar styling in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage({ viewport: { width: 800, height: 400 } })
    await page.goto(`${fixture.baseUrl}/src/test/browser/scrollbar.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.documentElement).scrollbarWidth === 'thin')
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('the root and the nested container both scroll', async () => {
    const overflows = await page.evaluate(() =>
      [document.documentElement, document.getElementById('nested')!].map(element => element.scrollHeight > element.clientHeight))
    expect(overflows).toEqual([true, true])
  })

  it.each(THEMES)('%s theme (glass UI: %s): thin, with the theme\'s thumb on a transparent track', async (theme, glass) => {
    await applyTheme(theme, glass)
    const expected = { width: 'thin', color: `${await thumbColor()} rgba(0, 0, 0, 0)` }
    expect(await scrollbarStyles()).toEqual([expected, expected])
  })

  // Guards the per-theme cases: a theme switch that did nothing would leave
  // both sides of their comparison unchanged and still pass.
  it('switching between dark and light changes the scrollbar colour', async () => {
    await applyTheme('dark', false)
    const dark = (await scrollbarStyles())[0].color
    await applyTheme('light', false)
    expect((await scrollbarStyles())[0].color).not.toBe(dark)
  })
})
