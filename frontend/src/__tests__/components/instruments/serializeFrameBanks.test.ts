/**
 * B6.1 — Frame-Bank export serialization tests.
 *
 * GATE 1 (additive): no frameBanks → empty payload (omitted from export).
 * Slot assets collected into the shared assets table; model values passed
 * through verbatim (the backend security.validate_frame_bank is the clamping
 * trust boundary, not the serializer).
 */
import { describe, expect, it } from 'vitest'

import { serializeFrameBanks } from '../../../renderer/components/instruments/serializeFrameBanks'
import type { FrameBankInstrument } from '../../../renderer/components/instruments/types'

const fb = (over: Partial<FrameBankInstrument> = {}): FrameBankInstrument => ({
  id: 'fb1',
  type: 'frameBank',
  slots: [
    { clipId: 'clipA', frameIndex: 0 },
    { clipId: 'clipA', frameIndex: 10 },
  ],
  position: 0.5,
  interp: 'blend',
  byteBudget: 64 * 1024 * 1024,
  ...over,
})

const ASSETS = {
  clipA: { path: '/x/clipA.mp4', meta: { fps: 30, duration: 10 } },
}

describe('serializeFrameBanks', () => {
  it('GATE 1 — no frameBanks → empty payload', () => {
    const r = serializeFrameBanks({}, ASSETS, 30)
    expect(Object.keys(r.frameBanks)).toHaveLength(0)
    expect(Object.keys(r.assets)).toHaveLength(0)
  })

  it('serializes a frameBank + collects its slot asset', () => {
    const r = serializeFrameBanks({ fb1: fb() }, ASSETS, 30)
    expect(r.frameBanks.fb1).toMatchObject({
      type: 'frameBank',
      position: 0.5,
      interp: 'blend',
      byteBudget: 64 * 1024 * 1024,
      slots: [
        { clipId: 'clipA', frameIndex: 0 },
        { clipId: 'clipA', frameIndex: 10 },
      ],
    })
    expect(r.assets.clipA).toEqual({
      path: '/x/clipA.mp4',
      frameCount: 300, // 30fps * 10s
      fps: 30,
    })
  })

  it('skips an unsourced (empty-slots) bank', () => {
    const r = serializeFrameBanks({ fb1: fb({ slots: [] }) }, ASSETS, 30)
    expect(Object.keys(r.frameBanks)).toHaveLength(0)
  })

  it('emits optional fields only when present', () => {
    const withOpt = serializeFrameBanks(
      { fb1: fb({ timeAxis: 'y', opacity: 0.8, blendMode: 'screen' }) },
      ASSETS,
      30,
    )
    expect(withOpt.frameBanks.fb1).toMatchObject({
      timeAxis: 'y',
      opacity: 0.8,
      blendMode: 'screen',
    })
    const without = serializeFrameBanks({ fb1: fb() }, ASSETS, 30)
    expect(without.frameBanks.fb1).not.toHaveProperty('timeAxis')
    expect(without.frameBanks.fb1).not.toHaveProperty('opacity')
  })

  it('dedupes a shared slot asset', () => {
    const r = serializeFrameBanks(
      {
        a: fb({ id: 'a' }),
        b: fb({ id: 'b', slots: [{ clipId: 'clipA', frameIndex: 5 }] }),
      },
      ASSETS,
      30,
    )
    expect(Object.keys(r.assets)).toEqual(['clipA'])
    expect(Object.keys(r.frameBanks).sort()).toEqual(['a', 'b'])
  })
})
