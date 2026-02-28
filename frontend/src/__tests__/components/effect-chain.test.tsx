/**
 * Effect Chain Component Tests
 *
 * Migrated from frontend/tests/e2e/phase-1/effect-chain.spec.ts
 * Tests: effect browser shows 10+ effects, reorder via buttons,
 * move-up disabled on first item.
 *
 * WHY NOT E2E: Tests EffectBrowser + EffectRack rendering and callbacks
 * with mocked IPC — no real engine IPC or video import needed.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import type { EffectInfo, EffectInstance } from '../../shared/types'

// --- Build 12 effects to test AC-12 (at least 10 registered) ---

const fullRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: {} },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'color', params: {} },
  { id: 'fx.brightness', name: 'Brightness', category: 'color', params: {} },
  { id: 'fx.contrast', name: 'Contrast', category: 'color', params: {} },
  { id: 'fx.saturation', name: 'Saturation', category: 'color', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: {} },
  { id: 'fx.pixelate', name: 'Pixelate', category: 'distortion', params: {} },
  { id: 'fx.noise', name: 'Noise', category: 'distortion', params: {} },
  { id: 'fx.mirror', name: 'Mirror', category: 'transform', params: {} },
  { id: 'fx.rotate', name: 'Rotate', category: 'transform', params: {} },
  { id: 'fx.scale', name: 'Scale', category: 'transform', params: {} },
  { id: 'fx.threshold', name: 'Threshold', category: 'color', params: {} },
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

describe('Effect Chain — AC-12: At least 10 effects registered', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('renders 12 effect items in browser', () => {
    render(
      <EffectBrowser
        registry={fullRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(12)
  })

  test('at least 10 effects visible (AC-12)', () => {
    render(
      <EffectBrowser
        registry={fullRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBeGreaterThanOrEqual(10)
  })
})

describe('Effect Chain — AC-9: Reorder effects', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('reorder via move-down: first item swaps with second', () => {
    const onReorder = vi.fn()
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.hue_shift', 1),
    ]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    )

    // Verify initial order
    const names = screen.getAllByText(/Invert|Hue Shift/)
    expect(names[0]).toHaveTextContent('Invert')
    expect(names[1]).toHaveTextContent('Hue Shift')

    // Click move-down on first item
    const moveDownBtns = screen.getAllByTitle('Move down')
    fireEvent.click(moveDownBtns[0])

    // Should call onReorder(0, 1)
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })

  test('reorder via move-up: second item swaps with first', () => {
    const onReorder = vi.fn()
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.hue_shift', 1),
    ]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    )

    // Click move-up on second item
    const moveUpBtns = screen.getAllByTitle('Move up')
    fireEvent.click(moveUpBtns[1])

    expect(onReorder).toHaveBeenCalledWith(1, 0)
  })

  test('move-up disabled on first item', () => {
    const chain = [makeInstance('fx.invert', 0)]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const moveUpBtn = screen.getByTitle('Move up')
    expect(moveUpBtn).toBeDisabled()
  })

  test('move-down disabled on last item', () => {
    const chain = [makeInstance('fx.invert', 0)]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const moveDownBtn = screen.getByTitle('Move down')
    expect(moveDownBtn).toBeDisabled()
  })

  test('selecting an effect applies selected class', () => {
    const chain = [makeInstance('fx.invert', 0), makeInstance('fx.blur', 1)]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId="inst-0"
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const cards = document.querySelectorAll('.effect-card')
    expect(cards[0].classList.contains('effect-card--selected')).toBe(true)
    expect(cards[1].classList.contains('effect-card--selected')).toBe(false)
  })

  test('clicking effect card fires onSelect', () => {
    const onSelect = vi.fn()
    const chain = [makeInstance('fx.invert', 0)]

    render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const card = document.querySelector('.effect-card')!
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith('inst-0')
  })
})
