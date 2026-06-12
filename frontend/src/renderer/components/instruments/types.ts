/**
 * B1 — Read-only 1-voice Sampler types (INSTRUMENTS-BUILD-PLAN.md §3 B1).
 *
 * Co-located here (not shared/types.ts) to keep the B1 core isolated from the
 * Creatrix PR-A/PR-B schema work. PR-B may later promote SamplerInstrumentV1
 * into the shared instrument union.
 */
import type { BlendMode } from '../../../shared/types'

export interface SamplerInstrumentV1 {
  id: string
  type: 'sampler'
  clipId: string // source asset id (resolves to assetPath + frameCount)
  startFrame: number // playhead start, clamped [0, frameCount-1]
  speed: number // 1=native, 0=freeze, <0=reverse; clamp [-8, 8]
  opacity: number // per-voice value, clamp [0,1] — set on the layer dict
  blendMode: BlendMode
}

/**
 * The composite-layer dict the sampler appends to the render_composite `layers`
 * array (mirrors the shape App.tsx builds for video clips). NOT a Composite
 * effect — opacity rides on the layer.
 *
 * P5a.3: `voice_id` added for per-voice state keying on the backend (P5a.2).
 * Constraint: must match backend VOICE_ID_PATTERN `^[A-Za-z0-9_-]{1,128}$`
 * (no colons — the backend prepends "voice:" as namespace prefix). The FSM
 * voiceId (`voice:{instrumentId}:{triggerFrame}:{eventIndex}`) is encoded
 * colon-free as `{instrumentId}_{triggerFrame}_{eventIndex}` in the layer.
 */
export interface SamplerVoiceLayer {
  layer_type: 'video'
  asset_path: string
  frame_index: number
  chain: never[]
  opacity: number
  blend_mode: BlendMode
  /** P5a.3: per-voice state cache key for the backend. No colons (P5a.2 constraint). */
  voice_id?: string
}

/** Hard speed bounds (reverse..forward), per B1 plan. */
export const SAMPLER_SPEED_MIN = -8
export const SAMPLER_SPEED_MAX = 8
