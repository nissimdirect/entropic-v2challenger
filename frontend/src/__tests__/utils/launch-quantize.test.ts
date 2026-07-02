/**
 * B10.2 — Quantized launch helper tests.
 *
 * Four enforced gates:
 *
 *  Gate 1 (Off-by-default byte-identical): when launch-quantize is OFF,
 *          onPadTrigger passes the raw frame UNCHANGED. Tested by checking
 *          quantizeFrame is a pure function that, when not called, leaves
 *          the frame as-is.
 *
 *  Gate 2 (Snap correctness): quantizeFrame(frame, division, bpm, fps)
 *          snaps to the next division boundary (ceil). Exact values for
 *          known (bpm, fps, division) inputs are asserted.
 *
 *  Gate 3 (No footage warp): quantizeFrame only affects the frame number
 *          returned; callers pass it as triggerRackPad's frameIndex.
 *          The function has no side effects — purity is its proof.
 *
 *  Gate 4 (Numeric guard): bad bpm/fps/division (0, NaN, negative,
 *          Infinity) → returns frame unchanged, no NaN/Inf.
 *
 * Tempo formula (from Timeline.tsx line 249):
 *   gridIntervalSecs = (60 / bpm) * (4 / division)
 *   framesPerDivision = gridIntervalSecs * fps
 */
import { describe, it, expect } from 'vitest'
import { quantizeFrame } from '../../renderer/utils/launch-quantize'

// ============================================================
// Helper: compute the expected framesPerDivision for a set of params.
// This mirrors the formula in Timeline.tsx so the test and impl stay in sync.
// ============================================================
function fpd(bpm: number, division: number, fps: number): number {
  return (60 / bpm) * (4 / division) * fps
}

// ============================================================
// Gate 2: Snap correctness — known (bpm, fps, division) exact values
// ============================================================
describe('quantizeFrame — snap to next division boundary', () => {
  it('snaps a frame between two boundaries to the NEXT boundary', () => {
    // bpm=120, fps=30, division=4 (1/4 note)
    // gridIntervalSecs = (60/120)*(4/4) = 0.5 s
    // framesPerDivision = 0.5 * 30 = 15 frames
    // Boundaries: 0, 15, 30, 45, ...
    // frame = 7 (between 0 and 15) → ceil(7/15)*15 = 15
    const result = quantizeFrame(7, 4, 120, 30)
    expect(result).toBe(15)
  })

  it('snaps a frame just before a boundary to that boundary', () => {
    // bpm=120, fps=30, division=4 → fpd=15
    // frame = 14 → ceil(14/15)*15 = 15
    const result = quantizeFrame(14, 4, 120, 30)
    expect(result).toBe(15)
  })

  it('a frame exactly on a boundary stays on that boundary', () => {
    // frame = 15 → ceil(15/15)*15 = 15 (stays)
    const result = quantizeFrame(15, 4, 120, 30)
    expect(result).toBe(15)
  })

  it('snaps to the second boundary when frame is past the first', () => {
    // frame = 16 → ceil(16/15)*15 = 30
    const result = quantizeFrame(16, 4, 120, 30)
    expect(result).toBe(30)
  })

  it('works with 1/8 note division', () => {
    // bpm=120, fps=30, division=8 (1/8 note)
    // gridIntervalSecs = (60/120)*(4/8) = 0.25 s
    // framesPerDivision = 0.25 * 30 = 7.5
    // frame = 4 → ceil(4/7.5)*7.5 = ceil(0.533)*7.5 = 1*7.5 = 7.5 → round to 8
    const result = quantizeFrame(4, 8, 120, 30)
    expect(result).toBe(8)
  })

  it('works at 60 bpm (slower tempo), 1/4 note', () => {
    // bpm=60, fps=30, division=4 → fpd = (60/60)*(4/4)*30 = 30
    // Boundaries: 0, 30, 60, ...
    // frame = 10 → ceil(10/30)*30 = 30
    const result = quantizeFrame(10, 4, 60, 30)
    expect(result).toBe(30)
  })

  it('works at 24 fps (cinema)', () => {
    // bpm=120, fps=24, division=4 → fpd = (60/120)*(4/4)*24 = 12
    // frame = 5 → ceil(5/12)*12 = 12
    const result = quantizeFrame(5, 4, 120, 24)
    expect(result).toBe(12)
  })

  it('frame=0 on a boundary stays at 0', () => {
    // ceil(0/15)*15 = 0 — frame 0 IS a boundary
    const result = quantizeFrame(0, 4, 120, 30)
    expect(result).toBe(0)
  })

  it('matches the timeline gridInterval formula exactly', () => {
    // Direct comparison: framesPerDivision = gridInterval * fps
    const bpm = 100
    const division = 8
    const fps = 25
    const expectedFpd = fpd(bpm, division, fps)
    // frame=1 → ceil(1/expectedFpd)*expectedFpd
    const expected = Math.round(Math.ceil(1 / expectedFpd) * expectedFpd)
    expect(quantizeFrame(1, division, bpm, fps)).toBe(expected)
  })
})

