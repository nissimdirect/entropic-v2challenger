/**
 * Resource limits — centralized so all stores reference the same constants.
 * Existing projects that exceed limits are clamped on load, not rejected.
 */
export const LIMITS = {
  MAX_TRACKS: 64,
  MAX_CLIPS_PER_TRACK: 500,
  /**
   * P4.1: operator cap raised to 64. MIRRORS backend security boundary
   * `backend/src/security.py:MAX_OPERATORS_PER_PROJECT` (= 64, qa-redteam M2 guard).
   * Dead-flag wired: operators.ts addOperator reads this constant.
   */
  MAX_OPERATORS: 64,
  /** P4.1: per-operator mapping cap — defense in depth (also enforced in routing.py). */
  MAX_MAPPINGS_PER_OPERATOR: 32,
  /**
   * P5b.21 (B9): project-wide cap on the TOTAL number of modulation edges
   * (operator mappings summed across ALL operators). MIRRORS the backend boundary
   * `backend/src/security.py:MAX_MOD_EDGES_TOTAL` (= 2048 = 64×32). Distinct from
   * the per-operator cap (32) and from operator count (64): a project can be under
   * both per-op caps yet exceed the total. Enforced in loadOperators (the real
   * production rehydration boundary) AND at the backend render/export ingress.
   */
  MAX_MOD_EDGES_TOTAL: 64 * 32,
  MAX_MARKERS: 1000,
  MAX_POINTS_PER_LANE: 50_000,
  MAX_COMPOSITOR_LAYERS: 32,
  MAX_EFFECTS_PER_CHAIN: 10,
  /** UE.7: Maximum clip label length; clamped at trust boundary in renameClip. */
  MAX_CLIP_NAME_LENGTH: 100,
  /** T4: Maximum marker label length; clamped + control-char-stripped at the
   * trust boundary in renameMarker (user text rendered into the DOM). */
  MAX_MARKER_LABEL_LENGTH: 80,
  /**
   * MK.9: composite-layer cap. MIRRORS the backend security boundary
   * `backend/src/security.py:MAX_COMPOSITE_LAYERS` (= 50, INJ-3 OOM guard).
   * The VALUE is owned by the backend (DO-NOT-TOUCH); this is a read-only mirror
   * so cut/copy-to-track can REFUSE pre-flight before the render path would
   * reject a 51-layer composite. Keep in lockstep with security.py.
   */
  MAX_COMPOSITE_LAYERS: 50,
  /**
   * P6.8 (I1): max probes on the single inspector track. UI cap of 16 leaves
   * deliberate headroom under the backend `MAX_PROBES` (= 64, registry.py:35)
   * which is the registry-wide hard limit. The 17th drag is rejected with a toast.
   */
  MAX_PROBES_PER_TRACK: 16,
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
