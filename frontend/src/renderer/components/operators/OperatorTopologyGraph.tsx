/**
 * OperatorTopologyGraph — P4.5 operator→effect routing topology (xyflow).
 *
 * Renders a deterministic, column-laid-out graph of the modulation routing:
 *   - left column  : one node per operator
 *   - right column : one node per *mapped* target effect (deduplicated)
 *   - edges        : one per operator mapping (operator → target effect)
 *
 * Built on @xyflow/react (decided by docs/perf/p4-xyflow-gate-result.md →
 * VERDICT: PASS). The animation contract follows the P4.0 spike
 * (frontend/spike/xyflow-gate/main.tsx): we animate ONLY the `transform` of a
 * wrapper container plus each edge's `stroke-width` imperatively per frame —
 * the edge path `d` strings are computed ONCE by xyflow's getStraightPath and
 * NEVER recomputed during animation. This is what kept p95 frame time well
 * inside the perf budget in the gate.
 *
 * Live edge animation (rule 3 — julik rAF race rules):
 *   - The rAF loop is created in a useEffect, so it only runs while this
 *     component is MOUNTED. OperatorRack unmounts the subtree when the
 *     topology section is collapsed (rule 5), so a collapsed section schedules
 *     ZERO rAF callbacks.
 *   - Latest live operator values arrive via the `operatorValues` prop and are
 *     mirrored into a ref so the loop reads them without re-subscribing /
 *     re-creating the loop on every value change.
 *   - On unmount we cancelAnimationFrame and flip a mounted guard so no stray
 *     callback touches the DOM / state after teardown.
 *
 * Trust boundary: depths are clamped [0,1] and NaN/Inf-guarded before they size
 * any stroke; live signal values are clamped [0,1] before they scale opacity.
 *
 * Edge color = SOURCE OPERATOR color (the OperatorDepthArc color convention is
 * "operator identity → color"; the per-type palette lives in OPERATOR_TYPE_COLORS,
 * shared with RoutingLines' TYPE_COLORS).
 *
 * P5b.24 (B9 routing inspector UI):
 *   - Clicking an edge opens the per-edge inspector: srcAxis/dstAxis pickers,
 *     bindingRule picker, Bitwig-style depth arc. Changes write through the
 *     existing #289 validator (validateMappingForSave / validateModRouteBindingRule).
 *   - Research rules (painted/hilbert/polar/learned) are hidden when
 *     `showResearchRules` is false (the default). The toggle is managed by the
 *     parent (OperatorRack) so the panel stays collapsed by default.
 *   - onCycleSafeCheck is called BEFORE committing any new edge to the store.
 *     If it returns false the add is blocked. This fires cycle_safe_edge_addition
 *     (from backend/src/safety/cycle_detection.py) via the routing_graph_get IPC
 *     (build_graph_from_project + has_cycle — the same path SG-5 uses at render
 *     time). The validation trust boundary is the live IPC + store, NOT the
 *     schema.py deserializer (which is the backend .glitch path, not the live path).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  getStraightPath,
} from '@xyflow/react'
import type { Node, Edge, EdgeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useOperatorStore } from '../../stores/operators'
import type { EffectInfo, Operator } from '../../../shared/types'
import type { Axis, BindingRule } from '../../../shared/axis-binding'
import { resolveModRouteAxes } from '../../../shared/axis-binding'

/**
 * Info block for the per-edge inspector. Emitted by onEdgeSelect.
 * Carries everything the inspector needs to render pickers and commit edits.
 */
export interface EdgeInspectorInfo {
  /** Composite edge id (embeds operatorId, targetEffectId, mappingIndex). */
  edgeId: string
  operatorId: string
  /** Index of this mapping within operator.mappings (stable while inspector open). */
  mappingIndex: number
  targetEffectId: string
  targetParamKey: string
  depth: number
  srcAxis: Axis
  dstAxis: Axis
  bindingRule: BindingRule
}

interface OperatorTopologyGraphProps {
  /** Effect chain entries: `id` is the chain-instance id used by mappings. */
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  /** Live per-operator signal values [0,1], refreshed per render frame. */
  operatorValues: Record<string, number>
  /**
   * P5b.24 (B9): Called when the user clicks an edge. Passes the edge's
   * inspector info (axes, bindingRule, depth, operatorId, mappingIndex) to the
   * parent so it can render the per-edge inspector panel. Pass null to deselect.
   */
  onEdgeSelect?: (info: EdgeInspectorInfo | null) => void
  /**
   * P5b.24 (B9): Pre-flight cycle check. Called BEFORE addMapping is committed.
   * Should serialize the proposed edge into routing_graph_get and return true
   * when the add is safe (no cycle), false to block. If absent, all adds pass.
   */
  onCycleSafeCheck?: (operatorId: string, targetEffectId: string) => Promise<boolean>
  /**
   * P5b.24 (B9): When true, show research binding rules (painted/hilbert/polar/
   * learned) in the inspector's binding-rule picker. Default: false (hidden).
   * The research toggle is managed by OperatorRack and off by default.
   */
  showResearchRules?: boolean
}

