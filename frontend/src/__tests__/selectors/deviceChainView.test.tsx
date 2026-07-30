/**
 * F4b PR1 — deviceChainView selector tests.
 * Verifies useDeviceChainView() returns the exact composed shape
 * DeviceChain.tsx previously assembled from 13 inline store-hook calls
 * across 5 stores + 2 project-store custom hooks (active track/pad
 * resolution, mask-node derivation from the playhead).
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useDeviceChainView } from '../../renderer/selectors/deviceChainView'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useEngineStore } from '../../renderer/stores/engine'
import { useFreezeStore } from '../../renderer/stores/freeze'
import { useLayoutStore } from '../../renderer/stores/layout'

const snapshots = {
  project: useProjectStore.getState(),
  timeline: useTimelineStore.getState(),
  effects: useEffectsStore.getState(),
  engine: useEngineStore.getState(),
  freeze: useFreezeStore.getState(),
  layout: useLayoutStore.getState(),
}

function resetAll() {
  useProjectStore.setState(snapshots.project, true)
  useTimelineStore.setState(snapshots.timeline, true)
  useEffectsStore.setState(snapshots.effects, true)
  useEngineStore.setState(snapshots.engine, true)
  useFreezeStore.setState(snapshots.freeze, true)
  useLayoutStore.setState(snapshots.layout, true)
}

beforeEach(resetAll)
afterEach(() => {
  cleanup()
  resetAll()
})

describe('useDeviceChainView', () => {
  it('resolves the TRACK-scoped chain when no rack pad is selected', () => {
    let trackId = ''
    act(() => {
      trackId = useTimelineStore.getState().addTrack('V1', '#4ade80') as string
      useProjectStore.getState().addEffect(trackId, {
        id: 'fx-1',
        effectId: 'blur',
        isEnabled: true,
        isFrozen: false,
        parameters: {},
        modulations: {},
        mix: 1,
        mask: null,
      })
    })
    const { result } = renderHook(() => useDeviceChainView())
    expect(result.current.activeTrackId).toBe(trackId)
    expect(result.current.isPadTarget).toBe(false)
    expect(result.current.effectChain.map((e) => e.id)).toEqual(['fx-1'])
    expect(result.current.padLabel).toBeNull()
  })

  it('composes registry, selectedEffectId, deviceGroups, projectAssets, height, lastFrameMs, freeze state', () => {
    act(() => {
      useEffectsStore.setState({ registry: [{ id: 'blur', name: 'Blur', params: {} } as never] })
      useProjectStore.setState({ selectedEffectId: 'fx-1' })
      useEngineStore.setState({ lastFrameMs: 42 })
      useLayoutStore.getState().setDeviceChainHeight(250)
    })
    const { result } = renderHook(() => useDeviceChainView())
    expect(result.current.registry.map((r) => r.id)).toEqual(['blur'])
    expect(result.current.selectedEffectId).toBe('fx-1')
    expect(result.current.deviceGroups).toEqual({})
    expect(result.current.lastFrameMs).toBe(42)
    expect(result.current.height).toBe(250)
    expect(typeof result.current.isFrozenAt).toBe('function')
    expect(result.current.freezeOpState).toBe('idle')
  })

  it('derives EMPTY maskNodes/undefined maskClipId when no clip sits at the playhead', () => {
    act(() => {
      useTimelineStore.getState().addTrack('V1', '#4ade80')
    })
    const { result } = renderHook(() => useDeviceChainView())
    expect(result.current.maskNodes).toEqual([])
    expect(result.current.maskClipId).toBeUndefined()
  })
})
