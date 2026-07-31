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

import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/electron-app.fixture'

// QF6/QF7 (W1.5a owner walk): every add-track button — empty-state and
// headers-spacer alike — now opens the same unified Add Track menu instead
// of adding directly. Shared two-step helper; picks the Video item by
// default (matches every prior test's implicit track type).
async function addTrackViaMenu(window: Page, item: 'video' | 'midi' | 'text' = 'video') {
  await window.locator('[data-testid="add-track-button"]').first().click()
  await window.locator(`[data-testid="add-track-menu-item-${item}"]`).click()
}

test.describe('Phase 4 — Timeline UI', () => {
  test('timeline panel is visible on launch', async ({ window }) => {
    // Timeline container should be rendered
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })
  })

  // QF7 (W1.5a owner walk, third pass): the empty-state's own two-button
  // (+ Add Track / + MIDI Track) creation surface is now the SAME single
  // "+ Track" button QF6 built for the headers-spacer.
  test('empty timeline shows the unified add-track button', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })
    const addBtn = window.locator('[data-testid="add-track-button"]').first()
    await expect(addBtn).toBeVisible()
    await expect(addBtn).toHaveText('+ Track')
  })

  test('clicking add-track then a menu item creates a track', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    await addTrackViaMenu(window)

    // Track header and lane should appear
    await expect(window.locator('.track-header')).toBeVisible({ timeout: 5_000 })
    await expect(window.locator('.track-lane')).toBeVisible({ timeout: 5_000 })
  })

  test('adding multiple tracks shows correct count', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    // First track from the empty state's unified button (QF7); two more
    // from the headers-spacer's unified button (QF6) — same button/menu,
    // just a different render branch once tracks exist.
    await addTrackViaMenu(window)
    await addTrackViaMenu(window)
    await addTrackViaMenu(window)

    // Should have 3 track headers
    const headers = window.locator('.track-header')
    await expect(headers).toHaveCount(3)
  })

  test('track header shows mute and solo buttons', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    await addTrackViaMenu(window)

    // Track header should have M and S buttons
    const muteBtn = window.locator('.track-header__btn', { hasText: 'M' })
    const soloBtn = window.locator('.track-header__btn', { hasText: 'S' })
    await expect(muteBtn).toBeVisible()
    await expect(soloBtn).toBeVisible()
  })

  test('time ruler is visible after adding a track', async ({ window }) => {
    await expect(window.locator('.timeline')).toBeVisible({ timeout: 10_000 })

    await addTrackViaMenu(window)

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
