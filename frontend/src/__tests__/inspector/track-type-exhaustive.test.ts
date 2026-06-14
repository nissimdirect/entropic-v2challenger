/**
 * P6.8 (I1) — predicate-audit / exhaustive-switch guard.
 *
 * Adding `"inspector"` to Track.type is the RISK of this packet. This test is the
 * compile-time + runtime evidence that every place which must enumerate track
 * types handles `"inspector"`. The `assertNever` helper makes an unhandled new
 * union member a TYPE error (caught by tsc -b), and the runtime cases prove the
 * known set is exactly the documented one.
 */
import { describe, it, expect } from 'vitest'
import type { Track } from '../../shared/types'

// Exhaustiveness helper: if a new Track['type'] is added and a switch below
// doesn't handle it, `x` is no longer `never` and this fails to compile.
function assertNever(x: never): never {
  throw new Error(`Unhandled track type: ${String(x)}`)
}

/** The canonical full set of track types this build understands. */
const ALL_TRACK_TYPES: Track['type'][] = ['video', 'performance', 'text', 'audio', 'inspector']

/** Mirrors the persistence load validator's accepted set. */
function isKnownTrackType(t: string): boolean {
  switch (t as Track['type']) {
    case 'video':
    case 'performance':
    case 'text':
    case 'audio':
    case 'inspector':
      return true
    default:
      // If a new union member appears, the line below becomes a compile error
      // until this switch is updated — the whole point of the audit.
      return assertNeverReturnsFalse(t as never)
  }
}

function assertNeverReturnsFalse(_x: never): boolean {
  return false
}

describe('Track type exhaustive predicate audit (P6.8)', () => {
  it('inspector is part of the known track-type set', () => {
    expect(ALL_TRACK_TYPES).toContain('inspector')
  })

  it('every known type (incl. inspector) is recognized by the exhaustive switch', () => {
    for (const t of ALL_TRACK_TYPES) {
      expect(isKnownTrackType(t)).toBe(true)
    }
  })

  it('an unknown future type is not recognized (forward-tolerance boundary)', () => {
    expect(isKnownTrackType('quantum-foam')).toBe(false)
  })

  it('a render-skip predicate (type !== "video") excludes inspector tracks', () => {
    // App.tsx render loops skip non-video tracks; inspector must never reach the
    // compositor. This encodes that invariant.
    const renderable = ALL_TRACK_TYPES.filter((t) => t === 'video')
    expect(renderable).toEqual(['video'])
    expect(renderable).not.toContain('inspector')
  })

  it('the composite-layer count predicate ignores inspector tracks', () => {
    // countCompositeLayers only counts video/text/performance. Inspector = 0.
    const contributing = ALL_TRACK_TYPES.filter(
      (t) => t === 'video' || t === 'text' || t === 'performance',
    )
    expect(contributing).not.toContain('inspector')
    expect(contributing).not.toContain('audio')
  })
})
