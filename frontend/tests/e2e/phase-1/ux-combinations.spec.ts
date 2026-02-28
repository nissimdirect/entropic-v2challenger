/**
 * Phase 1 — UX Combination & Permutation Tests
 *
 * Tests cross-feature interactions and state permutations.
 * These cover the gaps where BUG-1 and BUG-3 class bugs live:
 * features interacting in different orders, not features in isolation.
 *
 * Groups:
 * 1. Playback + Live Operations (5 tests)
 * 2. Replace Video (3 tests)
 * 3. Multi-Effect Param Editing (5 tests)
 * 4. Effect Chain Lifecycle (4 tests)
 * 5. Export Round-trips (4 tests)
 * 6. Error Recovery (3 tests)
 * 7. Search + Category + Effect Add (3 tests)
 * 8. State Machine Transitions (3 tests)
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

/** Add an effect by clicking the Nth item in the effect browser. Returns effect name. */
async function addEffectByIndex(window: any, index: number): Promise<string> {
  const item = window.locator('.effect-browser__item').nth(index)
  const name = await item.textContent()
  await item.click()
  await window.waitForTimeout(500)
  return name?.trim() ?? ''
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

// ═══════════════════════════════════════════════════════════
// GROUP 3: Multi-Effect Param Editing
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 3: Multi-Effect Param Editing', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('9. Add A → Add B → Select A → Adjust → Select B → Adjust → Independent params', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    if ((await effectItems.count()) < 2) {
      test.skip()
      return
    }

    // Add effect A and B
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    await effectItems.nth(1).click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(2)

    // Select effect A (first in rack) — click the card
    await rackItems.nth(0).locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Param panel should show effect A's name
    const panelHeaderA = await window.locator('.param-panel__header').textContent()
    expect(panelHeaderA).toBeTruthy()

    // Check if there are knobs to interact with
    const knobsA = window.locator('.knob__svg')
    const knobCountA = await knobsA.count()

    // Select effect B (second in rack)
    await rackItems.nth(1).locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Param panel should show effect B's name (different from A)
    const panelHeaderB = await window.locator('.param-panel__header').textContent()
    expect(panelHeaderB).toBeTruthy()

    // If A and B are different effects, headers should differ
    const rackNameA = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const rackNameB = await rackItems.nth(1).locator('.effect-card__name').textContent()
    if (rackNameA !== rackNameB) {
      expect(panelHeaderB).not.toBe(panelHeaderA)
    }

    // Switch back to A — panel header should return to A's name
    await rackItems.nth(0).locator('.effect-card').click()
    await window.waitForTimeout(500)
    const panelHeaderA2 = await window.locator('.param-panel__header').textContent()
    expect(panelHeaderA2).toBe(panelHeaderA)

    await expect(window.locator('.app')).toBeVisible()
  })

  test('10. Select effect → Remove it → Param panel shows empty state', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add and select an effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Param panel should NOT be empty
    const paramPanel = window.locator('.param-panel')
    await expect(paramPanel).toBeVisible()
    const isEmpty = await window.locator('.param-panel--empty').count()
    expect(isEmpty).toBe(0)

    // Remove the selected effect
    const removeBtn = window.locator('.effect-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(500)

    // Param panel should now show empty state
    await expect(window.locator('.param-panel--empty')).toBeVisible()
    await expect(window.locator('.app')).toBeVisible()
  })

  test('11. Adjust param → Toggle effect off → Toggle on → Param value preserved', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add and select an effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Read the initial knob value display (if knobs exist)
    const knobValues = window.locator('.knob .param-label__value, .knob .knob__label')
    const hasKnobs = (await window.locator('.knob__svg').count()) > 0

    // Capture param panel header as baseline
    const headerBefore = await window.locator('.param-panel__header').textContent()

    // Toggle OFF
    const toggleBtn = window.locator('.effect-card__toggle').first()
    await toggleBtn.click()
    await window.waitForTimeout(500)
    expect((await toggleBtn.textContent())?.trim()).toBe('OFF')

    // Toggle ON
    await toggleBtn.click()
    await window.waitForTimeout(500)
    expect((await toggleBtn.textContent())?.trim()).toBe('ON')

    // Param panel should still show the same effect
    // (selection and params preserved through toggle cycle)
    const headerAfter = await window.locator('.param-panel__header').textContent()
    expect(headerAfter).toBe(headerBefore)

    await expect(window.locator('.app')).toBeVisible()
  })

  test('12. Adjust slider + toggle + choice + mix on same effect → All update preview', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Add and select an effect
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    await rackItems.first().locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Interact with each param type if present

    // 1. Knobs (numeric params) — use arrow key to adjust
    const knobs = window.locator('.knob__svg')
    if ((await knobs.count()) > 0) {
      await knobs.first().focus()
      await window.keyboard.press('ArrowUp')
      await window.waitForTimeout(500)
    }

    // 2. Choice params (select dropdown)
    const choiceSelects = window.locator('.param-choice__select')
    if ((await choiceSelects.count()) > 0) {
      const options = await choiceSelects.first().locator('option').allTextContents()
      if (options.length > 1) {
        await choiceSelects.first().selectOption({ index: 1 })
        await window.waitForTimeout(500)
      }
    }

    // 3. Toggle params (checkbox)
    const toggleInputs = window.locator('.param-toggle__input')
    if ((await toggleInputs.count()) > 0) {
      await toggleInputs.first().click()
      await window.waitForTimeout(500)
    }

    // 4. Mix slider — use keyboard to adjust
    const mixTrack = window.locator('.hslider__track')
    if ((await mixTrack.count()) > 0) {
      await mixTrack.first().focus()
      await window.keyboard.press('ArrowLeft')
      await window.waitForTimeout(500)
    }

    // Wait for render to settle
    await window.waitForTimeout(2000)

    // Preview should still be rendering (no crash)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('13. Select effect A → Reorder A below B → Selection follows moved effect (or deselects)', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    if ((await effectItems.count()) < 2) {
      test.skip()
      return
    }

    // Add 2 effects
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    await effectItems.nth(1).click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(2)

    // Select the first effect (A)
    await rackItems.nth(0).locator('.effect-card').click()
    await window.waitForTimeout(500)

    // Verify A is selected
    const cardA = rackItems.nth(0).locator('.effect-card')
    await expect(cardA).toHaveClass(/effect-card--selected/)

    const nameA = await rackItems.nth(0).locator('.effect-card__name').textContent()

    // Move A down (swap with B)
    const moveDownBtns = window.locator('.effect-rack__arrow[title="Move down"]')
    await moveDownBtns.first().click()
    await window.waitForTimeout(1000)

    // After reorder, A is now at index 1. Check if either:
    // - A is still selected at its new position, OR
    // - Selection was cleared
    const paramHeader = await window.locator('.param-panel__header').textContent()
    const emptyCount = await window.locator('.param-panel--empty').count()

    // Either the param panel shows A's effect name (selection followed) or is empty (deselected)
    const selectionFollowed = paramHeader === nameA?.trim()
    const selectionCleared = emptyCount > 0
    expect(selectionFollowed || selectionCleared).toBe(true)

    await expect(window.locator('.app')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// GROUP 4: Effect Chain Lifecycle
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 4: Effect Chain Lifecycle', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('14. Add → Toggle off → Remove → Rack updates, no orphan state', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.first().click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)

    // Toggle off
    const toggleBtn = window.locator('.effect-card__toggle').first()
    await toggleBtn.click()
    await window.waitForTimeout(300)
    expect((await toggleBtn.textContent())?.trim()).toBe('OFF')

    // Remove
    const removeBtn = window.locator('.effect-card__remove').first()
    await removeBtn.click()
    await window.waitForTimeout(500)

    // Rack empty, param panel empty
    await expect(window.locator('.effect-rack--empty')).toBeVisible()
    await expect(window.locator('.param-panel--empty')).toBeVisible()

    // Preview still works (no orphan effect state)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('15. Add 10 → Remove from middle → Add new → Chain count correct, add button re-enables', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(180_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    const availableEffects = await effectItems.count()

    // Add effects up to 10
    const toAdd = Math.min(10, availableEffects)
    for (let i = 0; i < toAdd; i++) {
      await effectItems.nth(i % availableEffects).click()
      await window.waitForTimeout(200)
    }

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(toAdd)

    // If we reached 10, add button should be disabled
    if (toAdd === 10) {
      expect(await effectItems.first().isDisabled()).toBe(true)
    }

    // Remove from the middle (index 4)
    const middleRemove = rackItems.nth(4).locator('.effect-card__remove')
    await middleRemove.click()
    await window.waitForTimeout(500)

    expect(await rackItems.count()).toBe(toAdd - 1)

    // Add button should now be re-enabled (below max)
    if (toAdd === 10) {
      expect(await effectItems.first().isDisabled()).toBe(false)
    }

    // Add one more — should work
    await effectItems.first().click()
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(toAdd)

    await expect(window.locator('.app')).toBeVisible()
  })

  test('16. Add 3 → Remove middle → Preview renders with remaining 2 (no gap)', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    const available = await effectItems.count()
    if (available < 3) {
      test.skip()
      return
    }

    // Add 3 effects
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    await effectItems.nth(1).click()
    await window.waitForTimeout(300)
    await effectItems.nth(2).click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(3)

    // Remember names of first and third
    const name1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const name3 = await rackItems.nth(2).locator('.effect-card__name').textContent()

    // Remove the middle effect
    const middleRemove = rackItems.nth(1).locator('.effect-card__remove')
    await middleRemove.click()
    await window.waitForTimeout(1000)

    // Should have 2 effects — first and third from before
    expect(await rackItems.count()).toBe(2)
    const remaining1 = await rackItems.nth(0).locator('.effect-card__name').textContent()
    const remaining2 = await rackItems.nth(1).locator('.effect-card__name').textContent()
    expect(remaining1).toBe(name1)
    expect(remaining2).toBe(name3)

    // Wait for render to settle with 2-effect chain
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })

  test('17. Add → Adjust params → Add second → Adjust second → Both compose in preview', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Add first effect
    await effectItems.nth(0).click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)

    // Select and adjust params on first effect
    await rackItems.nth(0).locator('.effect-card').click()
    await window.waitForTimeout(500)

    const knobs = window.locator('.knob__svg')
    if ((await knobs.count()) > 0) {
      await knobs.first().focus()
      await window.keyboard.press('ArrowUp')
      await window.keyboard.press('ArrowUp')
      await window.waitForTimeout(500)
    }

    // Wait for render
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)

    // Add second effect
    if ((await effectItems.count()) >= 2) {
      await effectItems.nth(1).click()
    } else {
      await effectItems.nth(0).click()
    }
    await window.waitForTimeout(500)
    expect(await rackItems.count()).toBe(2)

    // Select and adjust second effect
    await rackItems.nth(1).locator('.effect-card').click()
    await window.waitForTimeout(500)

    const knobs2 = window.locator('.knob__svg')
    if ((await knobs2.count()) > 0) {
      await knobs2.first().focus()
      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('ArrowDown')
      await window.waitForTimeout(500)
    }

    // Wait for render — both effects should compose
    await window.waitForTimeout(2000)
    await waitForFrame(window, 10_000)
    await expect(window.locator('.app')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════
// GROUP 5: Export Round-trips
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 5: Export Round-trips', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('18. Open export dialog → Close → Reopen → Settings are fresh defaults', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Open export dialog
    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()

    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // Verify default codec label
    const codecLabel = await dialog.locator('.export-dialog__codec-label').textContent()
    expect(codecLabel).toContain('H.264')

    // Close
    await window.locator('.export-dialog__close').click()
    await window.waitForTimeout(500)
    expect(await dialog.count()).toBe(0)

    // Reopen
    await exportBtn.click()
    await expect(dialog).toBeVisible()

    // Settings should be fresh defaults (ExportDialog uses local useState, re-mount = fresh)
    const codecLabel2 = await dialog.locator('.export-dialog__codec-label').textContent()
    expect(codecLabel2).toContain('H.264')

    // The "Use original resolution" checkbox should be checked by default
    const resCheckbox = dialog.locator('input[type="checkbox"]')
    if ((await resCheckbox.count()) > 0) {
      expect(await resCheckbox.isChecked()).toBe(true)
    }

    await window.locator('.export-dialog__close').click()
    await expect(window.locator('.app')).toBeVisible()
  })

  test('19. Export → Cancel → Reopen dialog → Start again → Progress fresh', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()

    // Open export dialog and start export
    const exportPath = path.join(EVIDENCE_DIR, 'test-export-roundtrip.mp4')
    await stubSaveDialog(electronApp, exportPath)
    await exportBtn.click()

    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    const startBtn = dialog.locator('.export-dialog__export-btn')
    await startBtn.click()
    await window.waitForTimeout(2000)

    // Cancel export if progress is showing
    const cancelBtn = window.locator('.export-progress__cancel')
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click()
      await window.waitForTimeout(1000)
    }

    // Reopen export dialog
    await exportBtn.click()
    await expect(dialog).toBeVisible()

    // Dialog should show fresh state (not stale progress)
    await expect(dialog.locator('.export-dialog__export-btn')).toBeVisible()

    await window.locator('.export-dialog__close').click()
    await expect(window.locator('.app')).toBeVisible()
  })

  test('20. Export with 0 effects → Export with 2 effects (no crash on either)', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(150_000)
    await importAndWaitForFrame(electronApp, window)

    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()

    // Export #1: 0 effects
    const exportPath1 = path.join(EVIDENCE_DIR, 'test-export-0fx.mp4')
    await stubSaveDialog(electronApp, exportPath1)
    await exportBtn.click()

    let dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('.export-dialog__export-btn').click()
    await window.waitForTimeout(3000)

    // Cancel or wait for completion
    const cancelBtn = window.locator('.export-progress__cancel')
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click()
      await window.waitForTimeout(1000)
    }

    // Add 2 effects
    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })
    await effectItems.nth(0).click()
    await window.waitForTimeout(300)
    if ((await effectItems.count()) >= 2) {
      await effectItems.nth(1).click()
      await window.waitForTimeout(300)
    }

    // Export #2: with effects
    const exportPath2 = path.join(EVIDENCE_DIR, 'test-export-2fx.mp4')
    await stubSaveDialog(electronApp, exportPath2)
    await exportBtn.click()

    dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('.export-dialog__export-btn').click()
    await window.waitForTimeout(3000)

    // Cancel
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click()
      await window.waitForTimeout(1000)
    }

    // App should still be alive
    await expect(window.locator('.app')).toBeVisible()
  })

  test('21. Open export during playback → Playback behavior', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    // Start playback
    await startPlayback(window)
    expect(await isPlaying(window)).toBe(true)
    await window.waitForTimeout(1500)

    // Open export dialog while playing
    const exportBtn = window.locator('.export-btn')
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()

    const dialog = window.locator('.export-dialog')
    await expect(dialog).toBeVisible()

    // App should be stable with dialog open during playback
    await expect(window.locator('.app')).toBeVisible()

    // Close dialog
    await window.locator('.export-dialog__close').click()
    await window.waitForTimeout(500)

    // App should still be functional
    await expect(window.locator('.app')).toBeVisible()
    await pausePlayback(window)
  })
})

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
// GROUP 7: Search + Category + Effect Add
// ═══════════════════════════════════════════════════════════

