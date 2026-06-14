/**
 * P6.10 (I2) — Routing Canvas modal overlay (⌘⇧I).
 *
 * Vision I2 Surface B: a modal overlay with three columns —
 *   sources (operators + lanes) · graph (xyflow) · destinations (effect params)
 * Bright items are routed, dim items are available. Dragging an operator source
 * onto a destination creates an operator mapping (undoable, via the store — the
 * graph is a PROJECTION, rule 3). A bottom edge-inspector strip exposes
 * depth / polarity / delete (curve / lag / axis-binding are DEFERRED to B4-full).
 *
 * ── Research Gate (CLAUDE.md rule 15 / Rule 1.5) ──────────────────────────────
 * xyflow read-only edge rendering follows the P4.5 reference implementation
 * (OperatorTopologyGraph.tsx): a deterministic column layout, custom BaseEdge
 * whose `d` is computed ONCE via getStraightPath (endpoints are static so xyflow
 * never recomputes), nodesDraggable / nodesConnectable / elementsSelectable all
 * OFF, panOnDrag / zoomOnScroll OFF, hideAttribution. Edge selection is a click
 * on the edge group (data-id lookup), not xyflow's selection model — same as the
 * topology graph keeps its render deterministic. Drag-to-CONNECT is native HTML5
 * DnD between the columns (the established ParamPanel param-probe drag pattern),
 * NOT xyflow handle-connect — so xyflow stays a pure visualizer.
 *
 * ── Race hygiene (rule 6 / julik async-overlay rules) ─────────────────────────
 * The graph fetch is generation-guarded: a fetch started for an open overlay is
 * dropped if the overlay closed or a newer fetch superseded it before it
 * resolved (no setState after unmount, no stale-graph flash). All listeners /
 * the fetch guard are torn down on unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  getStraightPath,
} from '@xyflow/react'
import type { Node, Edge, EdgeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useOperatorStore } from '../../stores/operators'
import { useAutomationStore } from '../../stores/automation'
import { useEffectsStore } from '../../stores/effects'
import { useTimelineStore } from '../../stores/timeline'
import type { OperatorMapping, CurveType } from '../../../shared/types'

import NodeColumn from './NodeColumn'
import type { ColumnItem, RoutingSourceDragPayload } from './NodeColumn'
import EdgeInspector from './EdgeInspector'
import {
  CANVAS_MAX_EDGES,
  buildRoutingGraphPayload,
  enumerateDestinations,
  fetchRoutingGraph,
  validateEdgeUpdate,
} from './routing-graph-ipc'
import type { RoutingGraph, RoutingEdge, RoutingNode } from './routing-graph-ipc'

interface RoutingCanvasProps {
  open: boolean
  onClose: () => void
}

const EMPTY_GRAPH: RoutingGraph = {
  nodes: [],
  edges: [],
  hasCycle: false,
  cycleNodeIds: [],
}

const DEFAULT_CURVE: CurveType = 'linear'

/** Clamp to [-1, 1], NaN/Inf → 0. Single numeric trust gate for amounts. */
function clampAmount(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < -1) return -1
  if (value > 1) return 1
  return value
}

// ─── Deterministic column layout for the xyflow visualization ────────────────
const NODE_W = 150
const NODE_H = 34
const COL_GAP = 320
const ROW_PITCH = NODE_H + 18

function leftPos(index: number): { x: number; y: number } {
  return { x: 0, y: index * ROW_PITCH }
}
function rightPos(index: number): { x: number; y: number } {
  return { x: COL_GAP, y: index * ROW_PITCH }
}

interface CanvasEdgeData {
  selected: boolean
  [key: string]: unknown
}

/** Custom edge: path `d` computed ONCE (static endpoints — never recomputed). */
function CanvasEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const d = (data ?? {}) as CanvasEdgeData
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: d.selected ? '#fbbf24' : '#4ade80',
        strokeWidth: d.selected ? 3 : 1.5,
        opacity: d.selected ? 1 : 0.55,
      }}
    />
  )
}

const edgeTypes = { canvas: CanvasEdge }

/**
 * Build the deterministic xyflow node/edge model from a RoutingGraph.
 * Exported for unit tests (truncation cap + orphan-node skip).
 */
