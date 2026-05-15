/**
 * F-0514-6 regression test: PopOutPreview liveness driven by main-process
 * heartbeat, not frame arrival.
 *
 * Pre-fix, a paused main app (no new frames for 2s) made the pop-out
 * window flash a "Disconnected" overlay — a false positive whenever
 * playback stopped. The fix decouples liveness from frames: main sends
 * `pop-out:ping` ~1Hz, the preload exposes onPing + getLastPingAt, and the
 * component flags disconnected only when pings stop for >3.5s.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

let pingHandler: (() => void) | null = null
let lastPingAt = 0
let frameHandler: ((dataUrl: string) => void) | null = null

function installMockApi() {
  pingHandler = null
  frameHandler = null
  lastPingAt = 0
  ;(window as any).entropicPopOut = {
    onFrameUpdate: (cb: (dataUrl: string) => void) => {
      frameHandler = cb
    },
    onClose: () => {},
    onPing: (cb: () => void) => {
      pingHandler = cb
    },
    getLastPingAt: () => lastPingAt,
  }
}

import PopOutPreview from '../../renderer/components/preview/PopOutPreview'

describe('PopOutPreview heartbeat liveness (F-0514-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 })
    installMockApi()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete (window as any).entropicPopOut
  })

  it('does NOT show "Disconnected" immediately on mount when no ping yet', () => {
    const { queryByText } = render(<PopOutPreview />)
    expect(queryByText('Disconnected')).toBeNull()
  })

  it('does NOT show "Disconnected" when pings arrive within the threshold', () => {
    const { queryByText } = render(<PopOutPreview />)

    // 3 pings, each spaced 1s. Well under the 3.5s threshold.
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000)
        pingHandler?.()
      })
    }
    expect(queryByText('Disconnected')).toBeNull()
  })

  it('shows "Disconnected" once pings stop for more than the threshold', () => {
    const { queryByText } = render(<PopOutPreview />)

    // First ping seeds liveness.
    act(() => {
      pingHandler?.()
    })

    // Advance past the 3.5s threshold without any ping; interval fires every 1s
    // so by 4s the disconnect check has fired and flipped state.
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(queryByText('Disconnected')).not.toBeNull()
  })

  it('recovers from "Disconnected" when a ping resumes', () => {
    const { queryByText } = render(<PopOutPreview />)
    act(() => {
      pingHandler?.()
    })
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(queryByText('Disconnected')).not.toBeNull()

    // Ping resumes — state should clear.
    act(() => {
      pingHandler?.()
    })
    expect(queryByText('Disconnected')).toBeNull()
  })

  it('does NOT show "Disconnected" while paused (no frames) but pings continue', () => {
    // This is the F-0514-6 regression: pre-fix, a paused main app produced
    // no frame events for ≥2s and flipped the overlay to Disconnected even
    // though the IPC bridge was healthy.
    const { queryByText } = render(<PopOutPreview />)
    // Simulate 10s of paused playback with steady pings, zero frames.
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(1000)
        pingHandler?.()
      })
    }
    expect(queryByText('Disconnected')).toBeNull()
    // frameHandler never invoked
    expect(frameHandler).not.toBeNull()
  })
})
