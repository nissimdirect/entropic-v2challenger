/**
 * UAT: Export feedback — live Electron visibility checks.
 *
 * // WHY E2E: Covers outcomes E-06..E-11 which require the real IPC relay,
 * Python sidecar, and DOM-mounted toast/overlay components. Vitest with
 * mock IPC cannot verify that the progress overlay is visually present,
 * that toasts render with the right level, or that the relay handles
 * the idle-race correctly across a real 500ms polling loop.
 *
 * Traces to UAT IDs E-06 through E-11 (visible feedback for all outcomes).
 *
 * Run: npx --no playwright test tests/e2e/phase-1/export-feedback.spec.ts
 *
 * NOTE: requires exclusive Electron access. Do NOT run while another
 * session has the app open — kill first (`pkill -f entropic-uat-fix`).
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'
import path from 'path'
import os from 'os'

const TEST_VIDEO = path.join(__dirname, '..', 'fixtures', 'test-video.mp4')

test.describe('UAT: Export feedback (live Electron)', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
    // Upload test video so every test has an active asset
    await window.locator('.drop-zone').click()
    await window.setInputFiles('input[type="file"]', TEST_VIDEO)
    await window.waitForSelector('.preview-canvas', { timeout: 10_000 })
  })

  async function openExportAndSave(window: import('playwright').Page, outputPath: string) {
    await window.evaluate((p: string) => {
      (window as unknown as { entropic: { selectSavePath: (n: string) => Promise<string> } })
        .entropic.selectSavePath = () => Promise.resolve(p)
    }, outputPath)
    await window.locator('.export-btn').click()
    await window.waitForSelector('.export-dialog')
    await window.locator('.export-dialog__export-btn').click()
  }

  test('E-06: clicking Export produces "Export started" toast', async ({ window }) => {
    const outputPath = path.join(os.tmpdir(), `uat-e06-${Date.now()}.mp4`)
    await openExportAndSave(window, outputPath)
    await expect(window.locator('.toast').filter({ hasText: 'Export started' }))
      .toBeVisible({ timeout: 3_000 })
  })

  test('E-07: progress overlay is visible during export', async ({ window }) => {
    const outputPath = path.join(os.tmpdir(), `uat-e07-${Date.now()}.mp4`)
    await openExportAndSave(window, outputPath)
    const overlay = window.locator('.export-progress')
    await expect(overlay).toBeVisible({ timeout: 3_000 })
    await expect(overlay.locator('.export-progress__bar')).toBeVisible()
    await expect(overlay.locator('.export-progress__details'))
      .toContainText(/Exporting|frames/, { timeout: 5_000 })
  })

  test('E-08: export completion shows persistent "Export complete" toast + overlay message', async ({ window }) => {
    const outputPath = path.join(os.tmpdir(), `uat-e08-${Date.now()}.mp4`)
    await openExportAndSave(window, outputPath)
    await expect(window.locator('.toast').filter({ hasText: 'Export complete' }))
      .toBeVisible({ timeout: 30_000 })
    await expect(window.locator('.export-progress__done')).toBeVisible()
    await expect(window.locator('.export-progress__done'))
      .toContainText('Export complete!')
  })

  test('E-09: cancel during export shows "Export cancelled" toast', async ({ window }) => {
    const outputPath = path.join(os.tmpdir(), `uat-e09-${Date.now()}.mp4`)
    await openExportAndSave(window, outputPath)
    await expect(window.locator('.export-progress')).toBeVisible()
    await window.locator('.export-progress__cancel').click()
    // If mid-export (>50%), app asks for confirmation; click again to confirm.
    const maybeConfirm = window.locator('.export-progress__cancel').filter({ hasText: /Cancel\?/ })
    if (await maybeConfirm.isVisible().catch(() => false)) {
      await maybeConfirm.click()
    }
    await expect(window.locator('.toast').filter({ hasText: 'Export cancelled' }))
      .toBeVisible({ timeout: 5_000 })
  })

  test('E-10: export error surfaces error toast (inject via bad output path)', async ({ window }) => {
    // /dev/null/foo is an invalid output path — backend should error.
    const outputPath = '/dev/null/entropic-uat-e10.mp4'
    await openExportAndSave(window, outputPath)
    await expect(window.locator('.toast').filter({ hasText: /Export failed/i }))
      .toBeVisible({ timeout: 10_000 })
  })

  test('E-11: instant-complete (1-frame image export) still produces visible feedback', async ({ window }) => {
    // Switch to an image asset via the drop zone if fixtures provide one.
    // For a 1-frame export, we clamp Custom Range start=0 end=1.
    const outputPath = path.join(os.tmpdir(), `uat-e11-${Date.now()}.mp4`)
    await window.evaluate((p: string) => {
      (window as unknown as { entropic: { selectSavePath: (n: string) => Promise<string> } })
        .entropic.selectSavePath = () => Promise.resolve(p)
    }, outputPath)
    await window.locator('.export-btn').click()
    await window.waitForSelector('.export-dialog')
    // Select Custom Range, set start=0, end=1
    const regionSelect = window.locator('.export-dialog__select')
      .filter({ has: window.locator('option[value="full"]') })
    await regionSelect.selectOption('custom')
    const rangeInputs = window.locator('.export-dialog__res-input')
    const count = await rangeInputs.count()
    await rangeInputs.nth(count - 2).fill('0')
    await rangeInputs.nth(count - 1).fill('1')
    await window.locator('.export-dialog__export-btn').click()
    // Even though export is fast (<500ms), the completion toast must appear.
    await expect(window.locator('.toast').filter({ hasText: 'Export complete' }))
      .toBeVisible({ timeout: 5_000 })
  })
})
