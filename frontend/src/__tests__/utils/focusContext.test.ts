/**
 * H1 (2026-07-02 master-tuneup WS5) — focused-mapping-context selector tests.
 *
 * Pure-function tests against `deriveMappingContext`: no store mocking needed
 * (the function takes plain-object slices — see focusContext.ts doc comment).
 *
 * Precedence under test: rack-pad > effect > clip (on selected track) > track > none.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveMappingContext,
  type MappingTimelineSlice,
  type MappingProjectSlice,
} from '../../renderer/utils/focusContext'

// ─── Fixture builders ─────────────────────────────────────────────────────

function track(id: string, opts: Partial<{ type: 'video' | 'audio'; clips: { id: string }[] }> = {}) {
  return { id, type: opts.type ?? 'video', clips: opts.clips ?? [] } as MappingTimelineSlice['tracks'][number]
}

function timeline(overrides: Partial<MappingTimelineSlice> = {}): MappingTimelineSlice {
  return {
    selectedTrackId: null,
    selectedClipIds: [],
    tracks: [],
    ...overrides,
  }
}

function project(overrides: Partial<MappingProjectSlice> = {}): MappingProjectSlice {
  return {
    selectedEffectId: null,
    selectedRackPad: null,
    ...overrides,
  }
}

// ─── Precedence table ─────────────────────────────────────────────────────

describe('deriveMappingContext precedence', () => {
  it('returns none when nothing is selected', () => {
    const ctx = deriveMappingContext(timeline(), project())
    expect(ctx).toEqual({ kind: 'none', contextKey: 'none' })
  })

  it('track alone yields kind track', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const ctx = deriveMappingContext(tl, project())
    expect(ctx).toEqual({ kind: 'track', trackId: 't1', contextKey: 'track:t1' })
  })

  it('clip selected on the selected track outranks track alone', () => {
    const tl = timeline({
      selectedTrackId: 't1',
      selectedClipIds: ['c1'],
      tracks: [track('t1', { clips: [{ id: 'c1' }] })],
    })
    const ctx = deriveMappingContext(tl, project())
    expect(ctx).toEqual({ kind: 'clip', clipId: 'c1', trackId: 't1', contextKey: 'clip:t1:c1' })
  })

  it('clip selected on a DIFFERENT track than selectedTrackId falls back to track', () => {
    // e.g. user clicked a clip on track A, then clicked track B's header
    // without deselecting the clip — clip selection is now stale relative
    // to the active track (H1 spec: "if a clip is selected ON THE SELECTED TRACK").
    const tl = timeline({
      selectedTrackId: 't2',
      selectedClipIds: ['c1'],
      tracks: [track('t1', { clips: [{ id: 'c1' }] }), track('t2')],
    })
    const ctx = deriveMappingContext(tl, project())
    expect(ctx).toEqual({ kind: 'track', trackId: 't2', contextKey: 'track:t2' })
  })

  it('multi-clip selection uses the LAST (most-recently-interacted) clip as primary', () => {
    const tl = timeline({
      selectedTrackId: 't1',
      selectedClipIds: ['c1', 'c2', 'c3'],
      tracks: [track('t1', { clips: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] })],
    })
    const ctx = deriveMappingContext(tl, project())
    expect(ctx).toEqual({ kind: 'clip', clipId: 'c3', trackId: 't1', contextKey: 'clip:t1:c3' })
  })

  it('effect outranks clip', () => {
    const tl = timeline({
      selectedTrackId: 't1',
      selectedClipIds: ['c1'],
      tracks: [track('t1', { clips: [{ id: 'c1' }] })],
    })
    const ctx = deriveMappingContext(tl, project({ selectedEffectId: 'fx1' }))
    expect(ctx).toEqual({ kind: 'effect', trackId: 't1', effectId: 'fx1', contextKey: 'effect:t1:fx1' })
  })

  it('effect resolves its trackId via the active-track rule (selectedTrackId), not clip data', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const ctx = deriveMappingContext(tl, project({ selectedEffectId: 'fx1' }))
    expect(ctx.kind).toBe('effect')
    if (ctx.kind === 'effect') expect(ctx.trackId).toBe('t1')
  })

  it('effect with no active track (no selection, no video track) does not claim focus', () => {
    const tl = timeline({ tracks: [track('a1', { type: 'audio' })] })
    const ctx = deriveMappingContext(tl, project({ selectedEffectId: 'fx1' }))
    // No video track to fall back to and nothing selected -> effect can't resolve a track -> none
    expect(ctx.kind).toBe('none')
  })

  it('rack-pad outranks effect', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const ctx = deriveMappingContext(
      tl,
      project({ selectedEffectId: 'fx1', selectedRackPad: { trackId: 't1', padId: 'p1' } }),
    )
    expect(ctx).toEqual({
      kind: 'rack-pad',
      trackId: 't1',
      padId: 'p1',
      branchPath: [],
      contextKey: 'rack-pad:t1:p1:',
    })
  })

  it('rack-pad with a branchPath encodes the full nested path in contextKey', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const ctx = deriveMappingContext(
      tl,
      project({ selectedRackPad: { trackId: 't1', padId: 'p3', branchPath: ['p1', 'p2'] } }),
    )
    expect(ctx).toEqual({
      kind: 'rack-pad',
      trackId: 't1',
      padId: 'p3',
      branchPath: ['p1', 'p2'],
      contextKey: 'rack-pad:t1:p3:p1/p2',
    })
  })

  it('rack-pad on a NON-active track (Tiger-fix scoping) does not claim focus — falls through', () => {
    // selectedRackPad targets t1's pad, but t2 is the active track (matches
    // DeviceChain.tsx's isPadTarget guard: selectedRackPad.trackId === activeTrackId).
    const tl = timeline({ selectedTrackId: 't2', tracks: [track('t1'), track('t2')] })
    const ctx = deriveMappingContext(
      tl,
      project({ selectedEffectId: 'fx1', selectedRackPad: { trackId: 't1', padId: 'p1' } }),
    )
    // Falls through past the stale rack-pad to the next-highest applicable kind (effect).
    expect(ctx).toEqual({ kind: 'effect', trackId: 't2', effectId: 'fx1', contextKey: 'effect:t2:fx1' })
  })

  it('active-track resolution falls back to the first video track when selectedTrackId is stale', () => {
    const tl = timeline({
      selectedTrackId: 'deleted-track',
      tracks: [track('a1', { type: 'audio' }), track('v1', { type: 'video' })],
    })
    const ctx = deriveMappingContext(tl, project({ selectedEffectId: 'fx1' }))
    expect(ctx).toEqual({ kind: 'effect', trackId: 'v1', effectId: 'fx1', contextKey: 'effect:v1:fx1' })
  })
})

// ─── contextKey stability ─────────────────────────────────────────────────

describe('contextKey stability', () => {
  it('same selection produces the same contextKey across independent derivations', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const proj = project({ selectedEffectId: 'fx1' })
    const a = deriveMappingContext(tl, proj)
    const b = deriveMappingContext({ ...tl }, { ...proj })
    expect(a.contextKey).toBe(b.contextKey)
  })

  it('a different pad produces a different contextKey', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const a = deriveMappingContext(tl, project({ selectedRackPad: { trackId: 't1', padId: 'p1' } }))
    const b = deriveMappingContext(tl, project({ selectedRackPad: { trackId: 't1', padId: 'p2' } }))
    expect(a.contextKey).not.toBe(b.contextKey)
  })

  it('a different branchPath at the same pad id produces a different contextKey', () => {
    const tl = timeline({ selectedTrackId: 't1', tracks: [track('t1')] })
    const a = deriveMappingContext(
      tl,
      project({ selectedRackPad: { trackId: 't1', padId: 'p1', branchPath: ['x'] } }),
    )
    const b = deriveMappingContext(
      tl,
      project({ selectedRackPad: { trackId: 't1', padId: 'p1', branchPath: ['y'] } }),
    )
    expect(a.contextKey).not.toBe(b.contextKey)
  })

  it('a different track produces a different contextKey', () => {
    const a = deriveMappingContext(
      timeline({ selectedTrackId: 't1', tracks: [track('t1')] }),
      project(),
    )
    const b = deriveMappingContext(
      timeline({ selectedTrackId: 't2', tracks: [track('t2')] }),
      project(),
    )
    expect(a.contextKey).not.toBe(b.contextKey)
  })

  it('no selection always yields the stable "none" key', () => {
    const a = deriveMappingContext(timeline(), project())
    const b = deriveMappingContext(timeline({ tracks: [track('t1')] }), project())
    expect(a.contextKey).toBe('none')
    expect(b.contextKey).toBe('none')
  })
})
