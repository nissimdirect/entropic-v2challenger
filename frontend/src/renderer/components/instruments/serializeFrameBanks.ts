/**
 * B6.1 — Frame-Bank export serialization (INSTRUMENTS-BUILD-PLAN.md §B6).
 *
 * Mirrors the sampler/rack serialization in App.tsx `buildPerformancePayload`:
 * turns the instruments-store `frameBanks` map into the `frameBanks` payload the
 * backend export reads (engine.frame_bank), and registers every slot's source
 * clip into the SAME `assets` table samplers use (so the backend can resolve
 * clipId → asset path for each slot decode).
 *
 * The backend `security.validate_frame_bank` is the enforcing trust boundary
 * (clamps position + byteBudget, rejects over-cap slots). This serializer ships
 * the model values verbatim — additive optional: no frameBanks → empty payload →
 * `frameBanks` omitted from the export → render byte-identical (regression-safe).
 */
import type { FrameBankInstrument } from './types'

/** Minimal asset shape the serializer needs (subset of the project asset). */
export interface FrameBankAsset {
  path: string
  meta?: { fps?: number; duration?: number }
}

/** The serialized asset entry the backend export consumes. */
export interface SerializedAsset {
  path: string
  frameCount: number
  fps: number
}

export interface SerializeFrameBanksResult {
  /** frameBank id → serialized frameBank dict (or empty when none). */
  frameBanks: Record<string, unknown>
  /** clipId → serialized asset, for every slot's source clip (deduped). */
  assets: Record<string, SerializedAsset>
}

/**
 * Serialize all frame-banks + collect their slot assets.
 *
 * @param frameBanks  store map: id → FrameBankInstrument
 * @param projectAssets  clipId → asset (path + meta)
 * @param defaultFps  fallback fps when an asset has no meta.fps
 */
export function serializeFrameBanks(
  frameBanks: Record<string, FrameBankInstrument>,
  projectAssets: Record<string, FrameBankAsset | undefined>,
  defaultFps: number,
): SerializeFrameBanksResult {
  const outBanks: Record<string, unknown> = {}
  const assets: Record<string, SerializedAsset> = {}

  const addAsset = (clipId: string) => {
    if (!clipId || assets[clipId]) return
    const asset = projectAssets[clipId]
    if (!asset?.path) return
    const metaFps = asset.meta?.fps
    const fps = Number.isFinite(metaFps) && metaFps! > 0 ? metaFps! : defaultFps
    const dur = Number.isFinite(asset.meta?.duration) ? asset.meta!.duration! : 0
    assets[clipId] = {
      path: asset.path,
      frameCount: Math.max(1, Math.round(dur * fps)),
      fps,
    }
  }

  for (const [id, fb] of Object.entries(frameBanks)) {
    if (!fb || fb.type !== 'frameBank') continue
    const slots = (fb.slots ?? []).map((s) => ({
      clipId: s.clipId,
      frameIndex: s.frameIndex,
    }))
    if (slots.length === 0) continue // unsourced bank → nothing to render
    for (const s of slots) addAsset(s.clipId)
    outBanks[id] = {
      type: 'frameBank',
      slots,
      position: fb.position,
      interp: fb.interp,
      byteBudget: fb.byteBudget,
      ...(fb.timeAxis !== undefined ? { timeAxis: fb.timeAxis } : {}),
      ...(fb.opacity !== undefined ? { opacity: fb.opacity } : {}),
      ...(fb.blendMode !== undefined ? { blendMode: fb.blendMode } : {}),
    }
  }

  return { frameBanks: outBanks, assets }
}
