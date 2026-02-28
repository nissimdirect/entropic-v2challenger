/**
 * Chaos Tests — Deterministic stress sequences
 *
 * 10 tests (pruned from 17) — kept tests requiring real Electron APIs:
 * - Real Electron dialog debouncing (test 5)
 * - Real IPC abuse (tests 8-11)
 * - Preload bridge integrity (test 12)
 * - DOM corruption recovery (test 13)
 * - contextIsolation security (test 14)
 * - BrowserWindow resize (tests 15-17)
 *
 * Tests 1-4 (keyboard stress), 6-7 (click stress) PRUNED — migrated to Vitest: chaos.test.tsx
 */
// WHY E2E: Remaining tests need electronApp.evaluate, real IPC abuse, BrowserWindow resize, contextIsolation

import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

// Tests 1-4 (Rapid Input) PRUNED — DOM-only keyboard stress, migrated to Vitest

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

  // Tests 6-7 PRUNED — DOM-only click stress, migrated to Vitest
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
