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
  /** UE.7: Maximum clip label length; clamped at trust boundary in renameClip. */
  MAX_CLIP_NAME_LENGTH: 100,
  /**
   * MK.9: composite-layer cap. MIRRORS the backend security boundary
   * `backend/src/security.py:MAX_COMPOSITE_LAYERS` (= 50, INJ-3 OOM guard).
   * The VALUE is owned by the backend (DO-NOT-TOUCH); this is a read-only mirror
   * so cut/copy-to-track can REFUSE pre-flight before the render path would
   * reject a 51-layer composite. Keep in lockstep with security.py.
   */
  MAX_COMPOSITE_LAYERS: 50,
} as const

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
  'util.hsl_adjust',
  'util.color_balance',
])
