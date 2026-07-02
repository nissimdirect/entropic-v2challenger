/**
 * B8 Granulator — PAYLOAD WIRING test (audit HIGH #9).
 *
 * F7 (2026-07-02 month-audit-fix-plan) — this test USED TO be a mirror: it
 * re-implemented App.tsx's `performance.granulator` serialization expression
 * against the live store and asserted on the mirror's own output. That is a
 * drift-blind gate (the #299 gate-miss class): if App.tsx's real preview-send
 * code diverges from the copy-pasted expression here, this test keeps
 * passing while production silently breaks.
 *
 * REWRITTEN to render the REAL <App /> component tree (createMockEntropic
 * mock IPC boundary — no ZMQ) and intercept the REAL `window.entropic.
 * sendCommand` call App.tsx issues. We drive the exact real code paths:
 *   1. The Electron "Import Media" menu action (captured via the
 *      `onMenuAction` mock, same as a real native-menu click) -> real
 *      `handleFileIngest` -> real `ingest` sendCommand -> real
 *      `activeAssetPath.current` set -> real `requestRenderFrame` fires.
 *   2. Add a performance track + granulator via the same store actions the
 *      real GranulatorDevice double-click handler dispatches
 *      (`addTrack('performance')` + `addGranulator`) -> real B8 useEffect
 *      (deps: [granulators]) fires -> real `requestRenderFrame` -> real
 *      `render_composite` sendCommand carrying the REAL `performance.
 *      granulator` dict (not a hand-copied mirror).
 *
 * Backend contract (zmq_server.py `_parse_granulator_layer`), asserted
 * against the INTERCEPTED payload:
 *   density        — number (int after cast), 0..MAX_GRAINS
 *   window         — str 'hann'|'tri'|'rect'
 *   axes           — dict[UPPERCASE axis -> {grain, jitter, position, grain_env}]
 *   l_axis_enabled — bool
 *   selection      — str (accepted rule)
 *   instrument_id  — str
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, waitFor } from '@testing-library/react'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useProjectStore } from '../../../renderer/stores/project'
import { buildGranulatorLayer } from '../../../renderer/components/instruments/buildGranulatorLayer'
import { teardownMockEntropic } from '../../helpers/mock-entropic'
import { renderAppWithImportedMedia } from '../../helpers/render-app-with-media'

const TRACK_NAME = 'Perf'

function resetStores() {
  useTimelineStore.getState().reset()
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
  useProjectStore.setState({ assets: {} })
}

describe('B8 granulator preview payload wiring (real render + intercepted IPC)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
  })

  it('full chain: import media -> add granulator -> the REAL render_composite sendCommand carries the exact backend dict', async () => {
    const { sendCommandCalls } = await renderAppWithImportedMedia()

    // Step 1 — add a performance track and select it (D1: import
    // auto-selected the new video track, so we must explicitly select the
    // performance track before the granulator effect can bind to it).
    const trackId = useTimelineStore.getState().addTrack(TRACK_NAME, '#4ade80', 'performance')
    expect(trackId).toBeDefined()
    useTimelineStore.getState().selectTrack(trackId as string)

    // Step 2 — the real store action the browser handler dispatches on
    // double-click.
    useInstrumentsStore.getState().addGranulator(trackId as string)

    // Step 3 — App's B8 useEffect (deps: [granulators, currentFrame,
    // requestRenderFrame]) fires the REAL requestRenderFrame, which now
    // takes the render_composite path (hasGranulatorPreview === true) and
    // issues the REAL sendCommand carrying `performance.granulator`.
    await waitFor(() => {
      const call = sendCommandCalls.find(
        (c) => c.cmd === 'render_composite' && (c.performance as Record<string, unknown> | undefined)?.granulator,
      )
      expect(call).toBeDefined()
    })

    const compositeCall = sendCommandCalls.find(
      (c) => c.cmd === 'render_composite' && (c.performance as Record<string, unknown> | undefined)?.granulator,
    )!
    const performance = compositeCall.performance as Record<string, unknown>
    const payload = performance.granulator as Record<string, unknown>

    // --- backend `_parse_granulator_layer` contract, field-by-field, off
    // the ACTUAL intercepted IPC payload (not a hand-copied mirror) --------
    expect(typeof payload.instrument_id).toBe('string')
    expect((payload.instrument_id as string).length).toBeGreaterThan(0)

    expect(typeof payload.density).toBe('number')
    expect(Number.isFinite(payload.density as number)).toBe(true)
    expect(payload.density as number).toBeGreaterThanOrEqual(0)

    expect(['hann', 'tri', 'rect']).toContain(payload.window)

    expect(typeof payload.l_axis_enabled).toBe('boolean')

    // selection must be a backend-accepted rule (random/onset; latentSimilarity flag-gated).
    expect(['random', 'onset', 'latentSimilarity']).toContain(payload.selection)

    // axes — keys UPPERCASE (backend GranulatorParams AXES = T/Y/X/C/F/L), each
    // with snake_case grain/jitter/position/grain_env (NOT `envelope`).
    const axes = payload.axes as Record<string, Record<string, unknown>>
    const axisKeys = Object.keys(axes).sort()
    expect(axisKeys).toEqual(['C', 'F', 'L', 'T', 'X', 'Y'])
    for (const k of axisKeys) {
      expect(k).toBe(k.toUpperCase())
      const ap = axes[k]
      expect(typeof ap.grain).toBe('number')
      expect(typeof ap.jitter).toBe('number')
      expect(typeof ap.position).toBe('number')
      expect(typeof ap.grain_env).toBe('number')
      // `envelope` (the UI-side key) must NOT cross the IPC boundary.
      expect(ap.envelope).toBeUndefined()
    }

    // render_path is always present (never undefined) — audit #11.
    expect(typeof payload.render_path).toBe('string')
    expect(['cpu', 'gpu']).toContain(payload.render_path)
  })

  it('payload binds to the SELECTED track (a granulator on another track never leaks into the REAL IPC payload)', async () => {
    const { sendCommandCalls } = await renderAppWithImportedMedia()
    const preGranulatorCallCount = sendCommandCalls.length

    const otherTrackId = useTimelineStore.getState().addTrack('Other Perf', '#3b82f6', 'performance')
    useInstrumentsStore.getState().addGranulator(otherTrackId as string)

    const selectedTrackId = useTimelineStore.getState().addTrack(TRACK_NAME, '#4ade80', 'performance')
    useTimelineStore.getState().selectTrack(selectedTrackId as string)

    // Give any granulator-effect renders a beat to fire, then assert NONE of
    // them carry `performance.granulator` (selected track has no granulator
    // of its own — the REAL payload must not leak the other track's).
    await waitFor(() => {
      expect(sendCommandCalls.length).toBeGreaterThan(preGranulatorCallCount)
    })
    const leaked = sendCommandCalls.find(
      (c) => c.cmd === 'render_composite' && (c.performance as Record<string, unknown> | undefined)?.granulator,
    )
    expect(leaked).toBeUndefined()

    // Now add a granulator to the SELECTED track — the real IPC payload
    // must pick it up.
    useInstrumentsStore.getState().addGranulator(selectedTrackId as string)
    await waitFor(() => {
      const call = sendCommandCalls.find(
        (c) => c.cmd === 'render_composite' && (c.performance as Record<string, unknown> | undefined)?.granulator,
      )
      expect(call).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// audit #11 — render_path serialized to the layer dict (GPU preview reachable)
//
// These test the PURE serializer function directly (buildGranulatorLayer),
// not a hand-copied mirror of App.tsx's dispatch/conditional logic — the
// wiring into the real IPC payload is covered by the render+intercept tests
// above, so this is not a drift-blind gate.
// ---------------------------------------------------------------------------

describe('B8 granulator render_path serialization (audit #11)', () => {
  const TRACK = 'perf-track-1'

  beforeEach(() => {
    useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
  })

  it('buildGranulatorLayer emits render_path (default cpu)', () => {
    // When renderPath is absent on the instrument, the serializer must default to 'cpu'.
    useInstrumentsStore.getState().addGranulator(TRACK)
    const inst = useInstrumentsStore.getState().granulators[TRACK]
    const dict = buildGranulatorLayer(inst)!
    expect(dict).not.toBeNull()
    // render_path must be present in the IPC dict (backend contract).
    expect(dict.render_path).toBe('cpu')
  })

  it("render_path='gpu' serializes through to the layer dict (matches the backend contract)", () => {
    // Setting renderPath: 'gpu' on the instrument must propagate through the serializer
    // so the backend GPU preview arm is reachable from the frontend.
    useInstrumentsStore.getState().addGranulator(TRACK)
    const instrState = useInstrumentsStore.getState()
    // Simulate a power-user/devtool setting renderPath to 'gpu'.
    const inst = { ...instrState.granulators[TRACK], renderPath: 'gpu' as const }
    const dict = buildGranulatorLayer(inst)!
    expect(dict).not.toBeNull()
    expect(dict.render_path).toBe('gpu')
  })

  it('render_path is always present in the dict (never undefined)', () => {
    useInstrumentsStore.getState().addGranulator(TRACK)
    const inst = useInstrumentsStore.getState().granulators[TRACK]
    const dict = buildGranulatorLayer(inst)!
    // Must be a string (either 'cpu' or 'gpu') — never undefined.
    expect(typeof dict.render_path).toBe('string')
    expect(['cpu', 'gpu']).toContain(dict.render_path)
  })
})
