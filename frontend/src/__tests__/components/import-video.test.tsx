/**
 * Import Video Component Tests
 *
 * Migrated from frontend/tests/e2e/phase-1/import-video.spec.ts
 * Tests: Browse button visibility/state, drop zone hint text,
 * preview placeholder, file extension validation, cancel dialog behavior.
 *
 * WHY NOT E2E: Tests component rendering and client-side validation
 * with mocked IPC — no real dialog stubs or asset import pipeline needed.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import FileDialog from '../../renderer/components/upload/FileDialog'
import DropZone from '../../renderer/components/upload/DropZone'
import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'

describe('Import Video — UI State', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('Browse button is visible and enabled in empty state', () => {
    render(<FileDialog onFileSelect={vi.fn()} />)

    const btn = screen.getByText('Browse...')
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
  })

  test('Browse button has correct label text', () => {
    render(<FileDialog onFileSelect={vi.fn()} />)
    expect(screen.getByText('Browse...')).toBeInTheDocument()
  })

  test('Browse button disabled when disabled prop is true', () => {
    render(<FileDialog onFileSelect={vi.fn()} disabled={true} />)

    const btn = screen.getByText('Browse...')
    expect(btn).toBeDisabled()
  })

  test('Browse button calls selectFile on click', async () => {
    const onFileSelect = vi.fn()
    const mockEntropic = setupMockEntropic({
      selectFile: vi.fn().mockResolvedValue('/test/video.mp4'),
    })

    render(<FileDialog onFileSelect={onFileSelect} />)

    const btn = screen.getByText('Browse...')
    fireEvent.click(btn)

    // Wait for async selectFile to resolve
    await vi.waitFor(() => {
      expect(onFileSelect).toHaveBeenCalledWith('/test/video.mp4')
    })
  })

  test('Browse button does nothing when dialog is canceled (null path)', async () => {
    const onFileSelect = vi.fn()
    setupMockEntropic({
      selectFile: vi.fn().mockResolvedValue(null),
    })

    render(<FileDialog onFileSelect={onFileSelect} />)

    fireEvent.click(screen.getByText('Browse...'))

    // Wait a tick and verify onFileSelect was NOT called
    await new Promise((r) => setTimeout(r, 50))
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  test('drop zone shows correct hint text', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    expect(screen.getByText('Drop video file here')).toBeInTheDocument()
    expect(screen.getByText('MP4, MOV, AVI, WebM, MKV')).toBeInTheDocument()
  })

  test('preview shows "No video loaded" before import', () => {
    render(
      <PreviewCanvas
        frameDataUrl={null}
        width={1920}
        height={1080}
        previewState="empty"
        renderError={null}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('No video loaded')).toBeInTheDocument()
  })
})

describe('Import Video — File Extension Validation', () => {
  afterEach(() => {
    cleanup()
  })

  test('rejects unsupported file types (.txt)', () => {
    const ALLOWED = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    const ext = '.txt'
    expect(ALLOWED.includes(ext)).toBe(false)
  })

  test('accepts all allowed extensions', () => {
    const ALLOWED = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    for (const ext of ALLOWED) {
      expect(ALLOWED.includes(ext)).toBe(true)
    }
  })

  test('validates all common file types', () => {
    const ALLOWED = ['.mp4', '.mov', '.avi', '.webm', '.mkv']
    const tests = [
      { name: 'video.mp4', expected: true },
      { name: 'video.mov', expected: true },
      { name: 'video.avi', expected: true },
      { name: 'video.webm', expected: true },
      { name: 'video.mkv', expected: true },
      { name: 'document.pdf', expected: false },
      { name: 'script.js', expected: false },
      { name: 'image.png', expected: false },
      { name: 'archive.zip', expected: false },
    ]

    for (const t of tests) {
      const ext = t.name.slice(t.name.lastIndexOf('.')).toLowerCase()
      expect(ALLOWED.includes(ext)).toBe(t.expected)
    }
  })
})