/**
 * Per operator-type color. Mirrors RoutingLines.TYPE_COLORS (the established
 * operator-identity → color convention). Centralized here so the topology graph
 * and the legacy routing lines stay visually consistent.
 */
export const OPERATOR_TYPE_COLORS: Record<string, string> = {
  lfo: '#4ade80',
  envelope: '#f59e0b',
  step_sequencer: '#3b82f6',
  audio_follower: '#a855f7',
  video_analyzer: '#ec4899',
  fusion: '#06b6d4',
  kentaroCluster: '#eab308',
  sidechain: '#14b8a6',
  gate: '#f43f5e',
  midiEnvStutter: '#8b5cf6',
}

const DEFAULT_COLOR = '#4ade80'

/** Hard cap — mirrors the spike's proven 32-path budget and the routing cap. */
const MAX_EDGES = 32

// ─── Deterministic column layout geometry ──────────────────────────────────
const NODE_W = 140
const NODE_H = 40
const COL_GAP = 280 // horizontal gap between operator col and effect col
const ROW_GAP = 24 // vertical gap between rows
const COL_WRAP_AT = 8 // wrap a column into a second sub-column past this many

const ROW_PITCH = NODE_H + ROW_GAP

/** Clamp to [0,1], NaN/Inf → 0. Single numeric trust gate for depth/signal. */
function clamp01(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Stroke width from depth: 1px..5px linear over [0,1]. */
function depthToStrokeWidth(depth: number): number {
  return 1 + clamp01(depth) * 4
}

/**
 * Deterministic column position. `index` within the column; columns wrap into
 * a parallel sub-column once they exceed COL_WRAP_AT rows so 8+ operators don't
 * overlap. baseX selects operator (left) vs effect (right) column band.
 */
function columnPosition(index: number, baseX: number): { x: number; y: number } {
  const sub = Math.floor(index / COL_WRAP_AT)
  const row = index % COL_WRAP_AT
  return {
    x: baseX + sub * (NODE_W + 40),
    y: row * ROW_PITCH,
  }
}

interface EdgeData {
  /** Source operator color. */
  color: string
  /** Clamped mapping depth [0,1] → drives base stroke width. */
  depth: number
  /** Operator id — the rAF loop reads its live value to modulate the stroke. */
  operatorId: string
  // P5b.24 (B9): axis-routing fields for the inspector.
  targetEffectId: string
  targetParamKey: string
  mappingIndex: number
  srcAxis: Axis
  dstAxis: Axis
  bindingRule: BindingRule
  [key: string]: unknown
}

/**
 * Per-graph shared mutable ref that carries the onEdgeSelect callback. This
 * avoids threading it through xyflow's `edgeTypes` (the custom edge function
 * is memoized by type key — re-creating it re-mounts every edge). The ref is
 * set once on the outer component and read inside TopologyEdge.
 */
const edgeSelectRef: { current: ((id: string) => void) | null } = { current: null }

/**
 * Custom edge: path `d` computed ONCE via getStraightPath (xyflow recomputes it
 * only when the endpoints move — which never happens here, the layout is
 * static). Stroke width / opacity are seeded from depth; the rAF loop mutates
 * them imperatively via a data-edge-id lookup. We NEVER touch `d` per frame.
 *
 * P5b.24 (B9): clicking the edge path calls edgeSelectRef.current so the
 * parent (OperatorRack) can open the per-edge inspector. The SVG path gets a
 * thick transparent hit area (strokeWidth=12, stroke=transparent) layered
 * behind the visible stroke so small-depth edges remain clickable.
 */
function TopologyEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const d = (data ?? {}) as EdgeData
  const color = d.color ?? DEFAULT_COLOR
  const width = depthToStrokeWidth(d.depth ?? 0)
  const handleClick = () => {
    edgeSelectRef.current?.(id)
  }
  return (
    <>
      {/* Transparent wide hit area — makes thin (low-depth) edges easier to click */}
      <path
        d={edgePath}
        style={{ stroke: 'transparent', strokeWidth: 12, fill: 'none', cursor: 'pointer' }}
        onClick={handleClick}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: color, strokeWidth: width, opacity: 0.5, cursor: 'pointer' }}
        onClick={handleClick}
      />
    </>
  )
}

const edgeTypes = { topology: TopologyEdge }

interface TopologyModel {
  nodes: Node[]
  edges: Edge[]
  /** True when more than MAX_EDGES mappings reached the graph (assert state). */
  overLimit: boolean
  edgeCount: number
}

