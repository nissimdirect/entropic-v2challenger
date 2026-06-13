import { useOperatorStore } from '../../stores/operators'
import type { EffectInfo, MatteNode } from '../../../shared/types'
import type { SamplerInstrumentV1 } from '../instruments/types'

interface ModulationMatrixProps {
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  operatorValues: Record<string, number>
  /**
   * MK.8 — key nodes (chroma_key / luma_key) from the selected clip's maskStack.
   * Their lane-able params are prepended as synthetic targets
   * `mask.<node_id>.<param>` riding the F-0516-9 `_mix` mechanism, so a key can
   * be sidechained / LFO'd / beat-gated live (keying-as-performance, SPEC §6).
   * Optional — absent / empty = no key targets (legacy behavior).
   */
  maskNodes?: MatteNode[]
  /**
   * B3.2 — live sampler instruments. Their scrub/speed params are prepended as
   * synthetic targets `sampler.<id>.scrub` / `sampler.<id>.speed`, so an
   * operator (LFO / envelope / velocity) can drive the playhead position
   * (scrub-by-LFO) or scale playback speed. Backend routing.py reads them via
   * resolve_sampler_modulations. Optional — absent / empty = no sampler targets.
   */
  samplerInstruments?: SamplerInstrumentV1[]
}

/**
 * B3.2 — which sampler params are lane-addressable (float scalars). `scrub` is
 * the normalized playhead position [0,1]; `speed` is playback rate [-8,8].
 * Order defines column order.
 */
const SAMPLER_LANE_PARAMS: { key: string; label: string }[] = [
  { key: 'scrub', label: 'Scrub' },
  { key: 'speed', label: 'Speed' },
]

/**
 * MK.8 — which params of each key kind are lane-addressable (float scalars
 * only; `mode` is a choice and is excluded). Order defines column order.
 */
const KEY_LANE_PARAMS: Record<string, { key: string; label: string }[]> = {
  chroma_key: [
    { key: 'hue', label: 'Hue' },
    { key: 'tolerance', label: 'Tolerance' },
    { key: 'softness', label: 'Softness' },
    { key: 'spill', label: 'Spill' },
  ],
  luma_key: [
    { key: 'threshold', label: 'Threshold' },
    { key: 'softness', label: 'Softness' },
  ],
}

