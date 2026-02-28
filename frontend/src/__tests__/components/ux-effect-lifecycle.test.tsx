/**
 * UX Combinations — Multi-Effect Param Editing + Chain Lifecycle
 *
 * Migrated from frontend/tests/e2e/phase-1/ux-combinations.spec.ts
 * Groups 3 (tests 9-13) + 4 (tests 14-17)
 *
 * WHY NOT E2E: Tests EffectBrowser + EffectRack + ParamPanel state interactions.
 * No real Electron, IPC, sidecar, or video import needed — all verifiable
 * with mocked IPC and component rendering.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import ParamPanel from '../../renderer/components/effects/ParamPanel'
import type { EffectInfo, EffectInstance, ParamDef } from '../../shared/types'

// --- Shared test data ---

const fxParams: Record<string, ParamDef> = {
  amount: {
    type: 'float',
    min: 0,
    max: 1,
    default: 0.5,
    label: 'Amount',
  },
}

const choiceParams: Record<string, ParamDef> = {
  mode: {
    type: 'choice',
    default: 'normal',
    label: 'Mode',
    options: ['normal', 'intense', 'subtle'],
  },
}

const boolParams: Record<string, ParamDef> = {
  enabled: {
    type: 'bool',
    default: true,
    label: 'Enable',
  },
}

const fullRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: fxParams },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: { ...fxParams, ...choiceParams } },
  { id: 'fx.pixelate', name: 'Pixelate', category: 'distortion', params: { ...fxParams, ...boolParams } },
  { id: 'fx.mirror', name: 'Mirror', category: 'transform', params: fxParams },
  { id: 'fx.rotate', name: 'Rotate', category: 'transform', params: fxParams },
  { id: 'fx.scale', name: 'Scale', category: 'transform', params: fxParams },
  { id: 'fx.noise', name: 'Noise', category: 'distortion', params: fxParams },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'color', params: fxParams },
  { id: 'fx.brightness', name: 'Brightness', category: 'color', params: fxParams },
  { id: 'fx.contrast', name: 'Contrast', category: 'color', params: fxParams },
  { id: 'fx.saturation', name: 'Saturation', category: 'color', params: fxParams },
  { id: 'fx.threshold', name: 'Threshold', category: 'color', params: fxParams },
]

function makeInstance(effectId: string, index: number): EffectInstance {
  const info = fullRegistry.find((r) => r.id === effectId)
  return {
    id: `inst-${index}`,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: info
      ? Object.fromEntries(Object.entries(info.params).map(([k, d]) => [k, d.default]))
      : {},
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

// --- Group 3: Multi-Effect Param Editing ---

describe('UX Combos — Group 3: Multi-Effect Param Editing', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('9. Select A → params show → Select B → different params → Back to A → preserved', () => {
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.blur', 1),
    ]

    const onSelect = vi.fn()
    const onUpdateParam = vi.fn()
    const onSetMix = vi.fn()

    // Start with A selected
    const { rerender } = render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={onUpdateParam}
          onSetMix={onSetMix}
        />
      </>,
    )

    // Param panel should show "Invert"
    const header = document.querySelector('.param-panel__header')
    expect(header?.textContent).toBe('Invert')

    // Click to select B
    const cards = document.querySelectorAll('.effect-card')
    fireEvent.click(cards[1])
    expect(onSelect).toHaveBeenCalledWith('inst-1')

    // Re-render with B selected
    rerender(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-1"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[1]}
          effectInfo={fullRegistry.find((r) => r.id === 'fx.blur')!}
          onUpdateParam={onUpdateParam}
          onSetMix={onSetMix}
        />
      </>,
    )

    // Param panel should now show "Blur"
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Blur')

    // Click back to A
    fireEvent.click(document.querySelectorAll('.effect-card')[0])
    expect(onSelect).toHaveBeenCalledWith('inst-0')

    // Re-render with A selected
    rerender(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={onUpdateParam}
          onSetMix={onSetMix}
        />
      </>,
    )

    // Back to "Invert"
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Invert')
  })

  test('10. Select effect → Remove → Param panel shows empty', () => {
    const chain = [makeInstance('fx.invert', 0)]
    const onRemove = vi.fn()

    const { rerender } = render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={onRemove}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Panel is NOT empty
    expect(document.querySelector('.param-panel--empty')).toBeNull()
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Invert')

    // Click remove
    const removeBtn = document.querySelector('.effect-card__remove')!
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith('inst-0')

    // Re-render with empty chain
    rerender(
      <>
        <EffectRack
          chain={[]}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={null}
          effectInfo={null}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Param panel should be empty
    expect(document.querySelector('.param-panel--empty')).toBeTruthy()
    // Rack should be empty
    expect(document.querySelector('.effect-rack--empty')).toBeTruthy()
  })

  test('11. Toggle off → Toggle on → Param panel header preserved', () => {
    const chain = [makeInstance('fx.invert', 0)]
    const onToggle = vi.fn()

    const { rerender } = render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={onToggle}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    const headerBefore = document.querySelector('.param-panel__header')?.textContent

    // Toggle OFF
    const toggleBtn = document.querySelector('.effect-card__toggle')!
    fireEvent.click(toggleBtn)
    expect(onToggle).toHaveBeenCalledWith('inst-0')

    // Simulate toggled-off state
    const toggledOff = { ...chain[0], isEnabled: false }
    rerender(
      <>
        <EffectRack
          chain={[toggledOff]}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={onToggle}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={toggledOff}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Toggle should show OFF
    expect(document.querySelector('.effect-card__toggle')?.textContent?.trim()).toBe('OFF')

    // Toggle ON
    fireEvent.click(document.querySelector('.effect-card__toggle')!)

    const toggledOn = { ...toggledOff, isEnabled: true }
    rerender(
      <>
        <EffectRack
          chain={[toggledOn]}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={onToggle}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={toggledOn}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Toggle should show ON
    expect(document.querySelector('.effect-card__toggle')?.textContent?.trim()).toBe('ON')

    // Header preserved
    expect(document.querySelector('.param-panel__header')?.textContent).toBe(headerBefore)
  })

  test('12. Param types: knob + choice + toggle + mix all render for effect with mixed params', () => {
    const mixedParams: Record<string, ParamDef> = {
      amount: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Amount' },
      mode: { type: 'choice', default: 'normal', label: 'Mode', options: ['normal', 'intense'] },
      bypass: { type: 'bool', default: false, label: 'Bypass' },
    }
    const mixedInfo: EffectInfo = {
      id: 'fx.mixed',
      name: 'Mixed',
      category: 'test',
      params: mixedParams,
    }
    const instance: EffectInstance = {
      id: 'mixed-0',
      effectId: 'fx.mixed',
      isEnabled: true,
      isFrozen: false,
      parameters: { amount: 0.5, mode: 'normal', bypass: false },
      modulations: {},
      mix: 1.0,
      mask: null,
    }

    render(
      <ParamPanel
        effect={instance}
        effectInfo={mixedInfo}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )

    // Header shows effect name
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Mixed')

    // Knob for numeric param
    expect(document.querySelectorAll('.knob').length).toBeGreaterThanOrEqual(1)

    // Choice dropdown
    expect(document.querySelector('.param-choice__select')).toBeTruthy()
    const options = document.querySelectorAll('.param-choice__select option')
    expect(options.length).toBe(2)

    // Toggle checkbox
    expect(document.querySelector('.param-toggle__input')).toBeTruthy()

    // Mix slider
    expect(document.querySelector('.hslider__track')).toBeTruthy()
  })

  test('13. Select A → Reorder A below B → onReorder fires correctly', () => {
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.blur', 1),
    ]
    const onReorder = vi.fn()
    const onSelect = vi.fn()

    render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={onReorder}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // A is selected
    expect(document.querySelectorAll('.effect-card')[0].classList.contains('effect-card--selected')).toBe(true)

    // Move A down (swap with B)
    const moveDownBtns = screen.getAllByTitle('Move down')
    fireEvent.click(moveDownBtns[0])

    // Should call onReorder(0, 1) — move index 0 to index 1
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })
})

// --- Group 4: Effect Chain Lifecycle ---

describe('UX Combos — Group 4: Effect Chain Lifecycle', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('14. Add → Toggle off → Remove → Rack + param empty, no orphan state', () => {
    const chain = [makeInstance('fx.invert', 0)]
    const onToggle = vi.fn()
    const onRemove = vi.fn()

    const { rerender } = render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={onToggle}
          onRemove={onRemove}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // 1 effect in rack
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(1)

    // Toggle off
    fireEvent.click(document.querySelector('.effect-card__toggle')!)
    expect(onToggle).toHaveBeenCalled()

    // Simulate toggled-off state
    const toggledOff = { ...chain[0], isEnabled: false }
    rerender(
      <>
        <EffectRack
          chain={[toggledOff]}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={vi.fn()}
          onToggle={onToggle}
          onRemove={onRemove}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={toggledOff}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    expect(document.querySelector('.effect-card__toggle')?.textContent?.trim()).toBe('OFF')

    // Remove
    fireEvent.click(document.querySelector('.effect-card__remove')!)
    expect(onRemove).toHaveBeenCalledWith('inst-0')

    // Simulate removal
    rerender(
      <>
        <EffectRack
          chain={[]}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={null}
          effectInfo={null}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Both empty
    expect(document.querySelector('.effect-rack--empty')).toBeTruthy()
    expect(document.querySelector('.param-panel--empty')).toBeTruthy()
  })

  test('15. Add 10 → items disabled → Remove from middle → Re-enabled → Add new', () => {
    // Build 10-item chain
    const chain = Array.from({ length: 10 }, (_, i) =>
      makeInstance(fullRegistry[i % fullRegistry.length].id, i),
    )
    const onAdd = vi.fn()
    const onRemove = vi.fn()

    const { rerender } = render(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={onAdd}
          chainLength={chain.length}
        />
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={onRemove}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Rack has 10
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(10)

    // Browser items should be disabled (at max)
    const browserItems = document.querySelectorAll('.effect-browser__item')
    expect((browserItems[0] as HTMLButtonElement).disabled).toBe(true)
    expect((browserItems[0] as HTMLButtonElement).title).toBe('Max 10 effects')

    // Remove from middle (index 4)
    const removeBtn = document.querySelectorAll('.effect-card__remove')[4]
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalled()

    // Simulate chain with middle removed (9 items)
    const trimmedChain = [...chain.slice(0, 4), ...chain.slice(5)]
    rerender(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={onAdd}
          chainLength={trimmedChain.length}
        />
        <EffectRack
          chain={trimmedChain}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // 9 items now
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(9)

    // Browser items should be re-enabled
    const browserItemsAfter = document.querySelectorAll('.effect-browser__item')
    expect((browserItemsAfter[0] as HTMLButtonElement).disabled).toBe(false)

    // Add one more (should work)
    fireEvent.click(browserItemsAfter[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  test('16. Add 3 → Remove middle → Remaining 2 correct (no gap)', () => {
    const chain = [
      makeInstance('fx.invert', 0),
      makeInstance('fx.blur', 1),
      makeInstance('fx.mirror', 2),
    ]
    const onRemove = vi.fn()

    const { rerender } = render(
      <EffectRack
        chain={chain}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />,
    )

    // 3 effects
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(3)

    // Names before
    const nameEls = document.querySelectorAll('.effect-card__name')
    expect(nameEls[0].textContent).toBe('Invert')
    expect(nameEls[1].textContent).toBe('Blur')
    expect(nameEls[2].textContent).toBe('Mirror')

    // Remove middle (Blur)
    const removeBtn = document.querySelectorAll('.effect-card__remove')[1]
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith('inst-1')

    // Simulate removal
    const remaining = [chain[0], chain[2]]
    rerender(
      <EffectRack
        chain={remaining}
        registry={fullRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    // 2 effects: Invert and Mirror
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(2)
    const remainingNames = document.querySelectorAll('.effect-card__name')
    expect(remainingNames[0].textContent).toBe('Invert')
    expect(remainingNames[1].textContent).toBe('Mirror')
  })

  test('17. Add → Select → Add second → Select second → Both have independent params', () => {
    const chain = [makeInstance('fx.invert', 0)]
    const onSelect = vi.fn()

    const { rerender } = render(
      <>
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId="inst-0"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain[0]}
          effectInfo={fullRegistry[0]}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Panel shows first effect
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Invert')

    // Add second effect and select it
    const chain2 = [...chain, makeInstance('fx.blur', 1)]
    rerender(
      <>
        <EffectRack
          chain={chain2}
          registry={fullRegistry}
          selectedEffectId="inst-1"
          onSelect={onSelect}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
        <ParamPanel
          effect={chain2[1]}
          effectInfo={fullRegistry.find((r) => r.id === 'fx.blur')!}
          onUpdateParam={vi.fn()}
          onSetMix={vi.fn()}
        />
      </>,
    )

    // Panel shows second effect
    expect(document.querySelector('.param-panel__header')?.textContent).toBe('Blur')

    // Each effect has independent params — Blur has "Mode" choice param that Invert doesn't
    expect(document.querySelector('.param-choice__select')).toBeTruthy()
  })
})
