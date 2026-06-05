/**
 * B2 — track-bound instruments store.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInstrumentsStore } from '../../renderer/stores/instruments'

const T1 = 'track-1'
const T2 = 'track-2'

beforeEach(() => useInstrumentsStore.setState({ instruments: {} }))

describe('instruments store (track-bound)', () => {
  it('addSampler instantiates a sampler on a track (clipId empty by default)', () => {
    useInstrumentsStore.getState().addSampler(T1)
    const s = useInstrumentsStore.getState().instruments[T1]
    expect(s).toBeTruthy()
    expect(s.type).toBe('sampler')
    expect(s.clipId).toBe('')
    expect(s.speed).toBe(1)
  })

  it('addSampler is a no-op if the track already has a sampler', () => {
    useInstrumentsStore.getState().addSampler(T1, 'clip-a')
    const id1 = useInstrumentsStore.getState().instruments[T1].id
    useInstrumentsStore.getState().addSampler(T1, 'clip-b')
    expect(useInstrumentsStore.getState().instruments[T1].id).toBe(id1)
    expect(useInstrumentsStore.getState().instruments[T1].clipId).toBe('clip-a')
  })

  it('setSource sets the clip', () => {
    useInstrumentsStore.getState().addSampler(T1)
    useInstrumentsStore.getState().setSource(T1, 'clip-x')
    expect(useInstrumentsStore.getState().instruments[T1].clipId).toBe('clip-x')
  })

  it('updateSampler patches only the named track', () => {
    useInstrumentsStore.getState().addSampler(T1)
    useInstrumentsStore.getState().addSampler(T2)
    useInstrumentsStore.getState().updateSampler(T1, { speed: -2, blendMode: 'screen' })
    expect(useInstrumentsStore.getState().instruments[T1].speed).toBe(-2)
    expect(useInstrumentsStore.getState().instruments[T1].blendMode).toBe('screen')
    expect(useInstrumentsStore.getState().instruments[T2].speed).toBe(1) // untouched
  })

  it('removeSampler removes one track without touching others', () => {
    useInstrumentsStore.getState().addSampler(T1)
    useInstrumentsStore.getState().addSampler(T2)
    useInstrumentsStore.getState().removeSampler(T1)
    expect(useInstrumentsStore.getState().instruments[T1]).toBeUndefined()
    expect(useInstrumentsStore.getState().instruments[T2]).toBeTruthy()
  })

  it('getSampler returns the track sampler or undefined', () => {
    expect(useInstrumentsStore.getState().getSampler(T1)).toBeUndefined()
    useInstrumentsStore.getState().addSampler(T1)
    expect(useInstrumentsStore.getState().getSampler(T1)?.type).toBe('sampler')
  })

  it('setSource/updateSampler on a missing track are no-ops', () => {
    useInstrumentsStore.getState().setSource('nope', 'c')
    useInstrumentsStore.getState().updateSampler('nope', { speed: 3 })
    expect(useInstrumentsStore.getState().instruments['nope']).toBeUndefined()
  })
})