export default function ModulationMatrix({
  effectChain,
  registry,
  operatorValues,
  maskNodes,
  samplerInstruments,
}: ModulationMatrixProps) {
  const operators = useOperatorStore((s) => s.operators)
  const removeMapping = useOperatorStore((s) => s.removeMapping)
  const updateMapping = useOperatorStore((s) => s.updateMapping)

  // Build list of all target params across chain.
  // F-0516-9: prepend synthetic `_mix` target per effect so the dry/wet
  // container mix is modulatable from the matrix. Backend routing.py reads
  // `params._mix` and pipeline.py defers via setdefault so a routing-set
  // value survives. Range is hard-coded [0,1] in routing._get_param_bounds.
  const targets: { effectId: string; effectName: string; paramKey: string; paramLabel: string }[] = []

  // MK.8 — keying-as-performance: prepend the selected clip's key-node params
  // as synthetic targets `mask.<node_id>.<param>` (riding the F-0516-9 `_mix`
  // mechanism). The render payload carries the per-frame resolved values, so a
  // key can be sidechained / LFO'd / beat-gated live. Namespaced under `mask.`
  // so the paramKey never collides with `_mix` or a real effect param.
  for (const node of maskNodes ?? []) {
    const laneParams = KEY_LANE_PARAMS[node.kind]
    if (!laneParams) continue // not a key node (rect/ellipse/etc. — Phase B)
    for (const p of laneParams) {
      targets.push({
        // `effectId` carries the namespaced node id; backend routing keys off
        // the `mask.` prefix to route into the matte node instead of an effect.
        effectId: `mask.${node.id}`,
        effectName: `Key: ${node.id}`,
        paramKey: `mask.${node.id}.${p.key}`,
        paramLabel: p.label,
      })
    }
  }

  // B3.2 — sampler-as-performance: prepend each live sampler's scrub/speed as
  // synthetic targets `sampler.<id>.<param>`. The backend resolve_sampler_-
  // modulations reads them per frame, so an LFO/env/velocity can drive the
  // playhead (scrub) or speed. Namespaced under `sampler.` so the paramKey
  // never collides with `_mix`, a real effect param, or a `mask.` target.
  for (const inst of samplerInstruments ?? []) {
    if (inst.type !== 'sampler') continue
    for (const p of SAMPLER_LANE_PARAMS) {
      targets.push({
        // `effectId` carries the namespaced sampler id; backend routing keys
        // off the `sampler.` prefix to route into the instrument.
        effectId: `sampler.${inst.id}`,
        effectName: `Sampler: ${inst.id}`,
        paramKey: `sampler.${inst.id}.${p.key}`,
        paramLabel: p.label,
      })
    }
  }

  for (const fx of effectChain) {
    const info = registry.find((r) => r.id === fx.effectId)
    if (!info) continue
    targets.push({
      effectId: fx.id,
      effectName: info.name,
      paramKey: '_mix',
      paramLabel: 'Mix',
    })
    for (const [key, def] of Object.entries(info.params)) {
      if (def.type !== 'float' && def.type !== 'int') continue
      targets.push({
        effectId: fx.id,
        effectName: info.name,
        paramKey: key,
        paramLabel: def.label,
      })
    }
  }

  const enabledOps = operators.filter((o) => o.isEnabled || o.mappings.length > 0)

  if (enabledOps.length === 0 || targets.length === 0) {
    return (
      <div className="mod-matrix mod-matrix--empty">
        <span className="mod-matrix__hint">
          Add operators and effects to see the modulation matrix
        </span>
      </div>
    )
  }

  return (
    <div className="mod-matrix">
      <div className="mod-matrix__header">Modulation Matrix</div>
      <div className="mod-matrix__grid-wrapper">
        <table className="mod-matrix__table">
          <thead>
            <tr>
              <th className="mod-matrix__corner" />
              {targets.map((t) => (
                <th key={`${t.effectId}-${t.paramKey}`} className="mod-matrix__col-header">
                  <span className="mod-matrix__effect-name">{t.effectName}</span>
                  <span className="mod-matrix__param-name">{t.paramLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enabledOps.map((op) => {
              const signal = operatorValues[op.id] ?? 0
              return (
                <tr key={op.id}>
                  <td className="mod-matrix__row-header">
                    <span className="mod-matrix__op-label">{op.label}</span>
                    <span
                      className="mod-matrix__signal-bar"
                      style={{ width: `${Math.round(signal * 100)}%` }}
                    />
                  </td>
                  {targets.map((t) => {
                    const mappingIndex = op.mappings.findIndex(
                      (m) => m.targetEffectId === t.effectId && m.targetParamKey === t.paramKey,
                    )
                    const mapping = mappingIndex >= 0 ? op.mappings[mappingIndex] : null

                    return (
                      <td
                        key={`${t.effectId}-${t.paramKey}`}
                        className={`mod-matrix__cell${mapping ? ' mod-matrix__cell--active' : ''}`}
                      >
                        {mapping ? (
                          <div className="mod-matrix__cell-content">
                            <input
                              type="range"
                              className="mod-matrix__depth-slider"
                              min={0}
                              max={1}
                              step={0.01}
                              value={mapping.depth}
                              onChange={(e) =>
                                updateMapping(op.id, mappingIndex, {
                                  depth: parseFloat(e.target.value),
                                })
                              }
                            />
                            <span className="mod-matrix__depth-value">
                              {Math.round(mapping.depth * 100)}%
                            </span>
                            <button
                              className="mod-matrix__remove-btn"
                              onClick={() => removeMapping(op.id, mappingIndex)}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <span className="mod-matrix__empty-cell">·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
