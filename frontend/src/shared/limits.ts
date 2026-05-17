/**
 * Resource limits — centralized so all stores reference the same constants.
 * Existing projects that exceed limits are clamped on load, not rejected.
 */
export const LIMITS = {
  MAX_TRACKS: 64,
  MAX_CLIPS_PER_TRACK: 500,
  MAX_OPERATORS: 16,
  MAX_MARKERS: 1000,
  MAX_POINTS_PER_LANE: 50_000,
  MAX_COMPOSITOR_LAYERS: 32,
  MAX_EFFECTS_PER_CHAIN: 10,
} as const

/**
 * Synthetic trackId for the v2 project-level effect chain. The freeze store
 * was designed for per-track chains; v2 collapsed effectChain onto the
 * project store (one chain applied to whatever is rendering). UI call sites
 * use this constant; the freeze store's `frozenPrefixes: Record<trackId, ...>`
 * shape stays track-keyed so the existing test suite keeps passing and a
 * future per-track architecture can slot in without re-plumbing. V3 from the
 * 2026-05-15 red-team review: hoisted from `stores/freeze.ts` to break the
 * "constant defined in a store file" coupling.
 */
export const MASTER_TRACK_ID = 'master'

/**
 * Effects whose stock parameter defaults produce visually identical output
 * to input (zero adjustment). Adding one to a chain looks like nothing
 * happened until the user drags a param, which mimics a broken effect.
 *
 * F-0516-7 (filed via UAT 2026-05-16): the user reported "dry/wet doesn't
 * work" — a 206-effect sweep proved 0 in-place mutation bugs; the actual
 * cause for ~half the surprise effects was zero-default util plugins
 * looking like no-op until adjusted. Fix: one-time toast per effect_id
 * on first add to set expectations.
 */
export const ZERO_DEFAULT_EFFECT_IDS = new Set<string>([
  'util.curves',
  'util.levels',
  'util.hsl',
  'util.color_balance',
])
