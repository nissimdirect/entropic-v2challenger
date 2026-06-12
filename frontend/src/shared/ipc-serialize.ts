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
import type { EffectInstance, MatteNode, MatteRef, TextClipConfig } from './types'

/**
 * MK.3 — snake_case mask ref on the IPC wire. The backend resolves `node_id`
 * against the layer's `mask_stack` and injects the matte as the container
 * `_mask`. Omitted from the payload when the device has no maskRef (additive;
 * absent → byte-identical unmasked render).
 */
export interface SerializedMatteRef {
  node_id: string
  invert: boolean
}

export interface SerializedEffectInstance {
  effect_id: string
  enabled: boolean
  params: Record<string, number | string | boolean>
  mix: number
  /** MK.3 per-device mask routing. Present only when the device carries a maskRef. */
  mask_ref?: SerializedMatteRef
}

/**
 * Serialize a single EffectInstance from frontend camelCase to backend snake_case.
 */
export function serializeEffectInstance(effect: EffectInstance): SerializedEffectInstance {
  const out: SerializedEffectInstance = {
    effect_id: effect.effectId,
    enabled: effect.isEnabled,
    params: effect.parameters,
    mix: effect.mix,
  }
  // MK.3: only attach mask_ref when a valid ref is present (omit when absent →
  // legacy byte-identical path). nodeId must be a non-empty string.
  if (effect.maskRef && typeof effect.maskRef.nodeId === 'string' && effect.maskRef.nodeId) {
    out.mask_ref = { node_id: effect.maskRef.nodeId, invert: !!effect.maskRef.invert }
  }
  return out
}

/**
 * MK.3 — serialize a clip's maskStack for the render payload (`mask_stack`).
 * MatteNode fields already match the backend schema (`growShrink` etc. read
 * verbatim by MatteNode.from_dict), so this is a structural pass-through that
 * exists to (a) name the snake_case payload key and (b) drop the key entirely
 * when the stack is empty/absent (additive — absent → unmasked legacy path).
 * Returns undefined when there is nothing to send.
 */
export function serializeMaskStack(maskStack: MatteNode[] | undefined): MatteNode[] | undefined {
  if (!maskStack || maskStack.length === 0) return undefined
  return maskStack
}

/** Build a fresh MatteRef (used by the DeviceCard mask row). */
export function makeMatteRef(nodeId: string, invert = false): MatteRef {
  return { nodeId, invert }
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
