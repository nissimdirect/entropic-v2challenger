/**
 * memoryPressure store — P5b.2 (SG-8 frontend).
 *
 * Holds the latest `pressure_status` IPC reply and tracks which features are
 * NEWLY disabled since the last poll (used to fire per-feature degrade toasts
 * without duplicate firing when the same feature stays disabled across polls).
 *
 * Trust boundary: all incoming IPC data passes through `guardPressureReply`
 * (clamp + finite checks) before entering the store — never bypass it.
 */
import { create } from 'zustand'
import { useToastStore } from './toast'

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type PressureLevel = 'ok' | 'warn' | 'auto_disable' | 'emergency'

export interface PressureStatus {
  level: PressureLevel
  current_pct: number
  degraded_features: string[]
}

interface MemoryPressureState {
  level: PressureLevel
  current_pct: number
  degraded_features: string[]
  /** Set of feature names disabled in the PREVIOUS tick (for dedup). */
  _prevDisabled: ReadonlySet<string>
  setStatus: (status: PressureStatus) => void
  reset: () => void
}

// ---------------------------------------------------------------------------
// Trust-boundary guard (export so the polling hook + tests can use it)
// ---------------------------------------------------------------------------

/**
 * guardPressureReply — converts an unchecked IPC response to a `PressureStatus`.
 *
 * Rules:
 *   - `current_pct` must be finite and in [0, 100]; anything else → 0.
 *   - `level` must be one of the four known strings; anything else → 'ok'.
 *   - `degraded_features` must be an array of strings; anything else → [].
 *
 * This is the ONLY place numeric trust-boundary clamping occurs (per
 * feedback_numeric-trust-boundary.md — every numeric crossing IPC must be
 * clamp/finite guarded before rendering).
 */
const VALID_LEVELS = new Set<string>(['ok', 'warn', 'auto_disable', 'emergency'])

export function guardPressureReply(raw: Record<string, unknown>): PressureStatus {
  // current_pct
  const rawPct = raw['current_pct']
  const pct =
    typeof rawPct === 'number' && Number.isFinite(rawPct)
      ? Math.max(0, Math.min(100, rawPct))
      : 0

  // level
  const rawLevel = raw['level']
  const level: PressureLevel =
    typeof rawLevel === 'string' && VALID_LEVELS.has(rawLevel)
      ? (rawLevel as PressureLevel)
      : 'ok'

  // degraded_features
  const rawFeatures = raw['degraded_features']
  const degraded_features: string[] = Array.isArray(rawFeatures)
    ? rawFeatures.filter((f): f is string => typeof f === 'string')
    : []

  return { level, current_pct: pct, degraded_features }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  level: 'ok' as PressureLevel,
  current_pct: 0,
  degraded_features: [] as string[],
  _prevDisabled: new Set<string>(),
}

export const useMemoryPressureStore = create<MemoryPressureState>((set, get) => ({
  ...INITIAL_STATE,

  setStatus: ({ level, current_pct, degraded_features }) => {
    const { _prevDisabled } = get()
    const currentSet = new Set(degraded_features)

    // Fire a toast for each NEWLY disabled feature (not in prev tick).
    // The toast store's 2s rate-limit per source handles rapid re-fires within
    // a single poll cycle. We use a per-feature source key so each feature
    // gets its own dedup slot.
    for (const feature of degraded_features) {
      if (!_prevDisabled.has(feature)) {
        useToastStore.getState().addToast({
          level: 'warning',
          message: `Memory pressure auto-disabled: ${feature}`,
          source: `sg8-pressure:${feature}`,
        })
      }
    }

    // Fire a recovery toast for features that just came BACK
    for (const prev of _prevDisabled) {
      if (!currentSet.has(prev)) {
        useToastStore.getState().addToast({
          level: 'info',
          message: `Memory recovered — ${prev} re-enabled`,
          source: `sg8-pressure-recovery:${prev}`,
        })
      }
    }

    // Emergency level: a persistent "manual-dismiss" state toast (level='state').
    // Only fire when transitioning INTO emergency (not every poll tick).
    const wasEmergency = get().level === 'emergency'
    if (level === 'emergency' && !wasEmergency) {
      useToastStore.getState().addToast({
        level: 'state',
        message: 'Memory pressure critical — some features are disabled until memory is freed.',
        source: 'sg8-pressure-emergency',
        persistent: true,
      })
    }
    // If we just RECOVERED from emergency (any downgrade: ok / warn / auto_disable),
    // explicitly dismiss the persistent emergency toast. The dedup path cannot
    // remove a persistent toast, so we call dismissBySource directly to make
    // the transition symmetric: enter emergency → show toast, leave emergency →
    // dismiss toast. (Bug fix for audit HIGH #7 — state asymmetry.)
    if (level !== 'emergency' && wasEmergency) {
      useToastStore.getState().dismissBySource('sg8-pressure-emergency')
    }

    set({ level, current_pct, degraded_features, _prevDisabled: currentSet })
  },

  reset: () => set({ ...INITIAL_STATE, _prevDisabled: new Set() }),
}))
