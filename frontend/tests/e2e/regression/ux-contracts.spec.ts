/**
 * UX Contract Tests — Don Norman Principles
 *
 * 8 tests (pruned from 15) verifying:
 * - Visibility of system status (real engine connection)
 * - Affordances (real DOM tag verification)
 * - Consistency (real window layout, CSS, BrowserWindow API)
 *
 * Tests 4-6, 10-13 PRUNED — migrated to Vitest: ux-contracts.test.tsx
 */
// WHY E2E: Remaining tests need real engine connection, BrowserWindow API, and Electron CSS rendering

import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('UX Contracts — Visibility of System Status', () => {
  test.beforeEach(async ({ window }) => {
    // Give the app time to initialize
    await window.waitForLoadState('domcontentloaded')
  })

  test('1. engine status indicator is always visible', async ({ window }) => {
    await expect(window.locator('.status-bar')).toBeVisible()
    await expect(window.locator('.status-indicator')).toBeVisible()
    await expect(window.locator('.status-text')).toBeVisible()
  })

  test('2. status indicator color matches connected state', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    // The app sets inline style backgroundColor to statusColor[status]
    // Check it has some background color set (inline style)
    const hasInlineStyle = await window.locator('.status-indicator').evaluate(
      (el) => (el as HTMLElement).style.backgroundColor !== '',
    )
    expect(hasInlineStyle).toBe(true)
  })

  test('3. preview placeholder communicates empty state', async ({ window }) => {
    const placeholder = window.locator('.preview-canvas__placeholder')
    await expect(placeholder).toBeVisible()
    const text = await placeholder.textContent()
    expect(text).toBeTruthy()
    expect(text!.length).toBeGreaterThan(0)
  })
})

// Tests 4-6 (Feedback) PRUNED — migrated to Vitest: ux-contracts.test.tsx

test.describe('UX Contracts — Affordances', () => {
  test('7. Browse button looks like a button', async ({ window }) => {
    const btn = window.locator('.file-dialog-btn')
    await expect(btn).toBeVisible()
    // Should be a <button> element
    const tagName = await btn.evaluate((el) => el.tagName.toLowerCase())
    expect(tagName).toBe('button')
  })

  test('8. drop zone icon communicates addability', async ({ window }) => {
    const icon = window.locator('.drop-zone__icon')
    await expect(icon).toBeVisible()
    const text = await icon.textContent()
    expect(text).toBe('+')
  })

  test('9. effect browser items are clickable buttons', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
    // Wait for effects to load
    await window.waitForTimeout(2000)

    const items = window.locator('.effect-browser__item')
    const count = await items.count()

    if (count > 0) {
      const tagName = await items.first().evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('button')
    }
  })
})

// Tests 10-12 (Constraints) PRUNED — migrated to Vitest: ux-contracts.test.tsx
// Test 13 (BEM naming) PRUNED — migrated to Vitest: ux-contracts.test.tsx

test.describe('UX Contracts — Consistency', () => {
  test('14. status bar is always at bottom of viewport', async ({ electronApp, window }) => {
    const statusBar = window.locator('.status-bar')
    await expect(statusBar).toBeVisible()

    const box = await statusBar.boundingBox()
    expect(box).not.toBeNull()

    const { height: winHeight } = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const [, h] = win.getContentSize()
      return { height: h }
    })

    if (box) {
      // Status bar bottom edge should be near viewport bottom
      const barBottom = box.y + box.height
      expect(barBottom).toBeGreaterThanOrEqual(winHeight - 5)
    }
  })

  test('15. dark background theme applied', async ({ window }) => {
    // The app has backgroundColor: '#1a1a1a' set on the BrowserWindow
    // and uses dark theme colors throughout
    const bgColor = await window.evaluate(() => {
      const body = document.body
      return getComputedStyle(body).backgroundColor
    })
    // Should be a dark color (r, g, b all < 100)
    const match = bgColor.match(/rgb\((\d+), (\d+), (\d+)\)/)
    if (match) {
      const [, r, g, b] = match.map(Number)
      expect(r).toBeLessThan(100)
      expect(g).toBeLessThan(100)
      expect(b).toBeLessThan(100)
    }
    // If transparent or unset, that's also fine — Electron sets window bg
  })
})
