/**
 * P6.10 (I2) — bottom edge-inspector strip.
 *
 * Shows the selected edge and its editable fields. Per the packet, ONLY
 * depth / polarity / delete are wired in v1 — curve / lag / axis-binding are
 * DEFERRED (B4-full; no backend storage exists for them yet), so they are not
 * rendered.
 *
 * - depth: a slider in [-1, 1]. The change round-trips through
 *   `routing_edge_update` (validates range + decomposes the edge id) and is
 *   committed to the operator store by the parent. Lane edges are read-only
 *   (only `op-edge:` edges are updatable per the P6.9 contract).
 * - polarity: a +/− toggle that negates the depth.
 * - delete: removes the underlying operator mapping (undoable).
 */

import type { RoutingEdge } from './routing-graph-ipc'

interface EdgeInspectorProps {
  /** The selected edge, or null when nothing is selected. */
  edge: RoutingEdge | null
  /** Label of the source node (for the title). */
  sourceLabel: string
  /** Label of the destination node (for the title). */
  destLabel: string
  /** True when this edge is an operator edge (editable). Lane edges are read-only. */
  editable: boolean
  onDepthChange: (edge: RoutingEdge, amount: number) => void
  onPolarityToggle: (edge: RoutingEdge) => void
  onDelete: (edge: RoutingEdge) => void
}

/**
 * Clamp to [-1, 1], NaN/Inf → 0.
 * C15: exported so ModulationMatrix.tsx's depth slider (OperatorMapping.depth,
 * the SAME underlying field this edge's `amount` round-trips through) shares
 * the exact same clamp semantics — negative depth must display + edit
 * identically in both UIs.
 */
export function clampAmount(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < -1) return -1
  if (value > 1) return 1
  return value
}

export default function EdgeInspector({
  edge,
  sourceLabel,
  destLabel,
  editable,
  onDepthChange,
  onPolarityToggle,
  onDelete,
}: EdgeInspectorProps) {
  if (!edge) {
    return (
      <div className="routing-edge-inspector routing-edge-inspector--empty" data-empty="true">
        <span className="routing-edge-inspector__hint">
          select an edge to inspect — drag a source onto a destination to create one
        </span>
      </div>
    )
  }

  const amount = clampAmount(edge.amount)
  const polarity = amount < 0 ? '−' : '+'

  return (
    <div className="routing-edge-inspector" data-edge-id={edge.id}>
      <div className="routing-edge-inspector__title">
        <span className="routing-edge-inspector__route">
          ▸ {sourceLabel} → {destLabel}.{edge.dstParam}
        </span>
        <span className="routing-edge-inspector__sub">
          {editable ? 'selected · edit below' : 'lane edge · read-only'}
        </span>
      </div>

      <div className="routing-edge-inspector__field">
        <label htmlFor="routing-edge-depth">depth</label>
        <input
          id="routing-edge-depth"
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={amount}
          disabled={!editable}
          onChange={(e) => onDepthChange(edge, clampAmount(parseFloat(e.target.value)))}
          aria-label="Edge depth"
        />
        <span className="routing-edge-inspector__value" data-testid="routing-depth-value">
          ×{amount.toFixed(2)}
        </span>
      </div>

      <div className="routing-edge-inspector__field">
        <label>polarity</label>
        <button
          type="button"
          className="routing-edge-inspector__polarity"
          disabled={!editable}
          onClick={() => onPolarityToggle(edge)}
          aria-label="Toggle polarity"
          data-polarity={polarity}
        >
          {polarity}
        </button>
      </div>

      <div className="routing-edge-inspector__actions">
        <button
          type="button"
          className="routing-edge-inspector__delete"
          disabled={!editable}
          onClick={() => onDelete(edge)}
          aria-label="Delete edge"
        >
          delete
        </button>
      </div>
    </div>
  )
}
