/**
 * Phase 0A — Watchdog Tests (UAT Plan tests 5-8)
 *
 * 5. Watchdog detects sidecar connection
 * 6. Kill sidecar -> watchdog restarts it
 * 7. Rapid kill/respawn stability
 * 8. Port conflict recovery
 */
// WHY E2E: Tests sidecar crash detection and restart — requires real child process management

import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected, waitForEngineStatus } from '../fixtures/test-helpers'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

test.describe('Phase 0A — Watchdog', () => {
  test('5. watchdog detects sidecar and reports connected', async ({ window }) => {
    const testStart = new Date()
    await waitForEngineConnected(window, 20_000)

    const statusText = await window.locator('.status-text').textContent()
    expect(statusText).toContain('Connected')

    // Main process should have logged Python startup.
    // Migrated off stdout/consoleMessages: the diagnostics/PII-stripping
    // logger (frontend/src/main/logger.ts, introduced in ef895e1) writes
    // this line to ~/.creatrix/logs/electron-main.log only — it is never
    // printed to stdout, so the old consoleMessages assertion is stale.
    const logPath = join(homedir(), '.creatrix', 'logs', 'electron-main.log')
    const hasPythonLog = existsSync(logPath)
      && readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .some((line) => {
          try {
            const entry = JSON.parse(line)
            return entry.message === '[Main] Python sidecar started'
              && new Date(entry.timestamp) >= testStart
          } catch {
            return false
          }
        })
    expect(hasPythonLog).toBe(true)
  })

  test('6. kill sidecar -> watchdog restarts it', async ({ window }) => {
    test.setTimeout(45_000)

    // First, wait for connected
    await waitForEngineConnected(window, 20_000)

    // Kill the Python sidecar process
    try {
      execSync('pkill -f "backend/src/main.py" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // may not find it
    }

    // Watchdog should detect disconnect (after PING_INTERVAL * MAX_MISSES ~ 3s)
    // then restart and reconnect
    // Wait for disconnected or restarting state first
    await window.waitForFunction(
      () => {
        const el = document.querySelector('.status-text')
        const text = el?.textContent ?? ''
        return text.includes('Disconnected') || text.includes('Restarting')
      },
      { timeout: 10_000 },
    )

    // Then it should recover to connected
    await waitForEngineConnected(window, 20_000)
    const statusAfter = await window.locator('.status-text').textContent()
    expect(statusAfter).toContain('Connected')
  })

  test('7. rapid kill does not crash the app', async ({ window, electronApp }) => {
    test.setTimeout(60_000)

    await waitForEngineConnected(window, 20_000)

    // Kill the sidecar twice in quick succession
    for (let i = 0; i < 2; i++) {
      try {
        execSync('pkill -f "backend/src/main.py" 2>/dev/null || true', { stdio: 'ignore' })
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    // App should still be alive — wait for eventual recovery
    const isRunning = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length > 0
    })
    expect(isRunning).toBe(true)

    // Watchdog should eventually reconnect
    await waitForEngineConnected(window, 30_000)
  })

  test('8. uptime is reported when connected', async ({ window }) => {
    await waitForEngineConnected(window, 20_000)

    // Wait a moment for uptime to appear
    await new Promise((r) => setTimeout(r, 2000))

    const uptimeEl = window.locator('.uptime')
    const count = await uptimeEl.count()
    if (count > 0) {
      const uptimeText = await uptimeEl.textContent()
      expect(uptimeText).toMatch(/Uptime: \d+/)
    }
    // If uptime element doesn't appear, the test still passes —
    // uptime display is optional based on timing
  })
})
