/**
 * A1+A2 — Clip-transform automation lanes.
 *
 * ADDRESSING (A1): a transform lane targets ONE field of ONE clip's transform.
 *   paramPath = `clipTransform.<clipId>.<field>` where field ∈
 *   {x, y, scaleX, scaleY, rotation}. This mirrors the `projectParam.bpm`
 *   precedent (AutomationToolbar): a non-effect lane whose "effectId" is a
 *   reserved namespace. Construction reuses the store's `addLane(effectId,
 *   paramKey)` verbatim — `formatTransformLaneEffectId(clipId)` supplies the
 *   effectId and the field is the paramKey, so `${effectId}.${paramKey}`
 *   concatenates to the scheme with NO store change.
 *
 * PER-FRAME EVALUATION (A2): `evaluateTransformOverrides` mirrors
 *   `evaluateAutomationOverrides` — it shares the SAME interpolation math
 *   (`evaluateAutomation`) and normalization (`denormalize`), returning per-clip
 *   partial transforms. `mergeTransformOverride` folds those onto a base clip
 *   transform at the render-payload build site (a lane value REPLACES the field
 *   it automates; unautomated fields keep the base).
 *
 * Trust boundary: lane point values are normalized 0..1 (like effect lanes).
 *   denormalize maps them onto the field's *display* range (authoring-sane),
 *   then the value is CLAMPED to the field's *store* range — the SAME bounds the
 *   backend `_apply_clip_transform` enforces (scaleX/Y [0.01,100], rotation
 *   [-36000,36000], x/y [-10000,10000]). Non-finite values are dropped so
 *   NaN/Infinity never reaches the IPC payload.
 */
import type { AutomationLane } from '../../shared/types'
import { type ClipTransform, normalizeTransform } from '../../shared/types'
import { evaluateAutomation, denormalize } from './automation-evaluate'

/** The 5 automatable transform fields (flipH/flipV/anchor are NOT automatable). */
export type TransformField = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'

export const TRANSFORM_FIELDS: readonly TransformField[] = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
] as const

/** Reserved paramPath namespace for clip-transform lanes. */
export const CLIP_TRANSFORM_NAMESPACE = 'clipTransform'

interface TransformFieldMeta {
  /** Display label used in the toolbar picker ("Clip Transform · X"). */
  label: string
  /** Full backend clamp range (matches zmq_server `_apply_clip_transform`). */
  storeMin: number
  storeMax: number
  /** Sane authoring range the lane's 0..1 curve maps onto. */
  displayMin: number
  displayMax: number
}

/**
 * Registry metadata per field. Backend clamps (store*) mirror
 * `_apply_clip_transform`; display* is the sane range the lane curve maps onto.
 */
export const TRANSFORM_FIELD_META: Record<TransformField, TransformFieldMeta> = {
  x: { label: 'X', storeMin: -10000, storeMax: 10000, displayMin: -2000, displayMax: 2000 },
  y: { label: 'Y', storeMin: -10000, storeMax: 10000, displayMin: -2000, displayMax: 2000 },
  scaleX: { label: 'Scale X', storeMin: 0.01, storeMax: 100, displayMin: 0.01, displayMax: 10 },
  scaleY: { label: 'Scale Y', storeMin: 0.01, storeMax: 100, displayMin: 0.01, displayMax: 10 },
  rotation: { label: 'Rotation', storeMin: -36000, storeMax: 36000, displayMin: -360, displayMax: 360 },
}

/**
 * The "effectId" half of a transform lane's paramPath. Passed to the store's
 * `addLane(trackId, effectId, paramKey=field, color)` so the existing
 * `${effectId}.${paramKey}` concatenation yields `clipTransform.<clipId>.<field>`.
 */
export function formatTransformLaneEffectId(clipId: string): string {
  return `${CLIP_TRANSFORM_NAMESPACE}.${clipId}`
}

/** Build the full paramPath for a transform lane (round-trips with the parser). */
export function formatTransformLanePath(clipId: string, field: TransformField): string {
  return `${CLIP_TRANSFORM_NAMESPACE}.${clipId}.${field}`
}

/**
 * Parse a transform-lane paramPath → {clipId, field}, or null if it isn't one.
 * One function, one place — everything transform-lane-shaped goes through here
 * (no scattered string.split).
 *
 * Red-team hardening (PR #344 review): STRICT shape — exactly 3 dot-separated
 * segments (`clipTransform` · clipId · field) with a non-empty, dot-free clipId.
 * Clip ids are `randomUUID()` (never contain dots), so every toolbar-created
 * lane parses; anything looser (extra segments, empty/dotted middle) is
 * rejected. Defense-in-depth against forged paramPaths in tampered .glitch
 * files — the primary guard is the reserved-namespace strip at project load
 * (project-persistence.ts sanitizeEffectChain + transform-lane clip check).
 */
export function parseTransformLanePath(
  paramPath: string,
): { clipId: string; field: TransformField } | null {
  const segments = paramPath.split('.')
  if (segments.length !== 3) return null
  const [ns, clipId, field] = segments
  if (ns !== CLIP_TRANSFORM_NAMESPACE) return null
  if (!clipId) return null // non-empty; dot-free is guaranteed by the 3-way split
  if (!TRANSFORM_FIELDS.includes(field as TransformField)) return null
  return { clipId, field: field as TransformField }
}

/** A partial transform: only the automated fields are present. */
export type TransformOverride = Partial<Record<TransformField, number>>

/**
 * Evaluate all clip-transform lanes at `time`, returning per-clip overrides.
 * Mirrors evaluateAutomationOverrides (shares evaluateAutomation + denormalize).
 * - hidden lanes are skipped (consistent with evaluateAutomationOverrides)
 * - non-transform lanes are skipped (parseTransformLanePath returns null)
 * - the normalized value is denormalized onto the field's display range then
 *   CLAMPED to the field's store (backend) range
 * - NaN/Infinity is dropped at every stage (trust boundary)
 */
export function evaluateTransformOverrides(
  lanes: AutomationLane[],
  time: number,
): Record<string, TransformOverride> {
  const out: Record<string, TransformOverride> = {}

  for (const lane of lanes) {
    if (!lane.isVisible) continue
    const parsed = parseTransformLanePath(lane.paramPath)
    if (!parsed) continue

    const normalized = evaluateAutomation(lane, time)
    if (normalized === null || !Number.isFinite(normalized)) continue

    const meta = TRANSFORM_FIELD_META[parsed.field]
    const denorm = denormalize(normalized, meta.displayMin, meta.displayMax)
    if (!Number.isFinite(denorm)) continue

    const clamped = Math.max(meta.storeMin, Math.min(meta.storeMax, denorm))
    // Final finite guard — clamped is finite here, but keep the boundary explicit.
    if (!Number.isFinite(clamped)) continue

    ;(out[parsed.clipId] ??= {})[parsed.field] = clamped
  }

  return out
}

/**
 * Fold an override onto a base clip transform. Present (finite) override fields
 * REPLACE the base; every other field keeps the base value. Undefined base →
 * identity base (a clip that carries no transform yet but has a lane).
 *
 * Finite-guard at the fold site (defense in depth): a non-finite override field
 * is ignored so NaN/Infinity never reaches the transform in the IPC payload.
 */
export function mergeTransformOverride(
  base: ClipTransform | undefined,
  override: TransformOverride,
): ClipTransform {
  const b = normalizeTransform(base)
  const merged: ClipTransform = { ...b }
  for (const field of TRANSFORM_FIELDS) {
    const v = override[field]
    if (v !== undefined && Number.isFinite(v)) {
      merged[field] = v
    }
  }
  return merged
}