/**
 * Pure, deterministic transform: operators + their mapped target effects →
 * xyflow nodes/edges. No store / DOM access — given identical operators it
 * always produces identical coordinates (layout determinism test relies on it).
 */
export function buildTopologyModel(
  operators: Operator[],
  effectChain: { id: string; effectId: string }[],
  registry: EffectInfo[],
): TopologyModel {
  const activeOps = operators.filter((o) => o.isEnabled || o.mappings.length > 0)

  // Collect mappings in deterministic order (operator order, then mapping order).
  const rawEdges: {
    operatorId: string
    color: string
    depth: number
    targetEffectId: string
    targetParamKey: string
    sourceKey?: string
    mappingIndex: number
    srcAxis: Axis
    dstAxis: Axis
    bindingRule: BindingRule
  }[] = []

  for (const op of activeOps) {
    const color = OPERATOR_TYPE_COLORS[op.type] ?? DEFAULT_COLOR
    op.mappings.forEach((m, mi) => {
      const axes = resolveModRouteAxes(m)
      rawEdges.push({
        operatorId: op.id,
        color,
        depth: clamp01(m.depth),
        targetEffectId: m.targetEffectId,
        targetParamKey: m.targetParamKey,
        sourceKey: m.sourceKey,
        mappingIndex: mi,
        srcAxis: axes.srcAxis,
        dstAxis: axes.dstAxis,
        bindingRule: axes.bindingRule,
      })
    })
  }

  const overLimit = rawEdges.length > MAX_EDGES

  // ASSERT + render nothing extra: when more than 32 mappings reach the graph
  // we do NOT silently slice — we log an assertion error and emit zero edges
  // (and zero nodes) so the over-budget state is visually + programmatically
  // obvious rather than a quietly-truncated graph.
  if (overLimit) {
    // eslint-disable-next-line no-console
    console.error(
      `[OperatorTopologyGraph] ASSERTION: ${rawEdges.length} mappings exceed the ` +
        `${MAX_EDGES}-edge budget. Rendering nothing extra (zero edges).`,
    )
    return { nodes: [], edges: [], overLimit: true, edgeCount: rawEdges.length }
  }

  // Operator nodes (left column), in operator order.
  const opNodes: Node[] = activeOps.map((op, i) => {
    const pos = columnPosition(i, 0)
    return {
      id: `op:${op.id}`,
      position: pos,
      data: { label: op.label },
      style: {
        width: NODE_W,
        height: NODE_H,
        fontSize: 11,
        borderColor: OPERATOR_TYPE_COLORS[op.type] ?? DEFAULT_COLOR,
      },
      draggable: false,
      selectable: false,
    }
  })

  // Mapped target-effect nodes (right column), deduplicated by targetEffectId,
  // in first-seen deterministic order.
  const effectOrder: string[] = []
  const seenEffects = new Set<string>()
  for (const e of rawEdges) {
    if (!seenEffects.has(e.targetEffectId)) {
      seenEffects.add(e.targetEffectId)
      effectOrder.push(e.targetEffectId)
    }
  }

  const effectLabel = (targetEffectId: string): string => {
    const entry = effectChain.find((c) => c.id === targetEffectId)
    if (entry) {
      const info = registry.find((r) => r.id === entry.effectId)
      if (info) return info.name
    }
    // Namespaced synthetic targets (mask./sampler.) or unknown — show raw id.
    return targetEffectId
  }

  const fxNodes: Node[] = effectOrder.map((targetEffectId, i) => {
    const pos = columnPosition(i, COL_GAP)
    return {
      id: `fx:${targetEffectId}`,
      position: pos,
      data: { label: effectLabel(targetEffectId) },
      style: { width: NODE_W, height: NODE_H, fontSize: 11 },
      draggable: false,
      selectable: false,
    }
  })

  // Edges: one per mapping. kentaroCluster mappings with a sourceKey become a
  // distinct edge per sub-LFO because the edge id embeds the sourceKey.
  const edges: Edge[] = rawEdges.map((e) => {
    const idParts = [e.operatorId, e.targetEffectId, e.sourceKey ?? '_master', String(e.mappingIndex)]
    return {
      id: `e:${idParts.join('|')}`,
      source: `op:${e.operatorId}`,
      target: `fx:${e.targetEffectId}`,
      type: 'topology',
      data: {
        color: e.color,
        depth: e.depth,
        operatorId: e.operatorId,
        targetEffectId: e.targetEffectId,
        targetParamKey: e.targetParamKey,
        mappingIndex: e.mappingIndex,
        srcAxis: e.srcAxis,
        dstAxis: e.dstAxis,
        bindingRule: e.bindingRule,
      } satisfies EdgeData,
    }
  })

  return {
    nodes: [...opNodes, ...fxNodes],
    edges,
    overLimit: false,
    edgeCount: edges.length,
  }
}

