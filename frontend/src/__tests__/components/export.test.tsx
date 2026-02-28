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
    render(
      <ExportDialog
        isOpen={false}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-dialog')).toBeNull()
  })

  it('dialog renders overlay and content when isOpen=true', () => {
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-dialog__overlay')).toBeTruthy()
    expect(document.querySelector('.export-dialog')).toBeTruthy()
    expect(document.querySelector('.export-dialog__header')).toBeTruthy()
    expect(document.querySelector('.export-dialog__body')).toBeTruthy()
    expect(document.querySelector('.export-dialog__footer')).toBeTruthy()
  })

  it('dialog shows correct defaults: H.264 codec, frame count, original resolution checked', () => {
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Codec label
    const codecLabel = document.querySelector('.export-dialog__codec-label')
    expect(codecLabel).toBeTruthy()
    expect(codecLabel!.textContent).toBe('H.264 (MP4)')

    // Frame count
    const body = document.querySelector('.export-dialog__body')
    expect(body!.textContent).toContain('150')

    // "Use original resolution" checkbox checked by default
    const checkbox = document.querySelector('.export-dialog input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).toBeTruthy()
    expect(checkbox.checked).toBe(true)

    // Custom resolution inputs NOT visible when checkbox is checked
    const resInputs = document.querySelectorAll('.export-dialog__res-input')
    expect(resInputs.length).toBe(0)
  })

  it('unchecking resolution shows custom dimension inputs with 1920x1080 defaults', () => {
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const checkbox = document.querySelector('.export-dialog input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(checkbox)

    const resInputs = document.querySelectorAll('.export-dialog__res-input') as NodeListOf<HTMLInputElement>
    expect(resInputs.length).toBe(2)
    expect(parseInt(resInputs[0].value)).toBe(1920)
    expect(parseInt(resInputs[1].value)).toBe(1080)
  })
})

// =============================================================================
// ExportDialog — Close Behaviors
// =============================================================================

describe('Export — Dialog Close', () => {
  it('overlay click calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

    const overlay = document.querySelector('.export-dialog__overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

    const cancelBtn = document.querySelector('.export-dialog__cancel-btn') as HTMLElement
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('close (X) button calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={150}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

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
    render(
      <ExportProgress
        isExporting={false}
        progress={0}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-progress')).toBeNull()
  })

  it('shows progress bar and cancel button when exporting', () => {
    render(
      <ExportProgress
        isExporting={true}
        progress={0.5}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-progress')).toBeTruthy()
    expect(document.querySelector('.export-progress__bar-container')).toBeTruthy()
    expect(document.querySelector('.export-progress__bar')).toBeTruthy()
    expect(document.querySelector('.export-progress__cancel')).toBeTruthy()
    expect(document.querySelector('.export-progress__info')!.textContent).toContain('50%')
  })

  it('shows error message when export fails', () => {
    render(
      <ExportProgress
        isExporting={false}
        progress={0}
        error="Encoder failed"
        onCancel={vi.fn()}
      />,
    )

    const errorEl = document.querySelector('.export-progress__error')
    expect(errorEl).toBeTruthy()
    expect(errorEl!.textContent).toContain('Encoder failed')
  })

  it('shows completion message when progress reaches 1', () => {
    render(
      <ExportProgress
        isExporting={false}
        progress={1}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    const done = document.querySelector('.export-progress__done')
    expect(done).toBeTruthy()
    expect(done!.textContent).toContain('Export complete')
  })
})
