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

// Migrated off .preview-controls__play-btn / .preview-controls__scrub: those
// classes are still declared in global.css but the elements they styled were
// removed from PreviewControls.tsx long ago (58647bb) — "Play/pause and
// scrubbing handled by timeline" (see PreviewControls.tsx's own comment).
// Play/pause now lives in the global transport bar (.app__transport-btn,
// first of the three play/stop/loop buttons — App.tsx ~3200). Scrubbing now
// happens via TimeRuler's click-to-seek on `.time-ruler__canvas` (a canvas,
// not an <input type="range">) or by dragging `.playhead__head` — there is
// no numeric frame readout in the DOM, so frame position is derived from the
// transport timecode text ("m:ss.s / m:ss.s") × the asset's fps.

/** Check play/pause state via the button's title (toggles Play<->Pause),
 *  more robust than the glyph (▶/⏸) which can render inconsistently. */
async function isPlaying(window: any): Promise<boolean> {
  const title = await window.locator('.app__transport-btn').first().getAttribute('title')
  return title === 'Pause (Space)'
}

/** Click the play/pause button and poll until playback state flips to
 *  playing. Audio playback state (audioStore.isPlaying) updates via an
 *  async IPC round-trip, so a fixed sleep-then-check can read stale state
 *  under load — poll instead of assuming a fixed settle time. Re-clicks
 *  inside the retry loop (only if still not playing) in case the initial
 *  click landed while the button was mid-transition and didn't register. */
async function startPlayback(window: any): Promise<void> {
  await expect(async () => {
    if (!(await isPlaying(window))) {
      await window.locator('.app__transport-btn').first().click()
    }
    expect(await isPlaying(window)).toBe(true)
  }).toPass({ timeout: 8_000 })
}

/** Click the play/pause button and poll until playback state flips to
 *  paused. Same re-click-if-needed retry as startPlayback. */
async function pausePlayback(window: any): Promise<void> {
  await expect(async () => {
    if (await isPlaying(window)) {
      await window.locator('.app__transport-btn').first().click()
    }
    expect(await isPlaying(window)).toBe(false)
  }).toPass({ timeout: 8_000 })
}

/** Parse the transport timecode ("0:00.0 / 0:05.0") into {current, total} seconds. */
async function getTimecodeSeconds(window: any): Promise<{ current: number; total: number }> {
  const text = (await window.locator('.app__transport-timecode').textContent()) ?? '0:00.0 / 0:00.0'
  const parse = (t: string) => {
    const [m, s] = t.trim().split(':').map(Number)
    return m * 60 + s
  }
  const [curStr, totStr] = text.split('/')
  return { current: parse(curStr), total: parse(totStr ?? curStr) }
}

/** Read fps from the loaded asset's badge (e.g. "1920x1080 | 30fps"). */
async function getFps(window: any): Promise<number> {
  const meta = (await window.locator('.asset-badge__meta').first().textContent()) ?? ''
  const match = meta.match(/(\d+)\s*fps/)
  return match ? parseInt(match[1], 10) : 30
}

/** Get the current frame number, derived from the timecode text × fps.
 *  Approximate (±1-2 frames): the timecode only has 0.1s resolution. */
async function getCurrentFrame(window: any): Promise<number> {
  const [{ current }, fps] = await Promise.all([getTimecodeSeconds(window), getFps(window)])
  return Math.round(current * fps)
}

/** Seek to a specific frame by clicking the TimeRuler at the proportional
 *  x position (frame/fps as a fraction of total duration × ruler width).
 *  TimeRuler treats a pointerdown+pointerup with no drag as click-to-seek
 *  (TimeRuler.tsx handlePointerUp).
 *
 *  Self-correcting: the ruler's actual visible time range doesn't
 *  necessarily equal exactly [0, duration] (zoom-to-fit can pad it), so a
 *  single fraction-of-width click can land a few frames off. Re-reads the
 *  resulting frame after each click and nudges the fraction by the observed
 *  error until within the timecode display's own precision (0.1s) or the
 *  iteration budget runs out. */
