/**
 * B1/B3.1 — pure sampler→voice computation (INSTRUMENTS-BUILD-PLAN.md §3 B1).
 *
 * Given a sampler instrument + the current playhead, return ONE composite layer.
 * Pure + deterministic → fully unit-testable, replayable for export.
 *
 * B1/B2 (loop disabled / absent):
 *   footageFrameIndex = startFrame + round(speed * playheadFrame), clamped to
 *   [0, frameCount-1]. Byte-identical to original behavior.
 *
 * B3.1 (loop.enabled = true):
 *   The raw playhead offset is wrapped within [loopIn, loopOut] according to
 *   loop.dir: 'fwd' → wraps out→in; 'rev' → plays in←out wrapping;
 *   'pingpong' → bounces at in/out. Speed magnitude is respected; the sign of
 *   speed interacts with dir (negative speed reverses travel direction).
 *   crossfade > 0: near the seam the frame blends toward the far end (encoded
 *   as a fractional frame_index — the backend/export path resolves blend weight).
 *
 * Does NOT emit a layer_id — the backend derives asset:{path} (zmq_server)
 * and ignores incoming layer_id; voiceId keying is B2.
 */
import { clampFinite } from '../../../shared/numeric'
import {
  SAMPLER_SPEED_MAX,
  SAMPLER_SPEED_MIN,
  type SamplerInstrumentV1,
  type SamplerVoiceLayer,
} from './types'

const LOOP_CROSSFADE_MAX = 32

/**
 * Compute the footage frame index for a sampler instrument at a given playhead,
 * applying loop wrapping when loop.enabled = true.
 *
 * Exported separately for unit-testing the loop math without building a full
 * SamplerVoiceLayer.
 */
export function computeLoopFrameIndex(
  inst: SamplerInstrumentV1,
  playheadFrame: number,
  frameCount: number,
): number {
  // frameCount may be 0/undefined for a bad probe → freeze on frame 0, never NaN.
  const fc = Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 1
  const lastFrame = fc - 1

  const speed = clampFinite(inst.speed, SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1)
  const start = clampFinite(inst.startFrame, 0, lastFrame, 0)

  // B3.2 — `scrub` modulation destination. When a finite scrub is present
  // (written by resolveSamplerModulations), the playhead position is DRIVEN by
  // scrub (0..1) across the sampler's playable range — overriding the
  // playhead-derived offset. Absent scrub → null → B3.1 path unchanged
  // (regression-safe). MIRROR: export.py _compute_voice_footage_frame.
  const scrubRaw = inst.scrub
  const hasScrub = typeof scrubRaw === 'number' && Number.isFinite(scrubRaw)
  const scrub = hasScrub ? clampFinite(scrubRaw, 0, 1, 0) : null

  // B1/B2 path: no loop or loop disabled → original formula, byte-identical
  // when scrub is absent; scrub maps across [startFrame, endFrame|last].
  const loop = inst.loop
  if (!loop || !loop.enabled) {
    if (scrub !== null) {
      const end = Math.round(clampFinite(inst.endFrame ?? lastFrame, 0, lastFrame, lastFrame))
      const startI = Math.round(start)
      const lo = Math.min(startI, end)
      const hi = Math.max(startI, end)
      const raw = lo + scrub * (hi - lo)
      return Math.round(clampFinite(raw, 0, lastFrame, 0))
    }
    const raw = start + Math.round(speed * playheadFrame)
    return Math.round(clampFinite(raw, 0, lastFrame, 0))
  }

  // B3.1 loop path.
  const loopIn = clampFinite(loop.in ?? 0, 0, lastFrame, 0)
  const loopOut = clampFinite(loop.out ?? lastFrame, 0, lastFrame, lastFrame)

  // Enforce in <= out; if violated, clamp out to in (degenerate → freeze at loopIn).
  const lIn = Math.min(loopIn, loopOut)
  const lOut = Math.max(loopIn, loopOut)
  const loopLen = lOut - lIn + 1 // always >= 1

  // B3.2 — scrub overrides the loop traversal: map scrub (0..1) directly onto
  // [lIn, lOut]. The operator becomes the playhead.
  if (scrub !== null) {
    const raw = lIn + scrub * (lOut - lIn)
    return Math.round(clampFinite(raw, 0, lastFrame, 0))
  }

  // Raw offset from loopIn, incorporating speed magnitude.
  // Speed sign interacts with dir: positive speed travels "forward" in the dir
  // specified; negative speed reverses travel.
  const absSp = Math.abs(speed)
  const rawOffset = Math.round(absSp * playheadFrame)
  // Direction multiplier: speed<0 inverts the loop direction.
  const dirFlipped = speed < 0

  // Validate dir against the known set; anything else → 'fwd' (mirrors the
  // backend `if direction not in ("fwd","rev","pingpong"): direction = "fwd"`).
  const rawDir = loop.dir ?? 'fwd'
  const dir: 'fwd' | 'rev' | 'pingpong' =
    rawDir === 'rev' || rawDir === 'pingpong' ? rawDir : 'fwd'

  // Effective direction after speed-sign interaction.
  let effectiveDir: 'fwd' | 'rev' | 'pingpong'
  if (dir === 'pingpong') {
    effectiveDir = 'pingpong' // pingpong is symmetric; sign only shifts phase.
  } else if (dirFlipped) {
    effectiveDir = dir === 'fwd' ? 'rev' : 'fwd'
  } else {
    effectiveDir = dir
  }

  let frameIndex: number

  if (effectiveDir === 'fwd') {
    // Offset within [0, loopLen-1], then map to [lIn, lOut].
    frameIndex = lIn + (rawOffset % loopLen)
  } else if (effectiveDir === 'rev') {
    // Start at lOut, travel backward.
    frameIndex = lOut - (rawOffset % loopLen)
  } else {
    // pingpong: period = 2 * (loopLen - 1); bounce at boundaries.
    const period = loopLen <= 1 ? 1 : 2 * (loopLen - 1)
    const phase = rawOffset % period
    if (phase < loopLen) {
      frameIndex = lIn + phase
    } else {
      frameIndex = lOut - (phase - (loopLen - 1))
    }
  }

  // Final clamp to [0, lastFrame] as a safety net.
  return Math.round(clampFinite(frameIndex, 0, lastFrame, 0))
}

