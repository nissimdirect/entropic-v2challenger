/**
 * B3 / L3 — LAYER inspector panel component tests.
 *
 * Verifies the panel:
 *   - shows an empty state with no selection
 *   - reflects the SELECTED track (name + blend grid + opacity)
 *   - writes blend mode + opacity back to the track's terminal composite
 *   - auto-creates a composite on first edit when the track has none
 *   - reflects + writes the representative clip's transform (rotate/scale)
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const mockEntropic = {
  sendCommand: () => Promise.resolve({ ok: true }),
  onEngineStatus: () => () => {},
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import LayerPanel from '../../renderer/components/timeline/LayerPanel'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { useAutomationStore } from '../../renderer/stores/automation'
import { getTrackCompositing, getTerminalComposite, makeCompositeEffect } from '../../shared/types'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
  useAutomationStore.getState().resetAutomation()
})

afterEach(() => cleanup())

function selectTrackWithComposite(mode = 'screen', opacity = 0.6) {
  const id = useTimelineStore.getState().addTrack('V1', '#4ade80')!
  useProjectStore.getState().addEffect(id, makeCompositeEffect('cmp-1'))
  const composite = getTerminalComposite(
    useTimelineStore.getState().tracks.find((t) => t.id === id)!.effectChain,
  )!
  useProjectStore.getState().updateParam(id, composite.id, 'mode', mode)
  useProjectStore.getState().updateParam(id, composite.id, 'opacity', opacity)
  useTimelineStore.getState().selectTrack(id)
  return id
}

function compositingOf(trackId: string) {
  return getTrackCompositing(
    useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain,
  )
}

describe('B3 LAYER panel', () => {
  it('shows empty state when no track is selected', () => {
    const { container } = render(<LayerPanel />)
    expect(container.querySelector('[data-testid="layer-panel-empty"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="layer-panel"]')).toBeNull()
  })

  it('reflects the selected track name', () => {
    selectTrackWithComposite()
    const { container } = render(<LayerPanel />)
    const name = container.querySelector('[data-testid="layer-panel-name"]') as HTMLElement
    expect(name.textContent).toContain('V1')
  })

  it('highlights the active blend mode', () => {
    selectTrackWithComposite('multiply', 0.6)
    const { container } = render(<LayerPanel />)
    const active = container.querySelector('[data-testid="blend-multiply"]') as HTMLElement
    expect(active.getAttribute('aria-pressed')).toBe('true')
    const inactive = container.querySelector('[data-testid="blend-normal"]') as HTMLElement
    expect(inactive.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking a blend button writes the mode to the composite', () => {
    const id = selectTrackWithComposite('normal', 0.6)
    const { container } = render(<LayerPanel />)
    fireEvent.click(container.querySelector('[data-testid="blend-difference"]') as HTMLElement)
    expect(compositingOf(id).mode).toBe('difference')
  })

  it('opacity slider reflects + writes composite opacity', () => {
    const id = selectTrackWithComposite('normal', 0.6)
    const { container } = render(<LayerPanel />)
    const slider = container.querySelector('[data-testid="layer-opacity"]') as HTMLInputElement
    expect(slider.value).toBe('0.6')
    fireEvent.change(slider, { target: { value: '0.25' } })
    expect(compositingOf(id).opacity).toBeCloseTo(0.25, 5)
  })

  it('auto-creates a composite on first blend edit when the track has none', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().selectTrack(id)
    // No composite yet.
    expect(getTerminalComposite(
      useTimelineStore.getState().tracks.find((t) => t.id === id)!.effectChain,
    )).toBeNull()

    const { container } = render(<LayerPanel />)
    fireEvent.click(container.querySelector('[data-testid="blend-screen"]') as HTMLElement)

    const composite = getTerminalComposite(
      useTimelineStore.getState().tracks.find((t) => t.id === id)!.effectChain,
    )
    expect(composite).toBeTruthy()
    expect(compositingOf(id).mode).toBe('screen')
  })

  it('reflects + writes the representative clip transform', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    useTimelineStore.getState().addClip(id, {
      id: 'clip-1', assetId: 'asset-1', trackId: id,
      position: 0, duration: 10, inPoint: 0, outPoint: 10, speed: 1.0,
    })
    useTimelineStore.getState().selectTrack(id)

    const { container } = render(<LayerPanel />)
    const rotate = container.querySelector('[data-testid="layer-rotate"]') as HTMLInputElement
    expect(rotate).toBeTruthy()
    fireEvent.change(rotate, { target: { value: '30' } })

    const clip = useTimelineStore.getState().tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === 'clip-1')!
    expect(clip.transform?.rotation).toBeCloseTo(30, 5)
  })
})
