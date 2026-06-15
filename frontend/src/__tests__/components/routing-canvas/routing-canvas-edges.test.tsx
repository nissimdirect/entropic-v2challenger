/**
 * P6.10 (I2) — Routing Canvas edge create / inspect / delete.
 *
 * Named tests (packet TEST PLAN — routing-canvas-edges.test.tsx):
 *   - drag creates mapping via store action
 *   - created edge undoable
 *   - depth slider round-trips (via routing_edge_update IPC then store commit)
 *   - delete removes mapping
 *
 * Inlined rules:
 *   - Rule 3 (graph is a projection): edge create goes through
 *     useOperatorStore.addMapping (undoable) — NOT an IPC mutation. The depth
 *     change round-trips through routing_edge_update (P6.9) then commits to the
 *     store. We assert the store is the authority.
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

import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import RoutingCanvas from '../../../renderer/components/routing-canvas/RoutingCanvas'
import { ROUTING_SOURCE_DRAG_TYPE } from '../../../renderer/components/routing-canvas/NodeColumn'
import { useOperatorStore } from '../../../renderer/stores/operators'
import { useAutomationStore } from '../../../renderer/stores/automation'
import { useEffectsStore } from '../../../renderer/stores/effects'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { EffectInfo, Operator, Track } from '../../../shared/types'

const REGISTRY: EffectInfo[] = [
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'blur',
    params: {
      radius: { type: 'float', min: 0, max: 100 },
      threshold: { type: 'float', min: 0, max: 1 },
    },
  },
]

function makeOperator(id: string): Operator {
  return {
    id,
    type: 'lfo',
    label: 'LFO',
    isEnabled: true,
    parameters: { waveform: 'sine', rate_hz: 1.0 },
    processing: [],
    mappings: [],
  }
}

function makeTrack(id: string): Track {
  return {
    id,
    name: 'Track 1',
    color: '#4ade80',
    type: 'video',
    isMuted: false,
    isLocked: false,
    isSolo: false,
    height: 80,
    clips: [],
    effectChain: [
      {
        id: 'inst1',
        effectId: 'fx.blur',
        isEnabled: true,
        isFrozen: false,
        parameters: { radius: 10, threshold: 0.4 },
        modulations: {},
        mix: 1,
      },
    ],
  } as unknown as Track
}

/** Build a graph reply mirroring the current operator store mappings. */
function graphReplyFromStore() {
  const ops = useOperatorStore.getState().operators
  const nodes: any[] = [
    { id: 'fx:t1:fx.blur', kind: 'effect', label: 'Blur', trackId: 't1' },
  ]
  const edges: any[] = []
  for (const op of ops) {
    nodes.push({ id: `op:${op.id}`, kind: 'operator', label: op.label, trackId: null })
    op.mappings.forEach((m) => {
      edges.push({
        id: `op-edge:${op.id}:${m.targetEffectId}:${m.targetParamKey}`,
        srcId: `op:${op.id}`,
        dstId: 'fx:t1:fx.blur',
        dstParam: m.targetParamKey,
        amount: m.depth,
      })
    })
  }
  return { ok: true, nodes, edges, hasCycle: false, cycleNodeIds: [] }
}

function resetAll() {
  useOperatorStore.getState().resetOperators()
  useAutomationStore.getState().resetAutomation()
  useEffectsStore.setState({ registry: REGISTRY })
  useTimelineStore.getState().reset()
  useTimelineStore.setState({ tracks: [makeTrack('t1')] })
  useOperatorStore.setState({ operators: [makeOperator('op1')] })
  useUndoStore.getState().clear()
  sendCommand.mockReset()
  // Dynamic: routing_graph_get reflects current store; routing_edge_update echoes.
  sendCommand.mockImplementation(async (cmd: any) => {
    if (cmd.cmd === 'routing_graph_get') return graphReplyFromStore()
    if (cmd.cmd === 'routing_edge_update') {
      const remainder = String(cmd.edgeId).slice('op-edge:'.length)
      const [operatorId, targetEffectId, ...rest] = remainder.split(':')
      return {
        ok: true,
        edgeId: cmd.edgeId,
        amount: cmd.amount,
        operatorId,
        targetEffectId,
        targetParamKey: rest.join(':'),
      }
    }
    return { ok: true }
  })
}

beforeEach(resetAll)
afterEach(cleanup)

function dataTransfer(payload: object) {
  const store: Record<string, string> = {
    [ROUTING_SOURCE_DRAG_TYPE]: JSON.stringify(payload),
  }
  return {
    types: [ROUTING_SOURCE_DRAG_TYPE],
    getData: (t: string) => store[t] ?? '',
    setData: (t: string, v: string) => { store[t] = v },
    dropEffect: '',
    effectAllowed: '',
  }
}

