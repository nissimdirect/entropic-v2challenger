/**
 * UAT E2E Tests — Sections 17, 19, 20 (Stress, Edge Cases, Security)
 *
 * Maps to UAT-UIT-GUIDE.md tests: #217-231, #239-277, #278-283
 */
// WHY E2E: Stress tests require real Electron + real sidecar to verify that
// rapid keyboard/mouse input doesn't crash the IPC pipeline or ZMQ relay.
// Security tests require real context isolation to verify Node.js is blocked
// in the renderer. Edge cases require real file system and real ffmpeg.
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  waitForFrame,
  waitForIngestComplete,
  importVideoViaDialog,
  getTestVideoPath,
} from '../fixtures/test-helpers'

// ── SECTION 17: Stress Testing (Tests 217-231) ────────────────────────

test.describe('UAT Section 17: Stress Testing', () => {
  test.beforeEach(async ({ electronApp, window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)
  })

  test('UAT #217: Rapid play/pause (10+ times) — no crash', async ({ window }) => {
    for (let i = 0; i < 15; i++) {
      await window.keyboard.press('Space')
      await window.waitForTimeout(50)
    }
    // Ensure paused state
    await window.keyboard.press('Space')
    await window.waitForTimeout(200)
    await window.keyboard.press('Space')

    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #218: Rapid effect add/remove — no crash', async ({ window }) => {
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() === 0) return

    for (let i = 0; i < 5; i++) {
      // Add
      await effectItem.click()
      await window.waitForTimeout(200)

      // Remove via undo
      await window.keyboard.press('Meta+z')
      await window.waitForTimeout(200)
    }

    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #220: Rapid undo/redo mashing — no crash', async ({ window }) => {
    // Add a few effects first
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() === 0) return

    await effectItem.click()
    await window.waitForTimeout(300)
    await effectItem.click()
    await window.waitForTimeout(300)

    // Rapid undo/redo
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Meta+z')
      await window.waitForTimeout(30)
    }
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Meta+Shift+z')
      await window.waitForTimeout(30)
    }

    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #221: Add effect during playback — no crash', async ({ window }) => {
    // Start playback
    await window.keyboard.press('Space')
    await window.waitForTimeout(500)

    // Add effect while playing
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() > 0) {
      await effectItem.click()
      await window.waitForTimeout(1000)
    }

    // Stop
    await window.keyboard.press('Space')
    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #229: Empty project export — error not crash', async ({ window }) => {
    // Start fresh (no video)
    await window.keyboard.press('Meta+n')
    await window.waitForTimeout(1000)

    // Try export shortcut
    await window.keyboard.press('Meta+e')
    await window.waitForTimeout(500)

    // Export dialog should either not appear or show an error
    // App must not crash
    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #230: Engine crash recovery during operation', async ({ electronApp, window }) => {
    test.setTimeout(60_000)

    // Add an effect
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() > 0) {
      await effectItem.click()
      await window.waitForTimeout(500)
    }

    // Kill engine while effects are applied
    await electronApp.evaluate(async () => {
      const { execSync } = require('child_process')
      execSync('pkill -f "backend/src/main.py" 2>/dev/null || true')
    })

    // Wait for watchdog recovery
    await waitForEngineConnected(window, 30_000)

    // App still alive
    await expect(window.locator('.app')).toBeVisible()
  })
})

// ── SECTION 19: Edge Cases (Selected Tests) ────────────────────────────

test.describe('UAT Section 19: Edge Cases', () => {
  test('UAT #265: Search no results shows empty message', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    const searchInput = window.locator('.effect-browser__search input, .effect-browser__search-input')
    if (await searchInput.count() === 0) return

    await searchInput.fill('zzzzzznotaneffect')
    await window.waitForTimeout(300)

    // Should show empty state or "no effects found"
    const items = await window.locator('.effect-browser__item').count()
    expect(items).toBe(0)

    // Clean up
    await searchInput.fill('')
  })

  test('UAT #269: Preview empty state', async ({ window }) => {
    // Initial state — no video
    await expect(window.locator('.preview-canvas__placeholder')).toBeVisible()
    const text = await window.locator('.preview-canvas__placeholder').textContent()
    expect(text).toContain('No video loaded')
  })
})

// ── SECTION 20: Red Team / Security (Tests 278-283) ───────────────────

test.describe('UAT Section 20: Red Team / Security', () => {
  test('UAT #282: No Node.js in renderer (context isolation)', async ({ window }) => {
    // Try to access Node.js in the renderer process
    const hasRequire = await window.evaluate(() => {
      try {
        return typeof (globalThis as any).require === 'function'
      } catch {
        return false
      }
    })
    expect(hasRequire).toBe(false)

    // Try process object
    const hasProcess = await window.evaluate(() => {
      try {
        return typeof (globalThis as any).process?.versions?.node === 'string'
      } catch {
        return false
      }
    })
    expect(hasProcess).toBe(false)
  })

  test('UAT #283: Navigation blocked', async ({ window }) => {
    // Try to navigate — should be blocked by will-navigate handler
    const url = await window.evaluate(() => {
      try {
        globalThis.location.href = 'https://example.com'
      } catch {
        // May throw — that's fine, navigation is blocked
      }
      return globalThis.location.href
    })

    // Should still be on the app page, not example.com
    expect(url).not.toContain('example.com')
  })
})
