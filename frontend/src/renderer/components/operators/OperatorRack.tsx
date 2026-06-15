import { useCallback, useState } from 'react'
import { useOperatorStore } from '../../stores/operators'
import type { OperatorType, EffectInfo } from '../../../shared/types'
import LFOEditor from './LFOEditor'
import EnvelopeEditor from './EnvelopeEditor'
import StepSequencerEditor from './StepSequencerEditor'
import AudioFollowerEditor from './AudioFollowerEditor'
import VideoAnalyzerEditor from './VideoAnalyzerEditor'
import FusionEditor from './FusionEditor'
import OperatorKentaroCluster from './OperatorKentaroCluster'
import OperatorTopologyGraph from './OperatorTopologyGraph'
import type { EdgeInspectorInfo } from './OperatorTopologyGraph'
import B9EdgeInspector from './B9EdgeInspector'

interface OperatorRackProps {
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  operatorValues: Record<string, number>
  hasAudio: boolean
}

const TYPE_OPTIONS: { type: OperatorType; label: string; available: boolean }[] = [
  { type: 'lfo', label: 'LFO', available: true },
  { type: 'envelope', label: 'Envelope', available: true },
  { type: 'step_sequencer', label: 'Step Seq', available: true },
  { type: 'audio_follower', label: 'Audio', available: true },
  { type: 'video_analyzer', label: 'Video', available: true },
  { type: 'fusion', label: 'Fusion', available: true },
  // P4.1: new operator types. P4.4 enabled kentaroCluster; P4.6 enables the
  // remaining three (backend landed in P4.3). After this, ZERO available:false
  // entries remain. These three have no dedicated editor branch yet — the rack
  // renders them card-only (graceful fallback, no crash — Gate 14).
  { type: 'kentaroCluster', label: 'Kentaro Cluster', available: true },
  { type: 'sidechain', label: 'Sidechain', available: true },
  { type: 'gate', label: 'Gate', available: true },
  { type: 'midiEnvStutter', label: 'MIDI Env Stutter', available: true },
]

const TYPE_BADGE: Record<string, string> = {
  lfo: 'L',
  envelope: 'E',
  step_sequencer: 'S',
  audio_follower: 'A',
  video_analyzer: 'V',
  fusion: 'F',
  kentaroCluster: 'K',
}

const TYPE_CSS: Record<string, string> = {
  lfo: 'lfo',
  envelope: 'envelope',
  step_sequencer: 'step-seq',
  audio_follower: 'audio',
  video_analyzer: 'video',
  fusion: 'fusion',
  kentaroCluster: 'kentaro',
}

/**
 * P5b.24 (B9): cycle-safe pre-flight via routing_graph_get IPC.
 *
 * Serializes all current operator mappings PLUS a candidate (operatorId →
 * targetEffectId) edge, ships it to routing_graph_get, and returns true when the
 * result has no cycle. This calls cycle_safe_edge_addition (from
 * backend/src/safety/cycle_detection.py) transitively: build_graph_from_project
 * → RoutingGraph.has_cycle() → detect_cycles(). Returns true (allow) when the
 * IPC bridge is unavailable (tests / offline mode) so the unit test can inject
 * its own mock.
 *
 * The validation trust boundary is the live IPC + operator store, NOT the
 * schema.py deserializer (which is the backend .glitch load path, not the live
 * add-mapping path). This mirrors the guidance from the campaign packet.
 */
