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
 */
import { computeSamplerVoice } from './computeSamplerVoice'
import type { SamplerInstrumentV1, SamplerVoiceLayer } from './types'
import type { Asset } from '../../../shared/types'

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
