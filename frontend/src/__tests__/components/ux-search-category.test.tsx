/**
 * UX Combinations — Search, Category, and Effect Add
 *
 * Migrated from frontend/tests/e2e/phase-1/ux-combinations.spec.ts (Group 7, tests 25-27)
 *
 * WHY NOT E2E: Tests EffectBrowser search/category filtering and EffectRack state.
 * No real Electron, IPC, or video import needed — pure UI state interactions.
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import type { EffectInfo, EffectInstance } from '../../shared/types'

// --- Shared test data ---

const fullRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: {} },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'color', params: {} },
  { id: 'fx.brightness', name: 'Brightness', category: 'color', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: {} },
  { id: 'fx.pixelate', name: 'Pixelate', category: 'distortion', params: {} },
  { id: 'fx.mirror', name: 'Mirror', category: 'transform', params: {} },
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

describe('UX Combos — Group 7: Search + Category + Effect Add', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('25. Search → Add from results → Search persists, rack updates', () => {
    const chain: EffectInstance[] = []
    const onAdd = vi.fn()

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
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Type search term matching "Inv" → should filter to "Invert"
    const searchInput = document.querySelector('.effect-search__input') as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'Inv' } })

    // Should show only Invert in filtered results
    const filteredItems = document.querySelectorAll('.effect-browser__item')
    expect(filteredItems.length).toBe(1)
    expect(filteredItems[0].textContent).toBe('Invert')

    // Click to add the filtered effect
    fireEvent.click(filteredItems[0])
    expect(onAdd).toHaveBeenCalledTimes(1)

    // Simulate the state update: add effect to chain
    const addedInstance = makeInstance('fx.invert', 0)
    const updatedChain = [addedInstance]

    rerender(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={onAdd}
          chainLength={updatedChain.length}
        />
        <EffectRack
          chain={updatedChain}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Search input should still contain "Inv"
    expect(searchInput.value).toBe('Inv')

    // Browser still shows filtered results
    const stillFiltered = document.querySelectorAll('.effect-browser__item')
    expect(stillFiltered.length).toBe(1)

    // Rack shows 1 effect
    const rackItems = document.querySelectorAll('.effect-rack__item')
    expect(rackItems.length).toBe(1)
  })

  test('26. Category filter → Add → Switch to All → Rack preserved', () => {
    const onAdd = vi.fn()

    const { rerender } = render(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={onAdd}
          chainLength={0}
        />
        <EffectRack
          chain={[]}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Click a non-All category (e.g., "distortion")
    const catBtns = document.querySelectorAll('.effect-browser__cat-btn')
    expect(catBtns.length).toBeGreaterThan(1)

    // Find "distortion" button (categories are sorted: color, distortion, transform)
    const distortionBtn = Array.from(catBtns).find((b) => b.textContent === 'distortion')!
    fireEvent.click(distortionBtn)

    // Should show distortion effects only (Blur, Pixelate)
    let items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(2)

    // Add first filtered effect
    fireEvent.click(items[0])
    expect(onAdd).toHaveBeenCalledTimes(1)

    // Simulate adding to chain
    const addedChain = [makeInstance('fx.blur', 0)]
    rerender(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={onAdd}
          chainLength={addedChain.length}
        />
        <EffectRack
          chain={addedChain}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Switch to "All" category
    const allBtn = document.querySelectorAll('.effect-browser__cat-btn')[0]
    fireEvent.click(allBtn)

    // All 6 effects should be visible
    items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(6)

    // "All" button should be active
    expect(allBtn.classList.contains('effect-browser__cat-btn--active')).toBe(true)

    // Rack still has 1 effect
    const rackItems = document.querySelectorAll('.effect-rack__item')
    expect(rackItems.length).toBe(1)
  })

  test('27. Search no match → Clear → All visible, rack unchanged', () => {
    const chain = [makeInstance('fx.invert', 0)]

    render(
      <>
        <EffectBrowser
          registry={fullRegistry}
          isLoading={false}
          onAddEffect={vi.fn()}
          chainLength={chain.length}
        />
        <EffectRack
          chain={chain}
          registry={fullRegistry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    const searchInput = document.querySelector('.effect-search__input') as HTMLInputElement

    // Search for nonexistent term
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent999' } })

    // "No effects found" should be visible
    expect(document.querySelector('.effect-browser__empty')).toBeTruthy()
    expect(document.querySelectorAll('.effect-browser__item').length).toBe(0)

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })

    // All 6 effects should be visible again
    expect(document.querySelectorAll('.effect-browser__item').length).toBe(6)

    // Rack should be unchanged (1 effect)
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(1)
  })
})
