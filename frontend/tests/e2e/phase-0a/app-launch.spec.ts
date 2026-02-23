/**
 * Phase 0A — App Launch Tests (UAT Plan tests 1-4, 9-12)
 *
 * 1. Main window opens with correct dimensions
 * 2. Window title matches expected
 * 3. Renderer loads React app (no blank screen)
 * 4. Preload bridge (window.entropic) is exposed
 * 9. Status bar shows engine status
 * 10. Initial state: empty project, no assets
 * 11. Effect browser loads (registry fetched)
 * 12. All main UI sections present
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('Phase 0A — App Launch', () => {
  test('1. main window opens with correct dimensions', async ({ electronApp, window }) => {
    const { width, height } = await window.viewportSize()!
    // electron.vite defaults to 800x600 in createWindow
    expect(width).toBeGreaterThanOrEqual(700)
    expect(height).toBeGreaterThanOrEqual(500)
  })

  test('2. window title is "Entropic v2 Challenger"', async ({ window }) => {
    const title = await window.title()
    expect(title).toBe('Entropic v2 Challenger')
  })

  test('3. renderer loads React app (not blank)', async ({ window }) => {
    // The .app container must exist — React mounted
    await expect(window.locator('.app')).toBeVisible({ timeout: 10_000 })
  })

  test('4. preload bridge exposes window.entropic', async ({ window }) => {
    const hasEntropic = await window.evaluate(() => {
      return typeof (window as any).entropic === 'object' && (window as any).entropic !== null
    })
    expect(hasEntropic).toBe(true)
  })

  test('4b. preload bridge has all required methods', async ({ window }) => {
    const methods = await window.evaluate(() => {
      const e = (window as any).entropic
      return {
        sendCommand: typeof e.sendCommand === 'function',
        selectFile: typeof e.selectFile === 'function',
        selectSavePath: typeof e.selectSavePath === 'function',
        onEngineStatus: typeof e.onEngineStatus === 'function',
        onExportProgress: typeof e.onExportProgress === 'function',
        getPathForFile: typeof e.getPathForFile === 'function',
      }
    })
    expect(methods.sendCommand).toBe(true)
    expect(methods.selectFile).toBe(true)
    expect(methods.selectSavePath).toBe(true)
    expect(methods.onEngineStatus).toBe(true)
    expect(methods.onExportProgress).toBe(true)
    expect(methods.getPathForFile).toBe(true)
  })

  test('9. status bar shows engine status text', async ({ window }) => {
    // Status bar should be present regardless of connection state
    await expect(window.locator('.status-bar')).toBeVisible()
    await expect(window.locator('.status-text')).toBeVisible()

    const statusText = await window.locator('.status-text').textContent()
    // Should be one of: Connected, Disconnected, Restarting
    expect(statusText).toMatch(/Engine: (Connected|Disconnected|Restarting)/)
  })

  test('10. initial state: empty project, no assets', async ({ window }) => {
    // Drop zone visible means no assets loaded
    await expect(window.locator('.drop-zone')).toBeVisible()
    // No asset badges
    const assetBadgeCount = await window.locator('.asset-badge').count()
    expect(assetBadgeCount).toBe(0)
    // Export button not visible when no assets
    const exportBtnCount = await window.locator('.export-btn').count()
    expect(exportBtnCount).toBe(0)
  })

  test('11. effect browser loads once engine connects', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    // Effect browser header should be visible
    await expect(window.locator('.effect-browser__header')).toBeVisible()

    // "All" category button should exist
    await expect(
      window.locator('.effect-browser__cat-btn', { hasText: 'All' }),
    ).toBeVisible()
  })

  test('12. all main UI sections are present', async ({ window }) => {
    // Sidebar
    await expect(window.locator('.app__sidebar')).toBeVisible()
    // Main area
    await expect(window.locator('.app__main')).toBeVisible()
    // Preview canvas area
    await expect(window.locator('.preview-canvas')).toBeVisible()
    // Status bar
    await expect(window.locator('.status-bar')).toBeVisible()
  })
})
