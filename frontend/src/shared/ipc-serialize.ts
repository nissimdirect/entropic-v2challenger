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
import type { EffectInstance, TextClipConfig } from './types'

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

/**
 * Serialize a TextClipConfig from frontend camelCase to backend snake_case.
 */
export interface SerializedTextConfig {
  text: string
  font_family: string
  font_size: number
  color: string
  position: [number, number]
  alignment: string
  opacity: number
  stroke_width: number
  stroke_color: string
  shadow_offset: [number, number]
  shadow_color: string
  animation: string
  animation_duration: number
}

export function serializeTextConfig(config: TextClipConfig): SerializedTextConfig {
  return {
    text: config.text,
    font_family: config.fontFamily,
    font_size: config.fontSize,
    color: config.color,
    position: config.position,
    alignment: config.alignment,
    opacity: config.opacity,
    stroke_width: config.strokeWidth,
    stroke_color: config.strokeColor,
    shadow_offset: config.shadowOffset,
    shadow_color: config.shadowColor,
    animation: config.animation,
    animation_duration: config.animationDuration,
  }
}