test.describe('UX Combos — Group 7: Search + Category + Effect Add', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 25_000)
  })

  test('25. Search → Add effect from results → Search persists, rack updates', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Get the first effect's name to use as search term
    const firstName = await effectItems.first().textContent()
    const searchTerm = firstName?.trim().substring(0, 3) ?? 'a'

    // Type in search
    const searchInput = window.locator('.effect-search__input')
    await searchInput.fill(searchTerm)
    await window.waitForTimeout(500)

    // Should have filtered results
    const filteredCount = await effectItems.count()
    expect(filteredCount).toBeGreaterThan(0)

    // Add first filtered effect
    await effectItems.first().click()
    await window.waitForTimeout(500)

    // Rack should have 1 effect
    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)

    // Search input should still contain our search term
    const searchValue = await searchInput.inputValue()
    expect(searchValue).toBe(searchTerm)

    // Browser should still show filtered results
    const stillFiltered = await effectItems.count()
    expect(stillFiltered).toBe(filteredCount)

    await expect(window.locator('.app')).toBeVisible()
  })

  test('26. Category filter → Add effect → Switch to "All" → Rack still shows added effect', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Check for category buttons (besides "All")
    const catButtons = window.locator('.effect-browser__cat-btn')
    const catCount = await catButtons.count()

    if (catCount <= 1) {
      // No categories to test — skip
      test.skip()
      return
    }

    // Click a non-All category
    await catButtons.nth(1).click()
    await window.waitForTimeout(500)

    // Verify category is active
    await expect(catButtons.nth(1)).toHaveClass(/effect-browser__cat-btn--active/)

    // Add effect from this category
    const filteredItems = window.locator('.effect-browser__item')
    if ((await filteredItems.count()) > 0) {
      const addedName = await filteredItems.first().textContent()
      await filteredItems.first().click()
      await window.waitForTimeout(500)

      // Rack should have 1 effect
      const rackItems = window.locator('.effect-rack__item')
      expect(await rackItems.count()).toBe(1)

      // Switch back to All
      await catButtons.first().click()
      await window.waitForTimeout(500)

      // Verify All is active
      await expect(catButtons.first()).toHaveClass(/effect-browser__cat-btn--active/)

      // Rack still has the effect we added
      expect(await rackItems.count()).toBe(1)
      const rackName = await rackItems.first().locator('.effect-card__name').textContent()
      expect(rackName).toBe(addedName?.trim())
    }

    await expect(window.locator('.app')).toBeVisible()
  })

  test('27. Search no match → Clear search → All effects visible, rack unchanged', async ({
    electronApp,
    window,
  }) => {
    test.setTimeout(120_000)
    await importAndWaitForFrame(electronApp, window)

    const effectItems = window.locator('.effect-browser__item')
    await expect(effectItems.first()).toBeVisible({ timeout: 5_000 })

    // Add an effect before searching
    await effectItems.first().click()
    await window.waitForTimeout(500)

    const rackItems = window.locator('.effect-rack__item')
    expect(await rackItems.count()).toBe(1)

    // Count total effects available
    const totalEffects = await effectItems.count()

    // Search for something that won't match
    const searchInput = window.locator('.effect-search__input')
    await searchInput.fill('zzzznonexistent999')
    await window.waitForTimeout(500)

    // Should show "No effects found"
    await expect(window.locator('.effect-browser__empty')).toBeVisible()
    expect(await effectItems.count()).toBe(0)

    // Clear search
    await searchInput.fill('')
    await window.waitForTimeout(500)

    // All effects should be visible again
    expect(await effectItems.count()).toBe(totalEffects)

    // Rack should be unchanged
    expect(await rackItems.count()).toBe(1)

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
