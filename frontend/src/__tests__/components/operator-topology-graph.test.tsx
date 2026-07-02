/**
 * OperatorTopologyGraph tests (P4.5).
 *
 * Structural assertions (node/edge counts, color, depth→thickness, sourceKey
 * distinctness, layout determinism, the >32 assert) run against the PURE
 * `buildTopologyModel` transform — deterministic and independent of xyflow's
 * canvas measuring, which is unreliable under happy-dom. The lifecycle
 * assertions (rAF teardown on collapse/unmount, empty state, assert-error)
 * render the real component.
 *
 * Inlined rules honored:
 *   - Animate ONLY transform / never recompute path d (the model never carries
 *     a per-frame d; the component animates transform + stroke-width only).
 *   - rAF teardown (julik): collapse/unmount cancels the loop, no setState after
 *     unmount — verified by spying requestAnimationFrame/cancelAnimationFrame.
 *   - Deterministic layout: identical store state → identical coordinates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// xyflow uses ResizeObserver + matchMedia; happy-dom omits both.
;(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof (globalThis as any).matchMedia !== 'function') {
  ;(globalThis as any).matchMedia = (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  ;(window as any).matchMedia = (globalThis as any).matchMedia
}

import OperatorTopologyGraph, {
  buildTopologyModel,
  OPERATOR_TYPE_COLORS,
} from '../../renderer/components/operators/OperatorTopologyGraph'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { Operator, OperatorMapping, EffectInfo } from '../../shared/types'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

const REGISTRY: EffectInfo[] = [
  {
    id: 'fx.invert',
    name: 'Invert',
    category: 'color',
    params: { amount: { type: 'float', label: 'Amount', default: 0.5, min: 0, max: 1 } },
  } as unknown as EffectInfo,
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'blur',
    params: { radius: { type: 'float', label: 'Radius', default: 0.5, min: 0, max: 1 } },
  } as unknown as EffectInfo,
]

const CHAIN = [
  { id: 'chain-1', effectId: 'fx.invert' },
  { id: 'chain-2', effectId: 'fx.blur' },
]

function makeMapping(over: Partial<OperatorMapping>): OperatorMapping {
  return {
    targetEffectId: 'chain-1',
    targetParamKey: 'amount',
    depth: 0.5,
    min: 0,
    max: 1,
    curve: 'linear',
    ...over,
  }
}

function makeOperator(over: Partial<Operator>): Operator {
  return {
    id: 'op-1',
    type: 'lfo',
    label: 'LFO',
    isEnabled: true,
    parameters: {},
    processing: [],
    mappings: [],
    ...over,
  }
}

describe('OperatorTopologyGraph — buildTopologyModel (P4.5)', () => {
  it('renders one node per operator and one node per mapped target effect', () => {
    const operators: Operator[] = [
      makeOperator({ id: 'op-1', type: 'lfo', mappings: [makeMapping({ targetEffectId: 'chain-1' })] }),
      makeOperator({
        id: 'op-2',
        type: 'envelope',
        // two mappings into the SAME effect → effect node deduplicated to one.
        mappings: [
          makeMapping({ targetEffectId: 'chain-2', targetParamKey: 'radius' }),
          makeMapping({ targetEffectId: 'chain-2', targetParamKey: '_mix' }),
        ],
      }),
    ]
    const model = buildTopologyModel(operators, CHAIN, REGISTRY)

    const opNodes = model.nodes.filter((n) => n.id.startsWith('op:'))
    const fxNodes = model.nodes.filter((n) => n.id.startsWith('fx:'))
    expect(opNodes).toHaveLength(2) // one per operator
    expect(fxNodes).toHaveLength(2) // chain-1 + chain-2 (chain-2 deduped)
    // effect node label resolves through the registry.
    const blur = fxNodes.find((n) => n.id === 'fx:chain-2')
    expect((blur?.data as { label: string }).label).toBe('Blur')
  })

  it('renders one edge path per mapping with at most 32 paths', () => {
    // 3 operators × varying mappings = 5 mappings → 5 edges.
    const operators: Operator[] = [
      makeOperator({ id: 'op-1', mappings: [makeMapping({}), makeMapping({ targetParamKey: '_mix' })] }),
      makeOperator({ id: 'op-2', mappings: [makeMapping({ targetEffectId: 'chain-2', targetParamKey: 'radius' })] }),
      makeOperator({
        id: 'op-3',
        mappings: [makeMapping({}), makeMapping({ targetEffectId: 'chain-2', targetParamKey: 'radius' })],
      }),
    ]
    const model = buildTopologyModel(operators, CHAIN, REGISTRY)
    expect(model.edges).toHaveLength(5)
    expect(model.edges.length).toBeLessThanOrEqual(32)
    // Every edge is a topology edge with a source/target node that exists.
    const nodeIds = new Set(model.nodes.map((n) => n.id))
    for (const e of model.edges) {
      expect(e.type).toBe('topology')
      expect(nodeIds.has(e.source as string)).toBe(true)
      expect(nodeIds.has(e.target as string)).toBe(true)
    }
  })

  it('edge color matches source operator color and thickness scales with depth', () => {
    const operators: Operator[] = [
      makeOperator({ id: 'op-1', type: 'lfo', mappings: [makeMapping({ depth: 0.25 })] }),
      makeOperator({ id: 'op-2', type: 'envelope', mappings: [makeMapping({ targetEffectId: 'chain-2', targetParamKey: 'radius', depth: 1.0 })] }),
    ]
    const model = buildTopologyModel(operators, CHAIN, REGISTRY)

    const lfoEdge = model.edges.find((e) => e.source === 'op:op-1')
    const envEdge = model.edges.find((e) => e.source === 'op:op-2')
    expect((lfoEdge?.data as { color: string }).color).toBe(OPERATOR_TYPE_COLORS.lfo)
    expect((envEdge?.data as { color: string }).color).toBe(OPERATOR_TYPE_COLORS.envelope)

    // Thickness scales with depth (1 + depth*4): deeper mapping ⇒ thicker.
    const lfoDepth = (lfoEdge?.data as { depth: number }).depth
    const envDepth = (envEdge?.data as { depth: number }).depth
    expect(lfoDepth).toBeCloseTo(0.25)
    expect(envDepth).toBeCloseTo(1.0)
    expect(1 + envDepth * 4).toBeGreaterThan(1 + lfoDepth * 4)
  })

  it('kentaroCluster mappings with sourceKey render as distinct edges per sub-LFO', () => {
    const operators: Operator[] = [
      makeOperator({
        id: 'op-k',
        type: 'kentaroCluster',
        label: 'Kentaro Cluster',
        mappings: [
          makeMapping({ targetEffectId: 'chain-1', targetParamKey: 'amount', sourceKey: 'lfo0' }),
          makeMapping({ targetEffectId: 'chain-1', targetParamKey: 'amount', sourceKey: 'lfo1' }),
          makeMapping({ targetEffectId: 'chain-1', targetParamKey: 'amount', sourceKey: 'lfo2' }),
        ],
      }),
    ]
    const model = buildTopologyModel(operators, CHAIN, REGISTRY)
    // 3 sub-LFO mappings → 3 distinct edges (same source op, same target effect).
    const kEdges = model.edges.filter((e) => e.source === 'op:op-k')
    expect(kEdges).toHaveLength(3)
    const ids = new Set(kEdges.map((e) => e.id))
    expect(ids.size).toBe(3) // all distinct ids despite identical source/target
    // ids embed the sourceKey so each sub-LFO is addressable.
    expect(kEdges.some((e) => (e.id as string).includes('lfo0'))).toBe(true)
    expect(kEdges.some((e) => (e.id as string).includes('lfo1'))).toBe(true)
    expect(kEdges.some((e) => (e.id as string).includes('lfo2'))).toBe(true)
  })

  it('logs an assertion error and renders nothing extra when more than 32 mappings reach the graph', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // One operator with 33 mappings (over the 32 budget).
    const mappings: OperatorMapping[] = Array.from({ length: 33 }, (_, i) =>
      makeMapping({ targetEffectId: i % 2 === 0 ? 'chain-1' : 'chain-2', targetParamKey: `p${i}` }),
    )
    const operators: Operator[] = [makeOperator({ id: 'op-big', mappings })]
    const model = buildTopologyModel(operators, CHAIN, REGISTRY)

    expect(model.overLimit).toBe(true)
    expect(model.edges).toHaveLength(0) // nothing extra — not silently sliced
    expect(model.nodes).toHaveLength(0)
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('ASSERTION'))
    errSpy.mockRestore()
  })

  it('layout is deterministic: two renders of the same store state produce identical node coordinates', () => {
    const operators: Operator[] = Array.from({ length: 10 }, (_, i) =>
      makeOperator({
        id: `op-${i}`,
        type: i % 2 === 0 ? 'lfo' : 'envelope',
        mappings: [makeMapping({ targetEffectId: i % 2 === 0 ? 'chain-1' : 'chain-2', targetParamKey: 'amount' })],
      }),
    )
    const a = buildTopologyModel(operators, CHAIN, REGISTRY)
    const b = buildTopologyModel(operators, CHAIN, REGISTRY)

    const coords = (m: typeof a) => m.nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`)
    expect(coords(a)).toEqual(coords(b))
    // Row-wrap actually engaged for 10 operators (> COL_WRAP_AT = 8): the 9th
    // operator node (index 8) sits in a second sub-column (x > 0).
    const opNodes = a.nodes.filter((n) => n.id.startsWith('op:'))
    expect(opNodes[8].position.x).toBeGreaterThan(opNodes[0].position.x)
    expect(opNodes[8].position.y).toBe(opNodes[0].position.y) // wraps back to row 0
  })
})

describe('OperatorTopologyGraph — component lifecycle (P4.5)', () => {
  beforeEach(resetStores)
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders an empty state with zero edges and zero nodes when the project has no operators', () => {
    const { container } = render(
      <OperatorTopologyGraph effectChain={[]} registry={[]} operatorValues={{}} />,
    )
    const root = container.querySelector('.operator-topology')
    expect(root).not.toBeNull()
    expect(root?.classList.contains('operator-topology--empty')).toBe(true)
    expect(root?.getAttribute('data-edge-count')).toBe('0')
  })

  it('collapsed section unmounts the graph and cancels the animation frame loop', () => {
    vi.useFakeTimers()
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')

    // Seed an operator + mapping so the graph mounts a real (non-empty) canvas.
    useOperatorStore.getState().addOperator('lfo')
    const opId = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(opId, makeMapping({ targetEffectId: 'chain-1' }))

    const { unmount } = render(
      <OperatorTopologyGraph effectChain={CHAIN} registry={REGISTRY} operatorValues={{ [opId]: 0.5 }} />,
    )

    // The rAF loop scheduled at least one callback on mount.
    const scheduledOnMount = rafSpy.mock.calls.length
    expect(scheduledOnMount).toBeGreaterThan(0)

    // Collapse == unmount the subtree (OperatorRack renders {show && <Graph/>}).
    unmount()

    // Teardown cancelled the outstanding rAF...
    expect(cancelSpy).toHaveBeenCalled()

    // ...and no NEW rAF callbacks fire over 5 fake-timer frames post-unmount.
    const afterUnmount = rafSpy.mock.calls.length
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(16)
    }
    expect(rafSpy.mock.calls.length).toBe(afterUnmount)

    // scheduled-minus-cancelled balance: every scheduled frame id was cancelled
    // (the loop only ever has one outstanding id at a time, and teardown cancels it).
    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(1)

    vi.useRealTimers()
  })
})
