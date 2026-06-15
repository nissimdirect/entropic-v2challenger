/**
 * useMemoryPressurePoll — polls the Python sidecar's `pressure_status` command
 * at ~1s intervals while the app is active and surfaces results to
 * useMemoryPressureStore.
 *
 * P5b.2 (SG-8 frontend): wired at the App level alongside useAudioMeterPoll.
 *
 * Poll hygiene:
 *   - Interval cleared on unmount (no leak).
 *   - Pauses when `document.hidden` (tab/app backgrounded) to save IPC bandwidth.
 *   - No setState-after-unmount: the `cancelled` flag gates all async continuations.
 *   - Trust boundary: raw IPC reply passes through `guardPressureReply` before
 *     touching any store — clamp + finite checks per feedback_numeric-trust-boundary.
 */
import { useEffect, useRef } from 'react'
import { useMemoryPressureStore, guardPressureReply } from '../stores/memoryPressure'

export const PRESSURE_POLL_INTERVAL_MS = 1000 // ~1 Hz per P5b.2 spec

export function useMemoryPressurePoll(): void {
  // cancelled ref guards against setState-after-unmount in the async tick
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false

    let intervalId: ReturnType<typeof setInterval> | null = null

    const tick = async () => {
      // Pause while app is hidden (backgrounded window or minimised)
      if (cancelledRef.current || document.hidden) return

      try {
        const raw = await window.entropic.sendCommand({ cmd: 'pressure_status' })
        if (cancelledRef.current) return
        const payload = guardPressureReply(raw)
        useMemoryPressureStore.getState().setStatus(payload)
      } catch {
        // Network/ZMQ error — silently skip; engine disconnect is handled by
        // the watchdog / engine-status pathway, not the pressure poller.
        if (cancelledRef.current) return
      }
    }

    // Immediate first poll so the badge appears within 1 frame of mount,
    // not after the first interval tick.
    void tick()
    intervalId = setInterval(() => { void tick() }, PRESSURE_POLL_INTERVAL_MS)

    return () => {
      cancelledRef.current = true
      if (intervalId !== null) clearInterval(intervalId)
    }
  }, []) // [] — unconditional; pressure polling runs for the app's lifetime
}
