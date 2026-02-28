/**
 * UX Combinations — Export Round-trips + Playback Controls
 *
 * Migrated from frontend/tests/e2e/phase-1/ux-combinations.spec.ts
 * Group 5 (tests 18-21) + Group 8 partial (tests 29-30)
 *
 * WHY NOT E2E: Tests ExportDialog/ExportProgress DOM state and
 * PreviewControls play/pause toggle. No real Electron, IPC, sidecar,
 * or video processing needed — all verifiable with component rendering.
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import ExportDialog from '../../renderer/components/export/ExportDialog'
import ExportProgress from '../../renderer/components/export/ExportProgress'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import type { EffectInfo, EffectInstance } from '../../shared/types'

// --- Shared test data ---

const smallRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: {} },
]

function makeInstance(effectId: string, index: number): EffectInstance {
  return {
    id: `inst-${index}`,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

// --- Group 5: Export Round-trips ---

describe('UX Combos — Group 5: Export Round-trips', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('18. Open export → Close → Reopen → Settings are fresh defaults', () => {
    const onExport = vi.fn()
    const onClose = vi.fn()

    const { rerender } = render(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={onExport}
        onClose={onClose}
      />,
    )

    // Dialog visible
    expect(document.querySelector('.export-dialog')).toBeTruthy()

    // Default codec label
    expect(document.querySelector('.export-dialog__codec-label')?.textContent).toContain('H.264')

    // "Use original resolution" checkbox should be checked
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox?.checked).toBe(true)

    // Close dialog
    fireEvent.click(document.querySelector('.export-dialog__close')!)
    expect(onClose).toHaveBeenCalled()

    // Simulate closing
    rerender(
      <ExportDialog
        isOpen={false}
        totalFrames={300}
        onExport={onExport}
        onClose={onClose}
      />,
    )

    // Dialog should be gone
    expect(document.querySelector('.export-dialog')).toBeNull()

    // Reopen — fresh mount = fresh defaults
    rerender(
      <ExportDialog
        isOpen={true}
        totalFrames={300}
        onExport={onExport}
        onClose={onClose}
      />,
    )

    // Settings should be fresh defaults
    expect(document.querySelector('.export-dialog__codec-label')?.textContent).toContain('H.264')
    const checkboxReopen = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkboxReopen?.checked).toBe(true)
  })

  test('19. Export progress → Cancel → Dialog fresh on reopen', () => {
    const onCancel = vi.fn()

    const { rerender } = render(
      <ExportProgress
        isExporting={true}
        progress={0.35}
        error={null}
        onCancel={onCancel}
      />,
    )

    // Progress bar visible
    expect(document.querySelector('.export-progress__bar')).toBeTruthy()
    expect(document.querySelector('.export-progress__cancel')).toBeTruthy()

    // Cancel
    fireEvent.click(document.querySelector('.export-progress__cancel')!)
    expect(onCancel).toHaveBeenCalled()

    // Simulate cancelled state (not exporting, progress reset)
    rerender(
      <ExportProgress
        isExporting={false}
        progress={0}
        error={null}
        onCancel={onCancel}
      />,
    )

    // Progress UI should be gone
    expect(document.querySelector('.export-progress__bar')).toBeNull()
    expect(document.querySelector('.export-progress__cancel')).toBeNull()
  })

  test('20. Export with 0 effects and 2 effects both render dialog correctly', () => {
    const onExport = vi.fn()
    const onClose = vi.fn()

    // Export with 0 effects
    const { rerender } = render(
      <>
        <EffectRack
          chain={[]}
          registry={smallRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ExportDialog
          isOpen={true}
          totalFrames={300}
          onExport={onExport}
          onClose={onClose}
        />
      </>,
    )

    // Rack empty, dialog open
    expect(document.querySelector('.effect-rack--empty')).toBeTruthy()
    expect(document.querySelector('.export-dialog')).toBeTruthy()
    expect(document.querySelector('.export-dialog__export-btn')).toBeTruthy()

    // Now with 2 effects
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.blur', 1),
    ]
    rerender(
      <>
        <EffectRack
          chain={chain}
          registry={smallRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ExportDialog
          isOpen={true}
          totalFrames={300}
          onExport={onExport}
          onClose={onClose}
        />
      </>,
    )

    // Rack has 2 effects, dialog still open
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(2)
    expect(document.querySelector('.export-dialog')).toBeTruthy()
    expect(document.querySelector('.export-dialog__export-btn')).toBeTruthy()
  })

  test('21. Export dialog coexists with preview controls', () => {
    const onPlayPause = vi.fn()
    const onClose = vi.fn()

    render(
      <>
        <PreviewControls
          currentFrame={30}
          totalFrames={300}
          fps={30}
          isPlaying={true}
          onSeek={vi.fn()}
          onPlayPause={onPlayPause}
        />
        <ExportDialog
          isOpen={true}
          totalFrames={300}
          onExport={vi.fn()}
          onClose={onClose}
        />
      </>,
    )

    // Both visible
    expect(document.querySelector('.preview-controls')).toBeTruthy()
    expect(document.querySelector('.export-dialog')).toBeTruthy()

    // Play button shows pause indicator (playing)
    const playBtn = document.querySelector('.preview-controls__play-btn')!
    expect(playBtn.textContent?.trim()).toBe('||')

    // Close export dialog
    fireEvent.click(document.querySelector('.export-dialog__close')!)
    expect(onClose).toHaveBeenCalled()
  })
})

// --- Group 8: State Machine Transitions (partial) ---

describe('UX Combos — Group 8: Playback + Effect Accumulation', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('29. Toggle cycle: play → pause × 3 → state always correct', () => {
    let isPlaying = false
    const onPlayPause = vi.fn(() => {
      isPlaying = !isPlaying
    })

    const { rerender } = render(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )

    const playBtn = document.querySelector('.preview-controls__play-btn')!

    // Cycle 1: play
    expect(playBtn.textContent?.trim()).toBe('>')
    fireEvent.click(playBtn)
    expect(onPlayPause).toHaveBeenCalledTimes(1)

    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('||')

    // Cycle 1: pause
    fireEvent.click(playBtn)
    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('>')

    // Cycle 2: play
    fireEvent.click(playBtn)
    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('||')

    // Cycle 2: pause
    fireEvent.click(playBtn)
    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('>')

    // Cycle 3: play
    fireEvent.click(playBtn)
    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('||')

    // Final: pause
    fireEvent.click(playBtn)
    rerender(
      <PreviewControls
        currentFrame={0}
        totalFrames={300}
        fps={30}
        isPlaying={isPlaying}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )
    expect(playBtn.textContent?.trim()).toBe('>')

    expect(onPlayPause).toHaveBeenCalledTimes(6)
  })

  test('30. Effect accumulation: add 1→2→3 → remove 1 → count correct', () => {
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    let chain: EffectInstance[] = []

    const renderAll = () =>
      render(
        <>
          <EffectBrowser
            registry={smallRegistry}
            isLoading={false}
            onAddEffect={onAdd}
            chainLength={chain.length}
          />
          <EffectRack
            chain={chain}
            registry={smallRegistry}
            selectedEffectId={null}
            onSelect={vi.fn()}
            onToggle={vi.fn()}
            onRemove={onRemove}
            onReorder={vi.fn()}
          />
        </>,
      )

    // Add effect 1
    let { unmount } = renderAll()
    let items = document.querySelectorAll('.effect-browser__item')
    fireEvent.click(items[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
    unmount()

    chain = [makeInstance('fx.invert', 0)]
    ;({ unmount } = renderAll())
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(1)
    unmount()

    // Add effect 2
    chain = [...chain, makeInstance('fx.blur', 1)]
    ;({ unmount } = renderAll())
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(2)
    unmount()

    // Add effect 3
    chain = [...chain, makeInstance('fx.invert', 2)]
    ;({ unmount } = renderAll())
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(3)

    // Remove first effect
    fireEvent.click(document.querySelectorAll('.effect-card__remove')[0])
    expect(onRemove).toHaveBeenCalledWith('inst-0')
    unmount()

    chain = chain.slice(1)
    ;({ unmount } = renderAll())
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(2)
    unmount()
  })
})
