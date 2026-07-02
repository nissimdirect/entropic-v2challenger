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
    const onClose = vi.fn()

    const { rerender } = render(
      <ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />,
    )

    // Dialog visible
    expect(document.querySelector('.export-dialog')).toBeTruthy()

    // Default codec select = h264
    const codecSelect = document.querySelector('.export-dialog__select') as HTMLSelectElement
    expect(codecSelect.value).toBe('h264')

    // Video tab active by default
    expect(document.querySelector('.export-dialog__tab--active')?.textContent).toBe('Video')

    // Close dialog
    fireEvent.click(document.querySelector('.export-dialog__close')!)
    expect(onClose).toHaveBeenCalled()

    // Simulate closing
    rerender(
      <ExportDialog {...DIALOG_DEFAULTS} isOpen={false} onClose={onClose} />,
    )

    // Dialog should be gone
    expect(document.querySelector('.export-dialog')).toBeNull()

    // Reopen — fresh mount = fresh defaults
    rerender(
      <ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />,
    )

    // Settings should be fresh defaults
    const codecSelectReopen = document.querySelector('.export-dialog__select') as HTMLSelectElement
    expect(codecSelectReopen.value).toBe('h264')
    expect(document.querySelector('.export-dialog__tab--active')?.textContent).toBe('Video')
  })

  test('19. Export progress → Cancel → Dialog fresh on reopen', () => {
    const onCancel = vi.fn()

    const { rerender } = render(
      <ExportProgress
        {...PROGRESS_DEFAULTS}
        isExporting={true}
        progress={0.35}
        currentFrame={52}
        onCancel={onCancel}
      />,
    )

    // Progress bar visible
    expect(document.querySelector('.export-progress__bar')).toBeTruthy()
    expect(document.querySelector('.export-progress__cancel')).toBeTruthy()

    // Cancel (progress < 0.5 so no confirmation needed)
    fireEvent.click(document.querySelector('.export-progress__cancel')!)
    expect(onCancel).toHaveBeenCalled()

    // Simulate cancelled state (not exporting, progress reset)
    rerender(
      <ExportProgress {...PROGRESS_DEFAULTS} onCancel={onCancel} />,
    )

    // Progress UI should be gone
    expect(document.querySelector('.export-progress__bar')).toBeNull()
    expect(document.querySelector('.export-progress__cancel')).toBeNull()
  })

  test('20. Export with 0 effects and 2 effects both render dialog correctly', () => {
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
        <ExportDialog {...DIALOG_DEFAULTS} />
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
        <ExportDialog {...DIALOG_DEFAULTS} />
      </>,
    )

    // Rack has 2 effects, dialog still open
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(2)
    expect(document.querySelector('.export-dialog')).toBeTruthy()
    expect(document.querySelector('.export-dialog__export-btn')).toBeTruthy()
  })

  test('21. Export dialog coexists with preview controls', () => {
    const onClose = vi.fn()

    render(
      <>
        <PreviewControls
          currentFrame={30}
          totalFrames={300}
          fps={30}
          isPlaying={true}
          onSeek={vi.fn()}
          onPlayPause={vi.fn()}
        />
        <ExportDialog {...DIALOG_DEFAULTS} onClose={onClose} />
      </>,
    )

    // Both visible
    expect(document.querySelector('.preview-controls')).toBeTruthy()
    expect(document.querySelector('.export-dialog')).toBeTruthy()

    // Play button removed — play/pause now via Space key shortcutRegistry

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

  // REMOVED: '29. Toggle cycle: play → pause × 3'
  // Play button was removed from PreviewControls.
  // Play/pause is now triggered by Space key via shortcutRegistry.

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
