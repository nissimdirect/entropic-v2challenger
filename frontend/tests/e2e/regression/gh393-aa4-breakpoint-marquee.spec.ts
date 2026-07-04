/**
 * GH #393 — AA.4 breakpoint marquee-select, OS-pointer e2e.
 *
 * // WHY E2E: the marquee-select is a real pointerdown/move/up rubber-band on
 * the AutomationLane SVG (AutomationLane.tsx:179-258), gated by a
 * DRAG_THRESHOLD and a `.auto-node` target guard. Synthetic computer-use
 * pointer events do not fire these handlers (confirmed repeatedly in the
 * 2026-07-03/04 CU-UAT; same class as the #439 mask-draw finding); only a real
 * OS-level Playwright `_electron` drag reproduces the gesture. The selection
 * STORE logic is unit-tested (automation-selection.test.ts, 25 tests); this
 * proves the DOM→store wiring end-to-end.
 *
 * Resolves the #393 divergence: the CU pass could reach the lane infra
 * (arm → +Lane → param-picker) but not the breakpoint-drag surface. This spec
 * drives it via real pointer events.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  importVideoViaDialog,
  waitForIngestComplete,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'

test.describe('GH #393 — AA.4 breakpoint marquee-select (OS-pointer)', () => {
  test('marquee-drag over breakpoints selects them (real pointer)', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)

    // 1. Import + select a clip so a video track exists.
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 90_000)
    await waitForFrame(window, 15_000)
    const clip = window.locator('.clip').first()
    await expect(clip).toBeVisible({ timeout: 10_000 })
    await clip.click()

    // 2. Add an effect (its param is what we'll automate).
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()

    // 3. Arm the track for automation (the header arm-R button — accessible
    //    name from Track.tsx). #432 made this reachable on video tracks.
    const armBtn = window.getByRole('button', { name: /arm for automation/i }).first()
    await expect(armBtn).toBeVisible({ timeout: 5_000 })
    await armBtn.click()

    // 4. Add an automation lane (+Lane enables once armed), pick the first param.
    const addLane = window.locator('[data-testid="add-lane-btn"]')
    await expect(addLane).toBeEnabled({ timeout: 5_000 })
    await addLane.click()
    const paramPicker = window.locator('[data-testid="param-picker"]')
    await expect(paramPicker).toBeVisible({ timeout: 5_000 })
    // The picker is a custom list: param options are clickable buttons with
    // data-testid="param-option-<key>" (AutomationToolbar.tsx:574). Click the
    // first concrete param to create the lane.
    const paramOption = paramPicker.locator('[data-testid^="param-option-"]').first()
    await expect(paramOption).toBeVisible({ timeout: 5_000 })
    await paramOption.click()

    // 5. The lane renders. Add a few breakpoints by double-clicking the lane
    //    SVG at spread-out x positions (AutomationLane lane-dblclick → addPoint).
    const lane = window.locator('[data-testid="automation-lane"]').first()
    await expect(lane).toBeVisible({ timeout: 5_000 })
    const box = await lane.boundingBox()
    if (!box) throw new Error('automation-lane has no bounding box')
    const ys = box.y + box.height * 0.5
    for (const fx of [0.25, 0.45, 0.65]) {
      await window.mouse.dblclick(box.x + box.width * fx, ys)
    }
    await expect(window.locator('.auto-node')).toHaveCount(3, { timeout: 5_000 })

    // 6. Marquee-drag a box that encloses all three nodes — real OS pointer,
    //    with intermediate steps to clear the DRAG_THRESHOLD, starting on empty
    //    lane (not on a .auto-node).
    const x1 = box.x + box.width * 0.15
    const y1 = box.y + box.height * 0.2
    const x2 = box.x + box.width * 0.8
    const y2 = box.y + box.height * 0.8
    await window.mouse.move(x1, y1)
    await window.mouse.down()
    await window.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 })
    await window.mouse.move(x2, y2, { steps: 5 })
    await window.mouse.up()

    // 7. All three breakpoints are now selected (DOM→store wiring proven).
    await expect(window.locator('.auto-node__circle--selected')).toHaveCount(3, {
      timeout: 5_000,
    })
    await expect(window.locator('.error-boundary')).toHaveCount(0)
  })
})
