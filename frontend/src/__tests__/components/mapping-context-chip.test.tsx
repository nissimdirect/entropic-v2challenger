/**
 * H1 (2026-07-02 master-tuneup WS5) — MappingContextChip tests.
 *
 * The chip is the VISIBLE consumer of utils/focusContext.ts (anti-dead-flag —
 * the derivation must not ship without a reader). Covers each MappingContext
 * kind's label rendering plus the none -> hidden case.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

// Mock window.entropic before store imports (Electron preload dependency).
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import MappingContextChip from '../../renderer/components/layout/MappingContextChip'
import type { EffectInstance } from '../../shared/types'
import type { RackNode, RackPad, SamplerInstrumentV1 } from '../../renderer/components/instruments/types'

// ─── Fixtures (mirrors buildRackTree.test.ts fixture pattern) ─────────────

function makeInst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return { id: 'sampler-x', type: 'sampler', clipId: 'clip-1', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal', ...overrides }
}

function makePad(id: string, overrides: Partial<RackPad> = {}): RackPad {
  return { id, instrument: makeInst(), opacity: 1, blend: 'normal', mute: false, solo: false, ...overrides }
}

function makeRack(pads: RackPad[], overrides: Partial<RackNode> = {}): RackNode {
  return { id: 'rack-1', type: 'rack', pads, ...overrides }
}

function makeEffect(id: string, effectId = 'fx.invert'): EffectInstance {
  return { id, effectId, isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null }
}

function resetStores() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    assets: {},
    selectedEffectId: null,
    selectedRackPad: null,
    rackEditPath: [],
  })
  useEffectsStore.setState({ registry: [], isLoading: false, error: null })
  useInstrumentsStore.setState({ racks: {} })
}

beforeEach(() => {
  resetStores()
  cleanup()
})

// ─── kind: none ─────────────────────────────────────────────────────────

describe('MappingContextChip — none', () => {
  it('renders nothing when no focus context exists', () => {
    const { queryByTestId } = render(<MappingContextChip />)
    expect(queryByTestId('statusbar-mapping-context-chip')).toBeNull()
  })
})

// ─── kind: track ────────────────────────────────────────────────────────

describe('MappingContextChip — track', () => {
  it('renders the track label from the selected track', () => {
    const trackId = useTimelineStore.getState().addTrack('Drums', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    const { getByTestId } = render(<MappingContextChip />)
    const el = getByTestId('statusbar-mapping-context-chip')
    expect(el.getAttribute('data-context-kind')).toBe('track')
    expect(el.textContent).toContain('track · Drums')
  })
})

// ─── kind: clip ─────────────────────────────────────────────────────────

describe('MappingContextChip — clip', () => {
  it('renders the clip label (falls back to filename when the clip has no name)', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().addClip(trackId, {
      id: 'clip-1', assetId: 'asset-1', trackId, position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
    })
    useProjectStore.setState({
      assets: { 'asset-1': { id: 'asset-1', path: '/media/intro.mp4', type: 'video', meta: { width: 1920, height: 1080, duration: 5, fps: 30, codec: 'h264', hasAudio: true } } },
    })
    useTimelineStore.getState().selectTrack(trackId)
    useTimelineStore.getState().selectClip('clip-1')
    const { getByTestId } = render(<MappingContextChip />)
    const el = getByTestId('statusbar-mapping-context-chip')
    expect(el.getAttribute('data-context-kind')).toBe('clip')
    expect(el.textContent).toContain('clip · intro.mp4')
  })
})

// ─── kind: effect ───────────────────────────────────────────────────────

describe('MappingContextChip — effect', () => {
  it('renders the effect display name from the registry', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    const fx = makeEffect('fx-1', 'fx.pixelsort')
    useProjectStore.getState().addEffect(trackId, fx)
    useProjectStore.getState().selectEffect('fx-1')
    useEffectsStore.setState({
      registry: [{ id: 'fx.pixelsort', name: 'Pixelsort', category: 'glitch', params: {} }],
    })
    const { getByTestId } = render(<MappingContextChip />)
    const el = getByTestId('statusbar-mapping-context-chip')
    expect(el.getAttribute('data-context-kind')).toBe('effect')
    expect(el.textContent).toContain('effect · Pixelsort')
  })
})

// ─── kind: rack-pad ─────────────────────────────────────────────────────

describe('MappingContextChip — rack-pad', () => {
  it('renders a 1-based pad index and the owning track name', () => {
    const trackId = useTimelineStore.getState().addTrack('Drums', '#ff0000')!
    useTimelineStore.getState().selectTrack(trackId)
    useInstrumentsStore.setState({
      racks: { [trackId]: makeRack([makePad('p1'), makePad('p2'), makePad('p3')]) },
    })
    useProjectStore.getState().setSelectedRackPad(trackId, 'p3')
    const { getByTestId } = render(<MappingContextChip />)
    const el = getByTestId('statusbar-mapping-context-chip')
    expect(el.getAttribute('data-context-kind')).toBe('rack-pad')
    expect(el.textContent).toContain('pad Pad 3 · Drums')
  })

  it('a rack-pad selection scoped to a NON-active track does not render as rack-pad', () => {
    const t1 = useTimelineStore.getState().addTrack('Drums', '#ff0000')!
    const t2 = useTimelineStore.getState().addTrack('Bass', '#00ff00')!
    useInstrumentsStore.setState({ racks: { [t1]: makeRack([makePad('p1')]) } })
    useProjectStore.getState().setSelectedRackPad(t1, 'p1')
    // Switch the active track away from t1 (Tiger-fix scoping) without clearing the pad.
    useTimelineStore.getState().selectTrack(t2)
    const { getByTestId } = render(<MappingContextChip />)
    const el = getByTestId('statusbar-mapping-context-chip')
    expect(el.getAttribute('data-context-kind')).toBe('track')
    expect(el.textContent).toContain('track · Bass')
  })
})
