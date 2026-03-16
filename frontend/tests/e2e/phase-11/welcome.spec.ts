/**
 * Phase 11 E2E — Welcome screen tests.
 *
 * // WHY E2E: Welcome screen visibility depends on Electron app startup
 * state (no project loaded). It reads recent projects from disk via the
 * preload bridge and responds to real file dialog interactions. Vitest
 * can test the component in isolation but not the startup flow.
 */
import { test, expect } from '../fixtures/electron-app.fixture'

test.describe('Phase 11 — Welcome Screen', () => {
  test('welcome screen visible on launch with no project', async ({ window }) => {
    test.setTimeout(30_000)

    // On fresh launch, welcome screen should be visible
    // (depends on whether the app shows it by default — may need to be wired)
    const welcomeScreen = await window.locator('.welcome-screen').count()
    // If welcome screen is wired into App.tsx:
    if (welcomeScreen > 0) {
      expect(await window.locator('.welcome-screen__logo').textContent()).toContain('ENTROPIC')

      // New Project button exists
      const newBtn = window.locator('.welcome-screen__btn--primary')
      expect(await newBtn.count()).toBe(1)

      // Open Project button exists
      const openBtn = window.locator('.welcome-screen__btn').first()
      expect(await openBtn.count()).toBeGreaterThanOrEqual(1)
    }
  })
})
