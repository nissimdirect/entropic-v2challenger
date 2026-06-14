/**
 * P6.10 (I2) — Routing Canvas data layer.
 *
 * The graph is a PROJECTION (rule 3): the operator store mappings + automation
 * lanes are the SOLE sources of truth. This module:
 *   - assembles the `routing_graph_get` payload from the live stores,
 *   - fetches the serialized RoutingGraph (P6.9 backend), and
 *   - validates a depth change via `routing_edge_update` (P6.9 backend) so the
 *     frontend can commit the decomposed mapping back to its store.
 *
 * Edge CREATION is NOT an IPC call — it goes straight through
 * `useOperatorStore.addMapping` (undoable). `routing_edge_update` only validates
 * a depth/polarity change on an existing `op-edge:` edge and returns the
 * decomposed mapping fields; the store remains the authority (P6.9 contract).
 */

import type { Operator, AutomationLane, EffectInfo, Track } from '../../../shared/types'

/** Hard cap on edges the canvas will lay out (packet step 7). */
export const CANVAS_MAX_EDGES = 1000

/** Node kinds emitted by the backend projection (graph_sync.NodeKind). */
export type RoutingNodeKind = 'operator' | 'effect' | 'lane'

/** One serialized graph node (camelCase wire format from serialize_graph). */
export interface RoutingNode {
  id: string
  kind: RoutingNodeKind
  label: string
  trackId: string | null
}

/** One serialized graph edge (camelCase wire format from serialize_graph). */
export interface RoutingEdge {
  id: string
  srcId: string
  dstId: string
  dstParam: string
  amount: number
}

/** The serialized RoutingGraph reply (P6.9 `routing_graph_get`). */
export interface RoutingGraph {
  nodes: RoutingNode[]
  edges: RoutingEdge[]
  hasCycle: boolean
  cycleNodeIds: string[]
}

/** The shape of the `routing_graph_get` request payload. */
export interface RoutingGraphPayload {
  cmd: 'routing_graph_get'
  operators: Record<string, unknown>[]
  lanesByTrack: Record<string, unknown[]>
  chainByTrack: Record<string, unknown[]>
}

/** Decomposed mapping returned by `routing_edge_update` on success. */
export interface RoutingEdgeUpdateResult {
  ok: true
  edgeId: string
  amount: number
  operatorId: string
  targetEffectId: string
  targetParamKey: string
}

const EMPTY_GRAPH: RoutingGraph = {
  nodes: [],
  edges: [],
  hasCycle: false,
  cycleNodeIds: [],
}

function bridge(): Window['entropic'] | null {
  return typeof window !== 'undefined' && window.entropic ? window.entropic : null
}

/**
 * Serialize one operator to the backend (snake_case) shape `routing_graph_get`
 * expects. Mirrors operators.getSerializedOperators() but inlined so the canvas
 * never depends on render-loop internals.
 */
function serializeOperator(op: Operator): Record<string, unknown> {
  return {
    id: op.id,
    type: op.type,
    label: op.label,
    is_enabled: op.isEnabled,
    mappings: op.mappings.map((m) => ({
      target_effect_id: m.targetEffectId,
      target_param_key: m.targetParamKey,
      depth: m.depth,
      ...(m.sourceKey ? { source_key: m.sourceKey } : {}),
    })),
  }
}

/**
 * Build the `routing_graph_get` payload from the live stores. Pure: given the
 * same store snapshots it always yields the same payload (no DOM / no IPC).
 *
 * - operators: serialized operator configs (sources + their mapping edges)
 * - lanesByTrack: track_id -> automation lanes (lane sources + lane→param edges)
 * - chainByTrack: track_id -> effect chain (validates edge endpoints + provides
 *   the destination effect nodes)
 */
