/**
 * B2 — InstrumentsBrowser: RACKS list, Sampler draggable, double-click adds to a
 * selected Performance track (rejects otherwise).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import InstrumentsBrowser from '../../../renderer/components/instruments/InstrumentsBrowser'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useTimelineStore } from '../../../renderer/stores/timeline'

type Tracks = ReturnType<typeof useTimelineStore.getState>['tracks']
function setTracks(tracks: unknown, selectedTrackId: string | null) {
  useTimelineStore.setState({ tracks: tracks as Tracks, selectedTrackId })
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {} })
  setTracks([], null)
})
afterEach(() => cleanup())

describe('InstrumentsBrowser', () => {
  it('lists RACKS with a draggable Sampler and disabled others', () => {
    render(<InstrumentsBrowser />)
    const sampler = screen.getByTestId('instrument-sampler')
    expect(sampler.getAttribute('draggable')).toBe('true')
    expect(screen.getByTestId('instrument-drum-rack').className).toContain('--disabled')
    expect(screen.getByTestId('instrument-wavetable').className).toContain('--disabled')
  })

  it('double-click adds a sampler to the selected Performance track', () => {
    setTracks([{ id: 'p1', type: 'performance', clips: [] }], 'p1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-sampler'))
    expect(useInstrumentsStore.getState().instruments['p1']).toBeTruthy()
  })

  it('double-click does NOT add when the selected track is not a performance track', () => {
    setTracks([{ id: 'v1', type: 'video', clips: [] }], 'v1')
    render(<InstrumentsBrowser />)
    fireEvent.doubleClick(screen.getByTestId('instrument-sampler'))
    expect(useInstrumentsStore.getState().instruments['v1']).toBeUndefined()
  })

  it('the draggable item carries the instrument id in its dataTransfer', () => {
    render(<InstrumentsBrowser />)
    const setData = ((): { type: string; val: string } => {
      const store = { type: '', val: '' }
      const dt = {
        effectAllowed: '',
        setData: (t: string, v: string) => { if (t.includes('instrument')) { store.type = t; store.val = v } },
      }
      fireEvent.dragStart(screen.getByTestId('instrument-sampler'), { dataTransfer: dt })
      return store
    })()
    expect(setData.val).toBe('sampler')
  })
})
