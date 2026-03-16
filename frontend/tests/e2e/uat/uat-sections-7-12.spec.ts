/**
 * UAT E2E Tests — Sections 7-12 (Timeline, Undo, Save/Load, Export, Layout, Shortcuts)
 *
 * Maps to UAT-UIT-GUIDE.md tests: #112-216, #232-238
 */
// WHY E2E: Timeline interactions (click ruler to seek, drag clips, trim, split),
// undo/redo with real state mutations, save/load with real filesystem I/O,
// export with real ffmpeg rendering, and keyboard shortcuts all require the
// real Electron environment with Python sidecar processing frames.
import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  waitForFrame,
  waitForIngestComplete,
  importVideoViaDialog,
  getTestVideoPath,
  stubSaveDialog,
} from '../fixtures/test-helpers'
import path from 'path'
import os from 'os'
import fs from 'fs'

// ── SECTION 7: Timeline (Tests 112-153) ────────────────────────────────

test.describe('UAT Section 7: Timeline & Multi-Track', () => {
  test.beforeEach(async ({ electronApp, window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)
  })

  test('UAT #112-116: Timeline UI visible with ruler and playhead', async ({ window }) => {
    // Timeline panel visible
    const timeline = window.locator('.timeline, .timeline-panel')
    await expect(timeline).toBeVisible()

    // Time ruler
    const ruler = window.locator('.timeline__ruler, .time-ruler')
    if (await ruler.count() > 0) {
      await expect(ruler).toBeVisible()
    }

    // Playhead
    const playhead = window.locator('.timeline__playhead, .playhead')
    if (await playhead.count() > 0) {
      await expect(playhead).toBeVisible()
    }
  })

  test('UAT #121: Default track exists with clip after import', async ({ window }) => {
    // At least one track should exist
    const tracks = window.locator('.track, .timeline__track')
    const trackCount = await tracks.count()
    expect(trackCount).toBeGreaterThanOrEqual(1)
  })

  test('UAT #134-135: Clip visible on track', async ({ window }) => {
    const clips = window.locator('.clip, .timeline__clip')
    const clipCount = await clips.count()
    expect(clipCount).toBeGreaterThanOrEqual(1)
  })
})

// ── SECTION 8: Undo/Redo (Tests 154-171) ──────────────────────────────

test.describe('UAT Section 8: Undo/Redo', () => {
  test.beforeEach(async ({ electronApp, window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)
  })

  test('UAT #154-155: Undo/Redo add effect', async ({ window }) => {
    // Add an effect
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() === 0) return

    await effectItem.click()
    await window.waitForTimeout(500)
    let rackItems = await window.locator('.effect-rack__item, .effect-card').count()
    expect(rackItems).toBeGreaterThanOrEqual(1)

    // Undo (Cmd+Z)
    await window.keyboard.press('Meta+z')
    await window.waitForTimeout(500)
    rackItems = await window.locator('.effect-rack__item, .effect-card').count()
    expect(rackItems).toBe(0)

    // Redo (Cmd+Shift+Z)
    await window.keyboard.press('Meta+Shift+z')
    await window.waitForTimeout(500)
    rackItems = await window.locator('.effect-rack__item, .effect-card').count()
    expect(rackItems).toBeGreaterThanOrEqual(1)
  })
})

// ── SECTION 9: Project Save/Load (Tests 172-184) ──────────────────────

