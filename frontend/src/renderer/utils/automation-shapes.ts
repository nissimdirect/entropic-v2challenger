import type { AutomationPoint } from '../../shared/types'

/**
 * AA.3a — Insert Automation Shape.
 *
 * Pure, side-effect-free generators for common LFO/envelope shapes used to
 * one-click bake breakpoints into an automation lane (see
 * stores/automation.ts's `insertShapeIntoLane`). No store access here —
 * independently testable, mirrors automation-simplify.ts's shape.
 */
export type AutomationShapeKind =
  | 'sine'
  | 'triangle'
  | 'saw-up'
  | 'saw-down'
  | 'square'
  | 'ramp-up'
  | 'ramp-down'
  | 'random'

export const AUTOMATION_SHAPES: ReadonlyArray<{ value: AutomationShapeKind; label: string }> = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'saw-up', label: 'Saw Up' },
  { value: 'saw-down', label: 'Saw Down' },
  { value: 'square', label: 'Square' },
  { value: 'ramp-up', label: 'Ramp Up' },
  { value: 'ramp-down', label: 'Ramp Down' },
  { value: 'random', label: 'Random (S&H)' },
]

export interface ShapeGenOptions {
  /**
   * Number of full periods spread across [startTime, endTime]. Ignored by
   * 'ramp-up'/'ramp-down' (always a single monotonic sweep across the whole
   * span regardless of `cycles`). Repurposed as the number of
   * sample-and-hold STEPS for 'random' (rounded, minimum 1).
   */
  cycles: number
  /**
   * Scales the shape's deviation from the [min,max] midpoint — amplitude=1
   * uses the full [min,max] swing, amplitude=0.5 uses half, amplitude=0
   * collapses to a flat line at the midpoint. Not clamped itself (a caller
   * could intentionally overshoot), but the final sampled VALUE always is.
   */
  amplitude: number
  /**
   * Phase offset as a fraction of one cycle (0..1), default 0. For
   * 'random', this doubles as the deterministic PRNG seed input (same phase
   * -> same S&H sequence) since a periodic phase has no meaning for noise.
   */
  phase?: number
  min?: number
  max?: number
  startTime: number
  endTime: number
  /**
   * Number of AutomationPoints to generate, evenly spaced across
   * [startTime, endTime] inclusive of both ends. Clamped to >= 2 (>= 1 only
   * when startTime === endTime, a degenerate zero-width span).
   */
  count: number
}

const DEFAULT_MIN = 0
const DEFAULT_MAX = 1

/** Sensible default point density: ~16 samples/cycle, clamped to [8, 512]. */
export function defaultShapePointCount(cycles: number): number {
  const c = Number.isFinite(cycles) && cycles > 0 ? cycles : 1
  return Math.max(8, Math.min(512, Math.round(c * 16)))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** mulberry32 — small, fast, deterministic PRNG. Same seed -> same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Triangle wave in [-1, 1]: 0 at u=0/0.5/1, peak +1 at u=0.25, trough -1 at u=0.75. */
function triangleWave(u: number): number {
  const x = u - Math.floor(u)
  if (x < 0.25) return x * 4
  if (x < 0.75) return 1 - 4 * (x - 0.25)
  return -1 + 4 * (x - 0.75)
}

/** Square wave in [-1, 1]: +1 for the first half-cycle, -1 for the second. */
function squareWave(u: number): number {
  const x = u - Math.floor(u)
  return x < 0.5 ? 1 : -1
}

/** Sawtooth ramping from -1 up toward +1 across each cycle, then resetting. */
function sawUpWave(u: number): number {
  const x = u - Math.floor(u)
  return 2 * x - 1
}

/** Sawtooth ramping from +1 down toward -1 across each cycle, then resetting. */
function sawDownWave(u: number): number {
  const x = u - Math.floor(u)
  return 1 - 2 * x
}

/**
 * Generate evenly-spaced AutomationPoints tracing `shape` across
 * [startTime, endTime], with values clamped to [min, max].
 */
export function generateShapePoints(
  shape: AutomationShapeKind,
  opts: ShapeGenOptions,
): AutomationPoint[] {
  const minIn = Number.isFinite(opts.min) ? (opts.min as number) : DEFAULT_MIN
  const maxIn = Number.isFinite(opts.max) ? (opts.max as number) : DEFAULT_MAX
  const lo = Math.min(minIn, maxIn)
  const hi = Math.max(minIn, maxIn)
  const center = (lo + hi) / 2
  const halfRange = (hi - lo) / 2
  const amplitude = Number.isFinite(opts.amplitude) ? opts.amplitude : 1
  const cycles = Number.isFinite(opts.cycles) && opts.cycles > 0 ? opts.cycles : 1
  const phase = Number.isFinite(opts.phase) ? (opts.phase as number) : 0

  const startTime = Number.isFinite(opts.startTime) ? opts.startTime : 0
  const endTime = Number.isFinite(opts.endTime) ? opts.endTime : startTime
  const span = endTime - startTime

  const rawCount = Number.isFinite(opts.count) ? Math.round(opts.count) : 0
  // A zero-width span can only ever hold ONE distinct point in time —
  // multiple points at the same `time` would violate every other lane
  // consumer's "strictly non-decreasing time" assumption (sort, binary
  // search in axis-lanes.ts, etc.) — so `count` is forced to 1 regardless
  // of what was requested.
  const count = span === 0 ? 1 : Math.max(2, rawCount)

  // Seed the S&H PRNG from `phase` so 'random' is deterministic per-call —
  // (phase * 2^32) mapped into mulberry32's 32-bit seed space, `|| 1` so a
  // phase of exactly 0 doesn't degenerate to the all-zero seed.
  const steps = Math.max(1, Math.round(cycles))
  const stepValues: number[] = []
  if (shape === 'random') {
    const rng = mulberry32(Math.round(phase * 0xffffffff) || 1)
    for (let s = 0; s < steps; s++) stepValues.push(rng() * 2 - 1)
  }

  const points: AutomationPoint[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : i / (count - 1)
    const time = startTime + u * span
    const cyclePos = cycles * u + phase

    let shapeVal: number
    switch (shape) {
      case 'sine':
        shapeVal = Math.sin(2 * Math.PI * cyclePos)
        break
      case 'triangle':
        shapeVal = triangleWave(cyclePos)
        break
      case 'saw-up':
        shapeVal = sawUpWave(cyclePos)
        break
      case 'saw-down':
        shapeVal = sawDownWave(cyclePos)
        break
      case 'square':
        shapeVal = squareWave(cyclePos)
        break
      case 'ramp-up':
        // Ignores `cycles` — always one monotonic sweep across the whole span.
        shapeVal = 2 * u - 1
        break
      case 'ramp-down':
        shapeVal = 1 - 2 * u
        break
      case 'random': {
        const stepIdx = Math.min(steps - 1, Math.floor(u * steps))
        shapeVal = stepValues[stepIdx]
        break
      }
      default:
        shapeVal = 0
    }

    const value = clamp(center + halfRange * amplitude * shapeVal, lo, hi)
    points[i] = { time, value, curve: 0 }
  }

  return points
}
