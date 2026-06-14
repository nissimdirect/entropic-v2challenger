/**
 * P6.8 (I1) — ProbeScope sparkline.
 *
 * Named tests (packet TEST PLAN):
 *   - renders sparkline from mock snapshot
 *   - mute pauses polling
 *   - unmount sends probe_unmount   (covered at lane level; here: unsubscribe stops polling)
 *   - malformed snapshot payload renders empty scope not crash  (negative)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let snapshotReply: Record<string, unknown> = { ok: true, mounted: true, probes: {} }
const sendCommand = vi.fn().mockImplementation(async (cmd: Record<string, unknown>) => {
  if (cmd.cmd === 'probe_snapshot') return snapshotReply
  return { ok: true }
})
;(globalThis as any).window = { entropic: { sendCommand } }

import { render, cleanup } from '@testing-library/react'
import ProbeScope from '../../renderer/components/timeline/ProbeScope'
import { __resetProbeIpcForTest } from '../../renderer/components/timeline/probe-ipc'

beforeEach(() => {
  vi.useFakeTimers()
  snapshotReply = { ok: true, mounted: true, probes: {} }
  sendCommand.mockClear()
  __resetProbeIpcForTest()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function snapshotWith(probeId: string, values: number[], ts: number) {
  return {
    ok: true,
    mounted: true,
    capturedAtS: ts,
    probes: {
      [probeId]: {
        id: probeId,
        kind: 'param_postmod',
        label: 'x',
        trackId: 't1',
        effectId: 'e1',
        paramPath: 'radius',
        history: values.map((v, i) => ({ value: v, timestampS: ts - (values.length - i) * 0.1 })),
        latestValue: values[values.length - 1] ?? null,
        latestTimestampS: ts,
      },
    },
  }
}

describe('ProbeScope', () => {
  it('mounts and polls probe_snapshot from the shared loop', async () => {
    snapshotReply = snapshotWith('probe:e1:radius', [0.1, 0.5, 0.9], 1.0)
    const { container } = render(<ProbeScope probeId="probe:e1:radius" />)
    expect(container.querySelector('canvas.probe-scope')).toBeTruthy()
    // Advance one poll interval (10 Hz → 100ms).
    await vi.advanceTimersByTimeAsync(120)
    const cmds = sendCommand.mock.calls.map((c) => c[0].cmd)
    expect(cmds).toContain('probe_snapshot')
  })

  it('renders sparkline from mock snapshot without throwing', async () => {
    snapshotReply = snapshotWith('probe:e1:radius', [0.0, 0.3, 0.6, 1.0], 2.0)
    const { container } = render(<ProbeScope probeId="probe:e1:radius" />)
    await vi.advanceTimersByTimeAsync(120)
    // rAF draw is scheduled; flush microtasks/timers. The key assertion is no throw.
    const canvas = container.querySelector('canvas.probe-scope') as HTMLCanvasElement
    expect(canvas).toBeTruthy()
    expect(canvas.getAttribute('data-probe-id')).toBe('probe:e1:radius')
  })

  // NEGATIVE: a malformed snapshot must not crash the scope.
  it('malformed snapshot payload renders empty scope not crash', async () => {
    snapshotReply = { ok: true, mounted: true, probes: { 'probe:e1:radius': { junk: true } } }
    expect(() => render(<ProbeScope probeId="probe:e1:radius" />)).not.toThrow()
    await expect(vi.advanceTimersByTimeAsync(120)).resolves.not.toThrow()
  })

  it('mute pauses polling for this scope (no subscription → no snapshot poll)', async () => {
    render(<ProbeScope probeId="probe:e1:radius" muted />)
    await vi.advanceTimersByTimeAsync(300)
    const snapshotCalls = sendCommand.mock.calls.filter((c) => c[0].cmd === 'probe_snapshot')
    expect(snapshotCalls).toHaveLength(0)
  })

  it('unmount stops the shared poll loop when it was the only subscriber', async () => {
    const { unmount } = render(<ProbeScope probeId="probe:e1:radius" />)
    await vi.advanceTimersByTimeAsync(120)
    expect(sendCommand.mock.calls.some((c) => c[0].cmd === 'probe_snapshot')).toBe(true)
    unmount()
    sendCommand.mockClear()
    await vi.advanceTimersByTimeAsync(300)
    // No further polls after the last subscriber left.
    expect(sendCommand.mock.calls.filter((c) => c[0].cmd === 'probe_snapshot')).toHaveLength(0)
  })
})
