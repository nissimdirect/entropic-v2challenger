/**
 * B3 / L2 + L4 — lean track header component tests.
 *
 * Verifies (under F_CREATRIX_LAYOUT, forced on via a partial mock):
 *   - the header renders in the LEAN single-row form (data-testid lean-track-header)
 *   - the deep blend/opacity controls are GONE from the header (moved to LAYER panel)
 *   - the compact bchip reflects the track's terminal composite (mode + opacity)
 *   - the eye toggles the layer's visibility (mute), M/S are wired
 *   - the twirl toggles the track's expanded state → nested fx/automation reveal
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const mockEntropic = {
  sendCommand: () => Promise.resolve({ ok: true }),
  onEngineStatus: () => () => {},
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

// Force F_CREATRIX_LAYOUT on while keeping every other flag at its real value.
vi.mock('../../shared/feature-flags', async (importActual) => {
  const actual = await importActual<typeof import('../../shared/feature-flags')>()
  return { ...actual, FF: { ...actual.FF, F_CREATRIX_LAYOUT: true } }
})

import { TrackHeader } from '../../renderer/components/timeline/Track'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useLayoutStore } from '../../renderer/stores/layout'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import { getTerminalComposite, makeCompositeEffect } from '../../shared/types'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
  useLayoutStore.setState({ expandedTrackIds: [] })
})

afterEach(() => cleanup())

function trackWithComposite(mode = 'screen', opacity = 0.45) {
  const id = useTimelineStore.getState().addTrack('V1', '#4ade80')!
  useProjectStore.getState().addEffect(id, makeCompositeEffect('cmp-1'))
  const composite = getTerminalComposite(
    useTimelineStore.getState().tracks.find((t) => t.id === id)!.effectChain,
  )!
  useProjectStore.getState().updateParam(id, composite.id, 'mode', mode)
  useProjectStore.getState().updateParam(id, composite.id, 'opacity', opacity)
  return useTimelineStore.getState().tracks.find((t) => t.id === id)!
}

describe('B3 lean track header', () => {
  it('renders the lean header form', () => {
    const t = trackWithComposite()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(container.querySelector('[data-testid="lean-track-header"]')).toBeTruthy()
  })

  it('removes the deep opacity slider + blend select from the header', () => {
    const t = trackWithComposite()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    // The deep controls now live in the LAYER panel — not the header.
    expect(container.querySelector('.track-header__opacity')).toBeNull()
    expect(container.querySelector('select.track-header__blend')).toBeNull()
  })

  it('bchip reflects the terminal composite blend + opacity', () => {
    const t = trackWithComposite('screen', 0.45)
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const bchip = container.querySelector('[data-testid="track-bchip"]') as HTMLElement
    expect(bchip).toBeTruthy()
    expect(bchip.textContent).toContain('Screen')
    expect(bchip.textContent).toContain('45%')
  })

  it('bchip click selects the track (focuses the LAYER panel)', () => {
    const t = trackWithComposite()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const bchip = container.querySelector('[data-testid="track-bchip"]') as HTMLElement
    fireEvent.click(bchip)
    expect(useTimelineStore.getState().selectedTrackId).toBe(t.id)
  })

  it('eye toggles the layer visibility (mute)', () => {
    const t = trackWithComposite()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(useTimelineStore.getState().tracks[0].isMuted).toBe(false)
    fireEvent.click(container.querySelector('[data-testid="track-eye"]') as HTMLElement)
    expect(useTimelineStore.getState().tracks[0].isMuted).toBe(true)
  })

  it('twirl toggles the track expanded state', () => {
    const t = trackWithComposite()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(useLayoutStore.getState().expandedTrackIds).not.toContain(t.id)
    fireEvent.click(container.querySelector('[data-testid="track-twirl"]') as HTMLElement)
    expect(useLayoutStore.getState().expandedTrackIds).toContain(t.id)
  })

  it('expanded track reveals a nested fx row for each non-composite effect', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    // A regular (non-composite) effect + a terminal composite.
    useProjectStore.getState().addEffect(id, {
      id: 'fx-1', effectId: 'datamosh', isEnabled: true, isFrozen: false,
      parameters: {}, modulations: {}, mix: 1, mask: null,
    })
    useProjectStore.getState().addEffect(id, makeCompositeEffect('cmp-1'))
    useLayoutStore.setState({ expandedTrackIds: [id] })
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!

    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const nested = container.querySelector('[data-testid="track-nested"]')
    expect(nested).toBeTruthy()
    const fxRows = container.querySelectorAll('[data-testid="nested-fx-row"]')
    // Exactly ONE nested fx row — the composite is excluded (it's the LAYER panel's job).
    expect(fxRows.length).toBe(1)
  })
})
