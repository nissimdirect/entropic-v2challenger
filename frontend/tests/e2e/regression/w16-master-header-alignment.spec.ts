/**
 * W1.6 owner walk 3, item 1 — master header alignment regression.
 *
 * // WHY E2E: real layout geometry (getBoundingClientRect x-offsets across
 * sibling header rows, driven by actual CSS flex layout) — happy-dom
 * (vitest's DOM env) has no layout/paint engine, so `.getBoundingClientRect()`
 * always returns zeros there. Only a real, OS-composited window can prove two
 * elements land at the same pixel x-offset.
 *
 * Owner report: "the master header is weird compared to the track" — with a
 * video track + master both visible, the master row's [arm][swatch][name]
 * cluster did not left-align with the track rows' identical slots; it read
 * as centered/floating.
 *
 * TWO compounding root causes, both found via this test's geometry probe:
 *
 * 1. (Primary) creatrix-shell.css's `.track-header--lean { align-items:
 *    stretch }` was silently losing the cascade to timeline.css's
 *    `.track-header { align-items: center }` — both single-class selectors,
 *    equal specificity (0,1,0), and timeline.css loads AFTER creatrix-shell.
 *    css, so the later rule won regardless of the (incorrect) assumption in
 *    the old comment that "also setting" the property was enough to win.
 *    Every lean row was being horizontally CENTERED inside its ~267px
 *    gutter, not left-aligned. Wide rows (video/text, content ~288px,
 *    already overflowing) barely showed it (~3px shift). Master's much
 *    narrower row (~128px of content) got centered ~69px to the right —
 *    the visible bug. Fixed by compounding the selector to `.track-header.
 *    track-header--lean` (0,2,0), which always matches (UnifiedTrackHeader.
 *    tsx's rootClasses always include both classes together) and
 *    unconditionally wins regardless of import order.
 *
 * 2. (Secondary) master lacks the `twirl` capability (video/text/performance
 *    have it), so even under correct left-alignment its leading slots would
 *    still start ~24px further left than a track row's. Fixed in
 *    UnifiedTrackHeader.tsx: twirl and arm always render their button
 *    markup — invisible + inert (`--placeholder`, visibility:hidden) when
 *    the capability is absent — so the reserved gutter width is
 *    pixel-identical whether or not the slot is interactive.
 *
 * Badge is deliberately NOT asserted here: `.track-header__info--lean`
 * (the name slot) is `flex: 1` by design (so long names truncate instead of
 * overflowing), so it fills whatever space is left before the next slot —
 * a row with fewer trailing controls (master) fills more, pushing its badge
 * further right than a row with more trailing controls (video's blend/M/S/
 * eye cluster). That's expected flex-fill behavior, not a misalignment bug,
 * and video's badge is additionally subject to a pre-existing, separately
 * tracked column-overflow issue (creatrix-shell.css's issue-424/PK.B1
 * comments) unrelated to this fix.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('W1.6 — master header left-aligns with track header rows', () => {
  test('arm/swatch/name-slot x-offsets are identical for master vs. a video track row', async ({ window }) => {
    test.setTimeout(30_000)
    await waitForEngineConnected(window, 20_000)

    // The hermetic E2E launch starts with ZERO tracks (no auto-bootstrapped
    // project) — a fresh PROJECT (Cmd+N, project-persistence.ts
    // bootstrapNewProject) is what auto-creates exactly one Master track
    // (M.1 PRD). Add a video track alongside it via the unified menu.
    await window.keyboard.press('Meta+n')
    const addBtn = window.locator('[data-testid="add-track-button"]')
    await addBtn.click()
    await window.locator('[data-testid="add-track-menu-item-video"]').click()

    const videoHeader = '[data-testid="lean-track-header"]'
    const masterHeader = '[data-testid="master-track-header"]'

    const slotX = async (headerSel: string, slot: string) => {
      const box = await window.locator(`${headerSel} [data-slot="${slot}"]`).first().boundingBox()
      if (!box) throw new Error(`${headerSel} [data-slot="${slot}"] has no bounding box`)
      return box.x
    }

    await expect(window.locator(`${masterHeader} [data-slot="arm"]`)).toBeAttached()

    // Same left gutter for the leading cluster — the owner-reported
    // misalignment regresses if any of these drift apart again.
    expect(await slotX(masterHeader, 'arm')).toBe(await slotX(videoHeader, 'arm'))
    expect(await slotX(masterHeader, 'swatch')).toBe(await slotX(videoHeader, 'swatch'))
    expect(await slotX(masterHeader, 'name')).toBe(await slotX(videoHeader, 'name'))
  })
})