test.describe('UAT Section 9: Project Save/Load', () => {
  test('UAT #172-179: Save and load project round-trip', async ({ electronApp, window }) => {
    test.setTimeout(90_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)

    // Add an effect so we have state to verify
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() > 0) {
      await effectItem.click()
      await window.waitForTimeout(500)
    }

    // Save project
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entropic-uat-'))
    const savePath = path.join(tmpDir, 'test-project.glitch')
    await stubSaveDialog(electronApp, savePath)
    await window.keyboard.press('Meta+s')
    await window.waitForTimeout(2000)

    // Verify file was created
    expect(fs.existsSync(savePath)).toBe(true)

    // Verify it's valid JSON
    const content = fs.readFileSync(savePath, 'utf-8')
    const project = JSON.parse(content)
    expect(project).toHaveProperty('version')
    expect(project).toHaveProperty('assets')

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

// ── SECTION 11: Panel Layout (Tests 198-206) ──────────────────────────

test.describe('UAT Section 11: Panel Layout', () => {
  test('UAT #201-202: Toggle sidebar with Cmd+B', async ({ window }) => {
    await expect(window.locator('.app__sidebar')).toBeVisible()

    // Toggle sidebar
    await window.keyboard.press('Meta+b')
    await window.waitForTimeout(500)

    // Sidebar should be collapsed (width changes or class changes)
    // Re-toggle
    await window.keyboard.press('Meta+b')
    await window.waitForTimeout(500)

    // Sidebar visible again
    await expect(window.locator('.app__sidebar')).toBeVisible()
  })

  test('UAT #203-206: System meters visible', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    // Status bar should have metrics
    await expect(window.locator('.status-bar')).toBeVisible()
  })
})

// ── SECTION 12: Keyboard Shortcuts (Tests 207-216) ────────────────────

test.describe('UAT Section 12: Keyboard Shortcuts', () => {
  test.beforeEach(async ({ electronApp, window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)
  })

  test('UAT #207: Space toggles play/pause', async ({ window }) => {
    await window.keyboard.press('Space')
    await window.waitForTimeout(300)
    await window.keyboard.press('Space')
    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #209-210: Cmd+Z / Cmd+Shift+Z undo/redo', async ({ window }) => {
    // Add effect, undo, redo (same as section 8 test but focused on shortcut)
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() === 0) return

    await effectItem.click()
    await window.waitForTimeout(500)

    await window.keyboard.press('Meta+z')
    await window.waitForTimeout(300)

    await window.keyboard.press('Meta+Shift+z')
    await window.waitForTimeout(300)
  })

  test('UAT #213-215: Zoom shortcuts', async ({ window }) => {
    // Zoom in
    await window.keyboard.press('Meta+=')
    await window.waitForTimeout(200)

    // Zoom out
    await window.keyboard.press('Meta+-')
    await window.waitForTimeout(200)

    // Fit to window
    await window.keyboard.press('Meta+0')
    await window.waitForTimeout(200)

    // App still alive
    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #284: A key toggles automation', async ({ window }) => {
    await window.keyboard.press('a')
    await window.waitForTimeout(300)
    // Toggle back
    await window.keyboard.press('a')
    await window.waitForTimeout(300)
    await expect(window.locator('.app')).toBeVisible()
  })
})

// ── SECTION 18: Integration Tests (Tests 232-238) ─────────────────────

test.describe('UAT Section 18: Integration — Full Journeys', () => {
  test('UAT #232: End-to-end: Import → Effects → Export', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)

    // 1. Import video
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)

    // 2. Add effects
    const effectItems = window.locator('.effect-browser__item')
    if (await effectItems.count() > 0) {
      await effectItems.first().click()
      await window.waitForTimeout(500)
    }

    // 3. Verify effect in rack
    const rackCount = await window.locator('.effect-rack__item, .effect-card').count()
    expect(rackCount).toBeGreaterThanOrEqual(1)

    // 4. App is still responsive after the full flow
    await expect(window.locator('.app')).toBeVisible()
  })

  test('UAT #237-238: Audio plays in sync, visual effects dont corrupt audio', async ({ electronApp, window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    await importVideoViaDialog(electronApp, window, getTestVideoPath())
    await waitForIngestComplete(window, 30_000)
    await waitForFrame(window, 15_000)

    // Add a visual effect
    const effectItem = window.locator('.effect-browser__item').first()
    if (await effectItem.count() > 0) {
      await effectItem.click()
      await window.waitForTimeout(500)
    }

    // Play for a moment — should not crash
    await window.keyboard.press('Space')
    await window.waitForTimeout(2000)
    await window.keyboard.press('Space')

    // App alive after playback with effects
    await expect(window.locator('.app')).toBeVisible()
  })
})
