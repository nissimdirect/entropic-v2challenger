/**
 * P5b.19 — B8 Granulator device panel + grain-cloud viz.
 *
 * Vitest required gates (hard oracle per packet spec):
 *   1. `all six axes render knob rows`
 *   2. `numerics clamped at input`
 *   3. `selection picker hides latentSimilarity when flag off`
 *   4. `viz renders N<=cap markers`
 *   5. `layer dict matches backend contract`
 *   6. `deselect/unmount cleans listeners` (Gate 14 wiring checklist)
 *   7. `full chain: density knob change → store → granulator layer payload carries the new density`
 *
 * Test pattern: store-driven, mock IPC (no actual ZMQ). Mirrors
 * framebank-device.test.tsx conventions (beforeEach reset, afterEach cleanup).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import GranulatorDevice, { vizMarkersFromParams } from '../../../renderer/components/instruments/GranulatorDevice'
import { buildGranulatorLayer } from '../../../renderer/components/instruments/buildGranulatorLayer'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import {
  GRANULATOR_AXES,
  GRANULATOR_VIZ_MARKER_CAP,
  GRANULATOR_DENSITY_MIN,
  GRANULATOR_DENSITY_MAX,
  defaultGranulatorInstrument,
} from '../../../renderer/components/instruments/types'

const T = 'track-gran-1'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInstrumentsStore.setState({
    instruments: {},
    racks: {},
    frameBanks: {},
    granulators: {},
  })
})
afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// Gate 1 — all six axes render knob rows
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 1: all six axes render knob rows', () => {
  it('all six axes render knob rows', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)

    for (const ax of GRANULATOR_AXES) {
      const axRow = screen.getByTestId(`granulator-axis-row-${ax}`)
      expect(axRow).toBeTruthy()
      // Each axis must have grain / jitter / position / envelope inputs.
      expect(screen.getByTestId(`granulator-${ax}-grain`)).toBeTruthy()
      expect(screen.getByTestId(`granulator-${ax}-jitter`)).toBeTruthy()
      expect(screen.getByTestId(`granulator-${ax}-position`)).toBeTruthy()
      expect(screen.getByTestId(`granulator-${ax}-envelope`)).toBeTruthy()
    }
  })

  it('renders nothing when the track has no granulator (mount-safe)', () => {
    const { container } = render(<GranulatorDevice trackId={T} />)
    expect(container.querySelector('[data-testid="granulator-device"]')).toBeNull()
  })

  it('renders exactly 6 axis rows', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)
    const rows = document.querySelectorAll('[data-testid^="granulator-axis-row-"]')
    expect(rows.length).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Gate 2 — numerics clamped at input
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 2: numerics clamped at input', () => {
  it('numerics clamped at input — density clamped to [DENSITY_MIN, DENSITY_MAX]', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)

    // Over max → clamped to MAX.
    s.setGranulatorDensity(T, GRANULATOR_DENSITY_MAX + 999)
    expect(useInstrumentsStore.getState().granulators[T].density).toBe(GRANULATOR_DENSITY_MAX)

    // Under min → clamped to MIN.
    s.setGranulatorDensity(T, -5)
    expect(useInstrumentsStore.getState().granulators[T].density).toBe(GRANULATOR_DENSITY_MIN)

    // Non-finite → fallback (unchanged).
    s.setGranulatorDensity(T, 4)
    s.setGranulatorDensity(T, NaN)
    expect(useInstrumentsStore.getState().granulators[T].density).toBe(4)
  })

  it('numerics clamped at input — per-axis grain clamped to [0, 1]', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)

    s.setGranulatorAxisParam(T, 't', 'grain', 2.5)
    expect(useInstrumentsStore.getState().granulators[T].axes['t'].grain).toBe(1)

    s.setGranulatorAxisParam(T, 't', 'grain', -0.5)
    expect(useInstrumentsStore.getState().granulators[T].axes['t'].grain).toBe(0)

    s.setGranulatorAxisParam(T, 't', 'grain', 0.5)
    s.setGranulatorAxisParam(T, 't', 'grain', Infinity)
    expect(useInstrumentsStore.getState().granulators[T].axes['t'].grain).toBe(0.5)
  })

  it('numerics clamped at input — jitter/position/envelope all clamped [0,1]', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)

    for (const param of ['jitter', 'position', 'envelope'] as const) {
      s.setGranulatorAxisParam(T, 'y', param, 9)
      expect(useInstrumentsStore.getState().granulators[T].axes['y'][param]).toBe(1)
      s.setGranulatorAxisParam(T, 'y', param, -1)
      expect(useInstrumentsStore.getState().granulators[T].axes['y'][param]).toBe(0)
    }
  })

  it('unknown axis is rejected (no-op, P1-A canon)', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    const before = { ...useInstrumentsStore.getState().granulators[T].axes }
    // @ts-expect-error — 'T' (uppercase) is invalid per P1-A axis canon.
    s.setGranulatorAxisParam(T, 'T', 'grain', 0.9)
    expect(useInstrumentsStore.getState().granulators[T].axes).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Gate 3 — selection picker hides latentSimilarity when flag off
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 3: selection picker hides latentSimilarity when flag off', () => {
  it('selection picker hides latentSimilarity when flag off', () => {
    // Flag is OFF by default (import.meta.env.VITE_EXPERIMENTAL_LATENT_SELECTION absent).
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)

    const sel = screen.getByTestId('granulator-selection') as HTMLSelectElement
    const optionValues = Array.from(sel.options).map((o) => o.value)

    expect(optionValues).toContain('random')
    expect(optionValues).toContain('onset')
    // MUST NOT show latentSimilarity when flag is off.
    expect(optionValues).not.toContain('latentSimilarity')
    // MUST NEVER show scenePayload (reserved).
    expect(optionValues).not.toContain('scenePayload')
  })

  it('store rejects latentSimilarity when latentFlagOn=false', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    s.setGranulatorSelection(T, 'onset', false)
    s.setGranulatorSelection(T, 'latentSimilarity', false) // flag off → no-op
    expect(useInstrumentsStore.getState().granulators[T].selection).toBe('onset')
  })

  it('store accepts latentSimilarity when latentFlagOn=true', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    s.setGranulatorSelection(T, 'latentSimilarity', true) // flag on → accepted
    expect(useInstrumentsStore.getState().granulators[T].selection).toBe('latentSimilarity')
  })

  it('store NEVER accepts scenePayload (reserved)', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    // @ts-expect-error — scenePayload is reserved; the store type excludes it.
    s.setGranulatorSelection(T, 'scenePayload', true)
    expect(useInstrumentsStore.getState().granulators[T].selection).toBe('random')
  })
})

// ---------------------------------------------------------------------------
// Gate 4 — viz renders N<=cap markers
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 4: viz renders N<=cap markers', () => {
  it('viz renders N<=cap markers — vizMarkersFromParams respects GRANULATOR_VIZ_MARKER_CAP', () => {
    // density > cap → returns exactly cap markers.
    const markers = vizMarkersFromParams(GRANULATOR_VIZ_MARKER_CAP + 100, 0.5, 0.1, 0.5, 0.1)
    expect(markers.length).toBeLessThanOrEqual(GRANULATOR_VIZ_MARKER_CAP)
  })

  it('viz renders N<=cap markers — density 0 produces 0 markers', () => {
    const markers = vizMarkersFromParams(0, 0.5, 0.1, 0.5, 0.1)
    expect(markers.length).toBe(0)
  })

  it('viz renders N<=cap markers — all marker coords clamped [0,1]', () => {
    const markers = vizMarkersFromParams(32, 0.5, 0.5, 0.5, 0.5)
    for (const m of markers) {
      expect(m.tx).toBeGreaterThanOrEqual(0)
      expect(m.tx).toBeLessThanOrEqual(1)
      expect(m.ty).toBeGreaterThanOrEqual(0)
      expect(m.ty).toBeLessThanOrEqual(1)
    }
  })

  it('viz renders N<=cap markers — deterministic (same params → same markers)', () => {
    const a = vizMarkersFromParams(16, 0.3, 0.2, 0.7, 0.1)
    const b = vizMarkersFromParams(16, 0.3, 0.2, 0.7, 0.1)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// Gate 5 — layer dict matches backend contract
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 5: layer dict matches backend contract', () => {
  it('layer dict matches backend contract — buildGranulatorLayer returns null when no instrument', () => {
    expect(buildGranulatorLayer(null)).toBeNull()
    expect(buildGranulatorLayer(undefined)).toBeNull()
  })

  it('layer dict matches backend contract — keys match _parse_granulator_layer expected shape', () => {
    const inst = defaultGranulatorInstrument('gran-test-1')
    const dict = buildGranulatorLayer(inst)
    expect(dict).not.toBeNull()
    if (!dict) throw new Error('Expected dict')

    // Top-level keys.
    expect(typeof dict.instrument_id).toBe('string')
    expect(typeof dict.density).toBe('number')
    expect(typeof dict.window).toBe('string')
    expect(typeof dict.axes).toBe('object')
    expect(typeof dict.l_axis_enabled).toBe('boolean')
    expect(typeof dict.selection).toBe('string')

    // window must be one of the 3 valid shapes.
    expect(['hann', 'tri', 'rect']).toContain(dict.window)

    // selection must be a known rule.
    expect(['random', 'onset', 'latentSimilarity']).toContain(dict.selection)
  })

  it('layer dict matches backend contract — axes are UPPERCASE (backend AXES convention)', () => {
    const inst = defaultGranulatorInstrument('gran-test-2')
    const dict = buildGranulatorLayer(inst)!
    const axisKeys = Object.keys(dict.axes)
    // The backend GranulatorParams AXES = ("T", "Y", "X", "C", "F", "L").
    // All axis keys in the IPC dict must be UPPERCASE.
    for (const key of axisKeys) {
      expect(key).toBe(key.toUpperCase())
    }
    // All 6 axes present.
    expect(axisKeys.sort()).toEqual(['C', 'F', 'L', 'T', 'X', 'Y'])
  })

  it('layer dict matches backend contract — per-axis sub-keys match AxisParams (grain/jitter/position/grain_env)', () => {
    const inst = defaultGranulatorInstrument('gran-test-3')
    const dict = buildGranulatorLayer(inst)!
    for (const axKey of Object.keys(dict.axes)) {
      const ap = dict.axes[axKey]
      expect(typeof ap.grain).toBe('number')
      expect(typeof ap.jitter).toBe('number')
      expect(typeof ap.position).toBe('number')
      // MUST be `grain_env` (snake_case) — the backend key, NOT `envelope`.
      expect(typeof ap.grain_env).toBe('number')
      // `envelope` key must NOT exist at the IPC boundary.
      expect((ap as Record<string, unknown>).envelope).toBeUndefined()
    }
  })

  it('layer dict matches backend contract — density carries the new density after setGranulatorDensity (mock IPC)', () => {
    // This test exercises the full chain:
    //   density knob change → store.setGranulatorDensity → store.granulators[trackId].density
    //   → buildGranulatorLayer(inst).density → the exact number the backend parses.
    useInstrumentsStore.getState().addGranulator(T)
    useInstrumentsStore.getState().setGranulatorDensity(T, 12)
    const inst = useInstrumentsStore.getState().granulators[T]
    const dict = buildGranulatorLayer(inst)!
    expect(dict.density).toBe(12)
  })

  it('layer dict matches backend contract — l_axis_enabled maps from lAxisEnabled', () => {
    useInstrumentsStore.getState().addGranulator(T)
    useInstrumentsStore.getState().setGranulatorLAxisEnabled(T, true)
    const inst = useInstrumentsStore.getState().granulators[T]
    const dict = buildGranulatorLayer(inst)!
    expect(dict.l_axis_enabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Gate 6 — deselect/unmount cleans listeners
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 6: deselect/unmount cleans listeners', () => {
  it('deselect/unmount cleans listeners — cancelAnimationFrame called on unmount', () => {
    // Spy on cancelAnimationFrame to verify the RAF cleanup runs.
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')

    useInstrumentsStore.getState().addGranulator(T)
    const { unmount } = render(<GranulatorDevice trackId={T} />)
    unmount()

    // cancelAnimationFrame must have been called (Gate 14 wiring checklist: exit path).
    expect(cancelSpy).toHaveBeenCalled()
    cancelSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Gate 7 — full chain: density knob change → store → layer payload
// ---------------------------------------------------------------------------
describe('GranulatorDevice — gate 7: full chain: density knob change → store → layer payload', () => {
  it('full chain: density knob change → store → granulator layer payload carries the new density (mock IPC, asserts exact dict)', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)

    // Fire change on the density input.
    fireEvent.change(screen.getByTestId('granulator-density'), { target: { value: '7' } })

    // Verify the store was updated.
    const inst = useInstrumentsStore.getState().granulators[T]
    expect(inst.density).toBe(7)

    // Verify buildGranulatorLayer produces the exact dict the backend expects.
    const dict = buildGranulatorLayer(inst)!
    expect(dict).not.toBeNull()
    expect(dict.density).toBe(7)            // density field carries the new value
    expect(dict.instrument_id).toBe(inst.id) // id is stable
    expect(dict.selection).toBe('random')    // default selection unchanged
    expect(dict.l_axis_enabled).toBe(false)  // default L flag unchanged
    expect(Object.keys(dict.axes).sort()).toEqual(['C', 'F', 'L', 'T', 'X', 'Y'])
  })

  it('full chain: axis knob change → store → layer payload carries updated grain', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)

    // Fire change on the T-axis grain range input.
    fireEvent.change(screen.getByTestId('granulator-t-grain'), { target: { value: '0.75' } })

    const inst = useInstrumentsStore.getState().granulators[T]
    expect(inst.axes['t'].grain).toBe(0.75)

    const dict = buildGranulatorLayer(inst)!
    // Backend key is uppercase 'T' and uses snake_case field `grain`.
    expect(dict.axes['T'].grain).toBe(0.75)
  })

  it('full chain: selection change → store → layer payload carries the new rule', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)

    fireEvent.change(screen.getByTestId('granulator-selection'), { target: { value: 'onset' } })

    const inst = useInstrumentsStore.getState().granulators[T]
    expect(inst.selection).toBe('onset')

    const dict = buildGranulatorLayer(inst)!
    expect(dict.selection).toBe('onset')
  })
})

// ---------------------------------------------------------------------------
// Additive / regression
// ---------------------------------------------------------------------------
describe('GranulatorDevice — additive / regression', () => {
  it('addGranulator is a no-op when the track already has one', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    const id1 = useInstrumentsStore.getState().granulators[T].id
    s.addGranulator(T)
    expect(useInstrumentsStore.getState().granulators[T].id).toBe(id1)
  })

  it('removeGranulator removes the entry', () => {
    const s = useInstrumentsStore.getState()
    s.addGranulator(T)
    expect(useInstrumentsStore.getState().granulators[T]).toBeTruthy()
    s.removeGranulator(T)
    expect(useInstrumentsStore.getState().granulators[T]).toBeUndefined()
  })

  it('granulators map does not affect existing instruments/racks/frameBanks', () => {
    const s = useInstrumentsStore.getState()
    s.addSampler('other-track', 'clip-1')
    s.addGranulator(T)
    s.removeGranulator(T)
    expect(useInstrumentsStore.getState().instruments['other-track']).toBeTruthy()
    expect(useInstrumentsStore.getState().granulators[T]).toBeUndefined()
  })

  it('window selector writes the store', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('granulator-window'), { target: { value: 'tri' } })
    expect(useInstrumentsStore.getState().granulators[T].window).toBe('tri')
  })

  it('L-axis checkbox toggles lAxisEnabled', () => {
    useInstrumentsStore.getState().addGranulator(T)
    render(<GranulatorDevice trackId={T} />)
    const cb = screen.getByTestId('granulator-l-axis-enabled') as HTMLInputElement
    expect(cb.checked).toBe(false)
    fireEvent.click(cb)
    expect(useInstrumentsStore.getState().granulators[T].lAxisEnabled).toBe(true)
  })
})
