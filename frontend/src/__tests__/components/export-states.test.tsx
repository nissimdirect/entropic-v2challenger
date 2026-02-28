/**
 * Export Component State Tests
 *
 * Migrated from frontend/tests/e2e/phase-1/export.spec.ts (tests 10-14, 18)
 *
 * WHY NOT E2E: Tests ExportDialog and ExportProgress idle/active states.
 * No real Electron, IPC, or sidecar needed — pure component rendering.
 */
import { render, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import ExportDialog from '../../renderer/components/export/ExportDialog'
import ExportProgress from '../../renderer/components/export/ExportProgress'

describe('Export — Idle States', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('10. export dialog not rendered when isOpen=false', () => {
    render(
      <ExportDialog
        isOpen={false}
        totalFrames={300}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-dialog')).toBeNull()
  })

  test('12. export progress returns null when idle (not exporting, no error, progress < 1)', () => {
    render(
      <ExportProgress
        isExporting={false}
        progress={0}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-progress')).toBeNull()
    expect(document.querySelector('.export-progress__bar-container')).toBeNull()
    expect(document.querySelector('.export-progress__cancel')).toBeNull()
  })

  test('13. export progress bar visible during export', () => {
    render(
      <ExportProgress
        isExporting={true}
        progress={0.5}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('.export-progress__bar-container')).toBeTruthy()
    expect(document.querySelector('.export-progress__cancel')).toBeTruthy()

    // Bar width should reflect 50%
    const bar = document.querySelector('.export-progress__bar') as HTMLElement
    expect(bar.style.width).toBe('50%')
  })

  test('14. export error shown when error present', () => {
    render(
      <ExportProgress
        isExporting={false}
        progress={0}
        error="Encoding failed"
        onCancel={vi.fn()}
      />,
    )

    const errorEl = document.querySelector('.export-progress__error')
    expect(errorEl).toBeTruthy()
    expect(errorEl?.textContent).toContain('Encoding failed')
  })

  test('export complete message shown when done', () => {
    render(
      <ExportProgress
        isExporting={false}
        progress={1}
        error={null}
        onCancel={vi.fn()}
      />,
    )

    const doneEl = document.querySelector('.export-progress__done')
    expect(doneEl).toBeTruthy()
    expect(doneEl?.textContent).toContain('Export complete')
  })

  test('export dialog shows total frames count', () => {
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={750}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // The dialog body should display the frame count
    const body = document.querySelector('.export-dialog__body')
    expect(body?.textContent).toContain('750')
  })
})