describe('RoutingCanvas — edge create / inspect / delete', () => {
  it('drag creates mapping via store action', async () => {
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())

    // Find the source (operator) item and a destination (effect.param) item.
    // sendCommand firing does NOT guarantee the routing items have rendered yet
    // (they paint after the store updates from the command response), so wait
    // for the items to exist before interacting — otherwise dragStart races a
    // null element (flake: "Unable to fire a dragstart event").
    const sourceItem = await waitFor(() => {
      const el = container.querySelector(
        '.routing-column--source .routing-item[data-item-id="op:op1"]',
      ) as HTMLElement
      expect(el).not.toBeNull()
      return el
    })
    const destItem = container.querySelector(
      '.routing-column--destination .routing-item[data-item-id="fx.blur:radius"]',
    ) as HTMLElement
    expect(destItem).not.toBeNull()

    const dt = dataTransfer({ operatorId: 'op1', label: 'LFO' })
    fireEvent.dragStart(sourceItem, { dataTransfer: dt })
    await act(async () => {
      fireEvent.drop(destItem, { dataTransfer: dt })
      await Promise.resolve()
    })

    const op = useOperatorStore.getState().operators.find((o) => o.id === 'op1')!
    expect(op.mappings).toHaveLength(1)
    expect(op.mappings[0].targetEffectId).toBe('fx.blur')
    expect(op.mappings[0].targetParamKey).toBe('radius')
  })

  it('created edge undoable', async () => {
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    // Wait for the routing items to render before interacting (sendCommand
    // firing precedes the item paint — see note in the create-mapping test).
    const sourceItem = await waitFor(() => {
      const el = container.querySelector(
        '.routing-item[data-item-id="op:op1"]',
      ) as HTMLElement
      expect(el).not.toBeNull()
      return el
    })
    const destItem = container.querySelector(
      '.routing-item[data-item-id="fx.blur:radius"]',
    ) as HTMLElement
    expect(destItem).not.toBeNull()
    const dt = dataTransfer({ operatorId: 'op1', label: 'LFO' })
    fireEvent.dragStart(sourceItem, { dataTransfer: dt })
    await act(async () => {
      fireEvent.drop(destItem, { dataTransfer: dt })
      await Promise.resolve()
    })
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)

    act(() => useUndoStore.getState().undo())
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
  })

  it('depth slider round-trips via routing_edge_update then commits to store', async () => {
    // Seed an existing mapping so the edge is selectable.
    useOperatorStore.setState({
      operators: [
        {
          ...makeOperator('op1'),
          mappings: [
            { targetEffectId: 'fx.blur', targetParamKey: 'radius', depth: 0.7, min: 0, max: 1, curve: 'linear', blendMode: 'add' },
          ],
        },
      ],
    })

    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())

    // Select the edge by clicking the routed destination item (the accessible
    // selection path — xyflow's SVG edge is not clickable under happy-dom, but
    // the routed-item click is the same selection action a keyboard/AT user or
    // an agent would use).
    const routedDest = await waitFor(() => {
      const d = container.querySelector(
        '.routing-column--destination .routing-item--routed[data-item-id="fx.blur:radius"]',
      ) as HTMLElement
      expect(d).not.toBeNull()
      return d
    })
    fireEvent.click(routedDest)

    // The edge inspector depth slider should appear.
    const slider = await waitFor(() => {
      const s = container.querySelector('#routing-edge-depth') as HTMLInputElement
      expect(s).not.toBeNull()
      return s
    })

    await act(async () => {
      fireEvent.change(slider, { target: { value: '0.3' } })
      await Promise.resolve()
    })

    // routing_edge_update should have been called, and the store committed.
    const updateCall = sendCommand.mock.calls.find((c) => c[0].cmd === 'routing_edge_update')
    expect(updateCall).toBeTruthy()
    expect(updateCall![0].amount).toBeCloseTo(0.3, 5)
    await waitFor(() => {
      expect(useOperatorStore.getState().operators[0].mappings[0].depth).toBeCloseTo(0.3, 5)
    })
  })

  it('delete removes mapping', async () => {
    useOperatorStore.setState({
      operators: [
        {
          ...makeOperator('op1'),
          mappings: [
            { targetEffectId: 'fx.blur', targetParamKey: 'radius', depth: 0.7, min: 0, max: 1, curve: 'linear', blendMode: 'add' },
          ],
        },
      ],
    })
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    const routedDest = await waitFor(() => {
      const d = container.querySelector(
        '.routing-column--destination .routing-item--routed[data-item-id="fx.blur:radius"]',
      ) as HTMLElement
      expect(d).not.toBeNull()
      return d
    })
    fireEvent.click(routedDest)
    const delBtn = await waitFor(() => {
      const b = container.querySelector('.routing-edge-inspector__delete') as HTMLButtonElement
      expect(b).not.toBeNull()
      return b
    })
    act(() => fireEvent.click(delBtn))
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
  })
})
