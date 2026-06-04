/**
 * B1 — pure sampler→voice computation (INSTRUMENTS-BUILD-PLAN.md §3 B1).
 *
 * Given a sampler instrument + the current playhead, return ONE composite layer.
 * Pure + deterministic → fully unit-testable, replayable for export.
 *
 * `footageFrameIndex = startFrame + round(speed * playheadFrame)`, clamped to
 * the clip bounds. speed: 1=native, 0=freeze, <0=reverse (clamped [-8, 8]).
 * Does NOT emit a layer_id — the backend derives `asset:{path}` (zmq_server)
 * and ignores incoming layer_id; voiceId keying is B2.
 */
import { clampFinite } from '../../../shared/numeric'
import {
  SAMPLER_SPEED_MAX,
  SAMPLER_SPEED_MIN,
  type SamplerInstrumentV1,
  type SamplerVoiceLayer,
} from './types'

export function computeSamplerVoice(
  inst: SamplerInstrumentV1,
  assetPath: string,
  playheadFrame: number,
  frameCount: number,
): SamplerVoiceLayer {
  // frameCount may be 0/undefined for a bad probe → freeze on frame 0, never NaN.
  const lastFrame = Math.max(0, (Number.isFinite(frameCount) ? frameCount : 1) - 1)
  const speed = clampFinite(inst.speed, SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1)
  const start = clampFinite(inst.startFrame, 0, lastFrame, 0)
  const raw = start + Math.round(speed * playheadFrame)
  const frameIndex = Math.round(clampFinite(raw, 0, lastFrame, 0))

  return {
    layer_type: 'video',
    asset_path: assetPath,
    frame_index: frameIndex,
    chain: [],
    opacity: clampFinite(inst.opacity, 0, 1, 1),
    blend_mode: inst.blendMode,
  }
}
