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

const DIALOG_DEFAULTS = {
  isOpen: true,
  totalFrames: 300,
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
  totalFrames: 300,
  etaSeconds: null as number | null,
  outputPath: null as string | null,
  error: null as string | null,
  onCancel: vi.fn(),
}

describe('Export — Idle States', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('10. export dialog not rendered when isOpen=false', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} isOpen={false} />)
    expect(document.querySelector('.export-dialog')).toBeNull()
  })

  test('12. export progress returns null when idle (not exporting, no error, progress < 1)', () => {
    render(<ExportProgress {...PROGRESS_DEFAULTS} />)

    expect(document.querySelector('.export-progress')).toBeNull()
    expect(document.querySelector('.export-progress__bar-container')).toBeNull()
    expect(document.querySelector('.export-progress__cancel')).toBeNull()
  })

  test('13. export progress bar visible during export', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        isExporting={true}
        progress={0.5}
        currentFrame={150}
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
      <ExportProgress {...PROGRESS_DEFAULTS} error="Encoding failed" />,
    )

    const errorEl = document.querySelector('.export-progress__error')
    expect(errorEl).toBeTruthy()
    expect(errorEl?.textContent).toContain('Encoding failed')
  })

  test('export complete message shown when done', () => {
    render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        progress={1}
        currentFrame={300}
        outputPath="/Users/test/output.mp4"
      />,
    )

    const doneEl = document.querySelector('.export-progress__done')
    expect(doneEl).toBeTruthy()
    expect(doneEl?.textContent).toContain('Export complete')
  })

  test('export dialog shows total frames count in region selector', () => {
    render(<ExportDialog {...DIALOG_DEFAULTS} totalFrames={750} />)

    // The dialog body should display the frame count in the region selector
    const body = document.querySelector('.export-dialog__body')
    expect(body?.textContent).toContain('750')
  })
})
