/**
 * B9EdgeInspector — P5b.24 (B9 routing inspector UI).
 *
 * Per-edge inspector panel: srcAxis/dstAxis pickers, bindingRule picker,
 * Bitwig-style depth arc, and edge delete (with symmetric undo).
 *
 * Wiring rules:
 *   - All writes go through `useOperatorStore().updateMapping` which calls the
 *     existing P5b.21 validator (validateMappingForSave → validateModRouteBindingRule)
 *     — the validator is NOT bypassed.
 *   - Research binding rules (painted/hilbert/polar/learned) are shown ONLY when
 *     `showResearchRules` is true. Default: false, toggle owned by OperatorRack.
 *   - The depth arc is a Bitwig-style SVG arc rendered as a circular gauge
 *     showing the clamped [0,1] depth. The stroke sweeps from the bottom of the
 *     circle (−90° = left) around clockwise.
 *   - Edge delete calls `removeMapping` (undoable) so undo restores the mapping.
 *
 * Trust boundary: the store's updateMapping already guards bindingRule via
 * validateModRouteBindingRule; we do NOT duplicate that validation here — the
 * guard fires automatically on every call.
 */
import type { EdgeInspectorInfo } from './OperatorTopologyGraph'
import { useOperatorStore } from '../../stores/operators'
import {
  TIER_1_BINDING_RULES,
  RESEARCH_BINDING_RULES,
  ALL_AXES,
} from '../../../shared/axis-binding'
import type { Axis, BindingRule } from '../../../shared/axis-binding'

interface B9EdgeInspectorProps {
  info: EdgeInspectorInfo
  /** When true, show the 4 research binding rules in the bindingRule picker. */
  showResearchRules: boolean
  /** Called when the user dismisses (clicks ×) or the edge is deleted. */
  onClose: () => void
}

/** Human-readable axis label. */
const AXIS_LABELS: Record<Axis, string> = {
  t: 't — time',
  y: 'y — scanline (V)',
  x: 'x — scanline (H)',
  c: 'c — color channel',
  f: 'f — frequency',
  l: 'l — latent',
}

/** Human-readable binding rule label. */
const RULE_LABELS: Record<BindingRule, string> = {
  broadcast: 'broadcast — scalar → all',
  sampleAt: 'sampleAt — scalar at coord',
  scanOver: 'scanOver — sweep 1D',
  integrate: 'integrate — accumulate',
  painted: 'painted — hand-drawn mask',
  hilbert: 'hilbert — Hilbert curve',
  polar: 'polar — polar coords',
  learned: 'learned — neural binding',
}

