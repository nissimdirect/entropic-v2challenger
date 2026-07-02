/**
 * Evaluate all automation lanes at a given time, returning override values.
 * Pure function — no side effects.
 *
 * Returns Record<string, number> where key = "effectId.paramKey"
 * and value = denormalized parameter value.
 */
import type { AutomationLane, EffectInfo } from '../../shared/types'
import { evaluateAutomation, denormalize } from './automation-evaluate'

export function evaluateAutomationOverrides(
  lanes: AutomationLane[],
  time: number,
  registry: EffectInfo[],
): Record<string, number> {
  const overrides: Record<string, number> = {}

  for (const lane of lanes) {
    if (!lane.isVisible) continue

    const normalized = evaluateAutomation(lane, time)
    if (normalized === null) continue

    // Guard against NaN/Infinity
    if (!Number.isFinite(normalized)) continue

    // paramPath = "effectId.paramKey"
    const dotIdx = lane.paramPath.indexOf('.')
    if (dotIdx === -1) continue
    const effectId = lane.paramPath.slice(0, dotIdx)
    const paramKey = lane.paramPath.slice(dotIdx + 1)

    // Look up param bounds from registry
    const effectInfo = registry.find((r) => r.id === effectId)
    const paramDef = effectInfo?.params[paramKey]
    const pMin = paramDef?.min ?? 0
    const pMax = paramDef?.max ?? 1

    const value = denormalize(normalized, pMin, pMax)

    // Final NaN guard
    if (!Number.isFinite(value)) continue

    overrides[lane.paramPath] = value
  }

  return overrides
}
