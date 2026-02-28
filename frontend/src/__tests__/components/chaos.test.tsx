/**
 * Chaos Tests — Component Level (Migrated from E2E)
 *
 * Originally in tests/e2e/regression/chaos.spec.ts (Playwright + real Electron).
 * Migrated: rapid click sequences, rapid interactions on individual components.
 *
 * Tests requiring real Electron remain in E2E:
 * // WHY E2E: IPC abuse (invalid/empty/huge payload commands), contextIsolation XSS,
 * // window resize (BrowserWindow.setSize), DOM corruption with React recovery
 *
 * See: P97, docs/solutions/2026-02-28-e2e-test-pyramid.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import FileDialog from '../../renderer/components/upload/FileDialog'
import DropZone from '../../renderer/components/upload/DropZone'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import type { EffectInfo, EffectInstance } from '../../shared/types'

const mockRegistry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'fx', params: {} },
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'distortion',
    params: {
      radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Blur Radius' },
    },
  },
  { id: 'fx.hue_shift', name: 'Hue Shift', category: 'fx', params: {} },
]

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

// =============================================================================
// Rapid Clicks — Browse Button
// =============================================================================

describe('Chaos — Rapid Clicks on Browse', () => {
  it('rapid-click Browse button 10 times does not crash', () => {
    const onFileSelect = vi.fn()
    render(<FileDialog onFileSelect={onFileSelect} />)

    const btn = document.querySelector('.file-dialog-btn') as HTMLElement
    expect(btn).toBeTruthy()

    for (let i = 0; i < 10; i++) {
      fireEvent.click(btn)
    }

    // Component should still be in DOM and functional
    expect(document.querySelector('.file-dialog-btn')).toBeTruthy()
  })
})

// =============================================================================
// Rapid Clicks — Category Filters
// =============================================================================

describe('Chaos — Rapid Clicks on Categories', () => {
  it('rapid-click "All" category filter 20 times', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const allBtn = document.querySelector('.effect-browser__cat-btn') as HTMLElement
    expect(allBtn).toBeTruthy()
    expect(allBtn.textContent).toBe('All')

    for (let i = 0; i < 20; i++) {
      fireEvent.click(allBtn)
    }

    // All effects should still be visible
    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(3)
  })

  it('rapid category switching does not corrupt filter state', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const catBtns = document.querySelectorAll('.effect-browser__cat-btn')

    // Rapidly switch between all categories
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < catBtns.length; i++) {
        fireEvent.click(catBtns[i])
      }
    }

    // After all the switching, click "All" — everything should be back
    fireEvent.click(catBtns[0])
    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(3)
  })
})

// =============================================================================
// Rapid Clicks — Effect Items (Max Chain Enforcement)
// =============================================================================

describe('Chaos — Rapid Effect Adds', () => {
  it('clicking effect 15 times respects max chain of 10', () => {
    const addedEffects: EffectInstance[] = []
    const onAddEffect = vi.fn((e: EffectInstance) => addedEffects.push(e))

    // Start with chainLength=8, so only 2 more should be added
    const { rerender } = render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={onAddEffect}
        chainLength={8}
      />,
    )

    const items = document.querySelectorAll('.effect-browser__item')

    // Click first effect 15 times rapidly
    for (let i = 0; i < 15; i++) {
      fireEvent.click(items[0])
      // Simulate chain growing (rerender with updated chainLength)
      const newLen = Math.min(8 + onAddEffect.mock.calls.length, 10)
      rerender(
        <EffectBrowser
          registry={mockRegistry}
          isLoading={false}
          onAddEffect={onAddEffect}
          chainLength={newLen}
        />,
      )
    }

    // Only 2 additions should have been allowed (8 + 2 = 10)
    expect(onAddEffect).toHaveBeenCalledTimes(2)

    // Buttons should now be disabled
    const disabledItems = document.querySelectorAll('.effect-browser__item')
    disabledItems.forEach((item) => {
      expect((item as HTMLButtonElement).disabled).toBe(true)
    })
  })
})

// =============================================================================
// Rapid Clicks — Effect Rack Toggle
// =============================================================================

describe('Chaos — Rapid Effect Toggle', () => {
  it('toggling an effect on/off 10 times rapidly does not crash', () => {
    const chain: EffectInstance[] = [
      {
        id: 'inst-1',
        effectId: 'fx.invert',
        isEnabled: true,
        isFrozen: false,
        parameters: {},
        modulations: {},
        mix: 1.0,
        mask: null,
      },
    ]

    const onToggle = vi.fn()
    render(
      <EffectRack
        chain={chain}
        registry={mockRegistry}
        selectedEffectId={null}
        onSelect={vi.fn()}
        onToggle={onToggle}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const toggleBtn = document.querySelector('.effect-card__toggle') as HTMLElement
    if (toggleBtn) {
      for (let i = 0; i < 10; i++) {
        fireEvent.click(toggleBtn)
      }
      expect(onToggle).toHaveBeenCalledTimes(10)
    }

    // Component should still be in DOM
    expect(document.querySelector('.effect-rack')).toBeTruthy()
  })
})

// =============================================================================
// Rapid Clicks — Play/Pause Button
// =============================================================================

describe('Chaos — Rapid Play/Pause', () => {
  it('rapid play/pause clicks do not crash', () => {
    const onPlayPause = vi.fn()
    render(
      <PreviewControls
        currentFrame={0}
        totalFrames={100}
        fps={30}
        isPlaying={false}
        onSeek={vi.fn()}
        onPlayPause={onPlayPause}
      />,
    )

    const playBtn = document.querySelector('.preview-controls__play-btn') as HTMLElement
    for (let i = 0; i < 20; i++) {
      fireEvent.click(playBtn)
    }

    expect(onPlayPause).toHaveBeenCalledTimes(20)
    expect(document.querySelector('.preview-controls')).toBeTruthy()
  })
})

// =============================================================================
// Rapid Search Input
// =============================================================================

describe('Chaos — Rapid Search Input', () => {
  it('rapid typing in search does not crash or corrupt state', () => {
    render(
      <EffectBrowser
        registry={mockRegistry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const searchInput = document.querySelector('.effect-search__input') as HTMLInputElement

    // Type rapidly
    const chars = 'abcdefghijklmnopqrstuvwxyz'
    for (let i = 0; i < chars.length; i++) {
      fireEvent.change(searchInput, { target: { value: chars.slice(0, i + 1) } })
    }

    // Clear — all effects should return
    fireEvent.change(searchInput, { target: { value: '' } })
    const items = document.querySelectorAll('.effect-browser__item')
    expect(items.length).toBe(3)
  })
})

// =============================================================================
// Drop Zone Rapid Drag Events
// =============================================================================

describe('Chaos — Rapid Drag Events', () => {
  it('rapid dragOver/dragLeave does not corrupt state', () => {
    render(<DropZone onFileDrop={vi.fn()} />)

    const dropZone = document.querySelector('.drop-zone') as HTMLElement

    for (let i = 0; i < 20; i++) {
      fireEvent.dragOver(dropZone, { preventDefault: vi.fn(), stopPropagation: vi.fn() })
      fireEvent.dragLeave(dropZone, { preventDefault: vi.fn(), stopPropagation: vi.fn() })
    }

    // Should not be in active state after final leave
    expect(dropZone.className).not.toContain('drop-zone--active')
    expect(document.querySelector('.drop-zone')).toBeTruthy()
  })
})
