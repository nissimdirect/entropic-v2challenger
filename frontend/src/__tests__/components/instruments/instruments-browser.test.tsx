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
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
  setTracks([], null)
})
afterEach(() => cleanup())

describe('InstrumentsBrowser', () => {
  it('lists RACKS with Sample Rack enabled (labelled "Sample Rack"); Wavetable enabled with a clip (B6.3)', () => {
    // B4-editor: the rack entry (id drum-rack) is now ENABLED and labelled
    // "Sample Rack" (relabelled from "Drum Rack" to avoid colliding with the
    // B2-lite performance drumRack).
    // B6.3: the Wavetable entry (the Frame-Bank) is now ENABLED too — clip-gated
    // like the Sampler (its slots scan footage). With a video clip present it is
    // NOT disabled.
    setTracks([VIDEO_TRACK_WITH_CLIP], null)
    render(<InstrumentsBrowser />)
    const rack = screen.getByTestId('instrument-drum-rack')
    expect(rack.className).not.toContain('--disabled')
    expect(rack.textContent).toContain('Sample Rack')
    const wavetable = screen.getByTestId('instrument-wavetable')
    expect(wavetable.className).not.toContain('--disabled')
    expect(wavetable.textContent).not.toContain('(soon)')
  })

  it('Wavetable (Frame-Bank) entry is clip-gated: disabled with tooltip when timeline empty (B6.3)', () => {
    setTracks([], null)
    render(<InstrumentsBrowser />)
    const wavetable = screen.getByTestId('instrument-wavetable')
    expect(wavetable.className).toContain('--disabled')
    expect(wavetable.getAttribute('draggable')).not.toBe('true')
    expect(wavetable.getAttribute('title')).toContain('video clip')
  })

  it('double-click adds a Frame-Bank to the selected Performance track (B6.3)', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP, { id: 'p1', type: 'performance', clips: [] }], 'p1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-wavetable'))
    expect(useInstrumentsStore.getState().frameBanks['p1']).toBeTruthy()
  })

  it('double-click adds a Sample Rack to the selected Performance track (no video-clip gate)', () => {
    // The rack does NOT require video clips on the timeline (pads get sources
    // individually) — create with an empty timeline + a selected perf track.
    setTracks([{ id: 'p1', type: 'performance', clips: [] }], 'p1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-drum-rack'))
    expect(useInstrumentsStore.getState().racks['p1']).toBeTruthy()
  })

  it('double-click does NOT add a rack when no performance track is selected', () => {
    setTracks([{ id: 'v2', type: 'video', clips: [] }], 'v2')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-drum-rack'))
    expect(useInstrumentsStore.getState().racks['v2']).toBeUndefined()
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

  // -------------------------------------------------------------------------
  // B8 Granulator wiring (audit HIGH #9) — the browser entry + addGranulator
  // dispatch. Mirror of the Frame-Bank (Wavetable) entry tests above.
  // -------------------------------------------------------------------------
  it('lists a Granulator entry, enabled when a video clip is present (B8)', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP], null)
    render(<InstrumentsBrowser />)
    const gran = screen.getByTestId('instrument-granulator')
    expect(gran.className).not.toContain('--disabled')
    expect(gran.textContent).toContain('Granulator')
    expect(gran.textContent).not.toContain('(soon)')
  })

  it('Granulator entry is clip-gated: disabled with tooltip when timeline empty (B8)', () => {
    setTracks([], null)
    render(<InstrumentsBrowser />)
    const gran = screen.getByTestId('instrument-granulator')
    expect(gran.className).toContain('--disabled')
    expect(gran.getAttribute('draggable')).not.toBe('true')
    expect(gran.getAttribute('title')).toContain('video clip')
  })

  it('full chain step 1 — double-click adds a Granulator to the selected Performance track (B8)', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP, { id: 'p1', type: 'performance', clips: [] }], 'p1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-granulator'))
    // addGranulator dispatched → the instruments store now holds a granulator
    // bound to the selected track (the headline B8 reachability bug — fixed).
    expect(useInstrumentsStore.getState().granulators['p1']).toBeTruthy()
  })

  it('double-click does NOT add a Granulator when no performance track is selected (B8)', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP, { id: 'v2', type: 'video', clips: [] }], 'v2')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-granulator'))
    expect(useInstrumentsStore.getState().granulators['v2']).toBeUndefined()
  })

  it('Granulator drag payload kind=instruments id=builtin:granulator (P3.2 idiom, B8)', () => {
    setTracks([VIDEO_TRACK_WITH_CLIP], null)
    render(<InstrumentsBrowser />)
    const dataMap: Record<string, string> = {}
    const dt = {
      effectAllowed: '',
      setData: (t: string, v: string) => { dataMap[t] = v },
    }
    fireEvent.dragStart(screen.getByTestId('instrument-granulator'), { dataTransfer: dt })
    expect(dataMap[CREATRIX_NONCE_TYPE]).toBeTruthy()
    const payload = JSON.parse(dataMap[EFFECT_DRAG_TYPE] ?? '{}')
    expect(payload.kind).toBe('instruments')
    expect(payload.id).toBe('builtin:granulator')
  })
})
