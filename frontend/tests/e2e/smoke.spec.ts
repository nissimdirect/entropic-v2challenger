/**
 * Smoke test — 30-second check that the app launches and the sidecar connects.
 *
 * Verifies:
 * 1. Electron window opens
 * 2. Window has correct title
 * 3. Python sidecar connects (status indicator turns green)
 * 4. Upload UI visible (initial empty state, post-UX-redesign)
 */
import { test, expect } from './fixtures/electron-app.fixture'
import { waitForEngineConnected } from './fixtures/test-helpers'

test.describe('Smoke Test', () => {
  test('app launches and sidecar connects within 30s', async ({ window, electronApp }) => {
    test.setTimeout(30_000)

    // 1. Window exists
    expect(window).toBeTruthy()

    // 2. Window title
    const title = await window.title()
    expect(title).toContain('Creatrix')

    // 3. Engine connects (Python sidecar started by main process)
    await waitForEngineConnected(window, 20_000)

    const statusText = await window.locator('.status-text').textContent()
    expect(statusText).toContain('Connected')

    // 4. Status indicator is present
    const indicator = window.locator('.status-indicator')
    await expect(indicator).toBeVisible()

    // 5. Initial UI state: upload container visible (post-UX-redesign — old .drop-zone replaced by .app__upload)
    await expect(window.locator('.app__upload')).toBeVisible()

    // 6. Empty state — PK.D minimal import hint shown
    await expect(window.locator('.preview-canvas__placeholder')).toBeVisible()
    await expect(window.locator('.preview-canvas__placeholder')).toHaveText('Drag a clip here, or ⌘I to import.')

    // 7. Hermetic-launch contract (frontend-framework F0.2) — folded into
    // this test to keep the PR gate at ONE Electron launch. The fixture's
    // CREATRIX_E2E=1 must yield default 1280×800 bounds (no inherited
    // window-state.json) and device scale 1 (machine-independent pixels).
    // Prerequisite for any future screenshot-baseline work.
    const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win.getBounds()
    })
    expect(bounds.width).toBe(1280)
    expect(bounds.height).toBe(800)
    // (globalThis: the fixture's `window` Page variable shadows the DOM global here)
    const dpr = await window.evaluate(() => (globalThis as unknown as { devicePixelRatio: number }).devicePixelRatio)
    expect(dpr).toBe(1)
  })
})
