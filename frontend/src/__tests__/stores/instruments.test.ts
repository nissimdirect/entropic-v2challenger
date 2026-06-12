/**
 * B1 instruments store — single-sampler lifecycle.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInstrumentsStore } from '../../renderer/stores/instruments'

beforeEach(() => {
  useInstrumentsStore.setState({ instrument: null })
})

describe('useInstrumentsStore', () => {
  it('starts empty', () => {
    expect(useInstrumentsStore.getState().instrument).toBeNull()
  })

  it('addSampler creates a sampler with sane defaults', () => {
    useInstrumentsStore.getState().addSampler('clip-42')
    const inst = useInstrumentsStore.getState().instrument
    expect(inst).not.toBeNull()
    expect(inst!.type).toBe('sampler')
    expect(inst!.clipId).toBe('clip-42')
    expect(inst!.startFrame).toBe(0)
    expect(inst!.speed).toBe(1)
    expect(inst!.opacity).toBe(1)
    expect(inst!.blendMode).toBe('normal')
    expect(inst!.id).toMatch(/^sampler-/)
  })

  it('updateSampler patches fields, preserves id/type', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    const id = useInstrumentsStore.getState().instrument!.id
    useInstrumentsStore.getState().updateSampler({ speed: -2, opacity: 0.5 })
    const inst = useInstrumentsStore.getState().instrument!
    expect(inst.speed).toBe(-2)
    expect(inst.opacity).toBe(0.5)
    expect(inst.id).toBe(id)
    expect(inst.type).toBe('sampler')
  })

  it('updateSampler is a no-op when no instrument loaded', () => {
    useInstrumentsStore.getState().updateSampler({ speed: 3 })
    expect(useInstrumentsStore.getState().instrument).toBeNull()
  })

  it('removeSampler clears the instrument', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    useInstrumentsStore.getState().removeSampler()
    expect(useInstrumentsStore.getState().instrument).toBeNull()
  })
})