export default function OperatorTopologyGraph({
  effectChain,
  registry,
  operatorValues,
  onEdgeSelect,
  showResearchRules,
}: OperatorTopologyGraphProps) {
  const operators = useOperatorStore((s) => s.operators)

  const model = useMemo(
    () => buildTopologyModel(operators, effectChain, registry),
    [operators, effectChain, registry],
  )

  // P5b.24 (B9): wire the edge selection callback into the module-level ref so
  // TopologyEdge can call it without a prop-drill through xyflow's edgeTypes.
  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      if (!onEdgeSelect) return
      const edge = model.edges.find((e) => e.id === edgeId)
      if (!edge) return
      const d = (edge.data ?? {}) as EdgeData
      onEdgeSelect({
        edgeId,
        operatorId: d.operatorId,
        mappingIndex: d.mappingIndex,
        targetEffectId: d.targetEffectId,
        targetParamKey: d.targetParamKey,
        depth: d.depth,
        srcAxis: d.srcAxis,
        dstAxis: d.dstAxis,
        bindingRule: d.bindingRule,
      })
    },
    [model.edges, onEdgeSelect],
  )

  // Keep the module-level ref in sync so TopologyEdge can call it.
  edgeSelectRef.current = handleEdgeClick

  // Live values mirror — read by the rAF loop without re-subscribing.
  const valuesRef = useRef<Record<string, number>>(operatorValues)
  valuesRef.current = operatorValues

  // Edge metadata for the loop (operatorId + base depth per edge id).
  const edgeMetaRef = useRef<{ id: string; operatorId: string; depth: number }[]>([])
  edgeMetaRef.current = model.edges.map((e) => {
    const d = (e.data ?? {}) as EdgeData
    return { id: e.id, operatorId: d.operatorId, depth: d.depth }
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const mountedRef = useRef(true)
  const t0Ref = useRef(0)

  // rAF animation loop — created ONLY while mounted (collapsed section unmounts
  // this component → zero scheduled callbacks). Animates the wrapper transform
  // and each edge's stroke-width/opacity imperatively. NEVER recomputes path d.
  useEffect(() => {
    mountedRef.current = true
    t0Ref.current = performance.now()

    const animate = () => {
      if (!mountedRef.current) return
      const elapsed = (performance.now() - t0Ref.current) / 1000

      // Subtle wrapper "breathing" transform — proves transform-only animation
      // and keeps the GPU layer warm without recomputing geometry.
      if (containerRef.current) {
        const dx = Math.sin(elapsed * 0.4) * 1.5
        const dy = Math.cos(elapsed * 0.3) * 1
        containerRef.current.style.transform = `translate(${dx}px, ${dy}px)`
      }

      // Modulate each edge's stroke-width from its source operator's LIVE value.
      // xyflow renders each edge as a `.react-flow__edge` group carrying
      // `data-id="<edgeId>"`, with the drawn `<path class="react-flow__edge-path">`
      // inside it. We resolve the path via the group's data-id (robust across
      // xyflow internals) and mutate ONLY stroke-width/opacity — never `d`.
      const root = containerRef.current
      if (root) {
        for (const meta of edgeMetaRef.current) {
          const signal = clamp01(valuesRef.current[meta.operatorId] ?? 0)
          const base = depthToStrokeWidth(meta.depth)
          // Live signal swells the stroke up to +3px and drives opacity.
          const w = base + signal * 3
          const group = root.querySelector<SVGGElement>(
            `.react-flow__edge[data-id="${cssEscape(meta.id)}"]`,
          )
          const el =
            group?.querySelector<SVGPathElement>('.react-flow__edge-path') ??
            root.querySelector<SVGPathElement>(`path[data-id="${cssEscape(meta.id)}"]`)
          if (el) {
            el.style.strokeWidth = String(w)
            el.style.opacity = String(0.35 + signal * 0.6)
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      mountedRef.current = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Empty state: no operators / no mappings → zero nodes, zero edges.
  if (model.nodes.length === 0 && model.edges.length === 0) {
    return (
      <div className="operator-topology operator-topology--empty" data-edge-count={0}>
        <span className="operator-topology__hint">
          {model.overLimit
            ? 'Too many routings to display (over 32).'
            : 'No operator routings yet — map an operator to an effect param.'}
        </span>
      </div>
    )
  }

  return (
    <div className="operator-topology" data-edge-count={model.edgeCount}>
      <div ref={containerRef} className="operator-topology__canvas">
        <ReactFlowProvider>
          <ReactFlow
            nodes={model.nodes}
            edges={model.edges}
            edgeTypes={edgeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

/**
 * Minimal CSS.escape shim for attribute selectors (edge ids contain `|`, `:`).
 * happy-dom / jsdom may not expose CSS.escape in every version.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/["\\\]\[:|.#>+~*^$=()]/g, '\\$&')
}