/** Clamp to [0,1], NaN/Inf → 0 (numeric trust boundary). */
function clamp01(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

/**
 * Bitwig-style depth arc: a circular gauge [0,1] where 0 = no arc and 1 =
 * full circle. The arc starts at the bottom-left (225°) and sweeps clockwise
 * to 225° + depth*270°. Radius=20, center=(24,24), viewBox=48×48.
 *
 * Stroke-width scales slightly with depth so a deep mapping "pops" visually.
 * The track arc (grey) always shows the full sweep range; the value arc
 * (operator color) shows the current depth.
 */
function DepthArc({ depth, color }: { depth: number; color: string }) {
  const r = 18
  const cx = 24
  const cy = 24
  const clamped = clamp01(depth)

  const startAngleDeg = 135 // degrees from positive X axis (bottom-left)
  const sweepDeg = 270 // total arc range

  /**
   * Compute an SVG arc path for a given fraction of the full sweep.
   * Returns an empty path when fraction is 0.
   */
  function arcPath(fraction: number): string {
    if (fraction <= 0) return ''
    const clampedFraction = Math.min(fraction, 0.9999) // avoid start === end
    const startRad = ((startAngleDeg - 90) * Math.PI) / 180
    const endRad = ((startAngleDeg - 90 + sweepDeg * clampedFraction) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = sweepDeg * clampedFraction > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  const trackPath = arcPath(1)
  const valuePath = arcPath(clamped)
  const strokeW = 2 + clamped * 2

  return (
    <svg
      className="b9-edge-inspector__depth-arc"
      viewBox="0 0 48 48"
      width={48}
      height={48}
      aria-label={`Depth arc: ${Math.round(clamped * 100)}%`}
    >
      {/* Track — full sweep in grey */}
      <path d={trackPath} stroke="#444" strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* Value — depth fraction in operator color */}
      {valuePath && (
        <path
          d={valuePath}
          stroke={color}
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
          className="b9-edge-inspector__depth-arc-value"
          data-depth={clamped}
        />
      )}
      {/* Center percentage label */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={9}
        fill="#ccc"
        className="b9-edge-inspector__depth-label"
      >
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  )
}

export default function B9EdgeInspector({
  info,
  showResearchRules,
  onClose,
}: B9EdgeInspectorProps) {
  const updateMapping = useOperatorStore((s) => s.updateMapping)
  const removeMapping = useOperatorStore((s) => s.removeMapping)
  // Read the operator color for the depth arc.
  const operatorType = useOperatorStore(
    (s) => s.operators.find((o) => o.id === info.operatorId)?.type ?? 'lfo',
  )

  // Resolve color from OPERATOR_TYPE_COLORS (same palette as the graph).
  // Import is deferred to avoid a circular import — the palette is re-declared
  // here as a minimal inline map. The palette IS shared via the graph export but
  // importing it here would import the full graph module (xyflow et al.).
  const COLORS: Record<string, string> = {
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
  const color = COLORS[operatorType] ?? '#4ade80'

  // Derive the visibleRules list for the binding rule picker.
  // Research rules hidden when showResearchRules is false (the toggle default).
  const visibleRules: BindingRule[] = showResearchRules
    ? ([...TIER_1_BINDING_RULES, ...RESEARCH_BINDING_RULES] as BindingRule[])
    : (TIER_1_BINDING_RULES as BindingRule[])

  function handleSrcAxisChange(e: { target: { value: string } }) {
    const axis = e.target.value as Axis
    // Writes through updateMapping → validateMappingForSave (the #289 validator).
    updateMapping(info.operatorId, info.mappingIndex, { srcAxis: axis })
  }

  function handleDstAxisChange(e: { target: { value: string } }) {
    const axis = e.target.value as Axis
    updateMapping(info.operatorId, info.mappingIndex, { dstAxis: axis })
  }

  function handleBindingRuleChange(e: { target: { value: string } }) {
    const rule = e.target.value as BindingRule
    // validateModRouteBindingRule fires inside updateMapping — research rules are
    // rejected there if somehow passed. The picker only shows allowed rules when
    // showResearchRules is false, so this is a belt-and-suspenders guard.
    updateMapping(info.operatorId, info.mappingIndex, { bindingRule: rule })
  }

  function handleDelete() {
    // removeMapping is undoable — undo restores the mapping (symmetric).
    removeMapping(info.operatorId, info.mappingIndex)
    onClose()
  }

  return (
    <div
      className="b9-edge-inspector"
      data-testid="b9-edge-inspector"
      data-operator-id={info.operatorId}
      data-mapping-index={info.mappingIndex}
    >
      <div className="b9-edge-inspector__header">
        <span className="b9-edge-inspector__title">
          Edge: {info.operatorId} → {info.targetParamKey}
        </span>
        <button
          className="b9-edge-inspector__close"
          aria-label="Close inspector"
          onClick={onClose}
          data-testid="b9-edge-inspector-close"
        >
          ×
        </button>
      </div>

      <div className="b9-edge-inspector__body">
        {/* Bitwig-style depth arc */}
        <div className="b9-edge-inspector__arc-row">
          <DepthArc depth={info.depth} color={color} />
          <span className="b9-edge-inspector__depth-text">
            depth {clamp01(info.depth).toFixed(2)}
          </span>
        </div>

        {/* Axis pickers */}
        <label className="b9-edge-inspector__label" htmlFor="b9-src-axis">
          Source axis
        </label>
        <select
          id="b9-src-axis"
          className="b9-edge-inspector__select"
          value={info.srcAxis}
          onChange={handleSrcAxisChange}
          data-testid="b9-src-axis"
        >
          {ALL_AXES.map((ax) => (
            <option key={ax} value={ax}>
              {AXIS_LABELS[ax]}
            </option>
          ))}
        </select>

        <label className="b9-edge-inspector__label" htmlFor="b9-dst-axis">
          Destination axis
        </label>
        <select
          id="b9-dst-axis"
          className="b9-edge-inspector__select"
          value={info.dstAxis}
          onChange={handleDstAxisChange}
          data-testid="b9-dst-axis"
        >
          {ALL_AXES.map((ax) => (
            <option key={ax} value={ax}>
              {AXIS_LABELS[ax]}
            </option>
          ))}
        </select>

        {/* Binding rule picker */}
        <label className="b9-edge-inspector__label" htmlFor="b9-binding-rule">
          Binding rule
        </label>
        <select
          id="b9-binding-rule"
          className="b9-edge-inspector__select"
          value={info.bindingRule}
          onChange={handleBindingRuleChange}
          data-testid="b9-binding-rule"
        >
          {visibleRules.map((rule) => (
            <option key={rule} value={rule}>
              {RULE_LABELS[rule]}
            </option>
          ))}
        </select>

        {/* Research rules hidden hint — shown only when toggle is off */}
        {!showResearchRules && (
          <p
            className="b9-edge-inspector__research-hint"
            data-testid="b9-research-hidden-hint"
          >
            Research rules hidden (enable via ⚗ Research toggle)
          </p>
        )}

        {/* Edge delete */}
        <button
          className="b9-edge-inspector__delete"
          onClick={handleDelete}
          data-testid="b9-edge-delete"
        >
          Delete edge
        </button>
      </div>
    </div>
  )
}