export function computeSamplerVoice(
  inst: SamplerInstrumentV1,
  assetPath: string,
  playheadFrame: number,
  frameCount: number,
): SamplerVoiceLayer {
  const frameIndex = computeLoopFrameIndex(inst, playheadFrame, frameCount)

  return {
    layer_type: 'video',
    asset_path: assetPath,
    frame_index: frameIndex,
    chain: [],
    opacity: clampFinite(inst.opacity, 0, 1, 1),
    blend_mode: inst.blendMode,
  }
}

/**
 * B3.1: Compute crossfade blend weight for the loop seam.
 *
 * Returns a value in [0.0, 1.0] representing how much of the "far-end blend"
 * frame should be mixed in at this playhead position. 0.0 = pure current frame;
 * 1.0 = pure blend target (at seam).
 *
 * The backend uses this to lerp between the current footage frame and the
 * opposite loop point frame, eliminating the hard jump.
 *
 * Exported for unit-testing.
 */
export function computeLoopCrossfadeWeight(
  inst: SamplerInstrumentV1,
  playheadFrame: number,
  frameCount: number,
): number {
  const loop = inst.loop
  if (!loop || !loop.enabled) return 0

  const crossfade = clampFinite(loop.crossfade ?? 0, 0, LOOP_CROSSFADE_MAX, 0)
  if (crossfade <= 0) return 0

  const fc = Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 1
  const lastFrame = fc - 1
  const loopIn = clampFinite(loop.in ?? 0, 0, lastFrame, 0)
  const loopOut = clampFinite(loop.out ?? lastFrame, 0, lastFrame, lastFrame)
  const lIn = Math.min(loopIn, loopOut)
  const lOut = Math.max(loopIn, loopOut)

  const frameIndex = computeLoopFrameIndex(inst, playheadFrame, frameCount)

  // Distance from the out seam (fwd approaches lOut) and in seam (rev approaches lIn).
  const distFromOut = lOut - frameIndex
  const distFromIn = frameIndex - lIn

  const minDist = Math.min(distFromOut, distFromIn)
  if (minDist < 0) return 0

  // Blend ramps from 1→0 as we move away from the seam over crossfade frames.
  return minDist < crossfade ? 1 - minDist / crossfade : 0
}
