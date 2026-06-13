/**
 * B4.1 — Sample Rack per-pad channel summing.
 *
 * A rack is N pads; each pad is a CHANNEL whose Sampler renders one-or-more
 * voice layers via the EXISTING `buildVoiceLayers` path (B3 sampler render).
 * This module SUMS the pad channels into ONE ordered rack-output layer list,
 * honoring per-pad opacity, blend mode, mute and solo. The actual blend is done
 * by the EXISTING backend compositor (`render_composite` reads each layer's
 * `opacity` + `blend_mode`) — we do NOT write a parallel compositor here.
 *
 * Summing semantics (the gates):
 *   - MUTE:  a muted pad contributes NOTHING (emits zero layers).
 *   - SOLO:  if ANY pad in the rack is soloed, ONLY soloed pads render
 *            (non-soloed pads are silenced, even if not muted). Solo wins over
 *            a pad's own mute only in that a soloed+muted pad is still muted
 *            (mute is the harder gate: muted → silent regardless of solo).
 *   - OPACITY: per-pad opacity multiplies onto each voice layer's opacity
 *              (which already folds in instrument opacity × ADSR envelope).
 *   - BLEND: per-pad blend mode REPLACES the layer's blend_mode so the channel
 *            composites onto the running sum with the pad's mode.
 *
 * Z-ORDER: pads are emitted in array order; within a pad, voices keep the
 * `buildVoiceLayers` ascending-triggerFrame order. So later pads composite on
 * top of earlier pads (NLE convention — matches the per-track sampler path).
 *
 * Regression safety: a project with NO rack never calls this — the per-track
 * sampler render path is untouched and renders byte-identical to today.
 *
 * Pure / no store reads — unit-testable without the App render pipeline.
 */
import { buildVoiceLayers } from './buildSamplerLayer'
import { evaluateVoices } from './voiceFSM'
import type { TriggerEvent } from './voiceFSM'
import type { RackNode, SamplerVoiceLayer } from './types'
import { RACK_PAD_OPACITY_MIN, RACK_PAD_OPACITY_MAX } from './types'
import type { Asset, ADSREnvelope } from '../../../shared/types'
import { clampFinite } from '../../../shared/numeric'

export interface BuildRackLayersOpts {
  /** Per-pad TriggerEvent log, keyed by pad id (frontend-evaluated). */
  eventsByPad: Record<string, TriggerEvent[]>
  /** Current render frame. */
  frame: number
  /** Project asset table (clipId → Asset). */
  assets: Record<string, Asset>
  /** Project fps fallback when an asset lacks fps meta. */
  defaultFps: number
  /** Rack-level voice envelope (Phase-5a: all pads share the rack ADSR). */
  adsr: ADSREnvelope
  /** Voice polyphony cap per pad. Default 4 (matches the per-track path). */
  voiceCap?: number
}

/**
 * Sum a rack's pad channels into one ordered layer list for `render_composite`.
 *
 * Returns [] for a null rack or a rack with no audible pads. The returned layers
 * are appended to the SAME `render_composite` layers array the per-track sampler
 * path uses, so the existing compositor sums them into the rack output frame.
 */
export function buildRackLayers(
  rack: RackNode | null,
  opts: BuildRackLayersOpts,
): SamplerVoiceLayer[] {
  if (!rack || rack.pads.length === 0) return []

  const { eventsByPad, frame, assets, defaultFps, adsr, voiceCap = 4 } = opts

  // SOLO gate: if ANY pad is soloed, only soloed pads are audible.
  const anySolo = rack.pads.some((p) => p.solo === true)

  const out: SamplerVoiceLayer[] = []

  for (const pad of rack.pads) {
    // MUTE is the harder gate — a muted pad is silent regardless of solo.
    if (pad.mute) continue
    // SOLO: when any pad is soloed, non-soloed pads are silenced.
    if (anySolo && !pad.solo) continue

    const events = eventsByPad[pad.id] ?? []
    const voices = evaluateVoices(events, frame, { voiceCap, adsr })

    // No active voices on this pad's channel → contributes nothing this frame.
    if (voices.length === 0) continue

    const padLayers = buildVoiceLayers(
      pad.instrument,
      voices,
      assets,
      frame,
      defaultFps,
      adsr,
    )

    // Apply the per-pad channel controls: opacity multiplies onto the voice
    // opacity (trust-boundary clamp), blend mode replaces the layer's mode so
    // the channel composites onto the running sum with the pad's mode.
    const padOpacity = clampFinite(
      pad.opacity,
      RACK_PAD_OPACITY_MIN,
      RACK_PAD_OPACITY_MAX,
      1,
    )
    for (const layer of padLayers) {
      out.push({
        ...layer,
        opacity: clampFinite(
          layer.opacity * padOpacity,
          RACK_PAD_OPACITY_MIN,
          RACK_PAD_OPACITY_MAX,
          0,
        ),
        blend_mode: pad.blend,
        // B4-pad-chain (ENGINE slice): carry the pad's per-pad insert chain onto
        // each voice layer so it reaches `render_composite` in PREVIEW. The
        // base voice layer from buildVoiceLayers always has chain=[] (no
        // per-voice chain on the per-track path); the rack OVERRIDES it per-pad.
        // Absent pad.chain → [] → compositor's `if chain:` no-op → byte-identical
        // to a no-chain pad. EXPORT carries the SAME chain via the serialized
        // instrument dict (App.tsx), giving preview/export parity.
        chain: pad.chain ?? [],
      })
    }
  }

  return out
}