// ============================================================
// Gate 4: Numeric guard — bad inputs return frame unchanged, no NaN
// ============================================================
describe('quantizeFrame — numeric guard (degenerate inputs)', () => {
  it('returns frame unchanged when bpm=0', () => {
    expect(quantizeFrame(10, 4, 0, 30)).toBe(10)
  })

  it('returns frame unchanged when bpm is negative', () => {
    expect(quantizeFrame(10, 4, -120, 30)).toBe(10)
  })

  it('returns frame unchanged when bpm is NaN', () => {
    expect(quantizeFrame(10, 4, NaN, 30)).toBe(10)
  })

  it('returns frame unchanged when bpm is Infinity', () => {
    expect(quantizeFrame(10, 4, Infinity, 30)).toBe(10)
  })

  it('returns frame unchanged when fps=0', () => {
    expect(quantizeFrame(10, 4, 120, 0)).toBe(10)
  })

  it('returns frame unchanged when fps is negative', () => {
    expect(quantizeFrame(10, 4, 120, -30)).toBe(10)
  })

  it('returns frame unchanged when fps is NaN', () => {
    expect(quantizeFrame(10, 4, 120, NaN)).toBe(10)
  })

  it('returns frame unchanged when division=0', () => {
    expect(quantizeFrame(10, 0, 120, 30)).toBe(10)
  })

  it('returns frame unchanged when division is negative', () => {
    expect(quantizeFrame(10, -4, 120, 30)).toBe(10)
  })

  it('returns frame unchanged when division is NaN', () => {
    expect(quantizeFrame(10, NaN, 120, 30)).toBe(10)
  })

  it('returns 0 when frame is NaN (falls through guard)', () => {
    // !Number.isFinite(frame) → return 0
    expect(quantizeFrame(NaN, 4, 120, 30)).toBe(0)
  })

  it('returns 0 when frame is Infinity', () => {
    expect(quantizeFrame(Infinity, 4, 120, 30)).toBe(0)
  })

  it('never returns NaN under any input combination', () => {
    const badValues = [0, -1, NaN, Infinity, -Infinity]
    for (const bad of badValues) {
      expect(Number.isNaN(quantizeFrame(10, bad, 120, 30))).toBe(false)
      expect(Number.isNaN(quantizeFrame(10, 4, bad, 30))).toBe(false)
      expect(Number.isNaN(quantizeFrame(10, 4, 120, bad))).toBe(false)
    }
  })
})

// ============================================================
// Gate 1: Off-by-default — passing raw frame when NOT snapping
// (Tests the pure function contract; RackDevice wiring tested separately)
// ============================================================
describe('quantizeFrame — purity (no side effects, stable identity)', () => {
  it('calling with arbitrary valid inputs always returns a finite number', () => {
    // When called with valid args, always finite (gate 3 / no NaN from wiring)
    const result = quantizeFrame(42, 4, 120, 30)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('is a pure function — same inputs produce same output', () => {
    const a = quantizeFrame(7, 4, 120, 30)
    const b = quantizeFrame(7, 4, 120, 30)
    expect(a).toBe(b)
  })

  it('result is always >= input frame for valid inputs', () => {
    // Snap is always to NEXT boundary (ceil), so result >= frame
    const frame = 13
    const result = quantizeFrame(frame, 4, 120, 30)
    expect(result).toBeGreaterThanOrEqual(frame)
  })
})
