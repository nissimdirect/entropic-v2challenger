/**
 * Cohesion fix — wand tolerance control.
 *
 * `wandTolerance` is READ by MaskSelectOverlay (the wand-sample IPC) but
 * `setWandTolerance` previously had ZERO callers → the value was frozen at the
 * default 30 and the feature was unreachable. The [tool] tab now renders a
 * tolerance slider while the Mask Wand tool is active; it is the sole writer of
 * setWandTolerance. These tests prove:
 *   1. the slider appears only when the Mask Wand tool is active,
 *   2. moving it WRITES timeline.wandTolerance (the value MaskSelectOverlay reads),
 *   3. it is clamped to the store's [0, 441.67] bound.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser from '../../renderer/components/effects/EffectBrowser'
import { useBrowserStore } from '../../renderer/stores/browser'
import { useTimelineStore } from '../../renderer/stores/timeline'

function renderToolTab() {
  return render(
    <EffectBrowser registry={[]} isLoading={false} onAddEffect={vi.fn()} chainLength={0} />,
  )
}

beforeEach(() => {
  setupMockEntropic()
  useBrowserStore.setState({ activeTab: 'tool' })
  useTimelineStore.getState().reset()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('Wand tolerance control (cohesion: WIRE setWandTolerance)', () => {
  it('the tolerance slider is HIDDEN until the Mask Wand tool is selected', () => {
    renderToolTab()
    expect(screen.queryByTestId('wand-tolerance-control')).toBeNull()
  })

  it('selecting the Mask Wand tool reveals the tolerance slider', () => {
    renderToolTab()
    fireEvent.click(screen.getByTestId('tool-item-mask-wand'))
    expect(screen.getByTestId('wand-tolerance-control')).toBeTruthy()
    expect(screen.getByTestId('wand-tolerance')).toBeTruthy()
  })

  it('moving the slider WRITES timeline.wandTolerance (the value MaskSelectOverlay reads)', () => {
    renderToolTab()
    fireEvent.click(screen.getByTestId('tool-item-mask-wand'))
    expect(useTimelineStore.getState().wandTolerance).toBe(30) // default
    // F3-C2: tolerance is now the common/Slider primitive (ARIA track driven
    // by pointer-drag or keyboard, not a native <input type="range">, so a
    // synthetic `change` event no longer applies). Shift+ArrowRight is
    // Slider's tested keyboard interaction (slider.test.tsx) — one press
    // moves by 10% of the [0, 441.67] range (delta ~44.167) from the 30
    // default; int-typed rounds the result to 74.
    fireEvent.keyDown(screen.getByTestId('wand-tolerance'), { key: 'ArrowRight', shiftKey: true })
    expect(useTimelineStore.getState().wandTolerance).toBe(74)
  })

  it('the slider value is clamped by the store to [0, 441.67]', () => {
    renderToolTab()
    fireEvent.click(screen.getByTestId('tool-item-mask-wand'))
    // F3-C2: Slider's own pointer/keyboard interaction paths are
    // structurally bounded to [min,max] (clampAndRound), so there is no
    // longer a UI path that can submit a raw out-of-range value. The store
    // action's OWN defensive clamp (for any non-UI caller) is exercised
    // directly here.
    useTimelineStore.getState().setWandTolerance(9999)
    expect(useTimelineStore.getState().wandTolerance).toBeCloseTo(441.67, 1)
    useTimelineStore.getState().setWandTolerance(-50)
    expect(useTimelineStore.getState().wandTolerance).toBe(0)
  })
})
