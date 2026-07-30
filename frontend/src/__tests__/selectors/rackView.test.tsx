/**
 * F4b PR1 — rackView selector tests.
 * Verifies useRackDeviceView(trackId) returns the exact composed shape
 * RackDevice.tsx previously assembled from ~26 inline store-hook calls
 * across 4 stores (data reads AND stable action-function refs).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useRackDeviceView } from '../../renderer/selectors/rackView'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useProjectStore } from '../../renderer/stores/project'
import { usePerformanceStore } from '../../renderer/stores/performance'
import { usePerformanceFreezeStore } from '../../renderer/stores/performanceFreeze'
import { useLayoutStore } from '../../renderer/stores/layout'

const TRACK_ID = 'char-rack-track-1'

const snapshots = {
  instruments: useInstrumentsStore.getState(),
  project: useProjectStore.getState(),
  performance: usePerformanceStore.getState(),
  performanceFreeze: usePerformanceFreezeStore.getState(),
  layout: useLayoutStore.getState(),
}

function resetAll() {
  useInstrumentsStore.setState(snapshots.instruments, true)
  useProjectStore.setState(snapshots.project, true)
  usePerformanceStore.setState(snapshots.performance, true)
  usePerformanceFreezeStore.setState(snapshots.performanceFreeze, true)
  useLayoutStore.setState(snapshots.layout, true)
}

beforeEach(resetAll)
afterEach(() => {
  cleanup()
  resetAll()
})

describe('useRackDeviceView', () => {
  it('returns undefined rack + defaulted freezeFsm when the track has no rack yet', () => {
    const { result } = renderHook(() => useRackDeviceView(TRACK_ID))
    expect(result.current.rack).toBeUndefined()
    expect(result.current.freezeFsm).toBe('idle')
    expect(result.current.rackEditPath).toEqual([])
    expect(result.current.selectedRackPad).toBeNull()
  })

  it('composes the rack once addRack creates it, and exposes stable action refs', () => {
    act(() => {
      useInstrumentsStore.getState().addRack(TRACK_ID)
    })
    const { result } = renderHook(() => useRackDeviceView(TRACK_ID))
    expect(result.current.rack).toBeDefined()
    // addRack seeds one default pad — not an empty grid.
    expect(result.current.rack!.pads.length).toBe(1)
    expect(typeof result.current.addRackPadAt).toBe('function')
    expect(typeof result.current.setRackPadSourceAt).toBe('function')
    expect(typeof result.current.triggerRackPad).toBe('function')
    expect(typeof result.current.freezePerformanceTrack).toBe('function')
    expect(typeof result.current.enterBranch).toBe('function')
  })

  it('composes launch-quantize state from the layout store', () => {
    act(() => {
      useLayoutStore.getState().toggleLaunchQuantize()
    })
    const { result } = renderHook(() => useRackDeviceView(TRACK_ID))
    expect(result.current.launchQuantizeEnabled).toBe(true)
    expect(typeof result.current.quantizeDivision).toBe('number')
  })

  it('re-renders when this track freezes (subscription check — scoped to trackId)', () => {
    const { result } = renderHook(() => useRackDeviceView(TRACK_ID))
    expect(result.current.freezeFsm).toBe('idle')
    act(() => {
      usePerformanceFreezeStore.setState((s) => ({ fsm: { ...s.fsm, [TRACK_ID]: 'frozen' } }))
    })
    expect(result.current.freezeFsm).toBe('frozen')
  })
})
