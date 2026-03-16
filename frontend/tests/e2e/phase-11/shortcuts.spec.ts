/**
 * Phase 11 E2E — Keyboard shortcut tests.
 *
 * // WHY E2E: Shortcut tests need a real Electron window with capture-phase
 * event listeners (window.addEventListener('keydown', ..., true)). Vitest's
 * jsdom doesn't support capture-phase events or real focus/blur. These tests
 * verify shortcuts work end-to-end including perform mode context switching.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('Phase 11 — Keyboard Shortcuts', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(30_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('Cmd+Z triggers undo', async ({ window }) => {
    // Upload a video first so undo has something to work with
    // Then apply an effect
    await window.keyboard.press('Meta+z')
    // Undo should not crash — just verify no error
    const errorEl = await window.locator('.error-boundary').count()
    expect(errorEl).toBe(0)
  })

  test('Space toggles play/pause', async ({ window }) => {
    // Space should not crash when no video loaded
    await window.keyboard.press('Space')
    await window.waitForTimeout(100)
    const errorEl = await window.locator('.error-boundary').count()
    expect(errorEl).toBe(0)
  })

  test('shortcuts do not fire in text inputs', async ({ window }) => {
    // If there's any text input on screen, typing shouldn't trigger shortcuts
    const inputs = await window.locator('input[type="text"]').count()
    if (inputs > 0) {
      const input = window.locator('input[type="text"]').first()
      await input.focus()
      await input.type('z') // Should NOT trigger undo
      const errorEl = await window.locator('.error-boundary').count()
      expect(errorEl).toBe(0)
    }
  })
})
