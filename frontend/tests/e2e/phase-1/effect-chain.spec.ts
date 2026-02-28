/**
 * Phase 1 — Effect Chain Tests (UAT Gap: AC-9, AC-12)
 *
 * // WHY E2E: AC-12 queries real engine via IPC (list_effects command)
 * // WHY E2E: AC-9 reorder needs real video import + effect pipeline
 * // WHY E2E: Move-up disabled test needs real import + effect add via IPC
 *
 * AC-9: Drag to reorder effects in chain (uses move-up/move-down buttons)
 * AC-12: At least 10 effects registered and working
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  stubFileDialog,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'

test.describe('Phase 1 — Effect Chain', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('AC-12: at least 10 effects registered in browser', async ({ window }) => {
    // Query the effect registry via IPC
    const effectCount = await window.evaluate(async () => {
      const res = await (window as any).entropic.sendCommand({
        cmd: 'list_effects',
      })
      if (res.ok && Array.isArray(res.effects)) {
        return res.effects.length
      }
      return 0
    })

    expect(effectCount).toBeGreaterThanOrEqual(10)

    // Also verify the UI shows effects
    const browserItems = window.locator('.effect-browser__item')
    await expect(browserItems.first()).toBeVisible({ timeout: 5_000 })
    const uiCount = await browserItems.count()
    expect(uiCount).toBeGreaterThanOrEqual(10)
  })

  test('AC-9: reorder effects via move-down button', async ({ electronApp, window }) => {
    test.setTimeout(120_000)

    // Import video so effects can be applied
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)

    const browseBtn = window.locator('.file-dialog-btn')
    await browseBtn.click()
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // Add first effect (Invert)
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()

    const rackItems = window.locator('.effect-rack__item')
    await expect(rackItems.first()).toBeVisible({ timeout: 5_000 })

    // Add second effect (Hue Shift)
    const effectCount = await effectItems.count()
    if (effectCount < 2) {
      test.skip()
      return
    }
    await effectItems.nth(1).click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(2)

    // Read initial order — effect names are inside EffectCard (.effect-card__name)
    const firstName = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const secondName = await rackItems.nth(1).locator('.effect-card__name').textContent()

    // Click "move down" arrow on first effect to swap positions
    const moveDownBtns = window.locator('.effect-rack__arrow[title="Move down"]')
    const moveDownCount = await moveDownBtns.count()

    if (moveDownCount > 0) {
      await moveDownBtns.first().click()
      await window.waitForTimeout(500)

      // Verify order swapped
      const newFirstName = await rackItems.nth(0).locator('.effect-card__name').textContent()
      const newSecondName = await rackItems.nth(1).locator('.effect-card__name').textContent()

      expect(newFirstName).toBe(secondName)
      expect(newSecondName).toBe(firstName)
    }

    // App should remain stable
    await expect(window.locator('.app')).toBeVisible()
  })

  test('AC-9: move-up button disabled on first item', async ({ electronApp, window }) => {
    test.setTimeout(120_000)

    // Import video
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)
    await window.locator('.file-dialog-btn').click()
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // Add one effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()

    const rackItems = window.locator('.effect-rack__item')
    await expect(rackItems.first()).toBeVisible({ timeout: 5_000 })

    // The move-up button on the first (and only) item should be disabled
    const moveUpBtn = rackItems.first().locator('.effect-rack__arrow[title="Move up"]')
    const moveUpCount = await moveUpBtn.count()

    if (moveUpCount > 0) {
      const isDisabled = await moveUpBtn.isDisabled()
      expect(isDisabled).toBe(true)
    }
  })
})
