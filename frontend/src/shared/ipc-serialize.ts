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
import type { EffectInstance, MatteNode, MatteRef, ParamValue, TextClipConfig } from './types'

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
  /**
   * P6.6: a param value is a scalar OR a FieldRef wrapper ({__field__: {...}}).
   * The FieldRef inner object is already snake_case (source_id), so it rides
   * through to the Python pipeline byte-identically — no per-key conversion.
   */
  params: Record<string, ParamValue>
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
 * M.2b (Master-Out Bus wiring) — build the `master_chain` field shared by the
 * render_composite (preview) and export_start payloads. The backend
 * (_handle_render_composite / _handle_export_start) already defaults an
 * ABSENT `master_chain` key to `[]`, which render_composite treats as a true
 * no-op — so an empty/undefined Master chain must omit the key entirely to
 * stay byte-identical to the pre-M.2b payload (back-compat). Reused at both
 * send sites (and uses the same serializeEffectChain shape per-track chains
 * already use) so preview and export can never drift from each other.
 */
export function buildMasterChainPayload(
  masterChain: EffectInstance[] | undefined,
): { master_chain: SerializedEffectInstance[] } | Record<string, never> {
  if (!masterChain || masterChain.length === 0) return {}
  return { master_chain: serializeEffectChain(masterChain) }
}

/**
 * M.2b — THE TRAP fix. Preview's single-clip fast path (`render_frame`)
 * bypasses render_composite entirely, and render_frame's backend handler
 * never reads `master_chain`. So a non-empty Master chain must force the
 * render_composite path even for a single clip — same seam M.2 used to make
 * export's single-input path apply master. This is the exact pre-existing
 * `hasMultipleLayers || activeVideoClips.length === 0` decision from App.tsx,
 * extracted as a pure function (so it's unit-testable without the live
 * sidecar) with `masterChainLength > 0` folded in as a third reason to use
 * the composite path.
 */
export function shouldUseCompositePath(params: {
  hasMultipleLayers: boolean
  activeVideoClipCount: number
  masterChainLength: number
}): boolean {
  return (
    params.hasMultipleLayers ||
    params.activeVideoClipCount === 0 ||
    params.masterChainLength > 0
  )
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
