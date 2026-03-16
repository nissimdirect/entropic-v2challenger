/**
 * Apply MIDI CC modulations to an effect chain.
 * CC modulation is absolute set (not additive like pad ADSR).
 * Pure function — returns a new chain with param values adjusted.
 */
import type { EffectInstance, CCMapping, ParamDef } from '../../../shared/types';

/**
 * Apply CC modulations to a chain of effects.
 *
 * @param chain - The current effect chain
 * @param ccMappings - Active CC-to-param mappings
 * @param ccValues - Map of CC number → normalized value (0-1)
 * @param effectRegistry - Optional registry for ParamDef min/max scaling
 * @returns New chain with CC-modulated param values
 */
export function applyCCModulations(
  chain: EffectInstance[],
  ccMappings: CCMapping[],
  ccValues: Record<number, number>,
  effectRegistry?: Map<string, Record<string, ParamDef>>,
): EffectInstance[] {
  if (ccMappings.length === 0) return chain;

  // Build lookup: effectId → paramKey → CC normalized value
  const overrides: Map<string, Map<string, number>> = new Map();

  for (const mapping of ccMappings) {
    const ccValue = ccValues[mapping.cc];
    if (ccValue === undefined) continue;
    if (!Number.isFinite(ccValue)) continue;

    if (!overrides.has(mapping.effectId)) {
      overrides.set(mapping.effectId, new Map());
    }
    overrides.get(mapping.effectId)!.set(mapping.paramKey, ccValue);
  }

  if (overrides.size === 0) return chain;

  let clonedChain: EffectInstance[];
  try {
    clonedChain = structuredClone(chain);
  } catch {
    console.warn('[MIDI] structuredClone failed, returning original chain');
    return chain;
  }

  for (const effect of clonedChain) {
    const effectOverrides = overrides.get(effect.id);
    if (!effectOverrides) continue;

    for (const [paramKey, normalizedCC] of effectOverrides) {
      const baseValue = effect.parameters[paramKey];
      if (typeof baseValue !== 'number') continue;

      // Scale CC (0-1) to param range (absolute set, not additive)
      let pMin = 0;
      let pMax = 1;
      if (effectRegistry) {
        const paramDefs = effectRegistry.get(effect.effectId);
        if (paramDefs && paramDefs[paramKey]) {
          const def = paramDefs[paramKey];
          if (def.min !== undefined) pMin = def.min;
          if (def.max !== undefined) pMax = def.max;
        }
      }

      const newValue = pMin + normalizedCC * (pMax - pMin);
      if (!Number.isFinite(newValue)) continue;

      effect.parameters[paramKey] = newValue;
    }
  }

  return clonedChain;
}
