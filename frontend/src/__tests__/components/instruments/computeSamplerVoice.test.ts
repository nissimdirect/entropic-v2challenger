/**
 * B1 computeSamplerVoice — pure sampler→voice math (Gate 5 unit layer).
 * B3.1 loop engine + preview/export PARITY GUARD (see bottom of file).
 */
import { describe, it, expect } from 'vitest'
import {
  computeSamplerVoice,
  computeLoopFrameIndex,
  computeLoopCrossfadeWeight,
} from '../../../renderer/components/instruments/computeSamplerVoice'
import type { SamplerInstrumentV1 } from '../../../renderer/components/instruments/types'

function inst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 's1',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  }
}

describe('computeSamplerVoice', () => {
  it('native speed: frame_index = startFrame + playhead', () => {
    const v = computeSamplerVoice(inst({ startFrame: 10 }), '/a.mp4', 5, 100)
    expect(v.frame_index).toBe(15)
    expect(v.asset_path).toBe('/a.mp4')
    expect(v.layer_type).toBe('video')
  })

  it('freeze (speed 0): frame_index stays at startFrame', () => {
    const v = computeSamplerVoice(inst({ startFrame: 20, speed: 0 }), '/a.mp4', 50, 100)
    expect(v.frame_index).toBe(20)
  })

  it('reverse (negative speed) walks backward, clamped at 0', () => {
    const v = computeSamplerVoice(inst({ startFrame: 5, speed: -1 }), '/a.mp4', 30, 100)
    expect(v.frame_index).toBe(0) // 5 - 30 = -25 → clamp 0
  })

  it('speed > 1 skips frames', () => {
    const v = computeSamplerVoice(inst({ startFrame: 0, speed: 3 }), '/a.mp4', 10, 100)
    expect(v.frame_index).toBe(30)
  })

  it('clamps to last frame (frameCount - 1)', () => {
    const v = computeSamplerVoice(inst({ startFrame: 90, speed: 2 }), '/a.mp4', 50, 100)
    expect(v.frame_index).toBe(99)
  })

  it('clamps speed to [-8, 8]', () => {
    const fast = computeSamplerVoice(inst({ speed: 999 }), '/a.mp4', 1, 1000)
    expect(fast.frame_index).toBe(8) // clamped 8 * 1
    const rev = computeSamplerVoice(inst({ startFrame: 100, speed: -999 }), '/a.mp4', 1, 1000)
    expect(rev.frame_index).toBe(92) // 100 + (-8 * 1)
  })

  it('frameCount = 0 → freeze on frame 0, never NaN/negative', () => {
    const v = computeSamplerVoice(inst({ startFrame: 5 }), '/a.mp4', 10, 0)
    expect(v.frame_index).toBe(0)
    expect(Number.isFinite(v.frame_index)).toBe(true)
  })

  it('opacity finite-guarded + clamped to [0,1]', () => {
    expect(computeSamplerVoice(inst({ opacity: 2 }), '/a.mp4', 0, 10).opacity).toBe(1)
    expect(computeSamplerVoice(inst({ opacity: -1 }), '/a.mp4', 0, 10).opacity).toBe(0)
    expect(computeSamplerVoice(inst({ opacity: NaN }), '/a.mp4', 0, 10).opacity).toBe(1)
  })

  it('non-finite startFrame/speed fall back, never produce NaN', () => {
    const v = computeSamplerVoice(
      inst({ startFrame: NaN, speed: Infinity }),
      '/a.mp4',
      5,
      100,
    )
    expect(Number.isFinite(v.frame_index)).toBe(true)
  })

  it('does NOT emit a layer_id (backend derives asset:{path})', () => {
    const v = computeSamplerVoice(inst(), '/a.mp4', 0, 10)
    expect('layer_id' in v).toBe(false)
  })

  it('passes blend mode through', () => {
    expect(computeSamplerVoice(inst({ blendMode: 'screen' }), '/a.mp4', 0, 10).blend_mode).toBe(
      'screen',
    )
  })
})

// ============================================================================
// B3.1 — Loop engine tests (mirrors backend tests/test_sampler_loop.py).
//
// Each block below mirrors a class in the backend pytest file 1:1 so the
// frontend (preview) loop math is verified against the SAME behavior the
// backend (export) is verified against.
// ============================================================================

