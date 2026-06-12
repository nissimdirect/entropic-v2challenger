/**
 * B2 / P3.5 — InstrumentsBrowser: RACKS list, Sampler draggable, double-click adds to a
 * selected Performance track (rejects otherwise). P3.5 adds P3.2 drag idiom (nonce + JSON
 * payload with kind='instruments') and disabled-with-tooltip when no video clips on timeline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import InstrumentsBrowser from '../../../renderer/components/instruments/InstrumentsBrowser'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { EFFECT_DRAG_TYPE, CREATRIX_NONCE_TYPE } from '../../../renderer/components/effects/EffectBrowser'

type Tracks = ReturnType<typeof useTimelineStore.getState>['tracks']
function setTracks(tracks: unknown, selectedTrackId: string | null) {
  useTimelineStore.setState({ tracks: tracks as Tracks, selectedTrackId })
}

/** A minimal video track with one clip (satisfies hasVideoClips check). */
const VIDEO_TRACK_WITH_CLIP = { id: 'v1', type: 'video', clips: [{ id: 'c1', assetPath: '/x.mp4', position: 0, duration: 30, trimStart: 0, trimEnd: 30 }] }

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {} })
  setTracks([], null)
})
afterEach(() => cleanup())

describe('InstrumentsBrowser', () => {
  it('lists RACKS with Drum Rack and Wavetable disabled', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP], null)
    render(<InstrumentsBrowser />)
    expect(screen.getByTestId('instrument-drum-rack').className).toContain('--disabled')
    expect(screen.getByTestId('instrument-wavetable').className).toContain('--disabled')
  })

  it('sampler entry disabled with tooltip when timeline empty (INJ-4 spec)', () => {
    // No tracks → no video clips → Sampler disabled
    setTracks([], null)
    render(<InstrumentsBrowser />)
    const sampler = screen.getByTestId('instrument-sampler')
    expect(sampler.className).toContain('--disabled')
    expect(sampler.getAttribute('draggable')).not.toBe('true')
    expect(sampler.getAttribute('title')).toContain('video clip')
  })

  it('drag payload kind=instruments id=sampler (P3.2 idiom, nonce present)', () => {
    // Need a video clip so Sampler is enabled
    setTracks([VIDEO_TRACK_WITH_CLIP], null)
    render(<InstrumentsBrowser />)
    const dataMap: Record<string, string> = {}
    const dt = {
      effectAllowed: '',
      setData: (t: string, v: string) => { dataMap[t] = v },
    }
    fireEvent.dragStart(screen.getByTestId('instrument-sampler'), { dataTransfer: dt })

    // P3.2: must carry the nonce
    expect(dataMap[CREATRIX_NONCE_TYPE]).toBeTruthy()

    // P3.2: EFFECT_DRAG_TYPE carries JSON {kind:'instruments', id:'builtin:sampler'}
    const payload = JSON.parse(dataMap[EFFECT_DRAG_TYPE] ?? '{}')
    expect(payload.kind).toBe('instruments')
    expect(payload.id).toBe('builtin:sampler')

    // Back-compat: INSTRUMENT_DRAG_TYPE still carries plain 'sampler'
    expect(dataMap['application/x-entropic-instrument-id']).toBe('sampler')
  })

  it('double-click adds a sampler to the selected Performance track', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP, { id: 'p1', type: 'performance', clips: [] }], 'p1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-sampler'))
    expect(useInstrumentsStore.getState().instruments['p1']).toBeTruthy()
  })

  it('double-click does NOT add when the selected track is not a performance track', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP, { id: 'v2', type: 'video', clips: [] }], 'v2')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-sampler'))
    expect(useInstrumentsStore.getState().instruments['v2']).toBeUndefined()
  })
})
