// @vitest-environment node
/// <reference types="node" />

// UI_2.0 type follows the super admin's Branding font (PD-059, owner
// 2026-11-18). Real Chromium: the shell's brand, navigation and page text
// all take the family that useBranding writes to --brand-font-family.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()

let server: ViteDevServer
let page: Page

const families = () => page.evaluate(() =>
  Object.fromEntries(['brand', 'nav-link', 'page-text'].map(id => [id, getComputedStyle(document.getElementById(id)!).fontFamily])))

// What useBranding's applyBrandFont does for a chosen font.
const applyBrandFont = (cssFamily: string) => page.evaluate(family =>
  document.documentElement.style.setProperty('--brand-font-family', family), cssFamily)

describe.skipIf(!browser)('UI_2.0 type follows Branding in a real browser', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    await page.goto(`${fixture.baseUrl}/src/test/browser/ui2Branding.fixture.html`)
    await page.waitForFunction(() => getComputedStyle(document.body).margin === '0px') // the stylesheet has loaded
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each([
    ['Roboto', 'Roboto, "Roboto Fallback", Arial, sans-serif'],
    ['JetBrains Mono', '"JetBrains Mono", ui-monospace, monospace'],
  ])('renders the shell in the Branding font %s', async (name, cssFamily) => {
    await applyBrandFont(cssFamily)
    const used = await families()
    for (const [id, family] of Object.entries(used)) {
      expect(family.startsWith(`"${name}"`) || family.startsWith(name), `${id}: ${family}`).toBe(true)
    }
  })
})
