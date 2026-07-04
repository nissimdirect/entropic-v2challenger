/**
 * GH #425 — F-1/F-2 regression e2e.
 *
 * // WHY E2E: real capture-phase keydown (window.addEventListener('keydown',
 * ..., true)) plus a real pointer drag through an actual layout/paint/resize
 * cycle — vitest/jsdom doesn't implement pointer capture, capture-phase focus,
 * or ResizeObserver-driven layout timing (see phase-11/shortcuts.spec.ts
 * header comment). F-2 in particular can ONLY be caught here: its root cause
 * (below) is a mount-order race that depends on real Electron paint timing —
 * a jsdom-rendered component would never reproduce it.
 *
 * F-1 root cause (App.tsx 'tool_marquee'/'tool_lasso' handlers, MK.4/MK.5):
 * they wrote useTimelineStore.previewToolMode but never wrote
 * useLayoutStore.cursorTool, so every indicator keyed off cursorTool (the
 * ToolRail active-icon highlight, the "tool: {cursorTool}" statusbar chip)
 * stayed on 'select' after a 'q'/'w' press. Fixed by also calling
 * setCursorTool() at each step, mirroring the click path
 * (EffectBrowser.tsx/ToolRail.tsx -> selectCursorTool()).
 *
 * F-2 root cause (MaskSelectOverlay.tsx, NOT a computer-use pointer-event
 * limitation as the issue speculated): MaskSelectOverlay mounts unconditionally
 * at app startup, before any clip is selected. Its layout-measuring effect ran
 * once on that very first mount, found `containerRef.current` (the shared
 * previewContainerRef div) not yet attached, and bailed — permanently, because
 * its dependency array (`canvasWidth`/`canvasHeight`, which default to
 * 1920x1080 in App.tsx) never changes value for a 1920x1080 clip, the most
 * common resolution (and the one this repo's own test fixture uses). With
 * `layout` stuck at `null`, every pointer handler early-returns, so a mask
 * drag silently no-ops regardless of input method — reproducible with a real
 * OS-level Playwright drag, not a CU artifact. Fixed by retrying the ref
 * attach via requestAnimationFrame until it resolves, instead of relying on
 * an unrelated dependency happening to change.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  importVideoViaDialog,
  waitForIngestComplete,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'

test.describe('GH #425 — masking tool hotkey + mask-draw proof', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('F-1/F-2: "q" activates the mask tool while an effect is selected, and a preview drag commits a mask', async ({
    electronApp,
    window,
  }) => {
    // 1. Import a clip so MaskSelectOverlay has a clipId to write to.
    const videoPath = getTestVideoPath()
    await importVideoViaDialog(electronApp, window, videoPath)
    await waitForIngestComplete(window, 90_000)
    await waitForFrame(window, 15_000)

    // 2. Select the clip (MaskSelectOverlay's `clipId` prop comes from the
    // selected clip, App.tsx:3997).
    const clip = window.locator('.clip').first()
    await expect(clip).toBeVisible({ timeout: 10_000 })
    await clip.click()

    // 3. Add an effect and select it — reproduces the exact "effect focus"
    // context from the bug report (F-1: hotkey blocked "when an effect is
    // the active selection context").
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    const deviceCard = window.locator('.device-chain__item .device-card').first()
    await expect(deviceCard).toBeVisible({ timeout: 5_000 })
    await deviceCard.click()

    // 4. Press "q" — real capture-phase keydown, effect still selected.
    await window.keyboard.press('q')

    // F-1 proof: ToolRail's active-icon highlight AND the data-cursor-tool
    // body attribute (both keyed off useLayoutStore.cursorTool) reflect the
    // mask tool, not the pre-fix stale 'select'.
    await expect(window.locator('body')).toHaveAttribute('data-cursor-tool', 'mask-marquee-rect')
    await expect(window.locator('[data-testid="tool-rail-item-mask-marquee-rect"]')).toHaveClass(
      /tool-rail__tool--active/,
    )

    // 5. F-2 proof: drag a marquee on the preview canvas and confirm a mask
    // node commits (marching-ants outline appears).
    const overlay = window.locator('.mask-select-overlay').first()
    await expect(overlay).toBeVisible({ timeout: 5_000 })
    const box = await overlay.boundingBox()
    if (!box) throw new Error('mask-select-overlay has no bounding box')

    const x1 = box.x + box.width * 0.3
    const y1 = box.y + box.height * 0.3
    const x2 = box.x + box.width * 0.6
    const y2 = box.y + box.height * 0.6

    await window.mouse.move(x1, y1)
    await window.mouse.down()
    // Multiple intermediate moves — single jump can land under the
    // DRAG_THRESHOLD_PX guard (MaskSelectOverlay.tsx:650) and no-op.
    await window.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 })
    await window.mouse.move(x2, y2, { steps: 5 })
    await window.mouse.up()

    await expect(window.locator('[data-testid="masking-ants-polyline"]')).toBeVisible({ timeout: 5_000 })

    // App should remain stable throughout.
    await expect(window.locator('.error-boundary')).toHaveCount(0)
  })
})
