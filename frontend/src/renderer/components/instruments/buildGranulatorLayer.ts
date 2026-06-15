/**
 * B8 — Serialize a GranulatorInstrument into the `performance.granulator`
 * payload dict that the backend `_parse_granulator_layer` expects.
 *
 * Pure seam between the App.tsx render path and the zmq_server granulator arm.
 * Returns null when no granulator is present on this track (the caller appends
 * nothing and does NOT include `performance.granulator` → render byte-identical
 * to pre-B8). Kept pure so the wiring is unit-testable without the full App
 * render pipeline.
 *
 * MIRROR of backend `_parse_granulator_layer` contract:
 *   density        — int, [0, MAX_GRAINS]
 *   window         — str, 'hann'|'tri'|'rect'
 *   axes           — dict[axis → {grain, jitter, position, grain_env}]
 *                    Keys MUST be UPPERCASE (T/Y/X/C/F/L) per the backend
 *                    GranulatorParams axes dict (granulator_instrument.py AXES).
 *   l_axis_enabled — bool
 *   selection      — str, accepted rule per accepted_selection_rules()
 *   instrument_id  — str, for the backend grain-seed derivation
 *
 * Trust boundary: this function is a pure serializer — it does NOT clamp
 * numerics (the store already clamped at the write boundary). The backend
 * `_parse_granulator_layer` is the enforcing trust boundary for the IPC path;
 * `GranulatorParams.__post_init__` is the second line of defense.
 *
 * Mirrored test: `frontend/src/__tests__/components/instruments/
 * granulator-device.test.tsx` ('layer dict matches backend contract').
 */
import type { GranulatorInstrument } from './types'
import { GRANULATOR_AXES } from './types'

/**
 * The `performance.granulator` payload dict (sent in the `render_performance` /
 * `render_composite` IPC message). Mirrors the shape `_parse_granulator_layer`
 * reads. Use snake_case for ALL keys (IPC camelCase→snake_case convention: the
 * serialization layer converts JS camelCase to Python snake_case for normal
 * layer fields, but the granulator sub-dict is a raw JSON object — be explicit).
 */
export interface GranulatorLayerDict {
  instrument_id: string
  density: number
  window: string
  axes: Record<string, {
    grain: number
    jitter: number
    position: number
    grain_env: number
  }>
  l_axis_enabled: boolean
  selection: string
}

/**
 * Build the `performance.granulator` payload dict from a GranulatorInstrument.
 *
 * Returns null when `inst` is null/undefined → the caller omits
 * `performance.granulator` → render byte-identical to pre-B8.
 *
 * Axis keys are UPPERCASE in the output because the backend GranulatorParams
 * `AXES` tuple is `("T", "Y", "X", "C", "F", "L")` and the `_parse_granulator_layer`
 * iterates raw_axes keys directly. The frontend stores axes in LOWERCASE per
 * P1-A canon; this builder uppercases them for the IPC boundary.
 */
export function buildGranulatorLayer(
  inst: GranulatorInstrument | null | undefined,
): GranulatorLayerDict | null {
  if (!inst) return null

  // Build the per-axis sub-dict. Axis keys uppercased for backend parity.
  const axes: GranulatorLayerDict['axes'] = {}
  for (const ax of GRANULATOR_AXES) {
    const p = inst.axes[ax]
    if (!p) continue
    axes[ax.toUpperCase()] = {
      grain: p.grain,
      jitter: p.jitter,
      position: p.position,
      grain_env: p.envelope, // UI uses `envelope`; backend key is `grain_env`
    }
  }

  return {
    instrument_id: inst.id,
    density: inst.density,
    window: inst.window,
    axes,
    l_axis_enabled: inst.lAxisEnabled,
    selection: inst.selection,
  }
}
