/**
 * Interaction Coverage Tests (Component Layer)
 *
 * Migrated from frontend/tests/e2e/phase-1/interactions.spec.ts
 *
 * WHY NOT E2E: Tests export dialog settings, close behaviors,
 * param panel states, and preview controls. No real Electron, IPC,
 * sidecar, or video needed — pure component rendering.
 *
 * Tests that remain E2E: play/pause with real playback, timecode
 * updates with real render, selecting effect from real engine registry.
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import ExportDialog from '../../renderer/components/export/ExportDialog'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import DropZone from '../../renderer/components/upload/DropZone'
import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import type { EffectInfo, ParamDef } from '../../shared/types'

// --- Shared test data ---

const fxParams: Record<string, ParamDef> = {
  amount: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Amount' },
}

const registry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: fxParams },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: fxParams },
]

// --- Export Dialog Interactions ---

describe('Interactions — Export Dialog', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('uncheck "Use original resolution" shows custom dimension inputs', () => {
    render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    // Checkbox should be checked by default
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    // Custom resolution inputs should NOT be visible
    expect(document.querySelectorAll('.export-dialog__res-input').length).toBe(0)

    // Uncheck
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    // Custom resolution inputs should appear
    const resInputs = document.querySelectorAll('.export-dialog__res-input') as NodeListOf<HTMLInputElement>
    expect(resInputs.length).toBe(2)

    // Default values: 1920x1080
    expect(parseInt(resInputs[0].value)).toBe(1920)
    expect(parseInt(resInputs[1].value)).toBe(1080)

    // Type custom values
    fireEvent.change(resInputs[0], { target: { value: '1280' } })
    fireEvent.change(resInputs[1], { target: { value: '720' } })
    expect(parseInt(resInputs[0].value)).toBe(1280)
    expect(parseInt(resInputs[1].value)).toBe(720)
  })

  test('overlay click closes export dialog', () => {
    const onClose = vi.fn()

    render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

    expect(document.querySelector('.export-dialog')).toBeTruthy()

    // Click the overlay (the outer div)
    const overlay = document.querySelector('.export-dialog__overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('cancel button closes export dialog', () => {
    const onClose = vi.fn()

    render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(document.querySelector('.export-dialog__cancel-btn')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('close (X) button closes export dialog', () => {
    const onClose = vi.fn()

    render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(document.querySelector('.export-dialog__close')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('export button calls selectSavePath then onExport', async () => {
    const mockEntropic = setupMockEntropic()
    const onExport = vi.fn()

    render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={onExport}
        onClose={vi.fn()}
      />,
    )

    // Click export button
    fireEvent.click(document.querySelector('.export-dialog__export-btn')!)

    // Wait for async selectSavePath to resolve
    await vi.waitFor(() => {
      expect(mockEntropic.selectSavePath).toHaveBeenCalledWith('output.mp4')
    })

    // onExport should be called with settings
    expect(onExport).toHaveBeenCalledWith({
      outputPath: '/test/output.mp4',
      codec: 'h264',
      resolution: null, // "Use original" is checked by default
    })
  })
})

// --- Preview Controls Interactions ---

describe('Interactions — Preview Controls', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('scrub slider disabled when totalFrames is 0', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={0}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub.disabled).toBe(true)
  })

  test('scrub slider enabled when video loaded', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub.disabled).toBe(false)
  })

  test('timecode display shows formatted time', () => {
    render(
      <PreviewControls
        currentFrame={150}
        totalFrames={300}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const counter = document.querySelector('.preview-controls__counter')!
    // 150 frames at 30fps = 5.0 seconds
    expect(counter.textContent).toContain('0:05.0')
  })

  test('scrub change fires onSeek callback', () => {
    const onSeek = vi.fn()

    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={false}
        onSeek={onSeek}
        onPlayPause={vi.fn()}
      />,
    )

    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    fireEvent.change(scrub, { target: { value: '100' } })
    expect(onSeek).toHaveBeenCalledWith(100)
  })
})

// --- Drop Zone Interactions ---

describe('Interactions — Drop Zone', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('drop zone shows icon, text, and hint', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    expect(document.querySelector('.drop-zone__icon')?.textContent).toBe('+')
    expect(document.querySelector('.drop-zone__text')?.textContent).toBe('Drop video file here')
    expect(document.querySelector('.drop-zone__hint')?.textContent).toContain('MP4')
  })

  test('drop zone shows no error initially', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    expect(document.querySelector('.drop-zone__error')).toBeNull()
  })

  test('drop zone disabled state adds class', () => {
    render(<DropZone onFileDrop={vi.fn()} disabled={true} />)

    expect(document.querySelector('.drop-zone')?.classList.contains('drop-zone--disabled')).toBe(true)
  })
})

// --- Effect Browser Search + Category (interaction-focused) ---

describe('Interactions — Effect Browser Search', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('each category filter shows subset of effects', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const catBtns = document.querySelectorAll('.effect-browser__cat-btn')
    // "All" + "color" + "distortion" = 3 buttons
    expect(catBtns.length).toBe(3)

    // Click "color" category
    fireEvent.click(catBtns[1])
    let items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(1)
    expect(items[0].textContent).toBe('Invert')

    // Verify active class
    expect(catBtns[1].classList.contains('effect-browser__cat-btn--active')).toBe(true)

    // Click "distortion" category
    fireEvent.click(catBtns[2])
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(1)
    expect(items[0].textContent).toBe('Blur')

    // Click "All" to reset
    fireEvent.click(catBtns[0])
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(2)
  })
})
