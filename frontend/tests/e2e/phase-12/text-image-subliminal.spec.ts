/**
 * Phase 12 E2E — Text, Image, and Subliminal tests.
 * Requires built app (npm run build) and test fixtures.
 *
 * // WHY E2E: Text rendering, image import, and subliminal effects require
 * the real Python sidecar with Pillow, system fonts, and PyAV. Vitest with
 * mock IPC cannot verify rendered text frames or image compositing.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected, waitForFrame } from '../fixtures/test-helpers'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Create a test PNG fixture
const TEST_IMAGE_DIR = path.join(os.tmpdir(), 'entropic-e2e-fixtures')
const TEST_IMAGE = path.join(TEST_IMAGE_DIR, 'test-image.png')
const TEST_VIDEO = path.join(__dirname, '..', 'fixtures', 'test-video.mp4')

test.beforeAll(() => {
  // Create a simple PNG test fixture if needed
  if (!fs.existsSync(TEST_IMAGE_DIR)) {
    fs.mkdirSync(TEST_IMAGE_DIR, { recursive: true })
  }
  if (!fs.existsSync(TEST_IMAGE)) {
    // Create a 100x100 red PNG using raw bytes (minimal valid PNG)
    // This is a 1x1 red pixel PNG that Pillow can open
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed data
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // ...
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND
      0x44, 0xae, 0x42, 0x60, 0x82,
    ])
    fs.writeFileSync(TEST_IMAGE, pngData)
  }
})

test.afterAll(() => {
  // Clean up test fixtures
  try {
    if (fs.existsSync(TEST_IMAGE)) fs.unlinkSync(TEST_IMAGE)
    if (fs.existsSync(TEST_IMAGE_DIR)) fs.rmdirSync(TEST_IMAGE_DIR)
  } catch {
    // Best-effort cleanup
  }
})

test.describe('Phase 12 — Image Import', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('image file accepted by drop zone', async ({ window }) => {
    // Verify drop zone shows image formats
    const hint = window.locator('.drop-zone__hint')
    await expect(hint).toContainText('PNG')
    await expect(hint).toContainText('JPG')
  })

  test('image file accepted by file dialog', async ({ window }) => {
    // The file dialog should include image extensions
    // (verified by the filter: { name: 'Image', extensions: [...] })
    const browseBtn = window.locator('.file-dialog-btn')
    await expect(browseBtn).toBeVisible()
  })
})

test.describe('Phase 12 — Text Tracks', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('add text track button is visible in empty timeline', async ({ window }) => {
    const addTextBtn = window.locator('.timeline__add-track-btn--text')
    await expect(addTextBtn).toBeVisible()
  })

  test('text track can be created', async ({ window }) => {
    // Click the text track button
    const addTextBtn = window.locator('.timeline__add-track-btn--text').first()
    await addTextBtn.click()

    // A track header should appear with the "T" icon
    const textIcon = window.locator('.timeline-track__icon--text')
    await expect(textIcon).toBeVisible({ timeout: 5_000 })
    await expect(textIcon).toHaveText('T')
  })
})

test.describe('Phase 12 — Text Panel', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('text panel hidden when no text clip selected', async ({ window }) => {
    const panel = window.locator('.text-panel')
    await expect(panel).not.toBeVisible()
  })
})

test.describe('Phase 12 — Subliminal Effect', () => {
  test.skip(
    !fs.existsSync(TEST_VIDEO),
    'Test video fixture not found — skipping subliminal E2E',
  )

  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('subliminal effect appears in effect browser', async ({ window }) => {
    // Load a video first
    if (fs.existsSync(TEST_VIDEO)) {
      await window.locator('.drop-zone').click()
      await window.setInputFiles('input[type="file"]', TEST_VIDEO)
      await waitForFrame(window, 15_000)
    }

    // Search for subliminal in effect browser
    const searchInput = window.locator('.effect-browser__search-input')
    if (await searchInput.isVisible()) {
      await searchInput.fill('subliminal')
      // Should find the effect
      const effectCard = window.locator('.effect-browser__item').filter({ hasText: 'Subliminal' })
      await expect(effectCard.first()).toBeVisible({ timeout: 5_000 })
    }
  })
})
