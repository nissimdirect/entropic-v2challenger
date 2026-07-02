/**
 * B4.2 — Sample Rack macro resolution (THE LIVE render-path resolver).
 *
 * A macro is ONE control (0..1) that drives ONE-OR-MANY param destinations
 * (routes) on the rack's pads. For each route `pad.<padId>.<param>` the resolved
 * value `clamp01(macro.value) * depth` is written into the matching pad
 * instrument's param, clamped to the param's bounds, BEFORE `buildRackLayers`
 * runs — so the modulated value feeds the render (the SAME placement as
 * resolveSamplerModulations: write resolved value, then render).
 *
 * One macro → MANY routes (one-to-many). Multiple macros / routes hitting the
 * same target sum additively.
 *
 * Regression-safe: a rack with NO macros, all macros at 0, or no routes is
 * returned UNCHANGED (same reference) — the render path is byte-identical to
 * B4.1.
 *
 * FAN-OUT CAPS — DEFENSE IN DEPTH (this is the LIVE trust boundary).
 * ─────────────────────────────────────────────────────────────────
 * This resolver runs PER FRAME on the render thread (App.tsx rack render path).
 * A hand-edited / hostile project file could declare 8 macros × 50,000 routes →
 * 400,000 iterations/frame = a render-thread DoS. To make the render path
 * bounded REGARDLESS of input, this resolver hard-caps its own iteration BEFORE
 * the nested loop:
 *   - at most MAX_MACROS_PER_RACK (8) macros are considered;
 *   - at most MAX_MODROUTES_PER_MACRO (32) routes per macro;
 *   - at most MAX_TOTAL_EDGES (256) routes processed across the whole rack
 *     (a global ceiling — once hit, remaining macros/routes are skipped).
 * Excess macros/routes are TRUNCATED (ignored), never iterated. So even a
 * project loaded directly into the store with millions of routes can do at most
 * MAX_TOTAL_EDGES route-iterations per frame. The store-write actions
 * (stores/instruments.ts addRackMacro/addMacroRoute) ALSO enforce these caps so
 * the in-app editor can't build an over-cap rack; this is the second layer that
 * catches a hostile file that bypasses those actions.
 *
 * Trust boundary (mirrors MK.8 / B3.2): a route whose prefix isn't `pad`, whose
 * padId isn't a live pad, whose param isn't macro-able, or that is otherwise
 * malformed is SKIPPED — never throws. A NaN/Inf depth (or a zero-magnitude
 * contribution) is a true no-op and does NOT materialize the target param.
 *
 * Pure / no store reads — unit-testable without the App render pipeline.
 */
import type { RackNode } from './types'
import {
  RACK_MACRO_PARAM_BOUNDS,
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
  MAX_TOTAL_EDGES,
} from './types'

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
 * Result of a bounded macro resolve. `next` is the (possibly unchanged) rack;
 * `routesProcessed` is the number of route-iterations actually performed — the
 * bounded-iteration proof asserts this is ≤ MAX_TOTAL_EDGES regardless of input.
 */
export interface ResolveRackMacrosResult {
  next: RackNode | null
  routesProcessed: number
}

/**
 * Apply a rack's macro values to its pads' instrument params, returning BOTH the
 * resolved rack and the bounded route-iteration count. Use this overload in
 * tests that must prove the render thread can't be flooded.
 */
export function resolveRackMacrosBounded(
  rack: RackNode | null,
  // H2 (2026-07-02 master-tuneup WS5): optional macroId -> transient override
  // value (0-1), supplied by the live CC-bank resolver
  // (applyBankModulations.ts resolveBankMacroOverrides). When a macro's id is
  // present here, its OVERRIDE value is used instead of the persisted
  // macro.value for THIS resolve call only — this function still never
  // mutates the input rack or writes to any store; the override is applied
  // exactly like macro.value always was, just sourced differently. Absent /
  // no entry for a given macro id -> that macro's persisted value is used
  // unchanged (byte-identical to pre-H2 behavior).
  macroValueOverrides?: Map<string, number>,
): ResolveRackMacrosResult {
  if (!rack) return { next: rack, routesProcessed: 0 }
  const macros = rack.macros
  if (!Array.isArray(macros) || macros.length === 0) {
    return { next: rack, routesProcessed: 0 }
  }
  if (!Array.isArray(rack.pads) || rack.pads.length === 0) {
    return { next: rack, routesProcessed: 0 }
  }

  // Pad lookup by id.
  const padIds = new Set<string>()
  for (const pad of rack.pads) {
    if (pad && typeof pad.id === 'string') padIds.add(pad.id)
  }
  if (padIds.size === 0) return { next: rack, routesProcessed: 0 }

  // Accumulate the additive offset per `padId.param` across ALL macros/routes.
  const deltas = new Map<string, number>()

  // DEFENSE IN DEPTH: hard-cap iteration so a hostile file can't flood the
  // render thread. At most MAX_MACROS_PER_RACK macros, MAX_MODROUTES_PER_MACRO
  // routes/macro, and MAX_TOTAL_EDGES routes TOTAL are ever iterated.
  const macroCount = Math.min(macros.length, MAX_MACROS_PER_RACK)
  let routesProcessed = 0

  for (let mi = 0; mi < macroCount; mi++) {
    if (routesProcessed >= MAX_TOTAL_EDGES) break // global ceiling reached
    const macro = macros[mi]
    if (!macro || typeof macro !== 'object') continue
    const override = typeof macro.id === 'string' ? macroValueOverrides?.get(macro.id) : undefined
    const value = override !== undefined ? clamp01(override) : clamp01(macro.value)
    if (!Array.isArray(macro.routes)) continue
    // NOTE: we count truncated route-iterations even when value===0, because the
    // ITERATION is the DoS surface, not the write. Capping happens before the
    // per-route work regardless of value.
    const routeCount = Math.min(macro.routes.length, MAX_MODROUTES_PER_MACRO)

    for (let ri = 0; ri < routeCount; ri++) {
      if (routesProcessed >= MAX_TOTAL_EDGES) break // global ceiling reached
      routesProcessed++

      if (value === 0) continue // macro at 0 → no contribution (regression-safe)
      const route = macro.routes[ri]
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

  if (deltas.size === 0) return { next: rack, routesProcessed }

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

  return { next, routesProcessed }
}

/**
 * Apply a rack's macro values to its pads' instrument params (the render-path
 * entry point). Returns a new rack with the driven params, or the input rack
 * UNCHANGED when there is nothing to resolve. Iteration is hard-bounded by the
 * fan-out caps — see `resolveRackMacrosBounded`.
 */
export function resolveRackMacros(
  rack: RackNode | null,
  macroValueOverrides?: Map<string, number>,
): RackNode | null {
  return resolveRackMacrosBounded(rack, macroValueOverrides).next
}
