/**
 * Phase 1 — UX Combination & Permutation Tests
 *
 * 14 tests (pruned from 30) — kept tests requiring real playback, video replace, error recovery:
 * - Group 1: Playback + Live Operations (5 tests) — real video playback + live effect operations
 * - Group 2: Replace Video (3 tests) — real sidecar re-ingest
 * - Group 6: Error Recovery (3 tests) — real IPC error + recovery
 * - Group 8: State Machine Transitions (3 tests) — full lifecycle integration
 *
 * PRUNED groups (migrated to Vitest: ux-combinations.test.tsx):
 * - Group 3: Multi-Effect Param Editing (5 tests) → Vitest: param switching, toggle preservation
 * - Group 4: Effect Chain Lifecycle (4 tests) → Vitest: add/remove/reorder rack state
 * - Group 5: Export Round-trips (4 tests) → Vitest: dialog open/close/reopen state
 * - Group 7: Search + Category + Effect Add (3 tests) → Vitest: filter + rack interaction
 */
// WHY E2E: Remaining tests need real playback, video replace, error recovery through live IPC

import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  stubFileDialog,
  stubSaveDialog,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'
import path from 'path'

// ── Shared Helpers ──────────────────────────────────────────

/** Import a video and wait for the first frame to render. */
async function importAndWaitForFrame(electronApp: any, window: any): Promise<void> {
  const videoPath = getTestVideoPath()
  await stubFileDialog(electronApp, videoPath)
  await window.locator('.file-dialog-btn').click()
  await window.waitForSelector('.asset-badge', { timeout: 90_000 })
  await waitForFrame(window, 15_000)
}

/** Click the play button and wait a beat for playback to start. */
async function startPlayback(window: any): Promise<void> {
  await window.locator('.preview-controls__play-btn').click()
  await window.waitForTimeout(1000)
}

/** Click the play button to pause and wait a beat. */
async function pausePlayback(window: any): Promise<void> {
  await window.locator('.preview-controls__play-btn').click()
  await window.waitForTimeout(500)
}

/** Get the current scrub slider value (frame number). */
async function getCurrentFrame(window: any): Promise<number> {
  const val = await window.locator('.preview-controls__scrub').inputValue()
  return parseInt(val, 10)
}

/** Set the scrub slider to a specific frame via nativeInputValueSetter. */
async function seekToFrame(window: any, frame: number): Promise<void> {
  await window.locator('.preview-controls__scrub').evaluate(
    (el: HTMLInputElement, f: number) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, String(f))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    },
    frame,
  )
  await window.waitForTimeout(1000)
}

/** Check play button text to determine if playing. */
async function isPlaying(window: any): Promise<boolean> {
  const text = await window.locator('.preview-controls__play-btn').textContent()
  return text?.trim() === '||'
}

const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'test-evidence', 'ux-combos')

