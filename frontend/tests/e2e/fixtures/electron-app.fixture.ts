import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron } from '@playwright/test'
import path from 'path'

/**
 * Shared Electron app fixture.
 * Launches the compiled Electron app and provides the window page.
 */
export type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
  consoleMessages: string[]
}

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  consoleMessages: async ({}, use) => {
    const messages: string[] = []
    await use(messages)
  },

  electronApp: async ({ consoleMessages }, use) => {
    const mainPath = path.resolve(__dirname, '..', '..', '..', 'out', 'main', 'index.js')
    const app = await _electron.launch({
      args: [mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
      timeout: 30_000,
    })

    // Capture main process console output
    app.process().stdout?.on('data', (data: Buffer) => {
      consoleMessages.push(`[main:stdout] ${data.toString().trim()}`)
    })
    app.process().stderr?.on('data', (data: Buffer) => {
      consoleMessages.push(`[main:stderr] ${data.toString().trim()}`)
    })

    await use(app)

    // Teardown: close app, then force-kill if it hangs
    // The Python sidecar + ZMQ sockets can prevent graceful shutdown.
    const pid = app.process().pid
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('close timeout')), 5_000),
        ),
      ])
    } catch {
      // Force kill the Electron process tree
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // already dead
        }
      }
    }

    // Also kill any orphan Python sidecar
    try {
      const { execSync } = await import('child_process')
      execSync('pkill -f "backend/src/main.py" 2>/dev/null || true', { stdio: 'ignore' })
    } catch {
      // ignore
    }
  },

  window: async ({ electronApp, consoleMessages }, use) => {
    // Wait for the first BrowserWindow to open
    const page = await electronApp.firstWindow()

    // Capture renderer console output
    page.on('console', (msg) => {
      consoleMessages.push(`[renderer:${msg.type()}] ${msg.text()}`)
    })

    // Wait for DOM to be ready
    await page.waitForLoadState('domcontentloaded')

    await use(page)
  },
})

export { expect } from '@playwright/test'