type LoopConfig = NonNullable<SamplerInstrumentV1['loop']>

function loopInst(loop: LoopConfig, overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return inst({ loop, ...overrides })
}

/** Frontend frame-index for a sampler at a playhead (loop-aware). */
function fi(s: SamplerInstrumentV1, playhead: number, frameCount = 100): number {
  return computeLoopFrameIndex(s, playhead, frameCount)
}

/** Frontend crossfade weight at a playhead. */
function xf(s: SamplerInstrumentV1, playhead: number, frameCount = 100): number {
  return computeLoopCrossfadeWeight(s, playhead, frameCount)
}

// ---------------------------------------------------------------------------
// REGRESSION GUARD: loop disabled → byte-identical to legacy
// (backend TestLoopDisabledMatchesLegacy)
// ---------------------------------------------------------------------------
describe('B3.1 loop disabled matches legacy playback (regression guard)', () => {
  it('test_loop_disabled_matches_legacy_playback (no loop key)', () => {
    // Legacy: startFrame + round(speed*playhead) = 10 + 5 = 15
    expect(fi(inst({ startFrame: 10, speed: 1 }), 5)).toBe(15)
  })

  it('loop.enabled=false → identical to no-loop path', () => {
    expect(fi(loopInst({ enabled: false, in: 0, out: 50 }, { startFrame: 10, speed: 1 }), 5)).toBe(15)
  })

  it('legacy clamp at last frame still works when loop disabled', () => {
    // 90 + 50 = 140 → clamp 99
    expect(fi(inst({ startFrame: 90, speed: 2 }), 25)).toBe(99)
  })

  it('legacy reverse clamps at 0 when loop disabled', () => {
    // 5 + (-1 * 30) = -25 → clamp 0
    expect(fi(inst({ startFrame: 5, speed: -1 }), 30)).toBe(0)
  })

  it('crossfade weight is 0 when loop disabled / absent', () => {
    expect(xf(loopInst({ enabled: false, crossfade: 10 }), 5)).toBe(0)
    expect(xf(inst(), 5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// LOOP FWD: wraps out → in (backend TestLoopFwdWrapsOutToIn)
// ---------------------------------------------------------------------------
describe('B3.1 loop fwd wraps out to in', () => {
  it('test_loop_fwd_wraps_out_to_in', () => {
    const s = loopInst({ enabled: true, in: 10, out: 19, dir: 'fwd' })
    expect(fi(s, 0)).toBe(10) // offset 0 → 10
    expect(fi(s, 9)).toBe(19) // offset 9 → 19
    expect(fi(s, 10)).toBe(10) // offset 10 % 10 = 0 → 10 (wrapped)
    expect(fi(s, 15)).toBe(15)
  })

  it('wraps multiple cycles', () => {
    const s = loopInst({ enabled: true, in: 0, out: 9, dir: 'fwd' })
    expect(fi(s, 25)).toBe(5) // 25 % 10 = 5
  })

  it('every frame stays within [in,out] global bounds', () => {
    const s = loopInst({ enabled: true, in: 5, out: 14, dir: 'fwd' })
    for (let ph = 0; ph < 100; ph++) {
      const f = fi(s, ph, 50)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(49)
    }
  })

  it('dir absent → defaults to fwd', () => {
    expect(fi(loopInst({ enabled: true, in: 0, out: 9 }), 10)).toBe(0)
  })

  it('unknown dir defaults to fwd', () => {
    // @ts-expect-error — intentionally invalid dir to test runtime default
    expect(fi(loopInst({ enabled: true, in: 0, out: 9, dir: 'bogus' }), 10)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// LOOP REVERSE: plays backward within bounds (backend TestLoopReverse...)
// ---------------------------------------------------------------------------
describe('B3.1 loop reverse plays backward within bounds', () => {
  it('test_loop_reverse_plays_backward_within_bounds', () => {
    const s = loopInst({ enabled: true, in: 10, out: 19, dir: 'rev' })
    expect(fi(s, 0)).toBe(19) // 19 - 0 = 19
    expect(fi(s, 9)).toBe(10) // 19 - 9 = 10
    expect(fi(s, 10)).toBe(19) // 19 - (10 % 10) = 19 (wrapped)
  })

  it('all frames in [in,out]', () => {
    const s = loopInst({ enabled: true, in: 5, out: 15, dir: 'rev' })
    for (let ph = 0; ph < 50; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(5)
      expect(f).toBeLessThanOrEqual(15)
    }
  })

  it('negative speed + dir=rev → effective fwd (matches fwd+pos)', () => {
    const revNeg = loopInst({ enabled: true, in: 10, out: 19, dir: 'rev' }, { speed: -1 })
    const fwdPos = loopInst({ enabled: true, in: 10, out: 19, dir: 'fwd' }, { speed: 1 })
    for (let ph = 0; ph < 20; ph++) {
      expect(fi(revNeg, ph)).toBe(fi(fwdPos, ph))
    }
  })
})

// ---------------------------------------------------------------------------
// LOOP PINGPONG: bounces at bounds (backend TestLoopPingpong...)
// ---------------------------------------------------------------------------
describe('B3.1 loop pingpong bounces at bounds', () => {
  it('test_loop_pingpong_bounces_at_bounds', () => {
    const s = loopInst({ enabled: true, in: 0, out: 4, dir: 'pingpong' })
    // Same expected sequence as backend test_loop_pingpong_bounces_at_bounds.
    const expected = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]
    expected.forEach((exp, ph) => {
      expect(fi(s, ph)).toBe(exp)
    })
  })

  it('all frames in [in,out]', () => {
    const s = loopInst({ enabled: true, in: 10, out: 20, dir: 'pingpong' })
    for (let ph = 0; ph < 100; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(10)
      expect(f).toBeLessThanOrEqual(20)
    }
  })

  it('single-frame loop (in==out) always returns that frame', () => {
    const s = loopInst({ enabled: true, in: 5, out: 5, dir: 'pingpong' })
    for (let ph = 0; ph < 10; ph++) expect(fi(s, ph)).toBe(5)
  })

  it('pingpong is symmetric: neg speed == pos speed', () => {
    const pos = loopInst({ enabled: true, in: 0, out: 4, dir: 'pingpong' }, { speed: 1 })
    const neg = loopInst({ enabled: true, in: 0, out: 4, dir: 'pingpong' }, { speed: -1 })
    for (let ph = 0; ph < 20; ph++) expect(fi(pos, ph)).toBe(fi(neg, ph))
  })
})

// ---------------------------------------------------------------------------
// CROSSFADE: blends the seam (backend TestLoopCrossfadeBlendSeam)
// ---------------------------------------------------------------------------
describe('B3.1 loop crossfade blends seam', () => {
  it('test_loop_crossfade_blends_seam', () => {
    const s = loopInst({ enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 4 })
    // At playhead 19 (l_out), dist_from_out=0 → weight 1.0
    expect(xf(s, 19)).toBeCloseTo(1.0, 6)
    // Midpoint playhead 10 → frame 10, min_dist=9 >= 4 → weight 0
    expect(xf(s, 10)).toBe(0)
  })

  it('crossfade=0 → hard cut (always 0)', () => {
    const s = loopInst({ enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 0 })
    for (let ph = 0; ph < 20; ph++) expect(xf(s, ph)).toBe(0)
  })

  it('weight always in [0,1]', () => {
    const s = loopInst({ enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 6 })
    for (let ph = 0; ph < 30; ph++) {
      const w = xf(s, ph)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })

  it('ramps linearly toward the seam', () => {
    const s = loopInst({ enabled: true, in: 0, out: 9, dir: 'fwd', crossfade: 4 })
    expect(xf(s, 9)).toBeCloseTo(1.0, 6) // frame 9, dist 0 → 1.0
    expect(xf(s, 7)).toBeCloseTo(0.5, 6) // frame 7, dist 2 → 1 - 2/4 = 0.5
  })

  it('crossfade clamps to max 32 (no crash, weight in [0,1])', () => {
    const s = loopInst({ enabled: true, in: 0, out: 50, dir: 'fwd', crossfade: 999 })
    for (let ph = 0; ph < 60; ph++) {
      const w = xf(s, ph)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// SPEED MAGNITUDE (backend TestLoopRespectsSpeedMagnitude)
// ---------------------------------------------------------------------------
describe('B3.1 loop respects speed magnitude', () => {
  it('test_loop_respects_speed_magnitude', () => {
    const s1 = loopInst({ enabled: true, in: 0, out: 9, dir: 'fwd' }, { speed: 1 })
    const s2 = loopInst({ enabled: true, in: 0, out: 9, dir: 'fwd' }, { speed: 2 })
    expect(fi(s1, 5)).toBe(5) // offset 5 → 5
    expect(fi(s2, 5)).toBe(0) // offset 10 % 10 = 0
  })

  it('max speed 8 still wraps in-range', () => {
    const s = loopInst({ enabled: true, in: 0, out: 9, dir: 'fwd' }, { speed: 8 })
    for (let ph = 0; ph < 20; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(9)
    }
  })

  it('speed 0 freezes at loopIn (fwd) / loopOut (rev)', () => {
    const fwd = loopInst({ enabled: true, in: 5, out: 15, dir: 'fwd' }, { speed: 0 })
    const rev = loopInst({ enabled: true, in: 5, out: 15, dir: 'rev' }, { speed: 0 })
    for (let ph = 0; ph < 10; ph++) {
      expect(fi(fwd, ph)).toBe(5)
      expect(fi(rev, ph)).toBe(15)
    }
  })
})

// ---------------------------------------------------------------------------
// NEGATIVE: in > out rejected/clamped (backend TestLoopInGreaterThanOut...)
// ---------------------------------------------------------------------------
describe('B3.1 loop in > out rejected or clamped', () => {
  it('test_loop_in_greater_than_out_rejected_or_clamped (no crash, sorted)', () => {
    const s = loopInst({ enabled: true, in: 20, out: 5, dir: 'fwd' })
    for (let ph = 0; ph < 10; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(99)
    }
  })

  it('in==out degenerate → always that frame', () => {
    const s = loopInst({ enabled: true, in: 7, out: 7, dir: 'fwd' })
    for (let ph = 0; ph < 10; ph++) expect(fi(s, ph)).toBe(7)
  })

  it('out beyond frameCount clamped', () => {
    const s = loopInst({ enabled: true, in: 0, out: 500, dir: 'fwd' })
    for (let ph = 0; ph < 10; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(99)
    }
  })

  it('negative in clamped to 0', () => {
    const s = loopInst({ enabled: true, in: -50, out: 9, dir: 'fwd' })
    for (let ph = 0; ph < 10; ph++) {
      const f = fi(s, ph)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(99)
    }
  })
})

// ===========================================================================
// PARITY GUARD — preview (frontend) ⟷ export (backend) lockstep.
//
// APPROACH: the EXPECTED values in the table below are copied VERBATIM from the
// backend pytest reference (backend/tests/test_sampler_loop.py). The backend is
// the tested reference implementation; here we assert the FRONTEND
// computeSamplerVoice produces the IDENTICAL frame index / crossfade weight for
// the same (inst, playhead, frameCount) inputs. If the two implementations ever
// diverge (off-by-one wrap, wrong pingpong bounce, crossfade mismatch), one of
// these assertions fails — which means preview ≠ export, the exact bug class
// this guard exists to catch. Updating the loop math in EITHER file without
// updating the other will break this table.
// ===========================================================================
describe('B3.1 PARITY GUARD: frontend frame index matches backend reference values', () => {
  // [label, loop|undefined, extraInstFields, playhead, frameCount, expectedFrameIndex]
  // Expected values are LIFTED from backend/tests/test_sampler_loop.py assertions.
  const FRAME_PARITY: Array<
    [string, LoopConfig | undefined, Partial<SamplerInstrumentV1>, number, number, number]
  > = [
    // — legacy / loop-disabled (backend TestLoopDisabledMatchesLegacy) —
    ['legacy no-loop 10+5', undefined, { startFrame: 10, speed: 1 }, 5, 100, 15],
    ['legacy clamp last', undefined, { startFrame: 90, speed: 2 }, 25, 100, 99],
    ['legacy reverse clamp 0', undefined, { startFrame: 5, speed: -1 }, 30, 100, 0],
    ['loop-off matches legacy', { enabled: false, in: 0, out: 50 }, { startFrame: 10, speed: 1 }, 5, 100, 15],
    // — fwd (backend test_loop_fwd_wraps_out_to_in) —
    ['fwd in10out19 ph0', { enabled: true, in: 10, out: 19, dir: 'fwd' }, {}, 0, 100, 10],
    ['fwd in10out19 ph9', { enabled: true, in: 10, out: 19, dir: 'fwd' }, {}, 9, 100, 19],
    ['fwd in10out19 ph10 wrap', { enabled: true, in: 10, out: 19, dir: 'fwd' }, {}, 10, 100, 10],
    ['fwd in0out9 ph25', { enabled: true, in: 0, out: 9, dir: 'fwd' }, {}, 25, 100, 5],
    // — rev (backend test_loop_reverse_plays_backward_within_bounds) —
    ['rev in10out19 ph0', { enabled: true, in: 10, out: 19, dir: 'rev' }, {}, 0, 100, 19],
    ['rev in10out19 ph9', { enabled: true, in: 10, out: 19, dir: 'rev' }, {}, 9, 100, 10],
    ['rev in10out19 ph10 wrap', { enabled: true, in: 10, out: 19, dir: 'rev' }, {}, 10, 100, 19],
    // — pingpong (backend test_loop_pingpong_bounces_at_bounds, in0out4) —
    ['pp in0out4 ph0', { enabled: true, in: 0, out: 4, dir: 'pingpong' }, {}, 0, 100, 0],
    ['pp in0out4 ph4', { enabled: true, in: 0, out: 4, dir: 'pingpong' }, {}, 4, 100, 4],
    ['pp in0out4 ph5 bounce', { enabled: true, in: 0, out: 4, dir: 'pingpong' }, {}, 5, 100, 3],
    ['pp in0out4 ph7 bounce', { enabled: true, in: 0, out: 4, dir: 'pingpong' }, {}, 7, 100, 1],
    // — speed magnitude (backend test_loop_respects_speed_magnitude) —
    ['fwd speed2 ph5', { enabled: true, in: 0, out: 9, dir: 'fwd' }, { speed: 2 }, 5, 100, 0],
    ['fwd speed1 ph5', { enabled: true, in: 0, out: 9, dir: 'fwd' }, { speed: 1 }, 5, 100, 5],
  ]

  it.each(FRAME_PARITY)(
    'frame parity: %s',
    (_label, loop, extra, playhead, frameCount, expected) => {
      const s = inst({ ...extra, ...(loop ? { loop } : {}) })
      // computeSamplerVoice (full path the preview actually calls) and the
      // extracted computeLoopFrameIndex must BOTH equal the backend reference.
      expect(computeSamplerVoice(s, '/a.mp4', playhead, frameCount).frame_index).toBe(expected)
      expect(computeLoopFrameIndex(s, playhead, frameCount)).toBe(expected)
    },
  )

  // [label, loop, playhead, frameCount, expectedWeight]
  // Expected values LIFTED from backend TestLoopCrossfadeBlendSeam assertions.
  const XFADE_PARITY: Array<[string, LoopConfig, number, number, number]> = [
    ['seam out=19 ph19 → 1.0', { enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 4 }, 19, 100, 1.0],
    ['midpoint ph10 → 0', { enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 4 }, 10, 100, 0],
    ['ramp out=9 ph9 → 1.0', { enabled: true, in: 0, out: 9, dir: 'fwd', crossfade: 4 }, 9, 100, 1.0],
    ['ramp out=9 ph7 → 0.5', { enabled: true, in: 0, out: 9, dir: 'fwd', crossfade: 4 }, 7, 100, 0.5],
    ['crossfade 0 → hard cut', { enabled: true, in: 0, out: 19, dir: 'fwd', crossfade: 0 }, 19, 100, 0],
  ]

  it.each(XFADE_PARITY)(
    'crossfade parity: %s',
    (_label, loop, playhead, frameCount, expected) => {
      const s = inst({ loop })
      expect(computeLoopCrossfadeWeight(s, playhead, frameCount)).toBeCloseTo(expected, 6)
    },
  )
})
