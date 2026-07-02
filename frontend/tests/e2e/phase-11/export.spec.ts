/**
 * Phase 11 E2E — Export pipeline tests.
 * Requires built app (npm run build) and test video fixture.
 *
 * // WHY E2E: Export tests require the real Python sidecar to encode video
 * via PyAV. The codec registry, frame pipeline, resolution scaling, FPS
 * conversion, and audio muxing all run in the Python process. Vitest with
 * mock IPC cannot verify that a valid MP4/GIF/image sequence is produced.
 */
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'
import path from 'path'
import fs from 'fs'
import os from 'os'

const TEST_VIDEO = path.join(__dirname, '..', 'fixtures', 'test-video.mp4')

test.describe('Phase 11 — Export', () => {
  test.beforeEach(async ({ window }) => {
    test.setTimeout(60_000)
    await waitForEngineConnected(window, 20_000)
  })

  test('export H.264 1080p produces valid MP4', async ({ window }) => {
    // Upload test video
    await window.locator('.drop-zone').click()
    await window.setInputFiles('input[type="file"]', TEST_VIDEO)
    await window.waitForSelector('.preview-canvas', { timeout: 10_000 })

    // Open export dialog
    await window.locator('.export-btn').click()
    await window.waitForSelector('.export-dialog')

    // Verify H.264 is default codec
    const codecSelect = window.locator('.export-dialog__select').first()
    expect(await codecSelect.inputValue()).toBe('h264')

    // Click Export
    const outputPath = path.join(os.tmpdir(), `entropic-test-${Date.now()}.mp4`)
    await window.evaluate((p: string) => {
      (window as any).__testExportPath = p
    }, outputPath)

    await window.locator('.export-dialog__export-btn').click()

    // Wait for export to complete
    await window.waitForSelector('.export-progress__done', { timeout: 30_000 })

    // Verify output file exists and has content
    expect(fs.existsSync(outputPath)).toBe(true)
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000)

    fs.unlinkSync(outputPath)
  })

  test('cancel mid-export cleans up partial file', async ({ window }) => {
    await window.locator('.drop-zone').click()
    await window.setInputFiles('input[type="file"]', TEST_VIDEO)
    await window.waitForSelector('.preview-canvas', { timeout: 10_000 })

    await window.locator('.export-btn').click()
    await window.waitForSelector('.export-dialog')

    const outputPath = path.join(os.tmpdir(), `entropic-cancel-${Date.now()}.mp4`)
    await window.evaluate((p: string) => {
      (window as any).__testExportPath = p
    }, outputPath)

    await window.locator('.export-dialog__export-btn').click()
    await window.waitForSelector('.export-progress__cancel', { timeout: 5_000 })

    // Cancel immediately
    await window.locator('.export-progress__cancel').click()
    await window.waitForTimeout(2000)

    // Partial file should be cleaned up
    expect(fs.existsSync(outputPath)).toBe(false)
  })

  // P2.3 (slice 3d — full export parity): exporting a project runs the
  // modulation engine in the export path (export == preview). This E2E asserts
  // the start-export-from-UI flow completes a valid file with the export-parity
  // changes in place (operators / automation_by_frame payloads are additive and
  // do not break the shipping export pipeline). // WHY E2E: only the real
  // sidecar runs the SignalEngine + PyAV encode end to end.
  test('export-parity flow completes a valid file from the UI', async ({ window }) => {
    await window.locator('.drop-zone').click()
    await window.setInputFiles('input[type="file"]', TEST_VIDEO)
    await window.waitForSelector('.preview-canvas', { timeout: 10_000 })

    await window.locator('.export-btn').click()
    await window.waitForSelector('.export-dialog')

    const outputPath = path.join(os.tmpdir(), `entropic-parity-${Date.now()}.mp4`)
    await window.evaluate((p: string) => {
      (window as any).__testExportPath = p
    }, outputPath)

    await window.locator('.export-dialog__export-btn').click()

    // Progress surfaces, then completion — the modulation-parity wiring did not
    // break the export pipeline.
    await window.waitForSelector('.export-progress__done', { timeout: 30_000 })

    expect(fs.existsSync(outputPath)).toBe(true)
    expect(fs.statSync(outputPath).size).toBeGreaterThan(1000)

    fs.unlinkSync(outputPath)
  })
})
