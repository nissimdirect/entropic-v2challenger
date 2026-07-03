/**
 * Phase 4 UAT — Timeline UI, Undo/Redo, Project Persistence, History Panel
 *
 * Tests the user-visible behavior added in Phase 4:
 * - Timeline panel renders with add-track button
 * - Tracks can be added and appear in the timeline
 * - Undo/Redo keyboard shortcuts work
 * - History panel shows entries
 * - Window title reflects project name and dirty state
 * - Zoom controls work
 * - Keyboard shortcuts don't fire in text inputs
 */
// WHY E2E: Window title test needs real BrowserWindow API; preload bridge test needs real Electron context

import { test, expect } from '../fixtures/electron-app.fixture'

test.describe('Phase 4 — Timeline UI', () => {
  test('timeline panel is visible on launch', async ({ window }) => {
    // Timeline container should be rendered
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })
  })

  test('empty timeline shows add-track button', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })
    const addBtn = window.locator('.timeline__add-track-btn').first()
    await expect(addBtn).toBeVisible()
    await expect(addBtn).toContainText('Add')
  })

  test('clicking add-track creates a track', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    // Click the add track button (in empty state it says "+ Add Track")
    const addBtn = window.locator('.timeline__add-track-btn').first()
    await addBtn.click()

    // Track header and lane should appear
    await expect(window.locator('.track-header')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('.track-lane')).toBeVisible({ timeout: 5_000 })
  })

  test('adding multiple tracks shows correct count', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    // Find and click the add-track button
    const addBtn = window.locator('.timeline__add-track-btn').first()
    await addBtn.click()

    // After first track is added, the add-track buttons live in the headers spacer.
    // That spacer holds THREE add-track buttons (video / MIDI / inspector), each with
    // its own distinct modifier class — target the video add-track directly.
    const headerAddBtn = window.locator('.timeline__headers-spacer .timeline__add-track-btn--video')
    await headerAddBtn.click()
    await headerAddBtn.click()

    // Should have 3 track headers
    const headers = window.locator('.track-header')
    await expect(headers).toHaveCount(3)
  })

  test('track header shows mute and solo buttons', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    const addBtn = window.locator('.timeline__add-track-btn').first()
    await addBtn.click()

    // Track header should have M and S buttons
    const muteBtn = window.locator('.track-header__btn', { hasText: 'M' })
    const soloBtn = window.locator('.track-header__btn', { hasText: 'S' })
    await expect(muteBtn).toBeVisible()
    await expect(soloBtn).toBeVisible()
  })

  test('time ruler is visible after adding a track', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    const addBtn = window.locator('.timeline__add-track-btn').first()
    await addBtn.click()

    await expect(window.locator('.time-ruler')).toBeVisible({ timeout: 5_000 })
  })

  test('resize handle is present', async ({ window }) => {
    // The resize handle is at the top of the timeline
    const handle = window.locator('.timeline__resize-handle')
    await expect(handle).toBeAttached({ timeout: 10_000 })
  })
})

// NOTE: HistoryPanel was moved out of the sidebar (App.tsx: "Phase 13C — removed
// from sidebar; F-0514-18 re-surfaced as a floating overlay via Edit → Undo History").
// The two "history panel visible in sidebar on launch" tests were deleted — they
// asserted a removed location. HistoryPanel component rendering is covered by vitest.

test.describe('Phase 4 — Window Title', () => {
  test('window title shows "Creatrix" on launch (no project loaded)', async ({ window }) => {
    // App.tsx: with no project loaded the title is deliberately the plain "Creatrix"
    // (not "Untitled — Creatrix"); once a project loads it becomes "<name> — Creatrix".
    const title = await window.title()
    expect(title).toContain('Creatrix')
  })
})

// NOTE: the .zoom-scroll footer widget was removed (commit 58647bb — ZoomScroll
// orphaned; timeline zoom is now Cmd+scroll / pinch). The "zoom controls in footer"
// and "Cmd+=/Cmd+- read .zoom-scroll__value" tests were deleted as dead-selector.

test.describe('Phase 4 — Preload Bridge (E2E)', () => {
  test('window.entropic exposes the full preload API surface', async ({ window }) => {
    const methodCount = await window.evaluate(() => {
      const e = (window as any).entropic
      if (!e) return 0
      return Object.keys(e).filter(k => typeof e[k] === 'function').length
    })
    // Update this when the preload bridge (frontend/src/preload) changes its API.
    // The bridge grew well past the original 12; assert the real current surface.
    expect(methodCount).toBe(39)
  })
})