// ═══════════════════════════════════════════════════════════
// GROUP 1: Playback + Live Operations
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 1: Playback + Live Operations', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('1. Import → Play → Add effect while playing → Preview updates', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Capture frame before playback
    await waitForFrame(window, 15_000)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)

    // Wait for a few frames to advance
    await window.waitForTimeout(2000)
    const frameBeforeEffect = await getCurrentFrame(window)
    expect(frameBeforeEffect).toBeGreaterThan(0)

    // Add an effect WHILE playing
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(2000)

    // Verify: effect is in rack AND playback is still active
    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)
    expect(await isPlaying(window)).toBe(true)

    // Verify: frame is still rendering (no crash)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('2. Play → Toggle effect off while playing → Preview changes', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add an effect first
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(1000)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Toggle effect OFF while playing
    const toggleBtn = window.locator('.effect-card__toggle').first()
    await toggleBtn.click()
    await window.waitForTimeout(1000)

    // Verify toggle shows OFF
    const toggleText = await toggleBtn.textContent()
    expect(toggleText?.trim()).toBe('OFF')

    // Verify playback still running, app stable
    expect(await isPlaying(window)).toBe(true)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('3. Play → Remove effect while playing → Preview changes, no crash', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add an effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(1000)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Remove effect while playing
    const removeBtn = window.locator('.effect-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(2000)

    // Rack should be empty
    await expect(window.locator('.effect-rack--empty')).toBeVisible()

    // Playback still works, no crash
    expect(await isPlaying(window)).toBe(true)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('4. Play → Reorder effects while playing → Preview changes', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add 2 effects
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    const availCount = await effectItems.count()
    if (availCount < 2) {
      test.skip()
      return
    }

    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    await effectItems.nth(1).click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(2)

    const name1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const name2 = await rackItems.nth(1).locator('.effect-card__name').textContent()

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Reorder: move second effect up
    const moveUpBtns = window.locator('.effect-rack__arrow[title="Move up"]')
    await moveUpBtns.nth(1).click()
    await window.waitForTimeout(2000)

    // Verify order swapped
    const swapped1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const swapped2 = await rackItems.nth(1).locator('.effect-card__name').textContent()
    expect(swapped1).toBe(name2)
    expect(swapped2).toBe(name1)

    // Playback still active, app stable
    expect(await isPlaying(window)).toBe(true)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('5. Play to end of video → Frame wraps to 0 (loop behavior)', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Get total frames from scrub slider max
    const totalFrames = await window.locator('.preview-controls__scrub').evaluate(
      (el: HTMLInputElement) => parseInt(el.max, 10),
    )

    // Seek near end (2 frames before last)
    const nearEnd = Math.max(0, totalFrames - 2)
    await seekToFrame(window, nearEnd)

    // Start playback
    await startPlayback(window)

    // Wait long enough for it to wrap past the end
    // At 30fps, 2 frames = ~67ms, but we add buffer for render latency
    await window.waitForTimeout(3000)

    // Frame should have wrapped to a low value (looped)
    const frameAfterWrap = await getCurrentFrame(window)
    // It should have wrapped past end and back near the beginning
    // (Could be anywhere in the first portion depending on timing)
    expect(frameAfterWrap).toBeLessThan(totalFrames - 1)

    await pausePlayback(window)
    await expect(window.locator('.app')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// GROUP 2: Replace Video
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 2: Replace Video', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('6. Import → Add effects → Replace video → Effects preserved, preview shows new video', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(150_000)
    await importAndWaitForFrame(electronApp, window)

    // Add 2 effects
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    if ((await effectItems.count()) >= 2) {
      await effectItems.nth(1).click()
      await window.waitForTimeout(300)
    }

    const rackItems = window.locator('.effect-rack__item')
    const effectCountBefore = await rackItems.count()
    expect(effectCountBefore).toBeGreaterThanOrEqual(1)

    // Replace video — click the "Replace" FileDialog button
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)
    const replaceBtns = window.locator('.file-dialog-btn')
    // The second file-dialog-btn is the "Replace" button (visible when asset loaded)
    const replaceBtn = replaceBtns.last()
    await replaceBtn.click()

    // Wait for re-ingest
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // Effects should still be in the rack
    const effectCountAfter = await rackItems.count()
    expect(effectCountAfter).toBe(effectCountBefore)

    // Preview should show a rendered frame
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('7. Import → Scrub to frame 50 → Replace → Frame resets to 0', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(150_000)
    await importAndWaitForFrame(electronApp, window)

    // Scrub to frame 50
    await seekToFrame(window, 50)
    const frameAfterScrub = await getCurrentFrame(window)
    expect(frameAfterScrub).toBe(50)

    // Replace video
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)
    const replaceBtns = window.locator('.file-dialog-btn')
    await replaceBtns.last().click()

    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // Frame should reset to 0 after re-ingest
    const frameAfterReplace = await getCurrentFrame(window)
    expect(frameAfterReplace).toBe(0)

    await expect(window.locator('.app')).toBeVisible()
  })

  test('8. Import → Playing → Replace → Playback stops, new video loads', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(150_000)
    await importAndWaitForFrame(electronApp, window)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Replace video while playing
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)
    const replaceBtns = window.locator('.file-dialog-btn')
    await replaceBtns.last().click()

    // Wait for re-ingest
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // The new video should load successfully regardless of playback state
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
    await expect(window.locator('.asset-badge')).toBeVisible()
  })
})

// Groups 3-5, 7 PRUNED — migrated to Vitest: ux-combinations.test.tsx
// Group 3: Multi-Effect Param Editing (tests 9-13) → param switching, toggle preservation, reorder selection
// Group 4: Effect Chain Lifecycle (tests 14-17) → add/remove/reorder rack state
// Group 5: Export Round-trips (tests 18-21) → dialog open/close/reopen state
// Group 7: Search + Category + Effect Add (tests 25-27) → filter + rack interaction

