/**
 * unified-track-header-slots.test.tsx — W1.5b PK.B1 hard oracle
 * (openspec/changes/w15b-grid-track-paradigm/packets.md):
 *
 * "new test: every track.type renders identical slot sequence (assert DOM
 * order of testid slots per type)."
 *
 * The canonical slot order is RATIFIED law (packets.md PK.B1):
 *   [arm][swatch][name][badge][blend][M][S][eye]
 * `twirl` and `lock` are NOT part of this 8-slot capability contract (see
 * UnifiedTrackHeader.tsx's module doc) and are deliberately excluded from
 * this assertion — this test checks only the relative DOM order of the
 * `data-slot`-tagged elements that ARE present for a given track type,
 * never that nothing else exists between them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TrackHeader } from '../../renderer/components/timeline/Track'
import { AudioTrackHeader } from '../../renderer/components/timeline/AudioTrack'
import { InspectorTrackHeader } from '../../renderer/components/timeline/InspectorTrack'
import { MasterTrackHeader } from '../../renderer/components/timeline/MasterTrack'
import { useTimelineStore } from '../../renderer/stores/timeline'
import type { Track as TrackType } from '../../shared/types'

const CANONICAL_ORDER = ['arm', 'swatch', 'name', 'badge', 'blend', 'mute', 'solo', 'eye']

beforeEach(() => {
  useTimelineStore.getState().reset()
})

afterEach(() => cleanup())

function slotSequence(container: HTMLElement): string[] {
  const row = container.querySelector('.track-header__lean-row')!
  return Array.from(row.querySelectorAll<HTMLElement>('[data-slot]')).map(
    (el) => el.getAttribute('data-slot')!,
  )
}

describe('UnifiedTrackHeader — PK.B1 slot-order oracle', () => {
  it('video: [arm][swatch][name][badge][blend][mute][solo][eye] — all 8 present, in order', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#4ade80', 'video')!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(CANONICAL_ORDER)
  })

  it('text: same 8-slot sequence as video (shares TrackHeader)', () => {
    const id = useTimelineStore.getState().addTrack('T1', '#6366f1', 'text')!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(CANONICAL_ORDER)
  })

  it('performance (MIDI): [arm][swatch][name][badge][mute][solo][eye] — no blend', () => {
    const id = useTimelineStore.getState().addTrack('M1', '#3b82f6', 'performance')!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(['arm', 'swatch', 'name', 'badge', 'mute', 'solo', 'eye'])
  })

  it('audio: [swatch][name][badge][mute][solo] — no arm, no blend, no eye', () => {
    const id = useTimelineStore.getState().addAudioTrack('A1', '#f59e0b')!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<AudioTrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(['swatch', 'name', 'badge', 'mute', 'solo'])
  })

  it('inspector: [swatch][name][badge][mute][solo] — same reduced set as audio', () => {
    const id = useTimelineStore.getState().addInspectorTrack('I1', '#5fd7a8')!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<InspectorTrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(['swatch', 'name', 'badge', 'mute', 'solo'])
  })

  it('master: [arm][swatch][name][badge] — arm present, no mute/solo/eye (M.2 PRD)', () => {
    const id = useTimelineStore.getState().addMasterTrack()!
    const t = useTimelineStore.getState().tracks.find((tt) => tt.id === id)!
    const { container } = render(<MasterTrackHeader track={t} isSelected={false} />)
    expect(slotSequence(container)).toEqual(['arm', 'swatch', 'name', 'badge'])
  })

  it('every present slot, across all 5 types, respects the canonical relative order', () => {
    const videoId = useTimelineStore.getState().addTrack('V1', '#4ade80', 'video')!
    const midiId = useTimelineStore.getState().addTrack('M1', '#3b82f6', 'performance')!
    const audioId = useTimelineStore.getState().addAudioTrack('A1', '#f59e0b')!
    const inspectorId = useTimelineStore.getState().addInspectorTrack('I1', '#5fd7a8')!
    const masterId = useTimelineStore.getState().addMasterTrack()!
    const tracks = useTimelineStore.getState().tracks
    const byId = (id: string) => tracks.find((t) => t.id === id)!

    const renders: Array<[TrackType['type'], HTMLElement]> = [
      ['video', render(<TrackHeader track={byId(videoId)} isSelected={false} />).container],
      ['performance', render(<TrackHeader track={byId(midiId)} isSelected={false} />).container],
      ['audio', render(<AudioTrackHeader track={byId(audioId)} isSelected={false} />).container],
      ['inspector', render(<InspectorTrackHeader track={byId(inspectorId)} isSelected={false} />).container],
      ['master', render(<MasterTrackHeader track={byId(masterId)} isSelected={false} />).container],
    ]

    for (const [type, container] of renders) {
      const seq = slotSequence(container)
      const indices = seq.map((slot) => CANONICAL_ORDER.indexOf(slot))
      expect(indices, `${type} slot sequence: ${seq.join(',')}`).toEqual([...indices].sort((a, b) => a - b))
      // No duplicate slots for any single type.
      expect(new Set(seq).size).toBe(seq.length)
    }
  })
})
