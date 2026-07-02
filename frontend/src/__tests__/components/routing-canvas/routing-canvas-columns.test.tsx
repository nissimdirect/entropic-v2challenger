/**
 * P6.10 (I2) — Routing Canvas columns: bright/dim + search.
 *
 * Named tests (packet TEST PLAN — routing-canvas-columns.test.tsx):
 *   - routed nodes bright
 *   - search filters
 *
 * Plus payload-assembly + destination-enumeration unit coverage for the pure
 * helpers (deterministic, no DOM).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

;(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof (globalThis as any).matchMedia !== 'function') {
  ;(globalThis as any).matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  ;(window as any).matchMedia = (globalThis as any).matchMedia
}

const sendCommand = vi.fn()
;(globalThis as any).window = (globalThis as any).window || {}
;(window as any).entropic = { sendCommand }

import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import RoutingCanvas from '../../../renderer/components/routing-canvas/RoutingCanvas'
import {
  buildRoutingGraphPayload,
  enumerateDestinations,
} from '../../../renderer/components/routing-canvas/routing-graph-ipc'
import { useOperatorStore } from '../../../renderer/stores/operators'
import { useAutomationStore } from '../../../renderer/stores/automation'
import { useEffectsStore } from '../../../renderer/stores/effects'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { EffectInfo, Operator, AutomationLane, Track } from '../../../shared/types'

const REGISTRY: EffectInfo[] = [
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'blur',
    params: { radius: { type: 'float' }, threshold: { type: 'float' } },
  },
  {
    id: 'fx.hue',
    name: 'Hue',
    category: 'color',
    params: { shift: { type: 'float' }, saturation: { type: 'float' } },
  },
]

function makeTrack(): Track {
  return {
    id: 't1', name: 'T1', color: '#fff', type: 'video',
    isMuted: false, isLocked: false, isSolo: false, height: 80, clips: [],
    effectChain: [
      { id: 'i1', effectId: 'fx.blur', isEnabled: true, isFrozen: false, parameters: { radius: 1, threshold: 0.5 }, modulations: {}, mix: 1 },
      { id: 'i2', effectId: 'fx.hue', isEnabled: true, isFrozen: false, parameters: { shift: 0, saturation: 1 }, modulations: {}, mix: 1 },
    ],
  } as unknown as Track
}

const GRAPH_REPLY = {
  ok: true,
  nodes: [
    { id: 'op:op1', kind: 'operator', label: 'LFO', trackId: null },
    { id: 'op:op2', kind: 'operator', label: 'Envelope', trackId: null },
    { id: 'fx:t1:fx.blur', kind: 'effect', label: 'Blur', trackId: 't1' },
    { id: 'fx:t1:fx.hue', kind: 'effect', label: 'Hue', trackId: 't1' },
  ],
  // op1 → blur.radius routed; op2 unrouted; hue.shift unrouted.
  edges: [
    { id: 'op-edge:op1:fx.blur:radius', srcId: 'op:op1', dstId: 'fx:t1:fx.blur', dstParam: 'radius', amount: 0.7 },
  ],
  hasCycle: false,
  cycleNodeIds: [],
}

function resetAll() {
  useOperatorStore.getState().resetOperators()
  useAutomationStore.getState().resetAutomation()
  useEffectsStore.setState({ registry: REGISTRY })
  useTimelineStore.getState().reset()
  useTimelineStore.setState({ tracks: [makeTrack()] })
  useUndoStore.getState().clear()
  sendCommand.mockReset()
  sendCommand.mockResolvedValue(GRAPH_REPLY)
}

beforeEach(resetAll)
afterEach(cleanup)

describe('RoutingCanvas — columns bright/dim + search', () => {
  it('routed nodes bright (routed source/dest get the routed class)', async () => {
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())

    // op1 is routed → bright; op2 is unrouted → available.
    await waitFor(() => {
      const op1 = container.querySelector('.routing-item[data-item-id="op:op1"]')
      expect(op1?.classList.contains('routing-item--routed')).toBe(true)
    })
    const op2 = container.querySelector('.routing-item[data-item-id="op:op2"]')
    expect(op2?.classList.contains('routing-item--available')).toBe(true)

    // blur.radius destination is routed → bright; hue.shift available.
    const blurRadius = container.querySelector('.routing-item[data-item-id="fx.blur:radius"]')
    expect(blurRadius?.classList.contains('routing-item--routed')).toBe(true)
    const hueShift = container.querySelector('.routing-item[data-item-id="fx.hue:shift"]')
    expect(hueShift?.classList.contains('routing-item--available')).toBe(true)
  })

  it('search filters the source column', async () => {
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    await waitFor(() =>
      expect(container.querySelector('.routing-item[data-item-id="op:op2"]')).not.toBeNull(),
    )
    const searchInput = container.querySelector(
      '.routing-column--source .routing-column__search-input',
    ) as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'envelope' } })
    // Only the Envelope (op2) operator survives; LFO (op1) filtered out.
    await waitFor(() => {
      expect(container.querySelector('.routing-item[data-item-id="op:op1"]')).toBeNull()
      expect(container.querySelector('.routing-item[data-item-id="op:op2"]')).not.toBeNull()
    })
  })

  it('search filters the destination column', async () => {
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    const searchInput = container.querySelector(
      '.routing-column--destination .routing-column__search-input',
    ) as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'hue' } })
    await waitFor(() => {
      expect(container.querySelector('.routing-item[data-item-id="fx.blur:radius"]')).toBeNull()
      expect(container.querySelector('.routing-item[data-item-id="fx.hue:shift"]')).not.toBeNull()
    })
  })
})

describe('routing-graph-ipc — pure helpers', () => {
  function op(id: string, mappings: Operator['mappings'] = []): Operator {
    return { id, type: 'lfo', label: 'LFO', isEnabled: true, parameters: {}, processing: [], mappings }
  }
  function lane(id: string, paramPath: string): AutomationLane {
    return { id, paramPath, color: '#fff', isVisible: true, points: [], mode: 'linear' as any }
  }

  it('buildRoutingGraphPayload serializes operators, lanes (split paramPath), chains', () => {
    const operators = [
      op('op1', [{ targetEffectId: 'fx.blur', targetParamKey: 'radius', depth: 0.5, min: 0, max: 1, curve: 'linear', blendMode: 'add' }]),
    ]
    const lanes = { t1: [lane('lane1', 'fx.hue.shift')] }
    const tracks = [makeTrack()]
    const payload = buildRoutingGraphPayload(operators, lanes, tracks)
    expect(payload.cmd).toBe('routing_graph_get')
    expect(payload.operators[0]).toMatchObject({ id: 'op1', is_enabled: true })
    expect((payload.operators[0] as any).mappings[0]).toMatchObject({
      target_effect_id: 'fx.blur', target_param_key: 'radius', depth: 0.5,
    })
    // paramPath "fx.hue.shift" splits on first dot → effectId "fx", paramKey "hue.shift".
    expect((payload.lanesByTrack.t1 as any[])[0]).toMatchObject({
      laneId: 'lane1', effectId: 'fx', paramKey: 'hue.shift',
    })
    expect((payload.chainByTrack.t1 as any[])[0]).toMatchObject({ effect_id: 'fx.blur' })
  })

  it('enumerateDestinations dedups by effect+param, deterministic order', () => {
    const dests = enumerateDestinations([makeTrack()], REGISTRY)
    expect(dests.map((d) => d.key)).toEqual([
      'fx.blur:radius', 'fx.blur:threshold', 'fx.hue:shift', 'fx.hue:saturation',
    ])
  })
})
