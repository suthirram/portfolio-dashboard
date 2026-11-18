// @vitest-environment node
/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()
let server: ViteDevServer
let baseUrl: string

async function preview({ mode = 'ui2', premium = true, reduced = false, theme = 'cyberpunk' } = {}) {
  const page = await browser!.newPage({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.addInitScript(initialTheme => {
    localStorage.setItem('pd_theme', initialTheme)
    localStorage.setItem('pd_theme_chosen', '1')
    document.addEventListener('animationstart', event => {
      const animation = event as AnimationEvent
      if (animation.animationName === 'ui2-cyber-reveal' && (animation.target as HTMLElement).classList.contains('ui2-topbar')) {
        document.documentElement.dataset.entrances = String(Number(document.documentElement.dataset.entrances ?? 0) + 1)
      }
    })
  }, theme)
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: {
    id: 'cyber-review', username: 'cyber-review', name: 'Cyber Review', role: 'user', region: 'india',
    premium, ui_mode: mode, ui_revamp: mode === 'glass', gold_enabled: false, disabled: false,
    locked: false, must_change_password: false,
  } }))
  await page.goto(`${baseUrl}/src/test/browser/ui2CyberEntrance.fixture.html`)
  await page.waitForFunction(expected => document.documentElement.dataset.ui === expected,
    mode === 'ui2' ? 'ui2' : mode === 'glass' ? 'v2' : undefined)
  return page
}
const entrances = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.entrances ?? 0))
const marked = (page: Page) => page.locator('.ui2-shell[data-cyber-entrance]').count()

describe.skipIf(!browser)('UI_2.0 Cyber entrance in Chromium', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    baseUrl = fixture.baseUrl
  }, 60_000)
  afterAll(async () => { await browser?.close(); await server?.close() })

  it('plays once on load, keeps controls usable, does not replay on routing and replays on Cyber selection', async () => {
    const page = await preview()
    try {
      await expect.poll(() => entrances(page)).toBe(1)
      await page.getByRole('button', { name: 'Refresh fixture' }).click()
      expect(await page.getByRole('status', { name: 'Refresh count' }).textContent()).toBe('1')
      await expect.poll(() => marked(page), { timeout: 3000 }).toBe(0)
      await page.getByRole('link', { name: 'Fixture History' }).click()
      expect(await entrances(page)).toBe(1)
      const themes = page.getByRole('group', { name: 'Choose theme' })
      await themes.getByRole('button', { name: /Dark/ }).click()
      await themes.getByRole('button', { name: /Cyber/ }).click()
      await expect.poll(() => entrances(page)).toBe(2)
    } finally { await page.close() }
  })

  it('skips reduced motion and stops a running entrance when the preference changes', async () => {
    const reduced = await preview({ reduced: true })
    const normal = await preview()
    try {
      expect(await marked(reduced)).toBe(0)
      expect(await entrances(reduced)).toBe(0)
      await expect.poll(() => entrances(normal)).toBe(1)
      await normal.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => marked(normal)).toBe(0)
      expect(await normal.locator('.ui2-topbar').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
    } finally { await reduced.close(); await normal.close() }
  })

  it('never plays for a non-premium account with a stored Cyber theme', async () => {
    const page = await preview({ premium: false })
    try {
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
      expect(await entrances(page)).toBe(0)
      expect(await marked(page)).toBe(0)
    } finally { await page.close() }
  })

  it.each(['classic', 'glass'])('leaves the %s interface without a UI_2.0 entrance', async mode => {
    const page = await preview({ mode })
    try {
      expect(await page.locator('.ui2-shell').count()).toBe(0)
      expect(await entrances(page)).toBe(0)
    } finally { await page.close() }
  })
})
