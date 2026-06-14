/**
 * P6.10 (I2) — Routing Canvas degenerate payloads (negative pair + cap).
 *
 * Named tests (packet TEST PLAN — routing-canvas-degenerate.test.tsx):
 *   - empty graph renders empty-state message not crash  (NEGATIVE)
 *   - orphan edge in payload skipped (defense-in-depth)   (NEGATIVE)
 *   - payload over 1000 edges truncated with banner       (cap)
 *
 * Inlined rules:
 *   - Rule 4 (Wiring Check / pointer hygiene): empty project → empty canvas, no
 *     crash, controls disabled.
 *   - CANVAS_MAX_EDGES = 1000 hard cap (packet step 7).
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

import { render, cleanup, waitFor } from '@testing-library/react'
import RoutingCanvas, {
  buildFlowModel,
} from '../../../renderer/components/routing-canvas/RoutingCanvas'
import { CANVAS_MAX_EDGES } from '../../../renderer/components/routing-canvas/routing-graph-ipc'
import type { RoutingGraph } from '../../../renderer/components/routing-canvas/routing-graph-ipc'
import { useOperatorStore } from '../../../renderer/stores/operators'
import { useAutomationStore } from '../../../renderer/stores/automation'
import { useEffectsStore } from '../../../renderer/stores/effects'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'

function resetAll() {
  useOperatorStore.getState().resetOperators()
  useAutomationStore.getState().resetAutomation()
  useEffectsStore.setState({ registry: [] })
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  sendCommand.mockReset()
}

beforeEach(resetAll)
afterEach(cleanup)

describe('RoutingCanvas — degenerate payloads', () => {
  it('NEGATIVE: empty graph renders empty-state, no crash, controls disabled', async () => {
    sendCommand.mockResolvedValue({ ok: true, nodes: [], edges: [], hasCycle: false, cycleNodeIds: [] })
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    await waitFor(() =>
      expect(container.querySelector('[data-testid="routing-empty-state"]')).not.toBeNull(),
    )
    // Source search input disabled in the empty state.
    const srcSearch = container.querySelector(
      '.routing-column--source .routing-column__search-input',
    ) as HTMLInputElement
    expect(srcSearch.disabled).toBe(true)
    // The edge inspector shows its empty hint, not a crash.
    expect(container.querySelector('.routing-edge-inspector--empty')).not.toBeNull()
  })

  it('NEGATIVE: missing bridge → empty graph, no crash', async () => {
    // Simulate no sendCommand bridge.
    const saved = (window as any).entropic
    ;(window as any).entropic = {}
    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() =>
      expect(container.querySelector('[data-testid="routing-empty-state"]')).not.toBeNull(),
    )
    ;(window as any).entropic = saved
  })

  it('NEGATIVE: orphan node id in an edge is skipped, label falls back to id', () => {
    // An edge references a dst node that is NOT in nodes[] — buildFlowModel must
    // still produce a node slot (label = id) and not throw (defense-in-depth even
    // though P6.9 drops orphans server-side).
    const graph: RoutingGraph = {
      nodes: [{ id: 'op:op1', kind: 'operator', label: 'LFO', trackId: null }],
      edges: [
        { id: 'op-edge:op1:fx.ghost:radius', srcId: 'op:op1', dstId: 'fx:t1:fx.ghost', dstParam: 'radius', amount: 0.5 },
      ],
      hasCycle: false,
      cycleNodeIds: [],
    }
    const model = buildFlowModel(graph, null)
    expect(model.truncated).toBe(false)
    expect(model.edges).toHaveLength(1)
    // The orphan dst node gets a slot with its id as the label fallback.
    const dst = model.nodes.find((n) => n.id === 'fx:t1:fx.ghost')
    expect(dst).toBeTruthy()
    expect((dst!.data as any).label).toBe('fx:t1:fx.ghost')
  })

  it('payload over 1000 edges truncated with banner (cap)', async () => {
    const nodes: any[] = []
    const edges: any[] = []
    const n = CANVAS_MAX_EDGES + 50
    for (let i = 0; i < n; i++) {
      nodes.push({ id: `op:o${i}`, kind: 'operator', label: `O${i}`, trackId: null })
      nodes.push({ id: `fx:t:e${i}`, kind: 'effect', label: `E${i}`, trackId: 't' })
      edges.push({ id: `op-edge:o${i}:e${i}:p`, srcId: `op:o${i}`, dstId: `fx:t:e${i}`, dstParam: 'p', amount: 0.5 })
    }
    sendCommand.mockResolvedValue({ ok: true, nodes, edges, hasCycle: false, cycleNodeIds: [] })

    const { container } = render(<RoutingCanvas open onClose={() => {}} />)
    await waitFor(() => expect(sendCommand).toHaveBeenCalled())
    await waitFor(() => {
      const banner = container.querySelector('.routing-canvas__banner')
      expect(banner?.textContent).toContain(String(CANVAS_MAX_EDGES))
    })
  })

  it('buildFlowModel caps rendered edges at CANVAS_MAX_EDGES', () => {
    const nodes: any[] = []
    const edges: any[] = []
    const n = CANVAS_MAX_EDGES + 10
    for (let i = 0; i < n; i++) {
      nodes.push({ id: `op:o${i}`, kind: 'operator', label: `O${i}`, trackId: null })
      nodes.push({ id: `fx:t:e${i}`, kind: 'effect', label: `E${i}`, trackId: 't' })
      edges.push({ id: `op-edge:o${i}:e${i}:p`, srcId: `op:o${i}`, dstId: `fx:t:e${i}`, dstParam: 'p', amount: 0.5 })
    }
    const model = buildFlowModel({ nodes, edges, hasCycle: false, cycleNodeIds: [] }, null)
    expect(model.truncated).toBe(true)
    expect(model.edges.length).toBe(CANVAS_MAX_EDGES)
  })
})
