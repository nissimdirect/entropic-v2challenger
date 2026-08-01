/**
 * W1.6 owner walk 3, item 2 — Demos drawer left-edge text bleed regression.
 *
 * // WHY E2E: real layout/paint at specific window widths (BrowserWindow.
 * setBounds + getBoundingClientRect) — happy-dom has no layout engine, so a
 * viewport-width-driven overflow bug like this cannot be reproduced or
 * guarded in a Vitest component test.
 *
 * Owner report: "a vertical strip of clipped text fragments (single
 * letters/partial words) along the app's far-left edge, visible behind/
 * beside the sidebar when the LayerPanel is populated."
 *
 * Root cause (found via a real-DOM geometry harness, resizing the window
 * down to 250-400px to isolate the trigger): demos.css's `.demos-drawer`
 * is `position: fixed; right: 0` with a fixed `width: 360px` and no
 * viewport clamp. On any window narrower than 360px CSS px, the drawer's
 * left edge (viewport width - 360px) goes negative, so every line of
 * drawer text is cut off exactly at the window's x=0 boundary — showing
 * only each line's tail ("Demos" -> "s", "...one idea." -> "dea.",
 * "y_is_time" -> "_time", "painted_blur" -> "ted_blur"). Confirmed at
 * 250/300px width; NOT present at 400px (above the 360px threshold) or the
 * default 1280px hermetic width — matching why the surface 1 shell baseline
 * (1280px) needed no regen for this fix.
 *
 * Fixed with `max-width: 100vw` (+ `overflow-x: hidden` as defense in
 * depth) on `.demos-drawer` — every descendant (.demos-card etc.) is
 * flex/percentage-sized off the drawer's own width, so clamping this one
 * rule fixes the whole chain: below 360px the drawer shrinks to exactly
 * 100vw, its left edge lands at x=0, and content reflows/wraps instead of
 * bleeding past the window.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('W1.6 — Demos drawer never bleeds past the window at narrow widths', () => {
  test('no element extends past x=0 at 250/300/340px window widths', async ({ window, electronApp }) => {
    test.setTimeout(30_000)
    await waitForEngineConnected(window, 20_000)

    await expect(window.locator('[data-testid="demos-drawer"]')).toBeVisible()

    for (const width of [250, 300, 340]) {
      await electronApp.evaluate(({ BrowserWindow }, w) => {
        BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: w, height: 700 })
      }, width)

      // Drawer must never extend left of the window's own edge.
      const box = await window.locator('[data-testid="demos-drawer"]').boundingBox()
      if (!box) throw new Error('demos-drawer has no bounding box')
      expect(box.x, `demos-drawer.x at window width ${width}`).toBeGreaterThanOrEqual(0)

      // Its title text must render intact, not clipped to a tail fragment.
      await expect(window.locator('[data-testid="demos-drawer-title"]')).toHaveText('Demos')
    }
  })
})
