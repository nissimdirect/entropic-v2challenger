/**
 * Entropic v2 — IPC serialization layer.
 * Maps frontend camelCase EffectInstance fields to the snake_case
 * field names expected by the Python backend pipeline.
 *
 * Frontend (TypeScript)  ->  Backend (Python)
 *   effectId                  effect_id
 *   isEnabled                 enabled
 *   parameters                params
 *
 * See: backend/src/engine/pipeline.py apply_chain() for the expected shape.
 */
import type { EffectInstance } from './types'

export interface SerializedEffectInstance {
  effect_id: string
  enabled: boolean
  params: Record<string, number | string | boolean>
  mix: number
}

/**
 * Serialize a single EffectInstance from frontend camelCase to backend snake_case.
 */
export function serializeEffectInstance(effect: EffectInstance): SerializedEffectInstance {
  return {
    effect_id: effect.effectId,
    enabled: effect.isEnabled,
    params: effect.parameters,
    mix: effect.mix,
  }
}

/**
 * Serialize an entire effect chain for IPC transport to the Python backend.
 */
export function serializeEffectChain(chain: EffectInstance[]): SerializedEffectInstance[] {
  return chain.map(serializeEffectInstance)
}
