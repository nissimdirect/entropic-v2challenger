/**
 * Chaos Tests — Keyboard Stress + Rapid Clicks (Component Layer)
 *
 * Migrated from frontend/tests/e2e/regression/chaos.spec.ts (tests 1-4, 6-7, 13)
 *
 * WHY NOT E2E: Tests keyboard focus cycling, rapid UI clicks, and DOM
 * manipulation recovery. No real Electron, IPC, or sidecar needed —
 * all verifiable with component rendering and simulated events.
 *
 * Tests 5, 8-12, 14-17 STAY as E2E (need electronApp.evaluate,
 * real contextIsolation, real BrowserWindow, or real IPC).
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import EffectRack from '../../renderer/components/effects/EffectRack'
import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'
import PreviewControls from '../../renderer/components/preview/PreviewControls'
import type { EffectInfo, EffectInstance } from '../../shared/types'

// --- Shared test data ---

const registry: EffectInfo[] = [
  { id: 'fx.invert', name: 'Invert', category: 'color', params: {} },
  { id: 'fx.blur', name: 'Blur', category: 'distortion', params: {} },
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

describe('Chaos — Rapid Keyboard Input', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('1. rapid Tab key presses do not crash', () => {
    render(
      <>
        <EffectBrowser
          registry={registry}
          isLoading={false}
          onAddEffect={vi.fn()}
          chainLength={0}
        />
        <PreviewCanvas
          frameDataUrl={null}
          width={1920}
          height={1080}
          previewState="empty"
          renderError={null}
        />
      </>,
    )

    // Press Tab 20 times via keyboard events on document body
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(document.body, { key: 'Tab', code: 'Tab' })
    }

    // App elements should still be in DOM
    expect(document.querySelector('.effect-browser')).toBeTruthy()
    expect(document.querySelector('.preview-canvas')).toBeTruthy()
  })

  test('2. rapid Escape presses do not crash', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    for (let i = 0; i < 15; i++) {
      fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })
    }

    expect(document.querySelector('.effect-browser')).toBeTruthy()
  })

  test('3. rapid Space presses do not trigger unintended actions (no video)', () => {
    render(
      <>
        <PreviewCanvas
          frameDataUrl={null}
          width={1920}
          height={1080}
          previewState="empty"
          renderError={null}
        />
        <PreviewControls
          currentFrame={0}
          totalFrames={0}
          fps={30}
          isPlaying={false}
          onSeek={vi.fn()}
          onPlayPause={vi.fn()}
        />
      </>,
    )

    // Rapidly press Space 10 times
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    }

    // Preview placeholder should still be visible (no video loaded)
    expect(document.querySelector('.preview-canvas__placeholder')).toBeTruthy()
    // Scrub should still be disabled
    const scrub = document.querySelector('.preview-controls__scrub') as HTMLInputElement
    expect(scrub?.disabled).toBe(true)
  })

  test('4. keyboard shortcut sequence Ctrl+A, Ctrl+C, Ctrl+V does not crash', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    fireEvent.keyDown(document.body, { key: 'a', code: 'KeyA', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'v', code: 'KeyV', metaKey: true })

    // App should remain stable
    expect(document.querySelector('.effect-browser')).toBeTruthy()
  })
})

describe('Chaos — Rapid Clicks', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('6. rapid-click "All" category filter 10 times', () => {
    render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={vi.fn()}
        chainLength={0}
      />,
    )

    const allBtn = document.querySelector('.effect-browser__cat-btn')!
    expect(allBtn.textContent).toBe('All')

    // Click 10 times rapidly
    for (let i = 0; i < 10; i++) {
      fireEvent.click(allBtn)
    }

    // All effects should still be visible
    expect(document.querySelectorAll('.effect-browser__item').length).toBe(3)
    expect(document.querySelector('.effect-browser')).toBeTruthy()
  })

  test('7. rapid-click effect items beyond max chain (12 clicks, max 10)', () => {
    const onAdd = vi.fn()
    let chainLength = 0

    const { rerender } = render(
      <EffectBrowser
        registry={registry}
        isLoading={false}
        onAddEffect={(effect) => {
          onAdd(effect)
          chainLength++
        }}
        chainLength={chainLength}
      />,
    )

    // Click first effect 12 times rapidly
    for (let i = 0; i < 12; i++) {
      const items = document.querySelectorAll('.effect-browser__item')
      if (items.length > 0) {
        fireEvent.click(items[0])
      }

      // Re-render with updated chain length
      rerender(
        <EffectBrowser
          registry={registry}
          isLoading={false}
          onAddEffect={(effect) => {
            onAdd(effect)
            chainLength++
          }}
          chainLength={Math.min(chainLength, 10)}
        />,
      )
    }

    // Should have stopped at 10 (MAX_CHAIN_LENGTH)
    // The handleAdd guards: if (chainLength >= MAX_CHAIN_LENGTH) return
    // So onAdd fires for clicks 1-10, then the button becomes disabled
    expect(onAdd.mock.calls.length).toBeLessThanOrEqual(10)

    // Items should be disabled at max
    const items = document.querySelectorAll('.effect-browser__item')
    expect((items[0] as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Chaos — DOM Manipulation Recovery', () => {
  beforeEach(() => {
    setupMockEntropic()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  test('13. removing DOM element does not crash other components', () => {
    render(
      <>
        <EffectBrowser
          registry={registry}
          isLoading={false}
          onAddEffect={vi.fn()}
          chainLength={0}
        />
        <EffectRack
          chain={[makeInstance('fx.invert', 0)]}
          registry={registry}
          selectedEffectId={null}
          onSelect={vi.fn()}
          onToggle={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn()}
        />
      </>,
    )

    // Verify both present
    expect(document.querySelector('.effect-browser')).toBeTruthy()
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(1)

    // Manually remove the browser header from DOM
    const header = document.querySelector('.effect-browser__header')
    if (header) header.remove()

    // Header is gone but everything else still works
    expect(document.querySelector('.effect-browser__header')).toBeNull()
    expect(document.querySelector('.effect-browser')).toBeTruthy()
    expect(document.querySelectorAll('.effect-rack__item').length).toBe(1)
    expect(document.querySelectorAll('.effect-browser__item').length).toBe(3)
  })
})