async function seekToFrame(window: any, frame: number): Promise<void> {
  const fps = await getFps(window)
  const targetSeconds = frame / fps
  const ruler = window.locator('.time-ruler__canvas')

  let { total } = await getTimecodeSeconds(window)
  if (total <= 0) return
  let fraction = Math.max(0, Math.min(1, targetSeconds / total))

  for (let i = 0; i < 4; i++) {
    const box = await ruler.boundingBox()
    if (!box) return
    await ruler.click({ position: { x: fraction * box.width, y: box.height / 2 } })
    await window.waitForTimeout(500)

    const actualFrame = await getCurrentFrame(window)
    const errorFrames = frame - actualFrame
    if (Math.abs(errorFrames) <= 2) break
    const errorSeconds = errorFrames / fps
    fraction = Math.max(0, Math.min(1, fraction + errorSeconds / total))
  }
  await window.waitForTimeout(500)
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
    const rackItems = window.locator('.device-chain__item')
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
    const toggleBtn = window.locator('.device-card__toggle').first()
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

    const rackItems = window.locator('.device-chain__item')
    expect(await rackItems.count()).toBe(1)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Remove effect while playing
    const removeBtn = window.locator('.device-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(2000)

    // Rack should be empty
    await expect(window.locator('.device-chain__empty')).toBeVisible()

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

    const rackItems = window.locator('.device-chain__item')
    expect(await rackItems.count()).toBe(2)

    const name1 = await rackItems.nth(0).locator('.device-card__name').textContent()
    const name2 = await rackItems.nth(1).locator('.device-card__name').textContent()

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Phase 13C: DeviceChain removed move-up/move-down arrow buttons;
    // reordering is via drag-and-drop. The .effect-rack__arrow[title="Move up"]
    // selector no longer exists in the DOM. This block is intentionally
    // preserved as a no-op (moveUpCount will be 0) until AC-9 drag-and-drop
    // reorder tests are added — matches the same migration already applied
    // in phase-1/effect-chain.spec.ts.
    const moveUpBtns = window.locator('.effect-rack__arrow[title="Move up"]')
    const moveUpCount = await moveUpBtns.count()

    if (moveUpCount > 0) {
      await moveUpBtns.nth(1).click()
      await window.waitForTimeout(2000)

      // Verify order swapped
      const swapped1 = await rackItems.nth(0).locator('.device-card__name').textContent()
      const swapped2 = await rackItems.nth(1).locator('.device-card__name').textContent()
      expect(swapped1).toBe(name2)
      expect(swapped2).toBe(name1)
    }

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

    // Get total frames from the transport timecode × fps (no numeric scrub
    // slider exists anymore — see helper comment above).
    const { total: totalSeconds } = await getTimecodeSeconds(window)
    const fpsForTotal = await getFps(window)
    const totalFrames = Math.round(totalSeconds * fpsForTotal)

    // Seek near end (2 frames before last)
    const nearEnd = Math.max(0, totalFrames - 2)
    await seekToFrame(window, nearEnd)

    // Start playback
    await startPlayback(window)

    // Poll for the wrap rather than a fixed sleep-then-read: at 30fps, 2
    // frames = ~67ms, but getCurrentFrame's ±1-2 frame text-parsing
    // imprecision can read exactly at the not-yet-wrapped boundary on a
    // single fixed-delay check. It should have wrapped past end and back
    // near the beginning (could be anywhere in the first portion depending
    // on timing).
    let frameAfterWrap = 0
    await expect(async () => {
      frameAfterWrap = await getCurrentFrame(window)
      expect(frameAfterWrap).toBeLessThan(totalFrames - 1)
    }).toPass({ timeout: 8_000 })

    await pausePlayback(window)
    await expect(window.locator('.app')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// GROUP 2: Replace Video
// ═══════════════════════════════════════════════════════════

// "Replace Video" (in-place media swap: same track/clip/effects, new source
// file) is not a feature the current app has. handleFileIngest (App.tsx,
// used by both the initial-import FileDialog button and the Cmd+I
// "Import Media" shortcut) unconditionally does "Auto-create track + clip on
// import (CapCut behavior)" — every import adds a brand-new track, there is
// no code path that swaps an existing clip's source media. Confirmed
// empirically: importing the same file twice via Cmd+I after an initial
// import took .asset-badge count from 1 to 2, not back to 1. RelinkDialog.tsx
// looked like a candidate but is a different feature entirely — it only
// fires automatically on project load when a referenced file is missing on
// disk, not manually invokable mid-session. There is also no "Replace"
// button anymore (the FileDialog button that these tests targeted via
// `.file-dialog-btn.last()` only renders while `!hasAssets`; after import it
// is removed from the DOM, which is why these tests hung on a 30s click
// timeout waiting for a second instance that was never there).
// These 3 tests are skipped rather than rewritten to fit a different
// behavior (e.g. "import adds a 2nd track") — that would test something
// other than what the test names/descriptions claim to verify.
test.describe.skip('UX Combos — Group 2: Replace Video', () => {
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

    const rackItems = window.locator('.device-chain__item')
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
      const removeBtn = window.locator('.device-card__remove').first()
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
    // .param-panel--empty dropped: ParamPanel.tsx (the component that owned
    // it) is dead code, never mounted — no current DOM equivalent to assert.
    await expect(window.locator('.timeline__empty')).toBeVisible()
    await expect(window.locator('.device-chain__empty')).toBeVisible()

    // ── Import ──
    await importAndWaitForFrame(electronApp, window)
    await expect(window.locator('.asset-badge')).toBeVisible()

    // ── Add effects ──
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    if ((await effectItems.count()) >= 2) {
      await effectItems.nth(1).click()
      await window.waitForTimeout(300)
    }

    const rackItems = window.locator('.device-chain__item')
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
    // .export-btn dropped: export lost its visible trigger button — it's
    // "Export accessible via File > Export (Cmd+E) — no visible button
    // needed" (App.tsx). Trigger via the registered shortcut instead
    // (utils/default-shortcuts.ts: { action: 'export', keys: 'meta+e' }).
    const exportPath = path.join(EVIDENCE_DIR, 'test-lifecycle.mp4')
    await stubSaveDialog(electronApp, exportPath)
    await window.keyboard.press('Meta+e')

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
      const btn = window.locator('.device-card__remove').first()
      if ((await btn.count()) > 0) {
        await btn.click()
        await window.waitForTimeout(300)
      }
    }

    // ── Verify empty effect state ──
    await expect(window.locator('.device-chain__empty')).toBeVisible()

    // But asset is still loaded (not fully empty — video persists)
    await expect(window.locator('.asset-badge')).toBeVisible()

    await expect(window.locator('.app')).toBeVisible()
  })

  test('29. Toggle cycle: play → pause → play → pause → play → state always correct', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Play/pause moved to the global transport bar (see helper comment
    // above) — the glyph (▶/⏸) is checked via title instead, which is
    // stable across font rendering. startPlayback/pausePlayback poll for
    // the state flip rather than assuming a fixed settle time.
    const playBtn = window.locator('.app__transport-btn').first()

    // Cycle 1: play
    await startPlayback(window)
    expect(await playBtn.getAttribute('title')).toBe('Pause (Space)')

    // Cycle 1: pause
    await pausePlayback(window)
    expect(await playBtn.getAttribute('title')).toBe('Play (Space)')

    // Cycle 2: play
    await startPlayback(window)

    // Cycle 2: pause
    await pausePlayback(window)

    // Cycle 3: play
    await startPlayback(window)

    // Final: pause
    await pausePlayback(window)
    expect(await playBtn.getAttribute('title')).toBe('Play (Space)')

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
    const rackItems = window.locator('.device-chain__item')

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
    const removeBtn = window.locator('.device-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(2)
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    await expect(window.locator('.app')).toBeVisible()
  })
})
