/**
 * Apply pad envelope modulations to an effect chain.
 * Pure function — returns a new chain with param values adjusted.
 * Original chain is never mutated.
 */
import type { EffectInstance, Pad, ParamDef } from '../../../shared/types';

/**
 * Apply pad modulations to a chain of effects.
 *
 * @param chain - The current effect chain
 * @param pads - All pads in the drum rack
 * @param envelopeValues - Map of padId → current envelope value (0-1)
 * @param effectRegistry - Optional registry for ParamDef min/max clamping
 * @returns New chain with modulated param values
 */
export function applyPadModulations(
  chain: EffectInstance[],
  pads: Pad[],
  envelopeValues: Record<string, number>,
  effectRegistry?: Map<string, Record<string, ParamDef>>,
): EffectInstance[] {
  // Early exit: no active pads
  const activePadIds = Object.keys(envelopeValues);
  if (activePadIds.length === 0) return chain;

  // C3: Wrap structuredClone in try/catch
  let clonedChain: EffectInstance[];
  try {
    clonedChain = structuredClone(chain);
  } catch {
    console.warn('[Performance] structuredClone failed, returning original chain');
    return chain;
  }

  // Build modulation accumulator: effectId → paramKey → total delta
  const deltas: Map<string, Map<string, number>> = new Map();

  for (const pad of pads) {
    const envValue = envelopeValues[pad.id];
    if (!envValue || envValue <= 0) continue;

    // C2: Guard against NaN envelope value
    if (!Number.isFinite(envValue)) continue;

    for (const mapping of pad.mappings) {
      if (!mapping.effectId || !mapping.paramKey) continue;

      const range = mapping.max - mapping.min;
      const delta = mapping.depth * envValue * range;

      // C2: Guard against NaN delta
      if (!Number.isFinite(delta)) continue;

      if (!deltas.has(mapping.effectId)) {
        deltas.set(mapping.effectId, new Map());
      }
      const paramDeltas = deltas.get(mapping.effectId)!;
      const current = paramDeltas.get(mapping.paramKey) ?? 0;
      paramDeltas.set(mapping.paramKey, current + delta);
    }
  }

  // Apply accumulated deltas to cloned chain
  for (const effect of clonedChain) {
    const effectDeltas = deltas.get(effect.id);
    if (!effectDeltas) continue;

    for (const [paramKey, delta] of effectDeltas) {
      const baseValue = effect.parameters[paramKey];
      if (typeof baseValue !== 'number') continue;

      let newValue = baseValue + delta;

      // M5: Clamp to ParamDef min/max from registry
      if (effectRegistry) {
        const paramDefs = effectRegistry.get(effect.effectId);
        if (paramDefs && paramDefs[paramKey]) {
          const def = paramDefs[paramKey];
          if (def.min !== undefined) newValue = Math.max(def.min, newValue);
          if (def.max !== undefined) newValue = Math.min(def.max, newValue);
        }
      }

      // C2: Final NaN guard
      if (!Number.isFinite(newValue)) continue;

      effect.parameters[paramKey] = newValue;
    }
  }

  return clonedChain;
}
