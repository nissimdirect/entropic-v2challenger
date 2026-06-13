/**
 * B4-editor — RackDevice: pad grid triggers, per-pad editor writes to the store.
 *
 * Mirrors sampler-device.test.tsx (component test + mock-free store-driven I/O).
 * Gate 14 wiring: mount-safety (null when no rack), pad-trigger → composite-key
 * event, pad-select → editor shows, source/opacity/blend/mute/solo writes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import RackDevice from '../../../renderer/components/instruments/RackDevice'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import { useProjectStore } from '../../../renderer/stores/project'
import type { Asset } from '../../../shared/types'

const T = 'track-1'
function asset(id: string, path: string): Asset {
  return { id, path, type: 'video', meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false } }
}

function firstPadId(): string {
  return useInstrumentsStore.getState().racks[T].pads[0].id
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
  useProjectStore.setState({ assets: {}, currentFrame: 0 })
})
afterEach(() => cleanup())

describe('RackDevice', () => {
  it('renders nothing when the track has no rack (mount-safe)', () => {
    const { container } = render(<RackDevice trackId={T} />)
    expect(container.querySelector('[data-testid="rack-device"]')).toBeNull()
  })

  it('renders the pad grid when the track has a rack', () => {
    useInstrumentsStore.getState().addRack(T)
    render(<RackDevice trackId={T} />)
    expect(screen.getByTestId('rack-device')).toBeTruthy()
    expect(screen.getByTestId('rack-pad-grid')).toBeTruthy()
    expect(screen.getByTestId('rack-add-pad')).toBeTruthy()
  })

  it('mouse-down on a pad triggers it (writes the composite-key event)', () => {
    useProjectStore.setState({ currentFrame: 7 })
    useInstrumentsStore.getState().addRack(T)
    const padId = firstPadId()
    render(<RackDevice trackId={T} />)
    fireEvent.mouseDown(screen.getByTestId(`rack-pad-${padId}`))
    const events = usePerformanceStore.getState().trackEvents[`${T}:${padId}`]
    expect(events?.length).toBe(1)
    expect(events![0].frameIndex).toBe(7)
    expect(events![0].instrumentId).toBe(`${T}:${padId}`)
  })

  it('clicking a pad opens the editor; source picker sets the pad source', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/clip.mp4') } })
    useInstrumentsStore.getState().addRack(T)
    const padId = firstPadId()
    render(<RackDevice trackId={T} />)
    // No editor until a pad is selected.
    expect(screen.queryByTestId('rack-pad-editor')).toBeNull()
    fireEvent.click(screen.getByTestId(`rack-pad-${padId}`))
    expect(screen.getByTestId('rack-pad-editor')).toBeTruthy()
    fireEvent.change(screen.getByTestId('rack-pad-source'), { target: { value: 'a1' } })
    expect(useInstrumentsStore.getState().racks[T].pads[0].instrument.clipId).toBe('a1')
  })

  it('opacity input writes a clamped value to the pad', () => {
    useInstrumentsStore.getState().addRack(T)
    const padId = firstPadId()
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId(`rack-pad-${padId}`))
    fireEvent.change(screen.getByTestId('rack-pad-opacity'), { target: { value: '0.5' } })
    expect(useInstrumentsStore.getState().racks[T].pads[0].opacity).toBe(0.5)
    // Out-of-range clamps to [0,1].
    fireEvent.change(screen.getByTestId('rack-pad-opacity'), { target: { value: '99' } })
    expect(useInstrumentsStore.getState().racks[T].pads[0].opacity).toBe(1)
  })

  it('blend / mute / solo writes hit the store', () => {
    useInstrumentsStore.getState().addRack(T)
    const padId = firstPadId()
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId(`rack-pad-${padId}`))
    fireEvent.change(screen.getByTestId('rack-pad-blend'), { target: { value: 'screen' } })
    expect(useInstrumentsStore.getState().racks[T].pads[0].blend).toBe('screen')
    fireEvent.click(screen.getByTestId('rack-pad-mute'))
    expect(useInstrumentsStore.getState().racks[T].pads[0].mute).toBe(true)
    fireEvent.click(screen.getByTestId('rack-pad-solo'))
    expect(useInstrumentsStore.getState().racks[T].pads[0].solo).toBe(true)
  })

  it('Add pad appends a pad channel to the rack', () => {
    useInstrumentsStore.getState().addRack(T)
    expect(useInstrumentsStore.getState().racks[T].pads.length).toBe(1)
    render(<RackDevice trackId={T} />)
    fireEvent.click(screen.getByTestId('rack-add-pad'))
    expect(useInstrumentsStore.getState().racks[T].pads.length).toBe(2)
  })
})