export function buildFlowModel(
  graph: RoutingGraph,
  selectedEdgeId: string | null,
): { nodes: Node[]; edges: Edge[]; truncated: boolean } {
  // Only nodes that participate in an edge get a column slot (the canvas centre
  // is the WIRING view, not the full browse list — the columns are the browse).
  const srcIds: string[] = []
  const dstIds: string[] = []
  const seenSrc = new Set<string>()
  const seenDst = new Set<string>()

  const truncated = graph.edges.length > CANVAS_MAX_EDGES
  const edgesToRender = truncated ? graph.edges.slice(0, CANVAS_MAX_EDGES) : graph.edges

  for (const e of edgesToRender) {
    if (!seenSrc.has(e.srcId)) {
      seenSrc.add(e.srcId)
      srcIds.push(e.srcId)
    }
    if (!seenDst.has(e.dstId)) {
      seenDst.add(e.dstId)
      dstIds.push(e.dstId)
    }
  }

  const nodeLabel = (id: string): string =>
    graph.nodes.find((n) => n.id === id)?.label ?? id

  const nodes: Node[] = [
    ...srcIds.map((id, i) => ({
      id,
      position: leftPos(i),
      data: { label: nodeLabel(id) },
      style: { width: NODE_W, height: NODE_H, fontSize: 11 },
      draggable: false,
      selectable: false,
    })),
    ...dstIds.map((id, i) => ({
      id,
      position: rightPos(i),
      data: { label: nodeLabel(id) },
      style: { width: NODE_W, height: NODE_H, fontSize: 11 },
      draggable: false,
      selectable: false,
    })),
  ]

  const edges: Edge[] = edgesToRender.map((e) => ({
    id: e.id,
    source: e.srcId,
    target: e.dstId,
    type: 'canvas',
    data: { selected: e.id === selectedEdgeId } satisfies CanvasEdgeData,
  }))

  return { nodes, edges, truncated }
}

