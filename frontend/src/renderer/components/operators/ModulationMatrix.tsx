import { useOperatorStore } from '../../stores/operators'
import type { EffectInfo } from '../../../shared/types'

interface ModulationMatrixProps {
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  operatorValues: Record<string, number>
}

export default function ModulationMatrix({
  effectChain,
  registry,
  operatorValues,
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
