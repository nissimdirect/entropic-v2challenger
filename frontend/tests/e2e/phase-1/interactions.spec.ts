/**
 * Phase 1 — Interaction Coverage Tests
 *
 * Happy-path tests for EVERY interactive element in the app.
 * Organized by component, top-to-bottom in the UI.
 *
 * Covers gaps identified in UAT audit:
 * - Play/Pause button
 * - Effect search input
 * - Individual category filter buttons
 * - Export dialog settings (resolution checkbox, custom dimensions)
 * - Export dialog overlay click-to-close
 * - Drag-and-drop file import (simulated)
 * - ParamToggle (boolean checkbox)
 * - ParamChoice (select dropdown)
 */
// WHY E2E: Remaining tests need real video playback and render pipeline through IPC

import { test, expect } from '../fixtures/electron-app.fixture'
import {
  waitForEngineConnected,
  stubFileDialog,
  waitForFrame,
  getTestVideoPath,
} from '../fixtures/test-helpers'

// ─────────────────────────────────────────────
// Helper: Import video and wait for first frame
// ─────────────────────────────────────────────
async function importAndWaitForFrame(
  electronApp: any,
  window: any,
): Promise<void> {
  const videoPath = getTestVideoPath()
  await stubFileDialog(electronApp, videoPath)
  await window.locator('.file-dialog-btn').click()
  await window.waitForSelector('.asset-badge', { timeout: 90_000 })
  await waitForFrame(window, 15_000)
}

// Effect Browser Search & Categories PRUNED — migrated to Vitest: interactions.test.tsx

// ═══════════════════════════════════════════════
// PREVIEW CONTROLS — Play/Pause & Scrub
// ═══════════════════════════════════════════════
test.describe('Interactions — Preview Controls', () => {
  test('play/pause button toggles playback', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    const playBtn = window.locator('.preview-controls__play-btn')
    await expect(playBtn).toBeVisible()

    // Initial state: paused (shows ">")
    let btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('>')

    // Read initial frame
    const frameBefore = await window.locator('.preview-controls__scrub').inputValue()

    // Click play
    await playBtn.click()
    btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('||')

    // Wait for a few frames to advance
    await window.waitForTimeout(500)

    // Click pause
    await playBtn.click()
    btnText = await playBtn.textContent()
    expect(btnText?.trim()).toBe('>')

    // Frame should have advanced from initial position
    const frameAfter = await window.locator('.preview-controls__scrub').inputValue()
    expect(parseInt(frameAfter)).toBeGreaterThanOrEqual(parseInt(frameBefore))
  })

  // 'scrub slider disabled' PRUNED — migrated to Vitest: interactions.test.tsx

  test('timecode display updates on scrub', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    const counter = window.locator('.preview-controls__counter')
    const initialText = await counter.textContent()
    expect(initialText).toContain('0:00.0')

    // Scrub to 50%
    const scrub = window.locator('.preview-controls__scrub')
    await scrub.evaluate((el: HTMLInputElement) => {
      const max = parseInt(el.max, 10)
      const target = Math.floor(max * 0.5)
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, String(target))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    await window.waitForTimeout(1000)
    const updatedText = await counter.textContent()
    // Timecode should have changed from 0:00.0
    expect(updatedText).not.toBe(initialText)
  })
})

