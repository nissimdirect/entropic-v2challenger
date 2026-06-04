/**
 * B1 SamplerDevice — controls write clamped values to the store.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import SamplerDevice from '../../../renderer/components/instruments/SamplerDevice'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'

beforeEach(() => useInstrumentsStore.setState({ instrument: null }))
afterEach(() => cleanup())

describe('SamplerDevice', () => {
  it('renders nothing when no instrument loaded', () => {
    const { container } = render(<SamplerDevice />)
    expect(container.querySelector('[data-testid="sampler-device"]')).toBeNull()
  })

  it('renders controls when a sampler is loaded', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    render(<SamplerDevice />)
    expect(screen.getByTestId('sampler-device')).toBeTruthy()
    expect(screen.getByTestId('sampler-speed')).toBeTruthy()
  })

  it('changing speed writes to the store', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    render(<SamplerDevice />)
    fireEvent.change(screen.getByTestId('sampler-speed'), { target: { value: '-2' } })
    expect(useInstrumentsStore.getState().instrument!.speed).toBe(-2)
  })

  it('clamps out-of-range speed on input', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    render(<SamplerDevice />)
    fireEvent.change(screen.getByTestId('sampler-speed'), { target: { value: '99' } })
    expect(useInstrumentsStore.getState().instrument!.speed).toBe(8)
  })

  it('changing blend writes to the store', () => {
    useInstrumentsStore.getState().addSampler('clip-1')
    render(<SamplerDevice />)
    fireEvent.change(screen.getByTestId('sampler-blend'), { target: { value: 'screen' } })
    expect(useInstrumentsStore.getState().instrument!.blendMode).toBe('screen')
  })
})
