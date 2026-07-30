/**
 * F4b PR1 — trackView selector tests.
 * Verifies useTrackHeaderView/useLaneBadgesView/useTrackLaneView return the
 * exact composed shape Track.tsx's three components previously assembled
 * from individual inline store-hook calls, and stay reactive to each
 * underlying store.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useTrackHeaderView, useLaneBadgesView, useTrackLaneView } from '../../renderer/selectors/trackView'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTrackDragStore } from '../../renderer/stores/trackDrag'
import { useLayoutStore } from '../../renderer/stores/layout'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useProjectStore } from '../../renderer/stores/project'

const TRACK_ID = 'char-track-1'

const snapshots = {
  automation: useAutomationStore.getState(),
  trackDrag: useTrackDragStore.getState(),
  layout: useLayoutStore.getState(),
  effects: useEffectsStore.getState(),
  project: useProjectStore.getState(),
}

beforeEach(() => {
  useAutomationStore.setState(snapshots.automation, true)
  useTrackDragStore.setState(snapshots.trackDrag, true)
  useLayoutStore.setState(snapshots.layout, true)
  useEffectsStore.setState(snapshots.effects, true)
  useProjectStore.setState(snapshots.project, true)
})

afterEach(() => {
  cleanup()
  useAutomationStore.setState(snapshots.automation, true)
  useTrackDragStore.setState(snapshots.trackDrag, true)
  useLayoutStore.setState(snapshots.layout, true)
  useEffectsStore.setState(snapshots.effects, true)
  useProjectStore.setState(snapshots.project, true)
})

describe('useTrackHeaderView', () => {
  it('composes armedTrackId, dragFromIdx, expandedTrackIds, registry, leanAutoLanes', () => {
    act(() => {
      useAutomationStore.setState({ armedTrackId: TRACK_ID })
      useTrackDragStore.getState().setDrag(2, null)
      useLayoutStore.setState({ expandedTrackIds: [TRACK_ID] })
    })
    const { result } = renderHook(() => useTrackHeaderView(TRACK_ID))
    expect(result.current.armedTrackId).toBe(TRACK_ID)
    expect(result.current.dragFromIdx).toBe(2)
    expect(result.current.expandedTrackIds).toEqual([TRACK_ID])
    expect(result.current.registry).toEqual(useEffectsStore.getState().registry)
    expect(result.current.leanAutoLanes).toEqual([])
  })

  it('returns the stable empty-array sentinel when the track has no lanes', () => {
    const { result } = renderHook(() => useTrackHeaderView(TRACK_ID))
    expect(result.current.leanAutoLanes).toEqual([])
  })

  it('re-renders when armedTrackId changes on the underlying store (subscription check)', () => {
    const { result } = renderHook(() => useTrackHeaderView(TRACK_ID))
    expect(result.current.armedTrackId).toBeNull()
    act(() => {
      useAutomationStore.setState({ armedTrackId: TRACK_ID })
    })
    expect(result.current.armedTrackId).toBe(TRACK_ID)
  })
})

describe('useLaneBadgesView', () => {
  it('composes lanes + sg3AbortedLaneIds for the given track', () => {
    act(() => {
      useAutomationStore.getState().addLane(TRACK_ID, 'fx-1', 'opacity', '#4ade80')
    })
    const { result } = renderHook(() => useLaneBadgesView(TRACK_ID))
    expect(result.current.lanes.length).toBe(1)
    expect(result.current.sg3Aborted).toEqual(new Set())
  })

  it('returns the empty sentinel for a track with no lanes', () => {
    const { result } = renderHook(() => useLaneBadgesView('no-such-track'))
    expect(result.current.lanes).toEqual([])
  })
})

describe('useTrackLaneView', () => {
  it('composes assets, automationLanes, automationMode', () => {
    act(() => {
      useProjectStore.setState({
        assets: { 'asset-1': { id: 'asset-1', path: '/tmp/x.mp4', type: 'video', meta: {} } as never },
      })
      useAutomationStore.getState().addLane(TRACK_ID, 'fx-1', 'opacity', '#4ade80')
    })
    const { result } = renderHook(() => useTrackLaneView(TRACK_ID))
    expect(Object.keys(result.current.assets)).toContain('asset-1')
    expect(result.current.automationLanes.length).toBe(1)
    expect(result.current.automationMode).toBe(useAutomationStore.getState().mode)
  })
})
