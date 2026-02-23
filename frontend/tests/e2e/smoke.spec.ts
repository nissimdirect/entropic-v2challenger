/**
 * Smoke test — 30-second check that the app launches and the sidecar connects.
 *
 * Verifies:
 * 1. Electron window opens
 * 2. Window has correct title
 * 3. Python sidecar connects (status indicator turns green)
 * 4. Drop zone is visible (initial empty state)
 */
import { test, expect } from './fixtures/electron-app.fixture'
import { waitForEngineConnected } from './fixtures/test-helpers'

test.describe('Smoke Test', () => {
  test('app launches and sidecar connects within 30s', async ({ electronApp, window }) => {
    test.setTimeout(30_000)

    // 1. Window exists
    expect(window).toBeTruthy()

    // 2. Window title
    const title = await window.title()
    expect(title).toContain('Entropic')

    // 3. Engine connects (Python sidecar started by main process)
    await waitForEngineConnected(window, 20_000)

    const statusText = await window.locator('.status-text').textContent()
    expect(statusText).toContain('Connected')

    // 4. Status indicator is present
    const indicator = window.locator('.status-indicator')
    await expect(indicator).toBeVisible()

    // 5. Initial UI state: drop zone visible
    await expect(window.locator('.drop-zone')).toBeVisible()

    // 6. No video loaded — placeholder shown
    await expect(window.locator('.preview-canvas__placeholder')).toBeVisible()
    await expect(window.locator('.preview-canvas__placeholder')).toHaveText('No video loaded')
  })
})
