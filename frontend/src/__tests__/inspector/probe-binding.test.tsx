/**
 * P6.8 (I1) — probe binding store + drag-add + cap.
 *
 * Named tests (packet TEST PLAN):
 *   - drag-from-param registers probe via IPC mock
 *   - delete probe unregisters
 *   - 17th probe rejected with toast  (negative)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const sendCommand = vi.fn().mockResolvedValue({ ok: true })
;(globalThis as any).window = { entropic: { sendCommand } }

import { render, cleanup, fireEvent } from '@testing-library/react'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import { LIMITS } from '../../shared/limits'
import { PARAM_PROBE_DRAG_TYPE } from '../../renderer/components/effects/ParamPanel'
import { InspectorTrackLane } from '../../renderer/components/timeline/InspectorTrack'
import { __resetProbeIpcForTest } from '../../renderer/components/timeline/probe-ipc'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useToastStore.setState({ toasts: [] })
  sendCommand.mockClear()
  __resetProbeIpcForTest()
})

afterEach(() => {
  cleanup()
})

function makeDataTransfer(payload: object) {
  const store: Record<string, string> = {
    [PARAM_PROBE_DRAG_TYPE]: JSON.stringify(payload),
  }
  return {
    types: [PARAM_PROBE_DRAG_TYPE],
    getData: (t: string) => store[t] ?? '',
    setData: (t: string, v: string) => {
      store[t] = v
    },
    dropEffect: '',
    effectAllowed: '',
  }
}

describe('probe binding — store', () => {
  it('addProbeBinding adds a binding and dedups same effect+param', () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    const p1 = useTimelineStore.getState().addProbeBinding(id, {
      kind: 'param_postmod',
      effectId: 'e1',
      paramPath: 'radius',
      label: 'Blur · radius',
    })
    expect(p1).toBeTruthy()
    // Duplicate target → no new row, returns existing probeId.
    const p2 = useTimelineStore.getState().addProbeBinding(id, {
      kind: 'param_postmod',
      effectId: 'e1',
      paramPath: 'radius',
      label: 'Blur · radius',
    })
    expect(p2).toBe(p1)
    const track = useTimelineStore.getState().tracks.find((t) => t.id === id)!
    expect(track.probeBindings).toHaveLength(1)
  })

  it('addProbeBinding on a non-inspector track is a no-op', () => {
    const id = useTimelineStore.getState().addTrack('Video', '#fff')!
    const p = useTimelineStore.getState().addProbeBinding(id, {
      kind: 'param_postmod',
      effectId: 'e1',
      paramPath: 'radius',
      label: 'x',
    })
    expect(p).toBeUndefined()
  })

  // NEGATIVE: 17th probe rejected with toast (cap = 16).
  it('17th probe rejected with toast', () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    for (let i = 0; i < LIMITS.MAX_PROBES_PER_TRACK; i++) {
      const p = useTimelineStore.getState().addProbeBinding(id, {
        kind: 'param_postmod',
        effectId: `e${i}`,
        paramPath: 'radius',
        label: `p${i}`,
      })
      expect(p).toBeTruthy()
    }
    const overflow = useTimelineStore.getState().addProbeBinding(id, {
      kind: 'param_postmod',
      effectId: 'e-overflow',
      paramPath: 'radius',
      label: 'overflow',
    })
    expect(overflow).toBeUndefined()
    const track = useTimelineStore.getState().tracks.find((t) => t.id === id)!
    expect(track.probeBindings).toHaveLength(LIMITS.MAX_PROBES_PER_TRACK)
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => /probe limit/i.test(t.message))).toBe(true)
  })
})

describe('probe binding — drag-from-param + IPC', () => {
  it('drag-from-param registers probe via IPC mock', async () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    const track = () => useTimelineStore.getState().tracks.find((t) => t.id === id)!
    const { container, rerender } = render(
      <InspectorTrackLane track={track()} isSelected={false} />,
    )
    const lane = container.querySelector('.inspector-track-lane')!
    fireEvent.drop(lane, {
      dataTransfer: makeDataTransfer({ effectId: 'e1', paramPath: 'radius', label: 'Blur · radius' }),
    })
    // Binding landed in the store.
    expect(track().probeBindings).toHaveLength(1)
    // Re-render with the updated track so the lane's reconcile effect fires.
    rerender(<InspectorTrackLane track={track()} isSelected={false} />)
    // Allow the effect's microtask to flush.
    await Promise.resolve()
    const cmds = sendCommand.mock.calls.map((c) => c[0].cmd)
    expect(cmds).toContain('probe_mount')
    expect(cmds).toContain('probe_register')
  })

  it('delete probe unregisters via IPC mock', async () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    const probeId = useTimelineStore.getState().addProbeBinding(id, {
      kind: 'param_postmod',
      effectId: 'e1',
      paramPath: 'radius',
      label: 'Blur · radius',
    })!
    const track = () => useTimelineStore.getState().tracks.find((t) => t.id === id)!
    const { rerender } = render(<InspectorTrackLane track={track()} isSelected={false} />)
    await Promise.resolve()
    sendCommand.mockClear()
    // Remove the probe, re-render so the reconcile effect unregisters it.
    useTimelineStore.getState().removeProbeBinding(id, probeId)
    expect(track().probeBindings).toHaveLength(0)
    rerender(<InspectorTrackLane track={track()} isSelected={false} />)
    await Promise.resolve()
    const cmds = sendCommand.mock.calls.map((c) => c[0].cmd)
    expect(cmds).toContain('probe_unregister')
  })

  it('drop with malformed payload does not crash or add a probe', () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    const track = useTimelineStore.getState().tracks.find((t) => t.id === id)!
    const { container } = render(<InspectorTrackLane track={track} isSelected={false} />)
    const lane = container.querySelector('.inspector-track-lane')!
    expect(() =>
      fireEvent.drop(lane, {
        dataTransfer: {
          types: [PARAM_PROBE_DRAG_TYPE],
          getData: () => 'not-json{{{',
          dropEffect: '',
        },
      }),
    ).not.toThrow()
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)!.probeBindings).toHaveLength(0)
  })
})

// Balance test: unmount sends probe_unmount + unregisters (pointer-listener /
// IPC balance on unmount).
describe('probe binding — lifecycle balance', () => {
  it('unmounting the lane sends probe_unmount', async () => {
    const id = useTimelineStore.getState().addInspectorTrack()!
    const track = useTimelineStore.getState().tracks.find((t) => t.id === id)!
    const { unmount } = render(<InspectorTrackLane track={track} isSelected={false} />)
    await Promise.resolve()
    sendCommand.mockClear()
    unmount()
    await Promise.resolve()
    const cmds = sendCommand.mock.calls.map((c) => c[0].cmd)
    expect(cmds).toContain('probe_unmount')
  })
})
