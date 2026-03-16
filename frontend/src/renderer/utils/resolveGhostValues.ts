/**
 * Resolve operator modulation + automation + CC into ghost values for a specific effect's parameters.
 * Used to drive ghost handles on knobs in the ParamPanel.
 *
 * Signal order: Base → +ModDelta → AutoReplace → CCReplace → Clamp
 */
import type { Operator, ParamDef } from '../../shared/types'

export function resolveGhostValues(
  effectId: string,
  paramDefs: Record<string, ParamDef>,
  baseParams: Record<string, number | string | boolean>,
  operators: Operator[],
  operatorValues: Record<string, number>,
  automationOverrides?: Record<string, number>,
  ccOverrides?: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {}

  // For each numeric param, accumulate modulation from all operators
  for (const [key, def] of Object.entries(paramDefs)) {
    if (def.type !== 'float' && def.type !== 'int') continue

    const baseValue = (baseParams[key] ?? def.default) as number
    const pMin = def.min ?? 0
    const pMax = def.max ?? 1
    const pRange = pMax - pMin

    let modDelta = 0

    for (const op of operators) {
      if (!op.isEnabled) continue
      const signal = operatorValues[op.id] ?? 0

      for (const mapping of op.mappings) {
        if (mapping.targetEffectId !== effectId) continue
        if (mapping.targetParamKey !== key) continue

        const mapped = mapping.min + signal * (mapping.max - mapping.min)
        const scaled = mapped * mapping.depth
        modDelta += scaled * pRange
      }
    }

    // Signal order: Base → +ModDelta → AutoReplace → CCReplace → Clamp
    let value = baseValue + modDelta
    const overrideKey = `${effectId}.${key}`
    if (automationOverrides && overrideKey in automationOverrides) {
      value = automationOverrides[overrideKey]
    }
    // CC replace: absolute set from MIDI CC (scaled to param range)
    if (ccOverrides && key in ccOverrides) {
      value = ccOverrides[key]
    }
    const clamped = Math.max(pMin, Math.min(pMax, value))

    // Only include if different from base
    if (clamped !== baseValue || modDelta !== 0 || (automationOverrides && overrideKey in automationOverrides) || (ccOverrides && key in ccOverrides)) {
      result[key] = clamped
    }
  }

  return result
}