async function cycleSafeCheck(
  operators: ReturnType<typeof useOperatorStore.getState>['operators'],
  candidateOperatorId: string,
  candidateTargetEffectId: string,
): Promise<boolean> {
  type EntropicBridge = { sendCommand: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>> }
  const w = typeof window !== 'undefined' ? (window as unknown as { entropic?: EntropicBridge }) : null
  const bridge: EntropicBridge | null =
    w && typeof w.entropic?.sendCommand === 'function' ? (w.entropic as EntropicBridge) : null

  if (!bridge) {
    // No IPC bridge (test env / offline) — allow and let SG-5 catch at render.
    return true
  }

  // Serialize current operators PLUS the candidate mapping as a depth-0 edge.
  // We only need the topology to detect a cycle — depth/param values don't
  // affect cycle detection.
  const serializedOps = operators.map((op) => ({
    id: op.id,
    type: op.type,
    label: op.label,
    is_enabled: op.isEnabled,
    mappings: [
      ...op.mappings.map((m) => ({
        target_effect_id: m.targetEffectId,
        target_param_key: m.targetParamKey,
        depth: m.depth,
      })),
      // Inject the candidate edge for the operator it belongs to.
      ...(op.id === candidateOperatorId
        ? [{ target_effect_id: candidateTargetEffectId, target_param_key: '__cycle_check__', depth: 0 }]
        : []),
    ],
  }))

  try {
    const reply = await bridge.sendCommand({
      cmd: 'routing_graph_get',
      operators: serializedOps,
      lanesByTrack: {},
      chainByTrack: {},
    })
    if (reply && reply.hasCycle === true) {
      return false // cycle detected — block the add
    }
    return true
  } catch {
    // IPC error — allow and let SG-5 catch at render time.
    return true
  }
}