export function buildRoutingGraphPayload(
  operators: Operator[],
  lanesByTrack: Record<string, AutomationLane[]>,
  tracks: Track[],
): RoutingGraphPayload {
  const lanesOut: Record<string, unknown[]> = {}
  for (const [trackId, lanes] of Object.entries(lanesByTrack)) {
    if (!Array.isArray(lanes) || lanes.length === 0) continue
    lanesOut[trackId] = lanes.map((lane) => {
      // paramPath is "<effectId>.<paramKey>" — split on the FIRST dot so param
      // keys containing dots survive (none do today, but defensive).
      const dot = lane.paramPath.indexOf('.')
      const effectId = dot >= 0 ? lane.paramPath.slice(0, dot) : ''
      const paramKey = dot >= 0 ? lane.paramPath.slice(dot + 1) : lane.paramPath
      return {
        laneId: lane.id,
        effectId,
        paramKey,
        label: lane.paramPath,
      }
    })
  }

  const chainOut: Record<string, unknown[]> = {}
  for (const track of tracks) {
    const chain = track.effectChain
    if (!Array.isArray(chain) || chain.length === 0) continue
    chainOut[track.id] = chain.map((inst) => ({
      effect_id: inst.effectId,
      // params keys are the validation set the backend uses for edge endpoints.
      params: inst.parameters ?? {},
    }))
  }

  return {
    cmd: 'routing_graph_get',
    operators: operators.map(serializeOperator),
    lanesByTrack: lanesOut,
    chainByTrack: chainOut,
  }
}

/** Coerce an unknown reply into a RoutingGraph, defaulting empty on any miss. */
function coerceGraph(reply: Record<string, unknown>): RoutingGraph {
  if (!reply || reply.ok !== true) return EMPTY_GRAPH
  const nodes = Array.isArray(reply.nodes) ? (reply.nodes as RoutingNode[]) : []
  const edges = Array.isArray(reply.edges) ? (reply.edges as RoutingEdge[]) : []
  return {
    nodes,
    edges,
    hasCycle: reply.hasCycle === true,
    cycleNodeIds: Array.isArray(reply.cycleNodeIds)
      ? (reply.cycleNodeIds as string[])
      : [],
  }
}

/**
 * Fetch the RoutingGraph projection. Never throws — a missing bridge or a
 * backend error resolves to the empty graph (empty-state, no crash).
 */
export async function fetchRoutingGraph(
  payload: RoutingGraphPayload,
): Promise<RoutingGraph> {
  const w = bridge()
  if (!w?.sendCommand) return EMPTY_GRAPH
  try {
    const reply = await w.sendCommand(payload as unknown as Record<string, unknown>)
    return coerceGraph(reply)
  } catch {
    return EMPTY_GRAPH
  }
}

/**
 * Validate a depth/amount change on an existing operator edge via the P6.9
 * `routing_edge_update` command. Returns the decomposed mapping on success so
 * the caller can commit to the operator store, or null on any failure (the
 * caller then leaves the store untouched).
 */
export async function validateEdgeUpdate(
  edgeId: string,
  amount: number,
  payload: RoutingGraphPayload,
): Promise<RoutingEdgeUpdateResult | null> {
  const w = bridge()
  if (!w?.sendCommand) return null
  try {
    const reply = await w.sendCommand({
      cmd: 'routing_edge_update',
      edgeId,
      amount,
      operators: payload.operators,
      lanesByTrack: payload.lanesByTrack,
      chainByTrack: payload.chainByTrack,
    })
    if (
      reply &&
      reply.ok === true &&
      typeof reply.operatorId === 'string' &&
      typeof reply.targetEffectId === 'string' &&
      typeof reply.targetParamKey === 'string' &&
      typeof reply.amount === 'number'
    ) {
      return {
        ok: true,
        edgeId: String(reply.edgeId ?? edgeId),
        amount: reply.amount,
        operatorId: reply.operatorId,
        targetEffectId: reply.targetEffectId,
        targetParamKey: reply.targetParamKey,
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Destination enumeration ─────────────────────────────────────────────────

/** One assignable destination param (effect.param) across all tracks. */
export interface DestinationParam {
  /** Stable id: "<effectId>:<paramKey>". */
  key: string
  effectId: string
  effectName: string
  paramKey: string
  category: string
}

/**
 * Enumerate every assignable destination param from the live effect chains ×
 * the registry. Deduplicated by (effectId, paramKey) — the same effect instance
 * appearing on two tracks contributes one destination. Deterministic order:
 * chain order, then registry param order.
 */
export function enumerateDestinations(
  tracks: Track[],
  registry: EffectInfo[],
): DestinationParam[] {
  const byId = new Map<string, EffectInfo>()
  for (const info of registry) byId.set(info.id, info)

  const seen = new Set<string>()
  const out: DestinationParam[] = []
  for (const track of tracks) {
    for (const inst of track.effectChain ?? []) {
      const info = byId.get(inst.effectId)
      if (!info) continue
      for (const paramKey of Object.keys(info.params ?? {})) {
        const key = `${inst.effectId}:${paramKey}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          key,
          effectId: inst.effectId,
          effectName: info.name,
          paramKey,
          category: info.category,
        })
      }
    }
  }
  return out
}
