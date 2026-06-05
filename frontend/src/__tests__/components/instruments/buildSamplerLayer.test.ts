/**
 * B1 mount — buildSamplerLayer resolves an instrument + asset table into a
 * render_composite layer (the App.tsx render-path seam). Gate 5 unit layer.
 */
import { describe, it, expect } from 'vitest'
import { buildSamplerLayer } from '../../../renderer/components/instruments/buildSamplerLayer'
import type { SamplerInstrumentV1 } from '../../../renderer/components/instruments/types'
import type { Asset } from '../../../shared/types'

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

function asset(overrides: Partial<Asset['meta']> = {}, path = '/a.mp4'): Asset {
  return {
    id: 'clip-1',
    path,
    type: 'video',
    meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false, ...overrides },
  }
}

describe('buildSamplerLayer', () => {
  it('returns null when no instrument', () => {
    expect(buildSamplerLayer(null, { 'clip-1': asset() }, 5, 30)).toBeNull()
  })

  it('returns null when the clip is not in the asset table', () => {
    expect(buildSamplerLayer(inst({ clipId: 'missing' }), { 'clip-1': asset() }, 5, 30)).toBeNull()
  })

  it('resolves path + frame from the asset (frameCount = duration*fps)', () => {
    const layer = buildSamplerLayer(inst({ startFrame: 10 }), { 'clip-1': asset() }, 5, 30)
    expect(layer).not.toBeNull()
    expect(layer!.asset_path).toBe('/a.mp4')
    expect(layer!.frame_index).toBe(15) // 10 + 1*5
    expect(layer!.layer_type).toBe('video')
  })

  it('clamps frame_index to the last frame (duration*fps - 1)', () => {
    // 10s * 30fps = 300 frames → lastFrame 299
    const layer = buildSamplerLayer(inst({ startFrame: 290, speed: 5 }), { 'clip-1': asset() }, 100, 30)
    expect(layer!.frame_index).toBe(299)
  })

  it('bad probe (duration 0) freezes on frame 0, never NaN', () => {
    const layer = buildSamplerLayer(inst({ startFrame: 50 }), { 'clip-1': asset({ duration: 0 }) }, 20, 30)
    expect(layer!.frame_index).toBe(0)
    expect(Number.isNaN(layer!.frame_index)).toBe(false)
  })

  it('falls back to defaultFps when asset fps is missing/zero', () => {
    // duration 2s, fps 0 → use defaultFps 30 → 60 frames → lastFrame 59
    const layer = buildSamplerLayer(inst({ startFrame: 100 }), { 'clip-1': asset({ duration: 2, fps: 0 }) }, 0, 30)
    expect(layer!.frame_index).toBe(59)
  })

  it('carries opacity + blend_mode from the instrument', () => {
    const layer = buildSamplerLayer(inst({ opacity: 0.5, blendMode: 'screen' }), { 'clip-1': asset() }, 0, 30)
    expect(layer!.opacity).toBe(0.5)
    expect(layer!.blend_mode).toBe('screen')
  })
})
