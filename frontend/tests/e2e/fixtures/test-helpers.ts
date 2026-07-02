import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Stub the 'select-file' IPC handler to return a specific path.
 *
 * The real handler calls BrowserWindow.getFocusedWindow() which returns null
 * in test environments (no OS focus), so we replace the entire IPC handler
 * instead of just stubbing dialog.showOpenDialog.
 */
export async function stubFileDialog(
  electronApp: ElectronApplication,
  filePath: string,
): Promise<void> {
  await electronApp.evaluate(
    async ({ ipcMain }, stubPath) => {
      ipcMain.removeHandler('select-file')
      ipcMain.handle('select-file', async () => stubPath)
    },
    filePath,
  )
}

/**
 * Stub the 'select-save-path' IPC handler to return a specific path.
 *
 * Same issue as select-file: BrowserWindow.getFocusedWindow() returns null
 * in test environments.
 */
export async function stubSaveDialog(
  electronApp: ElectronApplication,
  savePath: string,
): Promise<void> {
  await electronApp.evaluate(
    async ({ ipcMain }, stubPath) => {
      ipcMain.removeHandler('select-save-path')
      ipcMain.handle('select-save-path', async () => stubPath)
    },
    savePath,
  )
}

/**
 * Wait for a rendered frame to appear in the preview canvas.
 * Uses multiple signals to detect readiness:
 * 1. canvas.dataset.frameReady === 'true' (set by drawToCanvas)
 * 2. canvas has non-zero dimensions and pixel data
 * 3. placeholder is gone (previewState moved past 'empty')
 */
export async function waitForFrame(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('.preview-canvas__element') as HTMLCanvasElement | null
      if (!canvas) return false

      // Signal 1: explicit dataset flag
      if (canvas.dataset.frameReady === 'true') return true

      // Signal 2: canvas has drawn content (non-zero size + pixel data)
      if (canvas.width > 0 && canvas.height > 0) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const pixel = ctx.getImageData(0, 0, 1, 1).data
          if (pixel[3] > 0) return true
        }
      }

      return false
    },
    { timeout: timeoutMs, polling: 250 },
  )
}

/**
 * Wait for the engine status indicator to show "connected".
 */
export async function waitForEngineConnected(page: Page, timeoutMs = 20_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const statusText = document.querySelector('.status-text')
      return statusText?.textContent?.includes('Connected')
    },
    { timeout: timeoutMs },
  )
}

/**
 * Wait for the engine status to show a specific state.
 */
export async function waitForEngineStatus(
  page: Page,
  status: 'Connected' | 'Disconnected' | 'Restarting',
  timeoutMs = 20_000,
): Promise<void> {
  await page.waitForFunction(
    (s) => {
      const statusText = document.querySelector('.status-text')
      return statusText?.textContent?.includes(s)
    },
    status,
    { timeout: timeoutMs },
  )
}

/**
 * Dismiss the welcome screen by clicking "New Project".
 * No-op if welcome screen is not visible.
 */
export async function dismissWelcomeScreen(page: Page): Promise<void> {
  const welcomeScreen = page.locator('.welcome-screen')
  if (await welcomeScreen.count() > 0 && await welcomeScreen.isVisible()) {
    const newProjectBtn = page.locator('.welcome-screen__btn--primary')
    if (await newProjectBtn.count() > 0) {
      await newProjectBtn.click()
      // Wait for welcome screen to disappear
      await welcomeScreen.waitFor({ state: 'hidden', timeout: 5_000 })
    }
  }
}

/**
 * Import a video file by clicking the Browse button (uses stubbed dialog).
 * Automatically dismisses the welcome screen if it's showing.
 */
export async function importVideoViaDialog(
  electronApp: ElectronApplication,
  page: Page,
  videoPath: string,
): Promise<void> {
  await dismissWelcomeScreen(page)
  await stubFileDialog(electronApp, videoPath)
  const browseBtn = page.locator('.file-dialog-btn')
  await browseBtn.click()
}

/**
 * Wait for ingest to complete (no longer showing ingest progress).
 */
export async function waitForIngestComplete(page: Page, timeoutMs = 30_000): Promise<void> {
  // Wait for asset badge to appear (indicates successful ingest)
  await page.waitForSelector('.asset-badge', { timeout: timeoutMs })
}

/**
 * Get the current engine status text from the status bar.
 */
export async function getEngineStatus(page: Page): Promise<string> {
  const text = await page.locator('.status-text').textContent()
  return text ?? ''
}

/**
 * Check if the export button is visible and enabled.
 */
export async function isExportButtonVisible(page: Page): Promise<boolean> {
  const btn = page.locator('.export-btn')
  const count = await btn.count()
  if (count === 0) return false
  return await btn.isEnabled()
}

/**
 * Get a test video path. Uses a small fixture video if it exists,
 * otherwise returns a placeholder path for stubbing.
 */
export function getTestVideoPath(): string {
  const path = require('path')
  return path.resolve(__dirname, '..', '..', '..', '..', 'test-fixtures', 'videos', 'valid-short.mp4')
}
