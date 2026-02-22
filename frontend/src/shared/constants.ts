/**
 * Entropic v2 — Shared constants.
 */

/** Effect category prefixes matching the taxonomy */
export const CATEGORY = {
  TOOLS: "util",
  EFFECTS: "fx",
  OPERATORS: "mod",
} as const;

/** Shared memory defaults */
export const SHM = {
  HEADER_SIZE: 64,
  RING_SIZE: 4,
  SLOT_SIZE: 4 * 1024 * 1024, // 4MB
} as const;

/** Watchdog timing */
export const WATCHDOG = {
  PING_INTERVAL_MS: 1000,
  TIMEOUT_MS: 2000,
  MAX_MISSES: 3,
} as const;
