// @vitest-environment node
/// <reference types="node" />

// The keyboard focus ring survives Forced Colors Mode (PD-058 Task 13).
// Real Chromium, real Tab presses, then the computed ring of the focused
// control is checked, with forced colors off and emulated on. Covers an
// input with inline `outline: none`, which many app inputs set.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

// The fixture's controls, in tab order.
const CONTROLS = ['button', 'plain-input', 'inline-none-input']

let server: ViteDevServer
let page: Page

// Tabs from the top of the page to the control and reports its focus ring.
async function tabTo(control: string) {
  await page.evaluate(() => document.getElementById('tab-start')!.focus())
  for (let presses = 0; presses <= CONTROLS.indexOf(control); presses++) await page.keyboard.press('Tab')
  return page.evaluate(() => {
    const focused = document.activeElement!
    const style = getComputedStyle(focused)
    return {
      id: focused.id,
      focusVisible: focused.matches(':focus-visible'),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      boxShadow: style.boxShadow,
    }
  })
}

// A system colour as the browser resolves it to rgb() right now.
const systemColor = (keyword: string) => page.evaluate(colorKeyword => {
  const probe = document.createElement('span')
  probe.style.color = colorKeyword
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}, keyword)

describe.skipIf(!browser)('keyboard focus ring in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    await page.goto(`${fixture.baseUrl}/src/test/browser/focusRing.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  // Outside forced colors the shadow is the visible ring (the outline is
  // transparent, or removed inline).
  it.each(CONTROLS)('%s: the shadow ring shows', async control => {
    await page.emulateMedia({ forcedColors: 'none' })
    const ring = await tabTo(control)
    expect(ring).toMatchObject({ id: control, focusVisible: true })
    expect(ring.boxShadow).not.toBe('none')
  })

  it.each(CONTROLS)('%s: forced colors paints a CanvasText outline', async control => {
    await page.emulateMedia({ forcedColors: 'active' })
    const ring = await tabTo(control)
    expect(ring).toMatchObject({ id: control, focusVisible: true, outline: `2px solid ${await systemColor('CanvasText')}` })
  })

  // Guards the forced-colors cases: their expected colour must be a visible
  // one, not the transparent outline the normal ring uses.
  it('CanvasText is not transparent under forced colors', async () => {
    await page.emulateMedia({ forcedColors: 'active' })
    expect(await systemColor('CanvasText')).not.toBe('rgba(0, 0, 0, 0)')
  })
})
