import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Stub Electron's native file dialog to return a specific path.
 * Must be called on the ElectronApplication (main process evaluate).
 */
export async function stubFileDialog(
  electronApp: ElectronApplication,
  filePath: string,
): Promise<void> {
  await electronApp.evaluate(
    async ({ dialog }, stubPath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [stubPath],
      })
    },
    filePath,
  )
}

/**
 * Stub Electron's save dialog to return a specific path.
 */
export async function stubSaveDialog(
  electronApp: ElectronApplication,
  savePath: string,
): Promise<void> {
  await electronApp.evaluate(
    async ({ dialog }, stubPath) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: stubPath,
      })
    },
    savePath,
  )
}

/**
 * Wait for a rendered frame to appear in the preview canvas.
 * The app renders frames as base64 JPEG into an <img> tag.
 */
export async function waitForFrame(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const img = document.querySelector('.preview-canvas__element') as HTMLImageElement | null
      return img !== null && img.src.startsWith('data:image/')
    },
    { timeout: timeoutMs },
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
 * Import a video file by clicking the Browse button (uses stubbed dialog).
 */
export async function importVideoViaDialog(
  electronApp: ElectronApplication,
  page: Page,
  videoPath: string,
): Promise<void> {
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
