/**
 * B8 Granulator — PAYLOAD WIRING test (audit HIGH #9).
 *
 * The B8 bug was "not wired end-to-end": the backend granulator render arm
 * (zmq_server `_handle_render_composite` → `_parse_granulator_layer`) was ready,
 * but the frontend NEVER put a `performance.granulator` dict on the render
 * payload, so the headline instrument was unreachable/silent.
 *
 * This test asserts the SERIALIZATION SEAM the App.tsx preview path uses:
 *   selected performance track's granulator
 *     → buildGranulatorLayer(instrState.granulators[selectedTrackId])
 *     → `performance.granulator` (the exact dict `_parse_granulator_layer` reads)
 *
 * App.tsx (preview send, render_composite) does EXACTLY:
 *   const granInst = selectedTrackId ? instrState.granulators[selectedTrackId] : undefined
 *   const granPreview = buildGranulatorLayer(granInst)
 *   if (granPreview !== null) performance.granulator = granPreview
 *
 * We replicate that expression against the live store here so the wiring is
 * unit-tested without the full App render pipeline (mock IPC — no ZMQ). The
 * shape is asserted field-by-field against the backend `_parse_granulator_layer`
 * contract (density/window/axes[UPPERCASE]/l_axis_enabled/selection/instrument_id).
 *
 * Backend contract (zmq_server.py `_parse_granulator_layer`):
 *   density        — number (int after cast), 0..MAX_GRAINS
 *   window         — str 'hann'|'tri'|'rect'
 *   axes           — dict[UPPERCASE axis → {grain, jitter, position, grain_env}]
 *   l_axis_enabled — bool
 *   selection      — str (accepted rule)
 *   instrument_id  — str
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { buildGranulatorLayer } from '../../../renderer/components/instruments/buildGranulatorLayer'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'

const TRACK = 'perf-track-1'

/**
 * Mirror of the App.tsx preview-send serialization expression. Returns the
 * `performance.granulator` value the render_composite IPC carries (or null when
 * the selected track has no granulator → key omitted → byte-identical to pre-B8).
 */
function buildPreviewGranulatorPayload(selectedTrackId: string | null) {
  const instrState = useInstrumentsStore.getState()
  const granInst = selectedTrackId ? instrState.granulators[selectedTrackId] : undefined
  return buildGranulatorLayer(granInst)
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
})

describe('B8 granulator preview payload wiring', () => {
  it('no granulator on the selected track → payload omits performance.granulator (regression-safe)', () => {
    // No granulator added → null → App omits `performance.granulator` entirely.
    expect(buildPreviewGranulatorPayload(TRACK)).toBeNull()
    // Also null when nothing is selected.
    expect(buildPreviewGranulatorPayload(null)).toBeNull()
  })

  it('full chain: addGranulator → preview payload carries performance.granulator with the exact backend dict', () => {
    // Step 1 — the browser handler dispatches this on double-click.
    useInstrumentsStore.getState().addGranulator(TRACK)

    // Step 2 — the App preview-send expression serializes the selected track's
    // granulator. THIS is the dict that ships on `performance.granulator`.
    const payload = buildPreviewGranulatorPayload(TRACK)
    expect(payload).not.toBeNull()
    if (!payload) throw new Error('expected payload')

    // --- backend `_parse_granulator_layer` contract, field-by-field ----------
    expect(typeof payload.instrument_id).toBe('string')
    expect(payload.instrument_id.length).toBeGreaterThan(0)

    expect(typeof payload.density).toBe('number')
    expect(Number.isFinite(payload.density)).toBe(true)
    expect(payload.density).toBeGreaterThanOrEqual(0)

    expect(['hann', 'tri', 'rect']).toContain(payload.window)

    expect(typeof payload.l_axis_enabled).toBe('boolean')

    // selection must be a backend-accepted rule (random/onset; latentSimilarity flag-gated).
    expect(['random', 'onset', 'latentSimilarity']).toContain(payload.selection)

    // axes — keys UPPERCASE (backend GranulatorParams AXES = T/Y/X/C/F/L), each
    // with snake_case grain/jitter/position/grain_env (NOT `envelope`).
    const axisKeys = Object.keys(payload.axes).sort()
    expect(axisKeys).toEqual(['C', 'F', 'L', 'T', 'X', 'Y'])
    for (const k of axisKeys) {
      expect(k).toBe(k.toUpperCase())
      const ap = payload.axes[k]
      expect(typeof ap.grain).toBe('number')
      expect(typeof ap.jitter).toBe('number')
      expect(typeof ap.position).toBe('number')
      expect(typeof ap.grain_env).toBe('number')
      // `envelope` (the UI-side key) must NOT cross the IPC boundary.
      expect((ap as Record<string, unknown>).envelope).toBeUndefined()
    }
  })

  it('full chain: density/selection edits propagate into the preview payload dict', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(TRACK)
    s.setGranulatorDensity(TRACK, 9)
    s.setGranulatorSelection(TRACK, 'onset', false)
    s.setGranulatorLAxisEnabled(TRACK, true)
    s.setGranulatorWindow(TRACK, 'tri')

    const payload = buildPreviewGranulatorPayload(TRACK)!
    expect(payload.density).toBe(9)
    expect(payload.selection).toBe('onset')
    expect(payload.l_axis_enabled).toBe(true)
    expect(payload.window).toBe('tri')
  })

  it('payload binds to the SELECTED track (a granulator on another track is not sent)', () => {
    useInstrumentsStore.getState().addGranulator('other-track')
    // Selected track has no granulator → null even though another track has one.
    expect(buildPreviewGranulatorPayload(TRACK)).toBeNull()
    // Select the track that has it → payload present.
    expect(buildPreviewGranulatorPayload('other-track')).not.toBeNull()
  })
})
