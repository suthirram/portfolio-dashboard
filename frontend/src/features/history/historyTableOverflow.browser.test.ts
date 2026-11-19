// @vitest-environment node
/// <reference types="node" />

// Guards the HistoryTable against page-width overflow at mobile and tablet
// viewports (PD-059 R07). The table holds many columns and must scroll
// inside its own overflow-x:auto container, never spilling to the page.
// Also verifies that position:relative on the wrapper creates a stacking
// context for any absolutely-positioned descendants (tooltips, overlays).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../../test/browser/harness'

const browser = await launchBrowser()

let server: ViteDevServer
let page: Page

async function overflowState(selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  }, selector)
}

describe.skipIf(!browser)('HistoryTable overflow at narrow viewports', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    page = await browser!.newPage()
    await page.goto(`${fixture.baseUrl}/src/test/browser/historyTable.fixture.html`)
    await page.waitForLoadState('load')
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  for (const [label, width] of [['mobile (390 px)', 390], ['tablet (768 px)', 768]] as const) {
    it(`no page-level horizontal overflow at ${label}`, async () => {
      await page.setViewportSize({ width, height: 900 })
      const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(pageScrollWidth).toBeLessThanOrEqual(width)
    })

    it(`table scrolls inside its wrapper (not the page) at ${label}`, async () => {
      await page.setViewportSize({ width, height: 900 })
      // The inner table must be wider than the wrapper (content overflows the container)
      // — that's the expected case: the table has many columns
      const relative = await overflowState('#relative')
      expect(relative.scrollWidth).toBeGreaterThan(relative.clientWidth)
    })
  }

  it('wrapper has position:relative stacking context', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const positioning = await page.evaluate(() => {
      const el = document.querySelector('#relative') as HTMLElement
      return getComputedStyle(el).position
    })
    expect(positioning).toBe('relative')
  })

  it('bare wrapper (no position:relative) still contained by page', async () => {
    await page.setViewportSize({ width: 390, height: 900 })
    const pageScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(pageScrollWidth).toBeLessThanOrEqual(390)
  })
})
