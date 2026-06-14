/**
 * P6.6 — Frontend FieldRef schema (the C3 "image-as-2D-field" param value).
 *
 * A *field param* lets an effect parameter be driven by a live image/video/lane2d
 * buffer instead of a scalar.  The serialized wire form (matching the backend
 * `backend/src/effects/field_params.py`) is:
 *
 *   {"__field__": {"kind": "image", "source_id": "...", "gain": 1.0, "invert": false}}
 *
 * The INNER object is snake_case on purpose: it rides through the IPC
 * serialization layer (`ipc-serialize.ts`) byte-identically into the Python
 * pipeline, which reads `source_id` directly via `FieldRef.from_dict`.  We
 * therefore store it snake_case in the frontend param value too, so there is no
 * conversion step and no chance of a camelCase/snake_case mismatch.
 *
 * `__field__` is a value SENTINEL key (inside the param value dict), NOT a
 * top-level param key — it never collides with the "_" reserved-prefix keys.
 */

/** The value-sentinel key marking a param value as a FieldRef. */
export const FIELD_SENTINEL = '__field__' as const

/** Valid field source kinds. `lane2d` is schema-reserved (painted-field UI is Tier 3). */
export type FieldKind = 'image' | 'video' | 'lane2d'

export const VALID_FIELD_KINDS: readonly FieldKind[] = ['image', 'video', 'lane2d']

/** Gain clamp bounds — mirrors backend `_GAIN_MIN`/`_GAIN_MAX`. Trust boundary. */
export const FIELD_GAIN_MIN = -4
export const FIELD_GAIN_MAX = 4

/** Max source_id length — mirrors backend `_SOURCE_ID_MAX_LEN`. */
export const FIELD_SOURCE_ID_MAX_LEN = 256

/**
 * The inner FieldRef payload (snake_case to match the backend wire shape).
 */
export interface FieldRefInner {
  kind: FieldKind
  source_id: string
  gain: number
  invert: boolean
}

/**
 * A param value that is a field reference. The sentinel-keyed wrapper makes it
 * structurally distinguishable from scalar param values at every layer.
 */
export interface FieldRefValue {
  [FIELD_SENTINEL]: FieldRefInner
}

/** Clamp + finite-guard a gain to [-4, 4]. Non-finite → 1.0 (the default). */
export function clampGain(gain: unknown): number {
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return 1
  return Math.max(FIELD_GAIN_MIN, Math.min(FIELD_GAIN_MAX, gain))
}

/**
 * Type guard: is this param value a FieldRef wrapper?
 * A value is a FieldRef iff it is a non-null object carrying the `__field__`
 * sentinel whose inner payload is itself an object. Scalars pass through false.
 */
export function isFieldRef(value: unknown): value is FieldRefValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    FIELD_SENTINEL in value &&
    typeof (value as Record<string, unknown>)[FIELD_SENTINEL] === 'object' &&
    (value as Record<string, unknown>)[FIELD_SENTINEL] !== null
  )
}

/**
 * Build a fresh FieldRef value from a chosen source. Gain is clamped; kind is
 * validated; source_id is required non-empty and length-capped.
 */
export function makeFieldRef(
  kind: FieldKind,
  sourceId: string,
  gain = 1,
  invert = false,
): FieldRefValue {
  return {
    [FIELD_SENTINEL]: {
      kind,
      source_id: sourceId.slice(0, FIELD_SOURCE_ID_MAX_LEN),
      gain: clampGain(gain),
      invert: !!invert,
    },
  }
}

/**
 * Load-time validator for a single persisted field value (trust boundary).
 *
 * Returns a sanitized `FieldRefValue` (gain clamped, kind/source validated), or
 * `null` if the dict is malformed and must be dropped to the param default.
 *
 * Named failure modes (P6.6 step 5):
 *  - missing/invalid `kind`            → drop (null)
 *  - missing/empty/over-long source_id → drop (null)
 *  - NaN/Inf/out-of-range gain         → clamp to [-4, 4]
 */
export function validateFieldRefOnLoad(value: unknown): FieldRefValue | null {
  if (!isFieldRef(value)) return null
  const inner = (value as FieldRefValue)[FIELD_SENTINEL] as Record<string, unknown>

  const kind = inner.kind
  if (typeof kind !== 'string' || !VALID_FIELD_KINDS.includes(kind as FieldKind)) {
    return null
  }

  const sourceId = inner.source_id
  if (typeof sourceId !== 'string' || sourceId.length === 0) return null
  if (sourceId.length > FIELD_SOURCE_ID_MAX_LEN) return null

  // gain: clamp NaN/Inf/out-of-range to a finite in-range value.
  const gain = clampGain(inner.gain)
  const invert = !!inner.invert

  return {
    [FIELD_SENTINEL]: {
      kind: kind as FieldKind,
      source_id: sourceId,
      gain,
      invert,
    },
  }
}
