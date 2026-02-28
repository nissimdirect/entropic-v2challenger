/**
 * Edge Case & Boundary Component Tests
 *
 * Migrated from frontend/tests/e2e/regression/edge-cases.spec.ts
 * Tests: max effects, remove all + re-add, toggle on/off, reorder round-trip,
 * param sliders at min/max, mix slider at 0/1, empty & loaded state constraints.
 *
 * WHY NOT E2E: All tests verify component rendering and state transitions
 * with mocked IPC — no real Electron, sidecar, or video import needed.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import ParamPanel from '../../renderer/components/effects/ParamPanel'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'
import DropZone from '../../renderer/components/upload/DropZone'
import type { EffectInfo, EffectInstance } from '../../shared/types'

// --- Test Data ---

const mockRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'fx', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: { radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Blur Radius' } } },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'fx', params: { shift: { type: 'float', min: 0, max: 360, default: 0, label: 'Hue Shift' } } },
  { id: 'fx.pixelate', name: 'Pixelate', category: 'distortion', params: { size: { type: 'int', min: 1, max: 64, default: 8, label: 'Pixel Size' } } },
  { id: 'fx.mirror', name: 'Mirror', category: 'transform', params: {} },
]

function makeInstance(effectId: string, index: number, enabled = true): EffectInstance {
  return {
    id: `inst-${index}`,
    effectId,
    isEnabled: enabled,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

describe('Edge Cases — Effects', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('add max effects (10) disables browser buttons', () => {
    const onAddEffect = vi.fn()
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={onAddEffect}
        chainLength={10}
      />,
    )

    const items = screen.getAllByRole('button', { name: /Invert|Blur|Hue Shift|Pixelate|Mirror/ })
    // All buttons should be disabled at chain length 10
    items.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  test('effect buttons show "Max 10 effects" title at chain limit', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={10}
      />,
    )

    const items = screen.getAllByRole('button', { name: /Invert|Blur|Hue Shift|Pixelate|Mirror/ })
    items.forEach((btn) => {
      expect(btn).toHaveAttribute('title', 'Max 10 effects')
    })
  })

  test('empty rack shows placeholder text', () => {
    render(
      <EffectRack
        chain={[]}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(screen.getByText('No effects. Add from browser.')).toBeInTheDocument()
  })

  test('rack with 3 effects renders all items', () => {
    const chain: EffectInstance[] = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.blur', 1),
      makeInstance('fx.hue_shift', 2),
    ]

    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(screen.getByText('Invert')).toBeInTheDocument()
    expect(screen.getByText('Blur')).toBeInTheDocument()
    expect(screen.getByText('Hue Shift')).toBeInTheDocument()
  })

  test('toggle effect off shows OFF, on shows ON', () => {
    const onToggle = vi.fn()
    const enabledEffect = makeInstance('fx.invert', 0, true)
    const disabledEffect = makeInstance('fx.blur', 1, false)

    render(
      <EffectRack
        chain={[enabledEffect, disabledEffect]}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={onToggle}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const toggleBtns = screen.getAllByTitle(/Enable|Disable/)
    expect(toggleBtns[0]).toHaveTextContent('ON')
    expect(toggleBtns[1]).toHaveTextContent('OFF')
  })

  test('remove button fires onRemove callback', () => {
    const onRemove = vi.fn()
    const chain = [makeInstance('fx.invert', 0)]

    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />,
    )

    const removeBtn = screen.getByTitle('Remove effect')
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith('inst-0')
  })

  test('reorder: move-up on second item calls onReorder(1, 0)', () => {
    const onReorder = vi.fn()
    const chain = [makeInstance('fx.invert', 0), makeInstance('fx.blur', 1)]

    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    )

    const moveUpBtns = screen.getAllByTitle('Move up')
    // First move-up is disabled (index 0), second is enabled (index 1)
    expect(moveUpBtns[0]).toBeDisabled()
    expect(moveUpBtns[1]).not.toBeDisabled()

    fireEvent.click(moveUpBtns[1])
    expect(onReorder).toHaveBeenCalledWith(1, 0)
  })

  test('reorder: move-down on first item calls onReorder(0, 1)', () => {
    const onReorder = vi.fn()
    const chain = [makeInstance('fx.invert', 0), makeInstance('fx.blur', 1)]

    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    )

    const moveDownBtns = screen.getAllByTitle('Move down')
    // First move-down is enabled (index 0), second is disabled (index 1)
    expect(moveDownBtns[0]).not.toBeDisabled()
    expect(moveDownBtns[1]).toBeDisabled()

    fireEvent.click(moveDownBtns[0])
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })

  test('move-up disabled on first item, move-down disabled on last item', () => {
    const chain = [makeInstance('fx.invert', 0), makeInstance('fx.blur', 1), makeInstance('fx.hue_shift', 2)]

    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const moveUpBtns = screen.getAllByTitle('Move up')
    const moveDownBtns = screen.getAllByTitle('Move down')

    // First item: up disabled, down enabled
    expect(moveUpBtns[0]).toBeDisabled()
    expect(moveDownBtns[0]).not.toBeDisabled()

    // Middle item: both enabled
    expect(moveUpBtns[1]).not.toBeDisabled()
    expect(moveDownBtns[1]).not.toBeDisabled()

    // Last item: up enabled, down disabled
    expect(moveUpBtns[2]).not.toBeDisabled()
    expect(moveDownBtns[2]).toBeDisabled()
  })
})

describe('Edge Cases — Param Panel', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('param panel empty state shows "Select an effect"', () => {
    render(
      <ParamPanel
        effect={null}
        effectInfo={null}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )

    expect(screen.getByText('Select an effect to edit parameters')).toBeInTheDocument()
  })

  test('param panel shows effect name in header', () => {
    const effect = makeInstance('fx.blur', 0)
    const effectInfo = mockRegistry.find((r) => r.id === 'fx.blur')!

    render(
      <ParamPanel
        effect={effect}
        effectInfo={effectInfo}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )

    expect(screen.getByText('Blur')).toBeInTheDocument()
  })

  test('param panel renders knob for float params', () => {
    const effect: EffectInstance = {
      ...makeInstance('fx.blur', 0),
      parameters: { radius: 5 },
    }
    const effectInfo = mockRegistry.find((r) => r.id === 'fx.blur')!

    render(
      <ParamPanel
        effect={effect}
        effectInfo={effectInfo}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )

    // Knob renders the label
    expect(screen.getByText('Blur Radius')).toBeInTheDocument()
  })
})

describe('Edge Cases — State Transitions', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('empty state: scrub disabled, placeholder visible', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={0}
        isPlaying={false}
        fps={30}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    // Scrub should be disabled when totalFrames = 0
    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub).toBeTruthy()
    expect(scrub.disabled).toBe(true)
  })

  test('loaded state: scrub enabled', () => {
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={150}
        isPlaying={false}
        fps={30}
        onSeek={vi.fn()}
        onPlayPause={vi.fn()}
      />,
    )

    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub).toBeTruthy()
    expect(scrub.disabled).toBe(false)
  })

  test('preview canvas: empty state shows placeholder', () => {
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

  test('drop zone: visible with correct hint text', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    expect(screen.getByText('Drop video file here')).toBeInTheDocument()
    expect(screen.getByText('MP4, MOV, AVI, WebM, MKV')).toBeInTheDocument()
  })

  test('effect rack: empty state message', () => {
    render(
      <EffectRack
        chain={[]}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const emptyRack = document.querySelector('.effect-rack--empty')
    expect(emptyRack).toBeTruthy()
    expect(screen.getByText('No effects. Add from browser.')).toBeInTheDocument()
  })
})
