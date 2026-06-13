/**
 * B4.2 — Sample Rack macro resolution (frontend mirror of backend
 * `modulation/routing.resolve_rack_macros`).
 *
 * A macro is ONE control (0..1) that drives ONE-OR-MANY param destinations
 * (routes) on the rack's pads. For each route `pad.<padId>.<param>` the resolved
 * value `clamp01(macro.value) * depth` is written into the matching pad
 * instrument's param, clamped to the param's bounds, BEFORE `buildRackLayers`
 * runs — so the modulated value feeds the render (the SAME placement as
 * resolveSamplerModulations: write resolved value, then render).
 *
 * One macro → MANY routes (one-to-many). Multiple macros / routes hitting the
 * same target sum additively (same blend semantics as the backend resolver).
 *
 * Regression-safe: a rack with NO macros, all macros at 0, or no routes is
 * returned UNCHANGED (same reference) — the render path is byte-identical to
 * B4.1.
 *
 * Trust boundary (mirrors MK.8 / B3.2): a route whose prefix isn't `pad`, whose
 * padId isn't a live pad, whose param isn't macro-able, or that is otherwise
 * malformed is SKIPPED — never throws. A NaN/Inf depth (or a zero-magnitude
 * contribution) is a true no-op and does NOT materialize the target param.
 *
 * The FAN-OUT CAPS (MAX_MODROUTES_PER_MACRO / MAX_TOTAL_EDGES) are the enforcing
 * trust boundary in the backend `security.validate_rack_macros`; this resolver
 * is a pure best-effort writer and does not re-validate counts.
 *
 * Pure / no store reads — unit-testable without the App render pipeline.
 */
import type { RackNode } from './types'
import { RACK_MACRO_PARAM_BOUNDS } from './types'

/** Coerce x to a finite number in [0,1]; non-finite / non-number → 0. */
function clamp01(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/** Coerce a route depth to a finite number; NaN/Inf/non-number → 0 (no-op). */
function finiteDepth(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  return x
}

/**
 * Apply a rack's macro values to its pads' instrument params.
 *
 * Returns a new rack (deep-ish copy of pad instruments) with the driven params,
 * or the input rack UNCHANGED when there is nothing to resolve.
 */
export function resolveRackMacros(rack: RackNode | null): RackNode | null {
  if (!rack) return rack
  const macros = rack.macros
  if (!Array.isArray(macros) || macros.length === 0) return rack
  if (!Array.isArray(rack.pads) || rack.pads.length === 0) return rack

  // Pad lookup by id.
  const padIds = new Set<string>()
  for (const pad of rack.pads) {
    if (pad && typeof pad.id === 'string') padIds.add(pad.id)
  }
  if (padIds.size === 0) return rack

  // Accumulate the additive offset per `padId.param` across ALL macros/routes.
  const deltas = new Map<string, number>()

  for (const macro of macros) {
    if (!macro || typeof macro !== 'object') continue
    const value = clamp01(macro.value)
    if (value === 0) continue // macro at 0 → no contribution (regression-safe)
    if (!Array.isArray(macro.routes)) continue

    for (const route of macro.routes) {
      if (!route || typeof route !== 'object') continue
      const target = route.targetPath
      if (typeof target !== 'string' || !target.startsWith('pad.')) continue
      // pad.<padId>.<param> — pad ids have no dots (schema id regex).
      const parts = target.split('.')
      if (parts.length !== 3 || parts[0] !== 'pad') continue
      const padId = parts[1]
      const param = parts[2]
      if (!padIds.has(padId)) continue
      if (!(param in RACK_MACRO_PARAM_BOUNDS)) continue

      const contribution = value * finiteDepth(route.depth)
      // Zero-magnitude (depth 0 / NaN-Inf clamped) is a true no-op: it must NOT
      // materialize the target param (gate 3 trust boundary).
      if (contribution === 0) continue
      const key = `${padId}.${param}`
      deltas.set(key, (deltas.get(key) ?? 0) + contribution)
    }
  }

  if (deltas.size === 0) return rack // all routes missed / depths 0 → no effect

  // Copy only the pads (and their instruments) we mutate; share the rest.
  const next: RackNode = {
    ...rack,
    pads: rack.pads.map((pad) => ({ ...pad, instrument: { ...pad.instrument } })),
  }
  const padMap = new Map(next.pads.map((p) => [p.id, p]))

  for (const [key, offset] of deltas) {
    const dot = key.indexOf('.')
    const padId = key.slice(0, dot)
    const param = key.slice(dot + 1)
    const pad = padMap.get(padId)
    if (!pad) continue
    const bounds = RACK_MACRO_PARAM_BOUNDS[param]
    const [pMin, pMax] = bounds
    const inst = pad.instrument as unknown as Record<string, unknown>
    // Base: the param's current value if numeric (speed/opacity), else the
    // range min (scrub is a pure destination with no persisted base → 0).
    const cur = inst[param]
    const base = typeof cur === 'number' && Number.isFinite(cur) ? cur : pMin
    inst[param] = Math.max(pMin, Math.min(pMax, base + offset))
  }

  return next
}
