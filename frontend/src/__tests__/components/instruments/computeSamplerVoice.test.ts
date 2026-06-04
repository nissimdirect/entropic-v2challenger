/**
 * B1 computeSamplerVoice — pure sampler→voice math (Gate 5 unit layer).
 */
import { describe, it, expect } from 'vitest'
import { computeSamplerVoice } from '../../../renderer/components/instruments/computeSamplerVoice'
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
