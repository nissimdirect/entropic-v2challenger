/**
 * B1 mount — resolve a sampler instrument into a render_composite layer.
 *
 * Pure seam between the App.tsx render path and computeSamplerVoice: resolves
 * the instrument's clipId against the project asset table (path + frameCount),
 * then defers to computeSamplerVoice for the frame math. Returns null when there
 * is no instrument or its clip is unresolved — the caller appends nothing and
 * does NOT force the composite path. Kept pure so the wiring is unit-testable
 * without standing up the full App render pipeline.
 *
 * frameCount = round(meta.duration * fps); a bad/zero probe collapses to 1 so
 * computeSamplerVoice freezes on frame 0 (never NaN).
 *
 * P5a.3: `buildVoiceLayers` is the multi-voice entry point (evaluateVoices →
 * one layer per active Voice). `buildSamplerLayer` is kept as the legacy B1
 * single-layer path (back-compat for callers that don't yet use the FSM).
 */
import { computeSamplerVoice } from './computeSamplerVoice'
import { envelopeValue } from './voiceFSM'
import type { Voice } from './voiceFSM'
import type { SamplerInstrumentV1, SamplerVoiceLayer } from './types'
import type { Asset, ADSREnvelope } from '../../../shared/types'
import { clampFinite } from '../../../shared/numeric'

export function buildSamplerLayer(
  inst: SamplerInstrumentV1 | null,
  assets: Record<string, Asset>,
  frame: number,
  defaultFps: number,
): SamplerVoiceLayer | null {
  if (!inst) return null
  const asset = assets[inst.clipId]
  if (!asset?.path) return null

  const metaFps = asset.meta?.fps
  const fps = Number.isFinite(metaFps) && metaFps > 0 ? metaFps : defaultFps
  const dur = Number.isFinite(asset.meta?.duration) ? asset.meta.duration : 0
  const frameCount = Math.max(1, Math.round(dur * fps))

  return computeSamplerVoice(inst, asset.path, frame, frameCount)
}

/**
 * P5a.3 — Multi-voice sampler layer builder.
 *
 * Given an instrument, an active-voice array from `evaluateVoices`, and the
 * project asset table, emits ONE composite layer per active Voice. Layers are
 * ordered ascending `triggerFrame` so the newest voice composites on top (last
 * element = highest z-order in render_composite).
 *
 * The `voice_id` on each layer is the FSM voiceId with colons replaced by
 * underscores to satisfy the backend VOICE_ID_PATTERN `^[A-Za-z0-9_-]{1,128}$`.
 * e.g. `voice:sampler-1:30:7` → `voice_sampler-1_30_7` (≤128 chars).
 *
 * Returns [] when the instrument has no sourced clip (unsourced sampler) or
 * the voices array is empty (no active voices).
 */
export function buildVoiceLayers(
  inst: SamplerInstrumentV1 | null,
  voices: Voice[],
  assets: Record<string, Asset>,
  frameIndex: number,
  defaultFps: number,
  adsr: ADSREnvelope,
): SamplerVoiceLayer[] {
  if (!inst || voices.length === 0) return []
  const asset = assets[inst.clipId]
  if (!asset?.path) return []

  const metaFps = asset.meta?.fps
  const fps = Number.isFinite(metaFps) && metaFps > 0 ? metaFps : defaultFps
  const dur = Number.isFinite(asset.meta?.duration) ? asset.meta.duration : 0
  const frameCount = Math.max(1, Math.round(dur * fps))

  // Sort ascending triggerFrame — newest voice last (highest z-order in composite)
  const sorted = [...voices].sort((a, b) =>
    a.triggerFrame !== b.triggerFrame
      ? a.triggerFrame - b.triggerFrame
      : a.eventIndex - b.eventIndex,
  )

  return sorted.map((voice) => {
    // Per-voice footage position: voiceFSM footagePos is the playhead into the clip.
    // B3.4 — pass the voice's MIDI note so the melodic note→startFrame/speed
    // transform can transpose this voice. melodic absent/off → note ignored →
    // byte-identical to B3.3.
    const baseLayer = computeSamplerVoice(
      inst,
      asset.path,
      voice.footagePos,
      frameCount,
      undefined,
      voice.note,
    )

    // Per-voice opacity = instrument opacity × ADSR envelope value at current frame
    const env = envelopeValue(voice, frameIndex, adsr)
    const perVoiceOpacity = clampFinite(inst.opacity * env, 0, 1, 0)

    // Encode voiceId colon-free for backend VOICE_ID_PATTERN compliance.
    // FSM voiceId format: "voice:{instrumentId}:{triggerFrame}:{eventIndex}"
    // → replace all ':' with '_' → "voice_{instrumentId}_{triggerFrame}_{eventIndex}"
    // Backend then prepends "voice:" → cache key "voice:voice_{...}" (unambiguous).
    // Truncate to 128 chars (MAX_VOICE_ID_LENGTH in backend security.py).
    const rawId = voice.voiceId.replace(/:/g, '_')
    const voiceId = rawId.length <= 128 ? rawId : rawId.slice(0, 128)

    return {
      ...baseLayer,
      opacity: perVoiceOpacity,
      voice_id: voiceId,
    }
  })
}
