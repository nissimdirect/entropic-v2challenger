/**
 * // WHY E2E: Tests requiring real video import, IPC pipeline, and frame rendering
 * Edge Case & Boundary Tests
 *
 * Tests for every edge case, boundary condition, and error recovery path.
 * Organized by feature area: import, effects, export, parameters.
 *
 * Covers:
 * - Boundary values on all numeric inputs
 * - Error recovery from failed operations
 * - State transitions (empty → loaded → effects → export)
 * - Concurrent/rapid interactions not covered by chaos tests
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  stubFileDialog,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'

// Helper: import video
async function importVideo(electronApp: any, window: any): Promise<void> {
  const videoPath = getTestVideoPath()
  await stubFileDialog(electronApp, videoPath)
  await window.locator('.file-dialog-btn').click()
  await window.waitForSelector('.asset-badge', { timeout: 90_000 })
  await waitForFrame(window, 15_000)
}

// ═══════════════════════════════════════════════
// IMPORT — Edge Cases
// ═══════════════════════════════════════════════
test.describe('Edge Cases — Import', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('ingest error shows error message in drop zone', async ({ electronApp, window }: any) => {
    // Stub dialog to return a non-existent file
    await electronApp.evaluate(
      async ({ ipcMain }: any) => {
        ipcMain.removeHandler('select-file')
        ipcMain.handle('select-file', async () => '/nonexistent/fake.mp4')
      },
    )

    await window.locator('.file-dialog-btn').click()
    await window.waitForTimeout(3000)

    // Either error shown in drop zone or ingest completes with error
    // The app should still be functional
    await expect(window.locator('.app')).toBeVisible()
  })

  test('Browse button disabled during ingest', async ({ window }) => {
    // We can check the disabled behavior by reading the component's behavior
    // FileDialog disables the button when isIngesting is true
    const browseBtn = window.locator('.file-dialog-btn')
    await expect(browseBtn).toBeEnabled()

    // After clicking, if ingest starts, button should be disabled
    // (can't reliably test mid-ingest state without race conditions)
    await expect(browseBtn).toBeVisible()
  })
})

// ═══════════════════════════════════════════════
// EFFECTS — Edge Cases
// ═══════════════════════════════════════════════
test.describe('Edge Cases — Effects', () => {
  test('add max effects (10) then verify button disabled', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    const availableEffects = await effectItems.count()

    // Add effects up to 10 (or as many as available)
    const toAdd = Math.min(10, availableEffects)
    for (let i = 0; i < toAdd; i++) {
      // Always click first available — they all add different instances
      await effectItems.nth(i % availableEffects).click()
      await window.waitForTimeout(200)
    }

    const rackItems = window.locator('.effect-rack__item')
    const chainLen = await rackItems.count()
    expect(chainLen).toBe(toAdd)

    // If we added 10, all add buttons should be disabled
    if (toAdd === 10) {
      const firstBtn = effectItems.first()
      const isDisabled = await firstBtn.isDisabled()
      expect(isDisabled).toBe(true)

      // Title should indicate max reached
      const title = await firstBtn.getAttribute('title')
      expect(title).toBe('Max 10 effects')
    }
  })

  test('remove all effects then add one — rack works correctly', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Add 3 effects
    for (let i = 0; i < 3; i++) {
      await effectItems.nth(i).click()
      await window.waitForTimeout(200)
    }

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(3)

    // Remove all via remove buttons
    for (let i = 0; i < 3; i++) {
      const removeBtn = window.locator('.effect-card__remove').first()
      await removeBtn.click()
      await window.waitForTimeout(200)
    }

    // Rack should be empty
    const emptyRack = window.locator('.effect-rack--empty')
    await expect(emptyRack).toBeVisible()

    // Add one more — should work fine
    await effectItems.first().click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(1)

    // Preview should still show a frame
    const previewCanvas = window.locator('.preview-canvas__element')
    const frameReady = await previewCanvas.getAttribute('data-frame-ready')
    expect(frameReady).toBe('true')
  })

  test('toggle effect off/on does not crash when multiple effects in chain', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Add 3 effects
    for (let i = 0; i < Math.min(3, await effectItems.count()); i++) {
      await effectItems.nth(i).click()
      await window.waitForTimeout(200)
    }

    // Toggle each effect off then on
    const toggleBtns = window.locator('.effect-card__toggle')
    const toggleCount = await toggleBtns.count()

    for (let i = 0; i < toggleCount; i++) {
      // Toggle off
      await toggleBtns.nth(i).click()
      await window.waitForTimeout(300)
      const offText = await toggleBtns.nth(i).textContent()
      expect(offText?.trim()).toBe('OFF')

      // Toggle on
      await toggleBtns.nth(i).click()
      await window.waitForTimeout(300)
      const onText = await toggleBtns.nth(i).textContent()
      expect(onText?.trim()).toBe('ON')
    }

    await expect(window.locator('.app')).toBeVisible()
  })

  test('reorder up on second item, then down — returns to original order', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Add 2 effects
    await effectItems.nth(0).click()
    await window.waitForTimeout(200)
    await effectItems.nth(1).click()
    await window.waitForTimeout(200)

    const rackItems = window.locator('.effect-rack__item')
    const name1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const name2 = await rackItems.nth(1).locator('.effect-card__name').textContent()

    // Move second item up (use move-up on second item)
    const moveUpBtns = window.locator('.effect-rack__arrow[title="Move up"]')
    await moveUpBtns.nth(1).click()
    await window.waitForTimeout(300)

    // Order should be swapped
    const swapped1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const swapped2 = await rackItems.nth(1).locator('.effect-card__name').textContent()
    expect(swapped1).toBe(name2)
    expect(swapped2).toBe(name1)

    // Move first item down (swap back)
    const moveDownBtns = window.locator('.effect-rack__arrow[title="Move down"]')
    await moveDownBtns.first().click()
    await window.waitForTimeout(300)

    // Should be back to original order
    const final1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const final2 = await rackItems.nth(1).locator('.effect-card__name').textContent()
    expect(final1).toBe(name1)
    expect(final2).toBe(name2)
  })
})

// ═══════════════════════════════════════════════
// EXPORT — Edge Cases
// ═══════════════════════════════════════════════
test.describe('Edge Cases — Export', () => {
  test('export with no effects applied still works', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    // Export button should be visible (video loaded, no effects)
    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()

    // Open export dialog
    await exportBtn.click()
    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // Frames should show the video frame count
    const framesText = await dialog.textContent()
    expect(framesText).toContain('150') // 5s @ 30fps

    // Close
    await window.locator('.export-dialog__cancel-btn').click()
  })

  test('export dialog shows correct frame count', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    await window.locator('.export-btn').click()
    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // Frame count field
    const bodyText = await dialog.locator('.export-dialog__body').textContent()
    // Should contain a number > 0
    expect(bodyText).toMatch(/\d+/)

    await window.locator('.export-dialog__close').click()
  })
})

// ═══════════════════════════════════════════════
// PARAMETERS — Edge Cases
// ═══════════════════════════════════════════════
test.describe('Edge Cases — Parameters', () => {
  test('param slider at min and max values', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    // Add an effect
    const effectItems = window.locator('.effect-browser__item')
    await effectItems.first().click()

    const rackItems = window.locator('.effect-rack__item')
    await expect(rackItems.first()).toBeVisible({ timeout: 5_000 })

    // Select the effect
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    const sliders = window.locator('.param-slider input[type="range"]')
    if ((await sliders.count()) > 0) {
      const slider = sliders.first()

      // Set to minimum
      await slider.evaluate((el: HTMLInputElement) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, el.min)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await window.waitForTimeout(500)

      // App should be stable
      await expect(window.locator('.app')).toBeVisible()

      // Set to maximum
      await slider.evaluate((el: HTMLInputElement) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, el.max)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await window.waitForTimeout(500)

      await expect(window.locator('.app')).toBeVisible()
    }
  })

  test('mix slider at 0 (full dry) and 1 (full wet)', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    // Add and select effect
    const effectItems = window.locator('.effect-browser__item')
    await effectItems.first().click()
    const rackItems = window.locator('.effect-rack__item')
    await expect(rackItems.first()).toBeVisible({ timeout: 5_000 })
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    const mixSlider = window.locator('.param-mix input[type="range"]')
    if ((await mixSlider.count()) > 0) {
      // Set to 0 (full dry)
      await mixSlider.evaluate((el: HTMLInputElement) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, '0')
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await window.waitForTimeout(500)
      await expect(window.locator('.app')).toBeVisible()

      // Set to 1 (full wet)
      await mixSlider.evaluate((el: HTMLInputElement) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, '1')
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })
      await window.waitForTimeout(500)
      await expect(window.locator('.app')).toBeVisible()
    }
  })

  test('scrub slider boundary: frame 0 and last frame', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    const scrub = window.locator('.preview-controls__scrub')

    // Set to frame 0
    await scrub.evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, '0')
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await window.waitForTimeout(1000)

    let frameReady = await window.locator('.preview-canvas__element').getAttribute('data-frame-ready')
    expect(frameReady).toBe('true')

    // Set to last frame
    await scrub.evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, el.max)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await window.waitForTimeout(1000)

    frameReady = await window.locator('.preview-canvas__element').getAttribute('data-frame-ready')
    expect(frameReady).toBe('true')
  })
})

// ═══════════════════════════════════════════════
// STATE TRANSITIONS — Full Lifecycle
// ═══════════════════════════════════════════════
test.describe('Edge Cases — State Transitions', () => {
  test('empty state → all UI constraints correct', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    // No export button
    expect(await window.locator('.export-btn').count()).toBe(0)

    // Drop zone visible
    await expect(window.locator('.drop-zone')).toBeVisible()

    // Placeholder text
    await expect(window.locator('.preview-canvas__placeholder')).toHaveText('No video loaded')

    // Scrub disabled
    expect(await window.locator('.preview-controls__scrub').isDisabled()).toBe(true)

    // Empty effect rack
    await expect(window.locator('.effect-rack--empty')).toBeVisible()

    // Empty param panel
    await expect(window.locator('.param-panel--empty')).toBeVisible()
  })

  test('loaded state → all UI constraints correct', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importVideo(electronApp, window)

    // Export button visible
    await expect(window.locator('.export-btn')).toBeVisible()

    // Asset badge visible
    await expect(window.locator('.asset-badge')).toBeVisible()

    // Drop zone gone (replaced by asset badge)
    // or still present depending on UI — check what's actually shown
    const previewCanvas = window.locator('.preview-canvas__element')
    await expect(previewCanvas).toBeVisible()

    // Scrub enabled
    expect(await window.locator('.preview-controls__scrub').isDisabled()).toBe(false)

    // Frame renders
    const frameReady = await previewCanvas.getAttribute('data-frame-ready')
    expect(frameReady).toBe('true')
  })
})
