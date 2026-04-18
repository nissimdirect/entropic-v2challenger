/**
 * Export Feedback UAT — ExportProgress overlay states (E-07, E-08, E-10).
 *
 * Vitest-only. Covers the live-runtime cases that would otherwise need
 * Playwright by asserting the rendered overlay content for each state
 * transition (running, complete, error).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import ExportProgress from '../../renderer/components/export/ExportProgress'

const DEFAULT = {
  isExporting: false,
  progress: 0,
  currentFrame: 0,
  totalFrames: 150,
  etaSeconds: null as number | null,
  outputPath: null as string | null,
  error: null as string | null,
  onCancel: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UAT: ExportProgress overlay states', () => {
  it('E-07 (running): overlay + bar + percentage + frame counter visible', () => {
    render(
      <ExportProgress
        {...DEFAULT}
        isExporting={true}
        progress={0.5}
        currentFrame={75}
        totalFrames={150}
        etaSeconds={12}
      />,
    )
    const overlay = document.querySelector('.export-progress')
    expect(overlay).toBeTruthy()
    const bar = document.querySelector('.export-progress__bar') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.style.width).toBe('50%')
    const details = document.querySelector('.export-progress__details')
    expect(details?.textContent).toContain('50%')
    expect(details?.textContent).toContain('75/150')
    expect(details?.textContent).toContain('12s') // ETA formatted
  })

  it('E-07b (cancel button): onCancel fires when progress < 50% (no confirm)', () => {
    const onCancel = vi.fn()
    render(
      <ExportProgress
        {...DEFAULT}
        isExporting={true}
        progress={0.2}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(document.querySelector('.export-progress__cancel') as HTMLElement)
    expect(onCancel).toHaveBeenCalled()
  })

  it('E-07c (cancel confirm): first click at >50% shows confirmation, second click fires', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <ExportProgress
        {...DEFAULT}
        isExporting={true}
        progress={0.8}
        onCancel={onCancel}
      />,
    )
    const btn = document.querySelector('.export-progress__cancel') as HTMLElement
    fireEvent.click(btn)
    expect(onCancel).not.toHaveBeenCalled()
    expect(btn.textContent).toMatch(/Cancel\?/)
    // Second click confirms
    fireEvent.click(btn)
    expect(onCancel).toHaveBeenCalled()
    rerender(
      <ExportProgress
        {...DEFAULT}
        isExporting={true}
        progress={0.8}
        onCancel={onCancel}
      />,
    )
  })

  it('E-08 (complete): "Export complete!" with output path visible', () => {
    render(
      <ExportProgress
        {...DEFAULT}
        isExporting={false}
        progress={1}
        outputPath={'/Users/test/output.mp4'}
      />,
    )
    const done = document.querySelector('.export-progress__done')
    expect(done).toBeTruthy()
    expect(done?.textContent).toContain('Export complete!')
    // Truncated path is displayed
    expect(document.querySelector('.export-progress__output-path')?.textContent)
      .toContain('output.mp4')
  })

  it('E-10 (error): failure message rendered with error text', () => {
    render(
      <ExportProgress
        {...DEFAULT}
        isExporting={false}
        progress={0.3}
        error={'Codec initialization failed'}
      />,
    )
    const err = document.querySelector('.export-progress__error')
    expect(err).toBeTruthy()
    expect(err?.textContent).toContain('Export failed')
    expect(err?.textContent).toContain('Codec initialization failed')
  })

  it('E-11 (instant complete): mounts directly with progress=1 and still renders completion UI', () => {
    // Simulates fast exports where first poll lands at status=complete.
    render(
      <ExportProgress
        {...DEFAULT}
        isExporting={false}
        progress={1}
        currentFrame={16}
        totalFrames={16}
        outputPath={'/Users/test/tiny.mp4'}
      />,
    )
    expect(document.querySelector('.export-progress__done')).toBeTruthy()
    expect(document.querySelector('.export-progress')).toBeTruthy()
    // Nothing should render "Exporting... 100%" progress bar AFTER complete
    expect(document.querySelector('.export-progress__bar')).toBeNull()
  })

  it('hidden when idle (not exporting, no error, no progress): nothing renders', () => {
    render(<ExportProgress {...DEFAULT} />)
    expect(document.querySelector('.export-progress')).toBeNull()
  })
})
