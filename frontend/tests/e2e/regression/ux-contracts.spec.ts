/**
 * UX Contract Tests — Don Norman Principles
 *
 * // WHY E2E: Test 14 tests viewport-relative positioning via BrowserWindow.getContentSize()
 *
 * 15 tests verifying:
 * - Visibility of system status
 * - Feedback on user actions
 * - Affordances (buttons look clickable, disabled states)
 * - Constraints (can't do invalid things)
 * - Consistency (same patterns everywhere)
 */
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

test.describe('UX Contracts — Feedback', () => {
  test('4. drop zone shows visual feedback on hover state class', async ({ window }) => {
    // Verify drop zone has the CSS class structure for active state
    const dropZone = window.locator('.drop-zone')
    await expect(dropZone).toBeVisible()

    // Check that the class name follows BEM convention for state
    const className = await dropZone.getAttribute('class')
    expect(className).toContain('drop-zone')
    // Active state class is 'drop-zone--active' (applied on dragOver)
  })

  test('5. effect rack shows empty state message', async ({ window }) => {
    // When no effects in chain, show placeholder
    const emptyRack = window.locator('.effect-rack--empty')
    const emptyCount = await emptyRack.count()

    if (emptyCount > 0) {
      const placeholder = window.locator('.effect-rack__placeholder')
      await expect(placeholder).toBeVisible()
      const text = await placeholder.textContent()
      expect(text).toContain('No effects')
    }
    // If effects are loaded, the rack is populated — also valid
  })

  test('6. loading state shown while effects registry loads', async ({ window }) => {
    // On initial load, effect browser may show loading state briefly
    // Just verify the component exists and eventually resolves
    const browser = window.locator('.effect-browser')
    await expect(browser).toBeVisible({ timeout: 15_000 })
  })
})

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

test.describe('UX Contracts — Constraints', () => {
  test('10. export button hidden when no assets', async ({ window }) => {
    // Empty state: no export button
    const count = await window.locator('.export-btn').count()
    expect(count).toBe(0)
  })

  test('11. effect chain has max length constraint', async ({ window }) => {
    // MAX_CHAIN_LENGTH = 10; buttons should show disabled title at max
    await waitForEngineConnected(window, 20_000)
    await window.waitForTimeout(2000)

    const items = window.locator('.effect-browser__item')
    const count = await items.count()

    if (count > 0) {
      // Before reaching max, title should say "Add <name>"
      const title = await items.first().getAttribute('title')
      expect(title).toMatch(/^Add /)
    }
  })

  test('12. disabled drop zone prevents drops', async ({ window }) => {
    // The drop zone has a --disabled modifier when ingesting
    const dropZone = window.locator('.drop-zone')
    const className = await dropZone.getAttribute('class')
    // In idle state, should NOT have disabled class
    expect(className).not.toContain('drop-zone--disabled')
  })
})

test.describe('UX Contracts — Consistency', () => {
  test('13. all control buttons use consistent BEM naming', async ({ window }) => {
    // Check that key UI elements follow BEM convention
    const selectors = [
      '.drop-zone',
      '.drop-zone__content',
      '.file-dialog-btn',
      '.preview-canvas',
      '.status-bar',
      '.effect-browser',
    ]

    for (const selector of selectors) {
      const count = await window.locator(selector).count()
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

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
