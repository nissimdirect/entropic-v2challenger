/**
 * B2 SamplerDevice — per-track controls + source picker write to the track's sampler.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import SamplerDevice from '../../../renderer/components/instruments/SamplerDevice'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useProjectStore } from '../../../renderer/stores/project'
import type { Asset } from '../../../shared/types'

const T = 'track-1'
function asset(id: string, path: string): Asset {
  return { id, path, type: 'video', meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false } }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {} })
  useProjectStore.setState({ assets: {} })
})
afterEach(() => cleanup())

describe('SamplerDevice', () => {
  it('renders nothing when the track has no sampler', () => {
    const { container } = render(<SamplerDevice trackId={T} />)
    expect(container.querySelector('[data-testid="sampler-device"]')).toBeNull()
  })

  it('renders controls when the track has a sampler', () => {
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    expect(screen.getByTestId('sampler-device')).toBeTruthy()
    expect(screen.getByTestId('sampler-speed')).toBeTruthy()
    expect(screen.getByTestId('sampler-source')).toBeTruthy()
  })

  it('changing speed writes to that track\'s sampler', () => {
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('sampler-speed'), { target: { value: '-2' } })
    expect(useInstrumentsStore.getState().instruments[T].speed).toBe(-2)
  })

  it('clamps out-of-range speed', () => {
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('sampler-speed'), { target: { value: '99' } })
    expect(useInstrumentsStore.getState().instruments[T].speed).toBe(8)
  })

  it('the source picker lists video assets and sets the source', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/clip.mp4') } })
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('sampler-source'), { target: { value: 'a1' } })
    expect(useInstrumentsStore.getState().instruments[T].clipId).toBe('a1')
  })

  it('changing blend writes to the store', () => {
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    fireEvent.change(screen.getByTestId('sampler-blend'), { target: { value: 'screen' } })
    expect(useInstrumentsStore.getState().instruments[T].blendMode).toBe('screen')
  })
})
