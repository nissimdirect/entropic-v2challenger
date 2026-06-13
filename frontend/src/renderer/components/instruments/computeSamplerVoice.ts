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
 * B3.3 (rgbOffset present and non-zero):
 *   Per-channel chromatic time-displacement. R, G, B channels are each sampled
 *   from a footage frame offset by their channel's amount relative to the
 *   playhead-derived base frame. Offsets are clamped to the playable bounds.
 *   rgbOffset absent or {0,0,0} → byte-identical to B3.2 (regression-safe).
 *   MIRROR: export.py _compute_voice_rgb_frame_indices
 *
 * B3.3 (glide > 0):
 *   On retrigger, the playhead origin LERPs from the previous value to the new
 *   target over `glide` frames instead of jumping instantly. glide=0 → instant
 *   jump = B3.2 behavior (regression-safe).
 *   MIRROR: export.py _apply_glide_ramp
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
/** B3.3: clamp glide to [0, 300] frames. */
const SAMPLER_GLIDE_MAX = 300

// ---------------------------------------------------------------------------
// B3.3 helpers — exported for unit tests + export parity
// ---------------------------------------------------------------------------

/**
 * B3.3 — Apply position/speed glide (portamento) ramp.
 *
 * On retrigger (elapsedFrames = frames since the new voice was triggered),
 * the playhead offset LERPs from 0 → targetOffset over `glideFrames` frames
 * instead of jumping instantly. After `glideFrames` it holds at targetOffset.
 *
 * glideFrames <= 0 → instant jump (returns targetOffset, byte-identical to
 * B3.2 behavior). The ramp is linear (LERP).
 *
 * Pure + deterministic; no side effects.
 * MIRROR: export.py ExportManager._apply_glide_ramp
 *
 * @param targetOffset  The fully-computed raw offset (speed * playheadFrame).
 * @param glideFrames   Ramp duration in frames. 0 = instant.
 * @param elapsedFrames Frames elapsed since the voice was triggered (≥ 0).
 */
export function applyGlideRamp(
  targetOffset: number,
  glideFrames: number,
  elapsedFrames: number,
): number {
  const gf = clampFinite(glideFrames, 0, SAMPLER_GLIDE_MAX, 0)
  if (gf <= 0) return targetOffset
  if (elapsedFrames >= gf) return targetOffset
  const t = Math.max(0, elapsedFrames) / gf
  return targetOffset * t
}

/**
 * B3.3 — Compute per-channel (R, G, B) footage frame indices for chromatic
 * time-displacement (rgbOffset).
 *
 * Each channel's frame index = clamp(baseFrame + channelOffset, loB, hiB) where
 * [loB, hiB] is the sampler's playable bounds:
 *   - loop.enabled  → [loopIn, loopOut]
 *   - otherwise     → [0, endFrame|last]
 *
 * rgbOffset absent or {0,0,0} → returns null (caller uses baseFrame, byte-
 * identical to B3.2). Nearest-frame interpolation (integer clamp, no RIFE).
 *
 * MIRROR: export.py ExportManager._compute_voice_rgb_frame_indices
 */
export function computeRgbFrameIndices(
  inst: SamplerInstrumentV1,
  baseFrame: number,
  frameCount: number,
): { r: number; g: number; b: number } | null {
  const off = inst.rgbOffset
  if (!off) return null
  if (off.r === 0 && off.g === 0 && off.b === 0) return null

  const fc = Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 1
  const lastFrame = fc - 1

  // Determine playable bounds for clamping.
  const loop = inst.loop
  let loBound: number
  let hiBound: number
  if (loop && loop.enabled) {
    const li = clampFinite(loop.in ?? 0, 0, lastFrame, 0)
    const lo = clampFinite(loop.out ?? lastFrame, 0, lastFrame, lastFrame)
    loBound = Math.round(Math.min(li, lo))
    hiBound = Math.round(Math.max(li, lo))
  } else {
    loBound = 0
    hiBound = Math.round(clampFinite(inst.endFrame ?? lastFrame, 0, lastFrame, lastFrame))
  }

  const clampChannel = (offset: number): number => {
    const raw = baseFrame + offset
    return Math.round(clampFinite(raw, loBound, hiBound, baseFrame))
  }

  return {
    r: clampChannel(off.r),
    g: clampChannel(off.g),
    b: clampChannel(off.b),
  }
}

/**
 * Compute the footage frame index for a sampler instrument at a given playhead,
 * applying loop wrapping when loop.enabled = true.
 *
 * B3.3: `elapsedFrames` (optional, default = playheadFrame) is the number of
 * frames elapsed since the current voice was triggered. When `inst.glide > 0`,
 * the raw playhead offset is glide-ramped over the first `glide` frames (LERP
 * from 0 → targetOffset). Absent or glide=0 → instant jump = B3.2 behavior.
 *
 * Exported separately for unit-testing the loop math without building a full
 * SamplerVoiceLayer.
 */
export function computeLoopFrameIndex(
  inst: SamplerInstrumentV1,
  playheadFrame: number,
  frameCount: number,
  elapsedFrames?: number,
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

  // B3.3 — glide ramp. When inst.glide > 0 and elapsedFrames is supplied,
  // the raw speed*playheadFrame offset is ramped from 0 → target over
  // `glide` frames. Absent/0 → instant jump = B3.2 behavior (regression-safe).
  // MIRROR: export.py ExportManager._apply_glide_ramp
  const glideFrames = clampFinite(inst.glide ?? 0, 0, SAMPLER_GLIDE_MAX, 0)
  // elapsedFrames defaults to playheadFrame when not supplied (same-voice
  // forward playback always has elapsed == playhead; the optional param lets
  // tests supply arbitrary elapsed without changing playheadFrame).
  const elapsed = elapsedFrames !== undefined ? Math.max(0, elapsedFrames) : playheadFrame

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
    // B3.3 glide: apply ramp to the raw offset before adding startFrame.
    const targetOffset = speed * playheadFrame
    const rampedOffset = applyGlideRamp(targetOffset, glideFrames, elapsed)
    const raw = start + Math.round(rampedOffset)
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
  // B3.3 glide: apply ramp to the raw offset (before direction/loop wrapping).
  const absSp = Math.abs(speed)
  const targetLoopOffset = absSp * playheadFrame
  const rampedLoopOffset = applyGlideRamp(targetLoopOffset, glideFrames, elapsed)
  const rawOffset = Math.round(rampedLoopOffset)
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
  elapsedFrames?: number,
): SamplerVoiceLayer {
  const frameIndex = computeLoopFrameIndex(inst, playheadFrame, frameCount, elapsedFrames)

  // B3.3 — per-channel RGB offset (chromatic time-displacement).
  // Compute channel frame indices; attach to layer when non-trivial.
  // rgbOffset absent or {0,0,0} → rgb_frame_indices omitted → byte-identical to B3.2.
  const rgbIndices = computeRgbFrameIndices(inst, frameIndex, frameCount)

  const layer: SamplerVoiceLayer = {
    layer_type: 'video',
    asset_path: assetPath,
    frame_index: frameIndex,
    chain: [],
    opacity: clampFinite(inst.opacity, 0, 1, 1),
    blend_mode: inst.blendMode,
  }

  if (rgbIndices !== null) {
    layer.rgb_frame_indices = rgbIndices
  }

  return layer
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
