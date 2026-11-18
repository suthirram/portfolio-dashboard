/// <reference types="node" />

// Shared setup for the real-browser tests (*.browser.test.ts): a Chromium
// from Playwright and a Vite dev server that serves the fixture pages under
// src/test/browser with the real app stylesheet.
//
// The browser is null when Chromium cannot launch, so a test file can skip
// with describe.skipIf(!browser). REQUIRE_BROWSER_TESTS=1 fails instead;
// CI sets it.
// Install locally: npx playwright install chromium-headless-shell
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

// One launch serves as both the availability probe and the test browser.
// Linux Chromium rounds each glyph advance to a whole pixel unless font
// hinting is off, so text widths drift from macOS and Windows and the
// metric-matched fallbacks re-wrap (fontFallback.browser.test.ts). This flag
// turns on subpixel positioning, as those platforms' browsers use.
export const launchBrowser = () => chromium.launch({ args: ['--font-render-hinting=none'] }).catch((error: unknown) => {
  if (process.env.REQUIRE_BROWSER_TESTS === '1') throw error
  return null
})

// Starts a dev server on a free port; baseUrl has no trailing slash.
export async function startFixtureServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({
    root: resolve(process.cwd()),
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
  })
  await server.listen()
  return { server, baseUrl: server.resolvedUrls!.local[0].replace(/\/$/, '') }
}