export default function OperatorRack({ effectChain, registry, operatorValues, hasAudio }: OperatorRackProps) {
  const operators = useOperatorStore((s) => s.operators)
  const addOperator = useOperatorStore((s) => s.addOperator)
  const removeOperator = useOperatorStore((s) => s.removeOperator)
  const setEnabled = useOperatorStore((s) => s.setOperatorEnabled)
  const reorderOperators = useOperatorStore((s) => s.reorderOperators)

  const [showAddMenu, setShowAddMenu] = useState(false)
  // P4.5: topology graph lives in a collapsible section, COLLAPSED by default.
  // When collapsed the graph subtree is UNMOUNTED (not display:none) so it
  // costs zero rAF / zero render while hidden.
  const [showTopology, setShowTopology] = useState(false)

  // P5b.24 (B9): per-edge inspector state. null = no edge selected.
  const [selectedEdge, setSelectedEdge] = useState<EdgeInspectorInfo | null>(null)

  // P5b.24 (B9): research toggle — off by default (painted/hilbert/polar/learned
  // are hidden when off, shown when on). The packet spec says research rules must
  // be HIDDEN behind this toggle.
  const [showResearchRules, setShowResearchRules] = useState(false)

  // P5b.24 (B9): cycle-safe pre-flight — bound to the live operator store so it
  // reads the CURRENT state at call time (not a stale closure).
  const handleCycleSafeCheck = useCallback(
    async (operatorId: string, targetEffectId: string): Promise<boolean> => {
      return cycleSafeCheck(
        useOperatorStore.getState().operators,
        operatorId,
        targetEffectId,
      )
    },
    [],
  )

  return (
    <div className="operator-rack">
      <div className="operator-rack__header">
        <span className="operator-rack__title">Operators</span>
        <button
          className="operator-rack__add-btn"
          onClick={() => setShowAddMenu(!showAddMenu)}
        >
          {showAddMenu ? '×' : '+ Add'}
        </button>
      </div>

      {showAddMenu && (
        <div className="operator-rack__add-menu">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className={`operator-rack__add-option${opt.available ? '' : ' operator-rack__add-option--disabled'}`}
              disabled={!opt.available}
              onClick={() => {
                addOperator(opt.type)
                setShowAddMenu(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {operators.length === 0 ? (
        <div className="operator-rack__empty">No operators — click + Add to create one</div>
      ) : (
        <div className="operator-rack__cards">
          {operators.map((op, index) => {
            const cssType = TYPE_CSS[op.type] ?? 'lfo'
            const badge = TYPE_BADGE[op.type] ?? '?'
            const signalValue = operatorValues[op.id] ?? 0
            const isActive = signalValue > 0 && op.isEnabled

            return (
              <div
                key={op.id}
                className={`operator-card operator-card--${cssType}${op.isEnabled ? '' : ' operator-card--disabled'}`}
              >
                <div className="operator-card__header">
                  <span className={`operator-card__type-badge operator-card__type-badge--${cssType}`}>
                    {badge}
                  </span>
                  <span className="operator-card__label">
                    {op.label}
                    {op.mappings.length > 0 && (
                      <span className="operator-card__mapping-count">{op.mappings.length}</span>
                    )}
                  </span>
                  <span className={`operator-card__active-dot${isActive ? '' : ' operator-card__active-dot--inactive'}`} />
                  <div className="operator-card__controls">
                    <button
                      className="operator-card__move-up"
                      disabled={index === 0}
                      onClick={() => reorderOperators(index, index - 1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="operator-card__move-down"
                      disabled={index === operators.length - 1}
                      onClick={() => reorderOperators(index, index + 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="operator-card__toggle-btn"
                      onClick={() => setEnabled(op.id, !op.isEnabled)}
                    >
                      {op.isEnabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      className="operator-card__remove-btn"
                      onClick={() => removeOperator(op.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {op.type === 'lfo' && (
                  <LFOEditor operator={op} effectChain={effectChain} registry={registry} />
                )}
                {op.type === 'envelope' && (
                  <EnvelopeEditor operator={op} />
                )}
                {op.type === 'step_sequencer' && (
                  <StepSequencerEditor operator={op} />
                )}
                {op.type === 'audio_follower' && (
                  <AudioFollowerEditor operator={op} hasAudio={hasAudio} />
                )}
                {op.type === 'video_analyzer' && (
                  <VideoAnalyzerEditor operator={op} />
                )}
                {op.type === 'fusion' && (
                  <FusionEditor
                    operator={op}
                    availableOperators={operators
                      .filter((o) => o.id !== op.id)
                      .map((o) => ({ id: o.id, label: o.label }))}
                  />
                )}
                {op.type === 'kentaroCluster' && (
                  <OperatorKentaroCluster
                    operator={op}
                    effectChain={effectChain}
                    registry={registry}
                    operatorValues={operatorValues}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* P4.5 / P5b.24 — operator→effect topology graph + B9 inspector.
          Collapsed by default; the graph subtree is UNMOUNTED while collapsed
          (rule 5: zero cost). The research toggle and edge inspector live here. */}
      <div className="operator-rack__topology-section">
        <div className="operator-rack__topology-header">
          <button
            className="operator-rack__topology-toggle"
            aria-expanded={showTopology}
            onClick={() => setShowTopology((v) => !v)}
          >
            {showTopology ? '▼' : '▶'} Topology
          </button>
          {/* P5b.24 (B9): research toggle — hidden behind ⚗ so research rules
              are not visible to general users by default. */}
          <button
            className={`operator-rack__research-toggle${showResearchRules ? ' operator-rack__research-toggle--active' : ''}`}
            aria-pressed={showResearchRules}
            title={showResearchRules ? 'Hide research binding rules' : 'Show research binding rules (experimental)'}
            onClick={() => setShowResearchRules((v) => !v)}
            data-testid="operator-rack-research-toggle"
          >
            ⚗ Research
          </button>
        </div>
        {showTopology && (
          <OperatorTopologyGraph
            effectChain={effectChain}
            registry={registry}
            operatorValues={operatorValues}
            onEdgeSelect={setSelectedEdge}
            onCycleSafeCheck={handleCycleSafeCheck}
            showResearchRules={showResearchRules}
          />
        )}
        {/* P5b.24 (B9): per-edge inspector panel. Rendered outside the topology
            collapse so the inspector stays open if the graph section is toggled. */}
        {selectedEdge && (
          <B9EdgeInspector
            info={selectedEdge}
            showResearchRules={showResearchRules}
            onClose={() => setSelectedEdge(null)}
          />
        )}
      </div>
    </div>
  )
}