export default function RoutingCanvas({ open, onClose }: RoutingCanvasProps) {
  const operators = useOperatorStore((s) => s.operators)
  const lanesByTrack = useAutomationStore((s) => s.lanes)
  const registry = useEffectsStore((s) => s.registry)
  const tracks = useTimelineStore((s) => s.tracks)

  const [graph, setGraph] = useState<RoutingGraph>(EMPTY_GRAPH)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [destSearch, setDestSearch] = useState('')

  // Generation guard: only the most recent fetch for an OPEN overlay may commit.
  const genRef = useRef(0)
  const mountedRef = useRef(true)

  // Build the request payload from the live stores (pure).
  const payload = useMemo(
    () => buildRoutingGraphPayload(operators, lanesByTrack, tracks),
    [operators, lanesByTrack, tracks],
  )

  const destinations = useMemo(
    () => enumerateDestinations(tracks, registry),
    [tracks, registry],
  )

  // Fetch the graph whenever the overlay opens OR the underlying stores change
  // while it is open (a created/deleted mapping re-projects the graph).
  const refetch = useCallback(async () => {
    const gen = ++genRef.current
    const result = await fetchRoutingGraph(payload)
    // Drop the result if the overlay closed or a newer fetch superseded us.
    if (!mountedRef.current || gen !== genRef.current || !open) return
    setGraph(result)
  }, [payload, open])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Invalidate any in-flight fetch so it cannot setState after unmount.
      genRef.current++
    }
  }, [])

  useEffect(() => {
    if (!open) {
      // Closing: invalidate in-flight fetch + reset transient UI state.
      genRef.current++
      setSelectedEdgeId(null)
      return
    }
    refetch()
  }, [open, refetch])

  // Escape closes (capture phase so it beats the global Escape dispatcher).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // ── Derived: routed-source / routed-dest id sets for bright/dim ─────────────
  const routedSrcIds = useMemo(
    () => new Set(graph.edges.map((e) => e.srcId)),
    [graph.edges],
  )
  const routedDestKeys = useMemo(() => {
    // A destination param is "routed" when an edge targets its effect+param.
    // Edge dstId is "fx:{track}:{effect}"; recover the effectId for the key.
    const keys = new Set<string>()
    for (const e of graph.edges) {
      const node = graph.nodes.find((n) => n.id === e.dstId)
      if (!node) continue
      // dstId form: fx:{trackId}:{effectId} → split on first two colons.
      const parts = e.dstId.split(':')
      const effectId = parts.length >= 3 ? parts.slice(2).join(':') : ''
      if (effectId) keys.add(`${effectId}:${e.dstParam}`)
    }
    return keys
  }, [graph.edges, graph.nodes])

  // ── Source column items (operators + lanes) ─────────────────────────────────
  const sourceItems = useMemo<ColumnItem[]>(() => {
    const items: ColumnItem[] = []
    for (const node of graph.nodes) {
      if (node.kind !== 'operator' && node.kind !== 'lane') continue
      items.push({
        id: node.id,
        label: node.label,
        group: node.kind === 'operator' ? 'Operators' : 'Lanes',
        routed: routedSrcIds.has(node.id),
        kind: node.kind,
      })
    }
    return items
  }, [graph.nodes, routedSrcIds])

  // ── Destination column items (effect params from the live chains) ───────────
  const destItems = useMemo<ColumnItem[]>(
    () =>
      destinations.map((d) => ({
        id: d.key,
        label: `${d.effectName} · ${d.paramKey}`,
        group: d.category,
        routed: routedDestKeys.has(d.key),
        effectId: d.effectId,
        paramKey: d.paramKey,
      })),
    [destinations, routedDestKeys],
  )

  // ── Selected edge ───────────────────────────────────────────────────────────
  const selectedEdge: RoutingEdge | null = useMemo(
    () => graph.edges.find((e) => e.id === selectedEdgeId) ?? null,
    [graph.edges, selectedEdgeId],
  )
  const selectedEditable = selectedEdge?.id.startsWith('op-edge:') ?? false

  const nodeById = useCallback(
    (id: string): RoutingNode | undefined => graph.nodes.find((n) => n.id === id),
    [graph.nodes],
  )

  // Select an edge by clicking a routed column item (accessible alternative to
  // clicking the SVG edge — keyboard / AT / agent parity). A routed destination
  // resolves to the edge whose dstParam + effect match; a routed source to its
  // first outgoing edge.
  const handleSelectItem = useCallback(
    (item: ColumnItem) => {
      let edge: RoutingEdge | undefined
      if (item.effectId && item.paramKey) {
        edge = graph.edges.find((e) => {
          const parts = e.dstId.split(':')
          const eff = parts.length >= 3 ? parts.slice(2).join(':') : ''
          return eff === item.effectId && e.dstParam === item.paramKey
        })
      } else {
        edge = graph.edges.find((e) => e.srcId === item.id)
      }
      if (edge) setSelectedEdgeId(edge.id)
    },
    [graph.edges],
  )

  // ── Drag source → destination: create a mapping (undoable) ──────────────────
  const handleDropOnDestination = useCallback(
    (source: RoutingSourceDragPayload, dest: ColumnItem) => {
      if (!dest.effectId || !dest.paramKey) return
      const op = useOperatorStore.getState().operators.find((o) => o.id === source.operatorId)
      if (!op) return
      // Idempotent: don't create a duplicate of an existing mapping.
      const exists = op.mappings.some(
        (m) => m.targetEffectId === dest.effectId && m.targetParamKey === dest.paramKey,
      )
      if (exists) {
        setSelectedEdgeId(`op-edge:${source.operatorId}:${dest.effectId}:${dest.paramKey}`)
        return
      }
      const mapping: OperatorMapping = {
        targetEffectId: dest.effectId,
        targetParamKey: dest.paramKey,
        depth: 1.0,
        min: 0,
        max: 1,
        curve: DEFAULT_CURVE,
        blendMode: 'add',
      }
      useOperatorStore.getState().addMapping(source.operatorId, mapping)
      setSelectedEdgeId(`op-edge:${source.operatorId}:${dest.effectId}:${dest.paramKey}`)
      // Stores changed → payload memo changes → refetch fires via the open effect.
    },
    [],
  )

  // ── Edge inspector handlers ─────────────────────────────────────────────────
  /** Locate the (operatorId, mappingIndex) backing an op edge, or null. */
  const findMapping = useCallback(
    (edge: RoutingEdge): { operatorId: string; index: number } | null => {
      if (!edge.id.startsWith('op-edge:')) return null
      const remainder = edge.id.slice('op-edge:'.length)
      const parts = remainder.split(':')
      if (parts.length < 3) return null
      const operatorId = parts[0]
      const effectId = parts[1]
      const paramKey = parts.slice(2).join(':')
      const op = useOperatorStore.getState().operators.find((o) => o.id === operatorId)
      if (!op) return null
      const index = op.mappings.findIndex(
        (m) => m.targetEffectId === effectId && m.targetParamKey === paramKey,
      )
      if (index < 0) return null
      return { operatorId, index }
    },
    [],
  )

  const handleDepthChange = useCallback(
    async (edge: RoutingEdge, amount: number) => {
      const target = findMapping(edge)
      if (!target) return
      const clamped = clampAmount(amount)
      // Optimistic local-view update so the slider feels live; the store commit
      // re-projects via refetch. Validate via P6.9 IPC first (range + edge id).
      setGraph((g) => ({
        ...g,
        edges: g.edges.map((e) => (e.id === edge.id ? { ...e, amount: clamped } : e)),
      }))
      const result = await validateEdgeUpdate(edge.id, clamped, payload)
      if (!mountedRef.current || !open) return
      if (result) {
        useOperatorStore
          .getState()
          .updateMapping(target.operatorId, target.index, { depth: result.amount })
      }
    },
    [findMapping, payload, open],
  )

  const handlePolarityToggle = useCallback(
    (edge: RoutingEdge) => {
      void handleDepthChange(edge, -clampAmount(edge.amount))
    },
    [handleDepthChange],
  )

  const handleDelete = useCallback(
    (edge: RoutingEdge) => {
      const target = findMapping(edge)
      if (!target) return
      useOperatorStore.getState().removeMapping(target.operatorId, target.index)
      setSelectedEdgeId(null)
    },
    [findMapping],
  )

  // ── xyflow model (read-only visualization) ──────────────────────────────────
  const flow = useMemo(
    () => buildFlowModel(graph, selectedEdgeId),
    [graph, selectedEdgeId],
  )

  if (!open) return null

  const isEmpty = graph.nodes.length === 0 && graph.edges.length === 0

  return (
    <div
      className="routing-canvas-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Routing Canvas"
      data-testid="routing-canvas"
      onMouseDown={(e) => {
        // Click on the backdrop (not the panel) closes.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="routing-canvas" data-empty={isEmpty}>
        <div className="routing-canvas__titlebar">
          <span className="routing-canvas__title">
            ◉ Routing Canvas — drag source → destination to map
          </span>
          <div className="routing-canvas__titlebar-actions">
            <span className="routing-canvas__stat">
              {sourceItems.length} sources · {destItems.length} destinations ·{' '}
              {graph.edges.length} routes
            </span>
            <button
              type="button"
              className="routing-canvas__close"
              aria-label="Close routing canvas"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {flow.truncated && (
          <div className="routing-canvas__banner" role="alert">
            graph too large — showing first {CANVAS_MAX_EDGES} edges
          </div>
        )}
        {graph.hasCycle && (
          <div className="routing-canvas__banner routing-canvas__banner--warn" role="alert">
            cycle detected in routing — {graph.cycleNodeIds.length} node(s) involved
          </div>
        )}

        <div className="routing-canvas__body">
          <NodeColumn
            side="source"
            title="Sources"
            items={sourceItems}
            search={sourceSearch}
            onSearchChange={setSourceSearch}
            disabled={isEmpty}
            onSelectItem={handleSelectItem}
          />

          <div className="routing-canvas__graph">
            {isEmpty ? (
              <div className="routing-canvas__empty-state" data-testid="routing-empty-state">
                no routings yet — drag an operator onto a destination param to map
              </div>
            ) : (
              <ReactFlowProvider>
                <ReactFlow
                  nodes={flow.nodes}
                  edges={flow.edges}
                  edgeTypes={edgeTypes}
                  fitView
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={false}
                  zoomOnScroll={false}
                  preventScrolling={false}
                  proOptions={{ hideAttribution: true }}
                  onEdgeClick={(_e, edge) => setSelectedEdgeId(edge.id)}
                />
              </ReactFlowProvider>
            )}
          </div>

          <NodeColumn
            side="destination"
            title="Destinations"
            items={destItems}
            search={destSearch}
            onSearchChange={setDestSearch}
            disabled={isEmpty && destItems.length === 0}
            onDropOnDestination={handleDropOnDestination}
            onSelectItem={handleSelectItem}
          />
        </div>

        <EdgeInspector
          edge={selectedEdge}
          sourceLabel={selectedEdge ? nodeById(selectedEdge.srcId)?.label ?? selectedEdge.srcId : ''}
          destLabel={selectedEdge ? nodeById(selectedEdge.dstId)?.label ?? selectedEdge.dstId : ''}
          editable={selectedEditable}
          onDepthChange={handleDepthChange}
          onPolarityToggle={handlePolarityToggle}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
