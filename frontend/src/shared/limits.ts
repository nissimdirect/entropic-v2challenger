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
