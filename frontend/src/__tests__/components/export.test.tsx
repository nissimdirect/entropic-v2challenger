/**
 * Export Component Tests (Migrated from E2E)
 *
 * Originally in tests/e2e/phase-1/export.spec.ts (Playwright + real Electron).
 * Migrated to Vitest + @testing-library/react with mocked IPC.
 * Same assertions, ~100x faster.
 *
 * See: P97, docs/solutions/2026-02-28-e2e-test-pyramid.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import ExportDialog from '../../renderer/components/export/ExportDialog'
import ExportProgress from '../../renderer/components/export/ExportProgress'

const DIALOG_DEFAULTS = {
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

const PROGRESS_DEFAULTS = {
  isExporting: false,
  progress: 0,
  currentFrame: 0,
  totalFrames: 150,
  etaSeconds: null as number | null,
  outputPath: null as string | null,
  error: null as string | null,
  onCancel: vi.fn(),
}

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

// =============================================================================
// ExportDialog — Structure & Defaults
// =============================================================================

describe('Export — Dialog Structure', () => {
  it('dialog renders nothing when isOpen=false', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} isOpen={false} />)
    expect(document.querySelector('.export-dialog')).toBeNull()
  })

  it('dialog renders overlay and content when isOpen=true', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} />)

    expect(document.querySelector('.export-dialog__overlay')).toBeTruthy()
    expect(document.querySelector('.export-dialog')).toBeTruthy()
    expect(document.querySelector('.export-dialog__header')).toBeTruthy()
    expect(document.querySelector('.export-dialog__body')).toBeTruthy()
    expect(document.querySelector('.export-dialog__footer')).toBeTruthy()
  })

  it('dialog shows correct defaults: H.264 codec selected, tabs visible, source resolution', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} />)

    // Codec select defaults to h264
    const codecSelect = document.querySelector('.export-dialog__select') as HTMLSelectElement
    expect(codecSelect).toBeTruthy()
    expect(codecSelect.value).toBe('h264')

    // Tabs present
    expect(document.querySelectorAll('.export-dialog__tab').length).toBe(3)
    expect(document.querySelector('.export-dialog__tab--active')?.textContent).toBe('Video')

    // Resolution select defaults to source
    const selects = document.querySelectorAll('.export-dialog__select') as NodeListOf<HTMLSelectElement>
    const resSelect = Array.from(selects).find((s) => s.value === 'source')
    expect(resSelect).toBeTruthy()

    // Custom resolution inputs NOT visible when resolution=source
    const resInputs = document.querySelectorAll('.export-dialog__res-input')
    expect(resInputs.length).toBe(0)
  })

  it('selecting custom resolution shows dimension inputs', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} />)

    // Find the resolution select (second select after codec)
    const selects = document.querySelectorAll('.export-dialog__select') as NodeListOf<HTMLSelectElement>
    const resSelect = selects[1] // resolution is second select
    fireEvent.change(resSelect, { target: { value: 'custom' } })

    const resInputs = document.querySelectorAll('.export-dialog__res-input') as NodeListOf<HTMLInputElement>
    expect(resInputs.length).toBe(2)
    expect(parseInt(resInputs[0].value)).toBe(1920)
    expect(parseInt(resInputs[1].value)).toBe(1080)
  })

  it('GIF tab shows max resolution and dithering options', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} />)

    const tabs = document.querySelectorAll('.export-dialog__tab')
    fireEvent.click(tabs[1]) // GIF tab

    expect(document.querySelector('.export-dialog__tab--active')?.textContent).toBe('GIF')
    // Should have a select for max resolution and a checkbox for dithering
    const checkbox = document.querySelector('.export-dialog__body input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).toBeTruthy()
    expect(checkbox.checked).toBe(true) // dithering on by default
  })

  it('Image Sequence tab shows format dropdown', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} />)

    const tabs = document.querySelectorAll('.export-dialog__tab')
    fireEvent.click(tabs[2]) // Image Sequence tab

    expect(document.querySelector('.export-dialog__tab--active')?.textContent).toBe('Image Sequence')
    const formatSelect = document.querySelector('.export-dialog__select') as HTMLSelectElement
    expect(formatSelect).toBeTruthy()
    expect(formatSelect.value).toBe('png')
  })
})

// =============================================================================
// ExportDialog — Close Behaviors
// =============================================================================

describe('Export — Dialog Close', () => {
  it('overlay click calls onClose', () => {
    const onClose = vi.fn()
    render(<ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />)

    const overlay = document.querySelector('.export-dialog__overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(<ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />)

    const cancelBtn = document.querySelector('.export-dialog__cancel-btn') as HTMLElement
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('close (X) button calls onClose', () => {
    const onClose = vi.fn()
    render(<ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />)

    const closeBtn = document.querySelector('.export-dialog__close') as HTMLElement
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})

// =============================================================================
// ExportProgress — States
// =============================================================================

describe('Export — Progress States', () => {
  it('renders nothing when idle (not exporting, no error, progress < 1)', () => {
    render(<ExportProgress {...PROGRESS_DEFAULTS} />)
    expect(document.querySelector('.export-progress')).toBeNull()
  })

  it('shows progress bar and cancel button when exporting', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        isExporting={true}
        progress={0.5}
        currentFrame={75}
        totalFrames={150}
      />,
    )

    expect(document.querySelector('.export-progress')).toBeTruthy()
    expect(document.querySelector('.export-progress__bar-container')).toBeTruthy()
    expect(document.querySelector('.export-progress__bar')).toBeTruthy()
    expect(document.querySelector('.export-progress__cancel')).toBeTruthy()
    // Progress text now in details section
    const details = document.querySelector('.export-progress__details')
    expect(details?.textContent).toContain('50%')
    expect(details?.textContent).toContain('75/150')
  })

  it('shows error message when export fails', () => {
    render(
      <ExportProgress {...PROGRESS_DEFAULTS} error="Encoder failed" />,
    )

    const errorEl = document.querySelector('.export-progress__error')
    expect(errorEl).toBeTruthy()
    expect(errorEl!.textContent).toContain('Encoder failed')
  })

  it('shows completion message when progress reaches 1', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        progress={1}
        currentFrame={150}
        outputPath="/Users/test/output.mp4"
      />,
    )

    const done = document.querySelector('.export-progress__done')
    expect(done).toBeTruthy()
    expect(done!.textContent).toContain('Export complete')
  })

  it('shows ETA when provided during export', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        isExporting={true}
        progress={0.3}
        currentFrame={45}
        totalFrames={150}
        etaSeconds={25}
      />,
    )

    const details = document.querySelector('.export-progress__details')
    expect(details?.textContent).toContain('ETA')
    expect(details?.textContent).toContain('25s')
  })

  it('shows output path in complete state', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        progress={1}
        currentFrame={150}
        outputPath="/Users/test/output.mp4"
      />,
    )

    const done = document.querySelector('.export-progress__done')
    expect(done?.textContent).toContain('output.mp4')
    expect(document.querySelector('.export-progress__open-btn')).toBeTruthy()
  })
})
