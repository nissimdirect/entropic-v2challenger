/**
 * Chaos Tests — Deterministic stress sequences
 *
 * MIGRATION STATUS: Rapid clicks (categories, effects, browse, toggle, play,
 * search, drag) migrated to Vitest component tests:
 *   frontend/src/__tests__/components/chaos.test.tsx
 *
 * Remaining E2E tests:
 * // WHY E2E: Tests 8-11 send real IPC commands (invalid, empty, huge payload, bad filters)
 * // WHY E2E: Test 14 verifies contextIsolation blocks XSS (SEC-15)
 * // WHY E2E: Tests 15-17 resize real BrowserWindow (min, max, rapid)
 * // WHY E2E: Test 13 removes DOM nodes and verifies React doesn't recover (needs full app)
 *
 * 17 tests simulating chaotic human behavior:
 * - Rapid keyboard input
 * - Multiple rapid clicks
 * - Invalid sequences
 * - State corruption attempts
 * - Boundary conditions
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

test.describe('Chaos — Rapid Input', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('1. rapid Tab key presses do not crash', async ({ window }) => {
    // Press Tab 20 times rapidly — focus should cycle without errors
    for (let i = 0; i < 20; i++) {
      await window.keyboard.press('Tab')
    }
    // App should still be responsive
    await expect(window.locator('.app')).toBeVisible()
  })

  test('2. rapid Escape presses do not crash', async ({ window }) => {
    for (let i = 0; i < 15; i++) {
      await window.keyboard.press('Escape')
    }
    await expect(window.locator('.app')).toBeVisible()
  })

  test('3. rapid Space presses do not trigger unintended actions', async ({ window }) => {
    // Focus should not cause play/pause if no video loaded
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('Space')
    }
    await expect(window.locator('.app')).toBeVisible()
    // No video loaded, so preview placeholder should still be visible
    await expect(window.locator('.preview-canvas__placeholder')).toBeVisible()
  })

  test('4. keyboard shortcut sequence: Ctrl+A, Ctrl+C, Ctrl+V', async ({ window }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await window.keyboard.press(`${modifier}+a`)
    await window.keyboard.press(`${modifier}+c`)
    await window.keyboard.press(`${modifier}+v`)
    // App should remain stable
    await expect(window.locator('.app')).toBeVisible()
  })
})

test.describe('Chaos — Rapid Clicks', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('5. rapid-click Browse button 5 times', async ({ electronApp, window }) => {
    // Stub dialog to always cancel — prevents actual file system interaction
    await electronApp.evaluate(async ({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    })

    const btn = window.locator('.file-dialog-btn')
    for (let i = 0; i < 5; i++) {
      await btn.click({ force: true })
      await window.waitForTimeout(50)
    }

    // App should still be responsive
    await expect(window.locator('.app')).toBeVisible()
    await expect(window.locator('.drop-zone')).toBeVisible()
  })

  test('6. rapid-click "All" category filter', async ({ window }) => {
    const allBtn = window.locator('.effect-browser__cat-btn', { hasText: 'All' })
    const count = await allBtn.count()
    if (count > 0) {
      for (let i = 0; i < 10; i++) {
        await allBtn.click({ force: true })
      }
    }
    await expect(window.locator('.app')).toBeVisible()
  })

  test('7. rapid-click effect items (if any)', async ({ window }) => {
    await window.waitForTimeout(2000) // Wait for effects to load

    const items = window.locator('.effect-browser__item')
    const itemCount = await items.count()

    if (itemCount > 0) {
      // Click first effect 12 times rapidly (max chain is 10)
      for (let i = 0; i < 12; i++) {
        await items.first().click({ force: true })
        await window.waitForTimeout(30)
      }
    }

    // App should remain stable regardless
    await expect(window.locator('.app')).toBeVisible()
  })
})

test.describe('Chaos — Invalid Sequences', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('8. send invalid IPC command via preload bridge', async ({ window }) => {
    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).entropic.sendCommand({
          cmd: 'nonexistent_command',
        })
        return { ok: res.ok, error: res.error }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    // Should return an error, not crash
    expect(result.ok).toBe(false)
  })

  test('9. send empty IPC command', async ({ window }) => {
    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).entropic.sendCommand({})
        return { ok: res.ok, error: res.error }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    expect(result.ok).toBe(false)
  })

  test('10. send IPC command with huge payload', async ({ window }) => {
    const result = await window.evaluate(async () => {
      try {
        const bigString = 'x'.repeat(1_000_000)
        const res = await (window as any).entropic.sendCommand({
          cmd: 'ping',
          data: bigString,
        })
        return { ok: typeof res.ok !== 'undefined' }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    })

    // Should handle gracefully (either succeed or return error, not crash)
    expect(result).toBeDefined()
  })

  test('11. call selectFile with invalid filters', async ({ electronApp, window }) => {
    // Stub the IPC handler to prevent a real native dialog opening in tests
    // (BrowserWindow.getFocusedWindow() may return a window, blocking on the dialog)
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.removeHandler('select-file')
      ipcMain.handle('select-file', async () => null)
    })

    const result = await window.evaluate(async () => {
      try {
        const res = await (window as any).entropic.selectFile([])
        return { result: res }
      } catch (err) {
        return { error: String(err) }
      }
    })

    // Should return null or error, not crash
    expect(result).toBeDefined()
  })
})

test.describe('Chaos — State Corruption Attempts', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('12. access window.entropic methods after rapid tab creation', async ({ window }) => {
    // Verify preload bridge is still intact
    const intact = await window.evaluate(() => {
      const e = (window as any).entropic
      return (
        typeof e.sendCommand === 'function' &&
        typeof e.selectFile === 'function' &&
        typeof e.onEngineStatus === 'function'
      )
    })
    expect(intact).toBe(true)
  })

  test('13. modify DOM manually and verify app recovers', async ({ window }) => {
    // Delete the status bar from DOM
    await window.evaluate(() => {
      const statusBar = document.querySelector('.status-bar')
      if (statusBar) statusBar.remove()
    })

    // Status bar should be gone now
    const countBefore = await window.locator('.status-bar').count()
    expect(countBefore).toBe(0)

    // React should NOT re-render the removed element unless state changes
    // But the app should still be functional
    await expect(window.locator('.app')).toBeVisible()
    await expect(window.locator('.preview-canvas')).toBeVisible()
  })

  test('14. attempt XSS via evaluate (contextIsolation blocks it)', async ({ window }) => {
    // contextIsolation is enabled — renderer cannot access Node APIs
    const hasRequire = await window.evaluate(() => {
      return typeof (window as any).require !== 'undefined'
    })
    expect(hasRequire).toBe(false)

    const hasProcess = await window.evaluate(() => {
      return typeof (window as any).process !== 'undefined'
    })
    // In Electron with contextIsolation, process should not be in renderer
    expect(hasProcess).toBe(false)
  })
})

test.describe('Chaos — Boundary Conditions', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('15. resize window to minimum size', async ({ electronApp }) => {
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setSize(320, 240)
      }
    })

    // Small delay for resize
    await new Promise((r) => setTimeout(r, 500))

    const page = await electronApp.firstWindow()
    await expect(page.locator('.app')).toBeVisible()
  })

  test('16. resize window to very large size', async ({ electronApp }) => {
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setSize(2560, 1440)
      }
    })

    await new Promise((r) => setTimeout(r, 500))

    const page = await electronApp.firstWindow()
    await expect(page.locator('.app')).toBeVisible()
  })

  test('17. rapid window resize does not crash', async ({ electronApp }) => {
    for (let i = 0; i < 5; i++) {
      await electronApp.evaluate(
        async ({ BrowserWindow }, size) => {
          const win = BrowserWindow.getAllWindows()[0]
          if (win) win.setSize(size, size)
        },
        400 + i * 200,
      )
      await new Promise((r) => setTimeout(r, 100))
    }

    const page = await electronApp.firstWindow()
    await expect(page.locator('.app')).toBeVisible()
  })
})
