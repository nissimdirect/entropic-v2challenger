/**
 * B1 mount — InstrumentsPanel: add/remove a sampler, source-clip resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import InstrumentsPanel from '../../../renderer/components/instruments/InstrumentsPanel'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useProjectStore } from '../../../renderer/stores/project'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import type { Asset } from '../../../shared/types'

function asset(id: string, path: string): Asset {
  return {
    id,
    path,
    type: 'video',
    meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false },
  }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instrument: null })
  useProjectStore.setState({ assets: {} })
  useTimelineStore.setState({ selectedClipIds: [], tracks: [] })
})
afterEach(() => cleanup())

describe('InstrumentsPanel', () => {
  it('disables Add when no clip is loaded', () => {
    render(<InstrumentsPanel />)
    const btn = screen.getByTestId('add-sampler') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('Load a clip first')
  })

  it('Add uses the first loaded asset when nothing is selected', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/a1.mp4') } })
    render(<InstrumentsPanel />)
    const btn = screen.getByTestId('add-sampler') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(useInstrumentsStore.getState().instrument?.clipId).toBe('a1')
  })

  it('Add prefers the selected timeline clip’s asset', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/a1.mp4'), a2: asset('a2', '/a2.mp4') } })
    useTimelineStore.setState({
      selectedClipIds: ['c2'],
      tracks: [
        { id: 't1', clips: [{ id: 'c2', assetId: 'a2' }] },
      ] as unknown as ReturnType<typeof useTimelineStore.getState>['tracks'],
    })
    render(<InstrumentsPanel />)
    fireEvent.click(screen.getByTestId('add-sampler'))
    expect(useInstrumentsStore.getState().instrument?.clipId).toBe('a2')
  })

  it('shows the device + Remove once a sampler exists; Remove clears it', () => {
    useProjectStore.setState({ assets: { a1: asset('a1', '/a1.mp4') } })
    useInstrumentsStore.getState().addSampler('a1')
    render(<InstrumentsPanel />)
    expect(screen.getByTestId('sampler-device')).toBeTruthy()
    fireEvent.click(screen.getByTestId('remove-sampler'))
    expect(useInstrumentsStore.getState().instrument).toBeNull()
  })
})