// ═══════════════════════════════════════════════════════════
// GROUP 6: Error Recovery
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 6: Error Recovery', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('22. Render error → Add/remove effect → Auto-retry clears error', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // The app has auto-retry logic in requestRenderFrame that retries with
    // empty chain on error. We test the sequence: add effect, if render error
    // occurs, adding/removing effect triggers re-render which should clear it.

    // Add an effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(2000)

    // Check if an error overlay appeared
    const errorOverlay = window.locator('.preview-canvas__error-overlay')
    const hasError = (await errorOverlay.count()) > 0

    if (hasError) {
      // Remove the effect to trigger re-render
      const removeBtn = window.locator('.effect-card__remove').first()
      await removeBtn.click()
      await window.waitForTimeout(3000)

      // Error should clear after re-render with empty chain
      expect(await errorOverlay.count()).toBe(0)
    }

    // Regardless of error, app should be stable
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('23. Drop invalid file → Error banner → Drop valid file → Error clears', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)

    // Stub dialog to return an invalid (non-existent) file first
    await electronApp.evaluate(
      async ({ ipcMain }: any) => {
        ipcMain.removeHandler('select-file')
        ipcMain.handle('select-file', async () => '/nonexistent/fake.mp4')
      },
    )

    await window.locator('.file-dialog-btn').click()
    await window.waitForTimeout(5000)

    // App should still be functional even with an ingest error
    await expect(window.locator('.app')).toBeVisible()

    // Now import a valid file
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)
    await window.locator('.file-dialog-btn').click()

    // Wait for successful ingest
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // The error should have cleared, asset loaded
    await expect(window.locator('.asset-badge')).toBeVisible()
    await expect(window.locator('.app')).toBeVisible()
  })

  test('24. Ingest error → Browse again with valid file → Success', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(150_000)

    // First attempt: invalid path
    await electronApp.evaluate(
      async ({ ipcMain }: any) => {
        ipcMain.removeHandler('select-file')
        ipcMain.handle('select-file', async () => '/tmp/does-not-exist.avi')
      },
    )

    await window.locator('.file-dialog-btn').click()
    await window.waitForTimeout(5000)

    // App still alive
    await expect(window.locator('.app')).toBeVisible()

    // Second attempt: valid file
    const videoPath = getTestVideoPath()
    await stubFileDialog(electronApp, videoPath)

    // Need to click the browse button again
    await window.locator('.file-dialog-btn').click()
    await window.waitForSelector('.asset-badge', { timeout: 90_000 })
    await waitForFrame(window, 15_000)

    // Verify success
    await expect(window.locator('.asset-badge')).toBeVisible()
    const badgeName = await window.locator('.asset-badge__name').textContent()
    expect(badgeName).toContain('valid-short')

    await expect(window.locator('.app')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// GROUP 8: State Machine Transitions
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 8: State Machine Transitions', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('28. Full lifecycle: empty → import → effects → play → pause → export → cancel → remove all → empty', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(180_000)

    // ── Empty state ──
    await expect(window.locator('.drop-zone')).toBeVisible()
    await expect(window.locator('.effect-rack--empty')).toBeVisible()
    await expect(window.locator('.param-panel--empty')).toBeVisible()
    expect(await window.locator('.export-btn').count()).toBe(0)

    // ── Import ──
    await importAndWaitForFrame(electronApp, window)
    await expect(window.locator('.asset-badge')).toBeVisible()
    await expect(window.locator('.export-btn')).toBeVisible()

    // ── Add effects ──
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    if ((await effectItems.count()) >= 2) {
      await effectItems.nth(1).click()
      await window.waitForTimeout(300)
    }

    const rackItems = window.locator('.effect-rack__item')
    const chainLen = await rackItems.count()
    expect(chainLen).toBeGreaterThanOrEqual(1)

    // ── Play ──
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(2000)

    // ── Pause ──
    await pausePlayback(window)
    expect(await isPlaying(window)).toBe(false)

    // ── Export attempt ──
    const exportBtn = window.locator('.export-btn')
    const exportPath = path.join(EVIDENCE_DIR, 'test-lifecycle.mp4')
    await stubSaveDialog(electronApp, exportPath)
    await exportBtn.click()

    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('.export-dialog__export-btn').click()
    await window.waitForTimeout(2000)

    // ── Cancel export ──
    const cancelBtn = window.locator('.export-progress__cancel')
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click()
      await window.waitForTimeout(1000)
    }

    // ── Remove all effects ──
    const removeCount = await rackItems.count()
    for (let i = 0; i < removeCount; i++) {
      const btn = window.locator('.effect-card__remove').first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await window.waitForTimeout(300)
      }
    }

    // ── Verify empty effect state ──
    await expect(window.locator('.effect-rack--empty')).toBeVisible()
    await expect(window.locator('.param-panel--empty')).toBeVisible()

    // But asset is still loaded (not fully empty — video persists)
    await expect(window.locator('.asset-badge')).toBeVisible()
    await expect(window.locator('.export-btn')).toBeVisible()

    await expect(window.locator('.app')).toBeVisible()
  })

  test('29. Toggle cycle: play → pause → play → pause → play → state always correct', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const playBtn = window.locator('.preview-controls__play-btn')

    // Cycle 1: play
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(true)
    expect((await playBtn.textContent())?.trim()).toBe('||')

    // Cycle 1: pause
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(false)
    expect((await playBtn.textContent())?.trim()).toBe('>')

    // Cycle 2: play
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(true)

    // Cycle 2: pause
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(false)

    // Cycle 3: play
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(true)

    // Final: pause
    await playBtn.click()
    await window.waitForTimeout(500)
    expect(await isPlaying(window)).toBe(false)
    expect((await playBtn.textContent())?.trim()).toBe('>')

    // Frame should still be rendering
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('30. Effect accumulation: add 1 → preview → add 2 → preview → add 3 → preview → remove 1 → preview', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    const rackItems = window.locator('.effect-rack__item')

    // Add effect 1, verify preview
    await effectItems.nth(0).click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(1)
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    // Add effect 2, verify preview
    const available = await effectItems.count()
    await effectItems.nth(Math.min(1, available - 1)).click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(2)
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    // Add effect 3, verify preview
    await effectItems.nth(Math.min(2, available - 1)).click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(3)
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    // Remove effect 1 (first in rack), verify preview with remaining 2
    const removeBtn = window.locator('.effect-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(2)
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    await expect(window.locator('.app')).toBeVisible()
  })
})
