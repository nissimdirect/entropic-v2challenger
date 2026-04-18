/**
 * Export Feedback UAT — covers all outcome states produce visible feedback.
 *
 * Traces to UAT IDs E-01 through E-14 (see docs/plans or session notes).
 * Scope: visible feedback for ALL export outcomes. Playwright covers E-06..E-11
 * (requires live Electron); this file covers the 7 dialog-layer cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'

import ExportDialog from '../../renderer/components/export/ExportDialog'
import { useToastStore } from '../../renderer/stores/toast'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

const BASE = {
  isOpen: true,
  totalFrames: 150,
  sourceWidth: 1920,
  sourceHeight: 1080,
  sourceFps: 30,
  loopIn: null as number | null,
  loopOut: null as number | null,
  onExport: vi.fn(),
  onClose: vi.fn(),
}

function toasts() {
  return useToastStore.getState().toasts
}

function clearToasts() {
  useToastStore.setState({ toasts: [] })
}

function clickExport() {
  const btn = document.querySelector('.export-dialog__export-btn') as HTMLElement
  expect(btn).toBeTruthy()
  fireEvent.click(btn)
}

beforeEach(() => {
  setupMockEntropic()
  clearToasts()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
  vi.restoreAllMocks()
})

describe('UAT: Export feedback — dialog-layer outcomes', () => {
  it('E-01: no asset loaded → error toast "No asset loaded"', async () => {
    render(<ExportDialog {...BASE} totalFrames={0} />)
    clickExport()
    await waitFor(() => {
      const t = toasts().find((x) => x.message === 'No asset loaded')
      expect(t).toBeTruthy()
      expect(t?.level).toBe('error')
    })
  })

  it('E-02: window.entropic missing → error toast "Export unavailable"', async () => {
    // Override bridge to be missing
    Object.defineProperty(window, 'entropic', {
      configurable: true,
      get: () => undefined,
    })
    render(<ExportDialog {...BASE} />)
    clickExport()
    await waitFor(() => {
      const t = toasts().find((x) => x.message === 'Export unavailable')
      expect(t).toBeTruthy()
      expect(t?.level).toBe('error')
    })
  })

  it('E-03: start ≥ end in custom range → error toast "Invalid export range"', async () => {
    render(<ExportDialog {...BASE} />)
    // switch Region select to "custom"
    const selects = document.querySelectorAll('.export-dialog__select') as NodeListOf<HTMLSelectElement>
    // Region select is the only one with a 'full' option (Resolution has 'source').
    const regionSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === 'full'),
    )!
    fireEvent.change(regionSelect, { target: { value: 'custom' } })
    // Set start=100, end=50 (start > end)
    const inputs = document.querySelectorAll('.export-dialog__res-input') as NodeListOf<HTMLInputElement>
    const rangeInputs = Array.from(inputs).slice(-2) // last two are the frame range
    fireEvent.change(rangeInputs[0], { target: { value: '100' } })
    fireEvent.change(rangeInputs[1], { target: { value: '50' } })
    clickExport()
    await waitFor(() => {
      const t = toasts().find((x) => x.message === 'Invalid export range')
      expect(t).toBeTruthy()
      expect(t?.level).toBe('error')
    })
  })

  it('E-04: user cancels save dialog (selectSavePath returns null) → silent (no toast)', async () => {
    // Default mock returns null from selectSavePath
    window.entropic.selectSavePath = vi.fn().mockResolvedValue(null)
    render(<ExportDialog {...BASE} />)
    clickExport()
    // Wait a microtask so the async handler runs
    await new Promise((r) => setTimeout(r, 10))
    // No error toast should have been added for a user cancel
    const errorToasts = toasts().filter((x) => x.level === 'error' && x.source === 'export')
    expect(errorToasts.length).toBe(0)
  })

  it('E-05: selectSavePath throws → error toast "Could not open save dialog"', async () => {
    window.entropic.selectSavePath = vi.fn().mockRejectedValue(new Error('EACCES denied'))
    render(<ExportDialog {...BASE} />)
    clickExport()
    await waitFor(() => {
      const t = toasts().find((x) => x.message === 'Could not open save dialog')
      expect(t).toBeTruthy()
      expect(t?.level).toBe('error')
      expect(t?.details).toContain('EACCES')
    })
  })

  it('E-13: totalFrames=0 → Custom Range option is disabled with hint', () => {
    render(<ExportDialog {...BASE} totalFrames={0} />)
    // Find the region select (has a 'custom' option)
    const selects = document.querySelectorAll('.export-dialog__select') as NodeListOf<HTMLSelectElement>
    // Region select is the only one with a 'full' option (Resolution has 'source').
    const regionSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === 'full'),
    )!
    const customOption = Array.from(regionSelect.options).find((o) => o.value === 'custom')!
    expect(customOption.disabled).toBe(true)
    expect(customOption.textContent).toContain('load a video first')
  })

  it('E-14: custom range inputs show frame labels + seconds hint + range summary', () => {
    render(<ExportDialog {...BASE} totalFrames={150} sourceFps={30} />)
    const selects = document.querySelectorAll('.export-dialog__select') as NodeListOf<HTMLSelectElement>
    // Region select is the only one with a 'full' option (Resolution has 'source').
    const regionSelect = Array.from(selects).find((s) =>
      Array.from(s.options).some((o) => o.value === 'full'),
    )!
    fireEvent.change(regionSelect, { target: { value: 'custom' } })

    // Labels explicit about units
    const labels = Array.from(document.querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toContain('Start frame')
    expect(labels).toContain('End frame')

    // Seconds hints next to inputs
    const hints = Array.from(document.querySelectorAll('.export-dialog__hint'))
    expect(hints.length).toBeGreaterThanOrEqual(2)
    // End frame = 150 @ 30fps = 5.00s
    expect(hints.some((h) => h.textContent?.includes('5.00s'))).toBe(true)

    // Range summary row shows frame count + seconds + fps
    const summary = document.querySelector('.export-dialog__hint-row')
    expect(summary).toBeTruthy()
    expect(summary?.textContent).toContain('frames 0–150 of 150')
    expect(summary?.textContent).toContain('5.00s')
    expect(summary?.textContent).toContain('30.00 fps')
  })
})