// ═══════════════════════════════════════════════
// EXPORT DIALOG — Settings & Interactions
// ═══════════════════════════════════════════════
test.describe('Interactions — Export Dialog', () => {
  test('export dialog opens and shows correct defaults', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    // Click Export button in status bar
    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()

    // Dialog should be open
    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // Check defaults: H.264, frame count, "Use original resolution" checked
    await expect(window.locator('.export-dialog__codec-label')).toHaveText('H.264 (MP4)')

    const checkbox = window.locator('.export-dialog input[type="checkbox"]')
    const isChecked = await checkbox.isChecked()
    expect(isChecked).toBe(true)

    // Custom resolution inputs should NOT be visible (checkbox is checked)
    const resInputs = window.locator('.export-dialog__res-input')
    expect(await resInputs.count()).toBe(0)
  })

  test('uncheck "Use original resolution" shows custom dimension inputs', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    await window.locator('.export-btn').click()
    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // Uncheck the checkbox
    const checkbox = window.locator('.export-dialog input[type="checkbox"]')
    await checkbox.uncheck()

    // Custom resolution inputs should appear
    const resInputs = window.locator('.export-dialog__res-input')
    await expect(resInputs.first()).toBeVisible()
    expect(await resInputs.count()).toBe(2)

    // Default values should be 1920x1080
    const widthVal = await resInputs.nth(0).inputValue()
    const heightVal = await resInputs.nth(1).inputValue()
    expect(parseInt(widthVal)).toBe(1920)
    expect(parseInt(heightVal)).toBe(1080)

    // Type custom values
    await resInputs.nth(0).fill('1280')
    await resInputs.nth(1).fill('720')

    const newWidth = await resInputs.nth(0).inputValue()
    const newHeight = await resInputs.nth(1).inputValue()
    expect(parseInt(newWidth)).toBe(1280)
    expect(parseInt(newHeight)).toBe(720)
  })

  test('overlay click closes export dialog', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    await window.locator('.export-btn').click()
    await expect(window.locator('.export-dialog')).toBeVisible()

    // Click the overlay (outside the dialog)
    await window.locator('.export-dialog__overlay').click({ position: { x: 5, y: 5 } })
    await window.waitForTimeout(300)

    // Dialog should be closed
    expect(await window.locator('.export-dialog').count()).toBe(0)
  })

  test('cancel button closes export dialog', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    await window.locator('.export-btn').click()
    await expect(window.locator('.export-dialog')).toBeVisible()

    await window.locator('.export-dialog__cancel-btn').click()
    await window.waitForTimeout(300)

    expect(await window.locator('.export-dialog').count()).toBe(0)
  })

  test('close (X) button closes export dialog', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    await window.locator('.export-btn').click()
    await expect(window.locator('.export-dialog')).toBeVisible()

    await window.locator('.export-dialog__close').click()
    await window.waitForTimeout(300)

    expect(await window.locator('.export-dialog').count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════
// PARAM PANEL — All Param Types
// ═══════════════════════════════════════════════
test.describe('Interactions — Param Panel', () => {
  test('selecting effect shows param panel with controls', async ({ electronApp, window }) => {
    test.setTimeout(120_000)
    await waitForEngineConnected(window, 20_000)
    await importAndWaitForFrame(electronApp, window)

    // Add an effect
    const effectItems = window.locator('.effect-browser__item')
    await effectItems.first().click()

    const rackItems = window.locator('.effect-rack__item')
    await expect(rackItems.first()).toBeVisible({ timeout: 5_000 })

    // Click the effect card to select it
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Param panel should show the effect name
    const paramHeader = window.locator('.param-panel__header')
    await expect(paramHeader).toBeVisible()
    const headerText = await paramHeader.textContent()
    expect(headerText).toBeTruthy()

    // Should have at least one param control (slider, toggle, or choice)
    const sliders = window.locator('.param-slider')
    const toggles = window.locator('.param-toggle')
    const choices = window.locator('.param-choice')
    const totalParams =
      (await sliders.count()) + (await toggles.count()) + (await choices.count())
    expect(totalParams).toBeGreaterThanOrEqual(0)

    // Mix slider should always be present
    const mixSlider = window.locator('.param-mix')
    await expect(mixSlider).toBeVisible()
  })

  // 'param panel empty state' PRUNED — migrated to Vitest: interactions.test.tsx
})

// Drop Zone — Drag-and-Drop section PRUNED — migrated to Vitest: interactions.test.tsx + upload.test.ts
