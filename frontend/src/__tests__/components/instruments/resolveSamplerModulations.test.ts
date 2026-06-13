/**
 * B3.2 — resolveSamplerModulations (frontend resolver) tests.
 *
 * Mirrors backend/tests/test_sampler_scrub_speed_modulation.py. Drives the REAL
 * resolver + the REAL frame math (computeLoopFrameIndex) and asserts the
 * computed frame moves — anti-dead-flag discipline. Expected frame values are
 * lifted from the backend reference so frontend/backend stay in lockstep.
 */
import { describe, it, expect } from 'vitest'
import { resolveSamplerModulations } from '../../../renderer/components/instruments/resolveSamplerModulations'
import { computeLoopFrameIndex } from '../../../renderer/components/instruments/computeSamplerVoice'
import type { SamplerInstrumentV1 } from '../../../renderer/components/instruments/types'
import type { Operator, OperatorMapping } from '../../../shared/types'

function inst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 's',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  }
}

function op(id: string, mappings: Partial<OperatorMapping>[], enabled = true): Operator {
  return {
    id,
    type: 'lfo',
    label: id,
    isEnabled: enabled,
    parameters: {},
    processing: [],
    mappings: mappings.map((m) => ({
      targetEffectId: m.targetEffectId ?? '',
      targetParamKey: m.targetParamKey ?? '',
      depth: m.depth ?? 1,
      min: m.min ?? 0,
      max: m.max ?? 1,
      curve: m.curve ?? 'linear',
      blendMode: m.blendMode ?? 'add',
    })),
  }
}

function resolveThenCompute(
  values: Record<string, number>,
  operators: Operator[],
  instruments: Record<string, SamplerInstrumentV1>,
  instId: string,
  playhead: number,
  frameCount = 100,
): number {
  const mod = resolveSamplerModulations(values, operators, instruments)
  return computeLoopFrameIndex(mod[instId], playhead, frameCount)
}

describe('B3.2 resolveSamplerModulations — anti-dead-flag', () => {
  it('scrub modulation is NOT a no-op: drives the frame off baseline', () => {
    const instruments = { samp1: inst({ id: 'samp1', startFrame: 0, endFrame: 99, speed: 0 }) }
    const operators = [op('lfo1', [{ targetParamKey: 'sampler.samp1.scrub', min: 0, max: 1 }])]

    // Baseline: no modulation → frozen at frame 0.
    expect(computeLoopFrameIndex(instruments.samp1, 37, 100)).toBe(0)
    // Modulated: signal 1.0 → scrub 1.0 → range top 99. (backend parity)
    expect(resolveThenCompute({ lfo1: 1.0 }, operators, instruments, 'samp1', 37, 100)).toBe(99)
  })

  it('scrub=0.5 lands mid range', () => {
    const instruments = { s: inst({ startFrame: 0, endFrame: 100, speed: 0 }) }
    const operators = [op('o', [{ targetParamKey: 'sampler.s.scrub', min: 0, max: 1 }])]
    expect(resolveThenCompute({ o: 0.5 }, operators, instruments, 's', 0, 100)).toBe(Math.round(0.5 * 99))
  })

  it('scrub drives within loop range [loopIn, loopOut]', () => {
    const instruments = { s: inst({ startFrame: 0, speed: 1, loop: { enabled: true, in: 20, out: 40, dir: 'fwd' } }) }
    const operators = [op('o', [{ targetParamKey: 'sampler.s.scrub', min: 0, max: 1 }])]
    expect(resolveThenCompute({ o: 0.0 }, operators, instruments, 's', 5)).toBe(20)
    expect(resolveThenCompute({ o: 1.0 }, operators, instruments, 's', 5)).toBe(40)
    expect(resolveThenCompute({ o: 0.5 }, operators, instruments, 's', 5)).toBe(30)
  })
})

describe('B3.2 resolveSamplerModulations — speed scales playback', () => {
  it('speed doubled → 2x frame step (backend parity)', () => {
    const instruments = { s: inst({ startFrame: 0, speed: 1 }) }
    // mod*(8 - -8)=mod*16; want speed 1→2 → mod=1/16. depth=1/16, m_max=1.
    const operators = [op('o', [{ targetParamKey: 'sampler.s.speed', depth: 1 / 16, min: 0, max: 1 }])]
    expect(computeLoopFrameIndex(instruments.s, 10, 100)).toBe(10) // base
    expect(resolveThenCompute({ o: 1.0 }, operators, instruments, 's', 10, 100)).toBe(20)
  })
})

describe('B3.2 resolveSamplerModulations — regression / trust boundary', () => {
  it('no matching mapping → SAME reference (regression-safe no-op)', () => {
    const instruments = { s: inst({ startFrame: 0, speed: 1 }) }
    const operators = [op('o', [{ targetParamKey: 'blur.radius' }])]
    expect(resolveSamplerModulations({ o: 1.0 }, operators, instruments)).toBe(instruments)
  })

  it('does not mutate the input instruments', () => {
    const instruments = { s: inst({ startFrame: 0, endFrame: 99, speed: 0 }) }
    const before = JSON.stringify(instruments)
    resolveSamplerModulations({ o: 1.0 }, [op('o', [{ targetParamKey: 'sampler.s.scrub' }])], instruments)
    expect(JSON.stringify(instruments)).toBe(before)
  })

  it('unknown sampler id is skipped (never throws)', () => {
    const instruments = { real: inst({ id: 'real', startFrame: 0, endFrame: 99, speed: 0 }) }
    const operators = [op('o', [{ targetParamKey: 'sampler.ghost.scrub' }])]
    const out = resolveSamplerModulations({ o: 1.0 }, operators, instruments)
    expect(out).toBe(instruments)
    expect(computeLoopFrameIndex(out.real, 50, 100)).toBe(0)
  })

  it('non-laneable param (opacity/clipId/loop) is skipped', () => {
    const instruments = { s: inst({ startFrame: 0, endFrame: 99, speed: 0 }) }
    const operators = [op('o', [
      { targetParamKey: 'sampler.s.opacity' },
      { targetParamKey: 'sampler.s.clipId' },
      { targetParamKey: 'sampler.s.loop' },
    ])]
    expect(resolveSamplerModulations({ o: 1.0 }, operators, instruments)).toBe(instruments)
  })

  it('disabled operator is skipped', () => {
    const instruments = { s: inst({ startFrame: 0, endFrame: 99, speed: 0 }) }
    const operators = [op('o', [{ targetParamKey: 'sampler.s.scrub' }], false)]
    const out = resolveSamplerModulations({ o: 1.0 }, operators, instruments)
    expect(out).toBe(instruments)
    expect(computeLoopFrameIndex(out.s, 50, 100)).toBe(0)
  })

  it('mask. / effect prefixes never route into the sampler resolver', () => {
    const instruments = { s: inst({ startFrame: 0 }) }
    const operators = [op('o', [{ targetParamKey: 'mask.node1.hue' }, { targetParamKey: 'blur.radius' }])]
    expect(resolveSamplerModulations({ o: 1.0 }, operators, instruments)).toBe(instruments)
  })
})
