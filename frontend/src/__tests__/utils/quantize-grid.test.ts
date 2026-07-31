/**
 * W1.5b PK.A2/A3/A4 — pure grid-math oracle for utils/quantize-grid.ts.
 */
import { describe, it, expect } from 'vitest'
import { selectQuantizeGridLevel, formatQuantizeReadout, snapTimeToGridLevel, QUANT_LABELS } from '../../renderer/utils/quantize-grid'

describe('selectQuantizeGridLevel — PK.A2 LOD coarsening', () => {
  it('shows the division level at high zoom (lines well over the 10px floor)', () => {
    // bpm=120, division=16 (1/16 notes): interval = (60/120)*(4/16) = 0.125s.
    // At zoom=1000px/s, spacing = 125px — comfortably visible.
    const result = selectQuantizeGridLevel(120, 16, 1000)
    expect(result.level).toBe('division')
    expect(result.fineIntervalSeconds).toBeCloseTo(0.125, 5)
    expect(result.showFineLayer).toBe(true)
  })

  it('coarsens division -> beat -> bar as zoom decreases, never skipping straight to nothing', () => {
    // bpm=120, division=16: beat interval = 0.5s, bar interval = 2s.
    // Pick a zoom where division (0.125s/line) no longer clears 10px but beat (0.5s/line) does.
    // division spacing = 0.125*zoom, beat spacing = 0.5*zoom. Want 0.125*zoom<10<=0.5*zoom -> zoom in (20,80].
    const result = selectQuantizeGridLevel(120, 16, 50)
    expect(result.level).toBe('beat')
    expect(result.fineIntervalSeconds).toBeCloseTo(0.5, 5)
  })

  it('extreme zoom-out yields bar or 4bar lines, NEVER an empty grid while quantize is on', () => {
    // bpm=120, division=16, zoom at the store's documented minimum (0.5px/s, Timeline.tsx clamp).
    const result = selectQuantizeGridLevel(120, 16, 0.5)
    expect(['bar', '4bar']).toContain(result.level)
    expect(result.barIntervalSeconds).toBeGreaterThan(0)
  })

  it('boundary exactness at 10px: spacing exactly at the floor is still shown; just under rolls to the next level', () => {
    // Choose bpm/division/zoom so beat-level spacing lands exactly on 10px.
    // beatSeconds = 60/bpm. spacingPx = beatSeconds * zoom = 10 -> zoom = 10 / beatSeconds.
    const bpm = 120
    const beatSeconds = 60 / bpm // 0.5s
    const zoomAtFloor = 10 / beatSeconds // 20
    const atFloor = selectQuantizeGridLevel(bpm, 4, zoomAtFloor) // division===beat here (qd=4)
    expect(atFloor.level).toBe('division') // division ties beat's spacing, division wins the tie-break
    expect(atFloor.fineIntervalSeconds * zoomAtFloor).toBeCloseTo(10, 5)

    const justUnder = selectQuantizeGridLevel(bpm, 4, zoomAtFloor - 0.001)
    // Should NOT choose the beat/division level anymore — coarsens to bar.
    expect(justUnder.level).toBe('bar')
  })

  it('bar layer is always computed (for the stacked-bar-color layer) even when the fine level IS bar', () => {
    // bpm=120, division=4 (beat spacing = 5px at zoom=10, under the floor;
    // bar spacing = 20px, clears it) -> chosen level is exactly 'bar'.
    const result = selectQuantizeGridLevel(120, 4, 10)
    expect(result.level).toBe('bar')
    expect(result.barIntervalSeconds).toBeCloseTo(2, 5) // 4 beats * 60/120
    expect(result.showFineLayer).toBe(false) // fine === bar -> single layer
  })

  it('falls back to safe defaults for non-finite/invalid bpm rather than throwing or dividing by zero', () => {
    expect(() => selectQuantizeGridLevel(NaN, 4, 50)).not.toThrow()
    const result = selectQuantizeGridLevel(0, 4, 50)
    expect(Number.isFinite(result.fineIntervalSeconds)).toBe(true)
  })
})

describe('formatQuantizeReadout — PK.A3', () => {
  it('formats {division 1/4, bpm 120} as "1/4 · bar 2.0s @ 120"', () => {
    expect(formatQuantizeReadout(120, 4)).toBe('1/4 · bar 2.0s @ 120')
  })

  it('formats {division 1/16, bpm 90} with the correct bar length', () => {
    // barSeconds = (60/90)*4 = 2.666... -> "2.7"
    expect(formatQuantizeReadout(90, 16)).toBe('1/16 · bar 2.7s @ 90')
  })

  it('every QUANT_LABELS division formats without throwing', () => {
    for (const div of Object.keys(QUANT_LABELS).map(Number)) {
      expect(() => formatQuantizeReadout(120, div)).not.toThrow()
    }
  })
})

describe('snapTimeToGridLevel — PK.A4', () => {
  // Oracle: snap math at 3 divisions x 2 bpm. zoom=200 keeps the DIVISION
  // level active (well over the 10px floor) for every combo below, so the
  // expected snap is a direct round-to-nearest-interval computation —
  // verified independently of selectQuantizeGridLevel's own coarsening logic.
  const DIVISIONS = [4, 8, 16]
  const BPMS = [120, 90]
  const ZOOM = 200

  it.each(DIVISIONS.flatMap((division) => BPMS.map((bpm) => ({ division, bpm }))))(
    'division=1/$division bpm=$bpm — snaps to the nearest division-interval multiple',
    ({ division, bpm }) => {
      const intervalSeconds = (60 / bpm) * (4 / division)
      // Land clearly inside the FIRST interval band above zero, close to but
      // not on either edge, so rounding direction is unambiguous.
      const rawTime = intervalSeconds * 1.3
      const expected = Math.round(rawTime / intervalSeconds) * intervalSeconds
      expect(snapTimeToGridLevel(rawTime, bpm, division, ZOOM)).toBeCloseTo(expected, 6)
    },
  )

  it('exact boundary: a time already ON a grid line snaps to itself', () => {
    // bpm=120, division=4 -> interval=0.5s. 1.5s is exactly the 3rd line.
    expect(snapTimeToGridLevel(1.5, 120, 4, ZOOM)).toBeCloseTo(1.5, 6)
  })

  it('rounds down when closer to the lower line, up when closer to the higher line', () => {
    // interval=0.5s (bpm=120, division=4): lines at 1.0, 1.5, 2.0.
    expect(snapTimeToGridLevel(1.2, 120, 4, ZOOM)).toBeCloseTo(1.0, 6) // closer to 1.0
    expect(snapTimeToGridLevel(1.3, 120, 4, ZOOM)).toBeCloseTo(1.5, 6) // closer to 1.5
  })

  it('never returns NaN/Infinity for non-finite/invalid inputs (bpm, zoom<=0)', () => {
    expect(Number.isFinite(snapTimeToGridLevel(5, NaN, 4, ZOOM))).toBe(true)
    expect(Number.isFinite(snapTimeToGridLevel(5, 120, 4, 0))).toBe(true)
    expect(Number.isFinite(snapTimeToGridLevel(5, 120, 0, ZOOM))).toBe(true)
  })
})
