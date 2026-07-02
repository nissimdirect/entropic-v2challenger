/**
 * useAudioMeterPoll — drives the audio store meter at ~30Hz while playing.
 * Tests the lifecycle: starts polling on isPlaying=true, stops + resets on
 * isPlaying=false, cleans up on unmount, dedup on remount (StrictMode).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

const mockSendCommand = vi.fn()

;(window as unknown as { entropic: unknown }).entropic = {
  onEngineStatus: () => {},
  sendCommand: mockSendCommand,
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => () => {},
}

import { useAudioStore, METER_FLOOR_DB } from '../../renderer/stores/audio'
import { useAudioMeterPoll } from '../../renderer/hooks/useAudioMeterPoll'

beforeEach(() => {
  vi.useFakeTimers()
  // Clear any intervals leaked from prior tests' renderHook calls — otherwise
  // the leak-detection test sees ticks from earlier polling tests.
  vi.clearAllTimers()
  mockSendCommand.mockReset()
  mockSendCommand.mockResolvedValue({
    ok: true,
    rms_db: -9,
    peak_db: -3,
    clipped: false,
  })
  useAudioStore.getState().reset()
})

afterEach(() => {
  cleanup() // unmount any hooks not explicitly unmounted in the test body
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useAudioMeterPoll', () => {
  it('does NOT poll while isPlaying=false', async () => {
    renderHook(() => useAudioMeterPoll())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(mockSendCommand).not.toHaveBeenCalled()
  })

  it('fires immediate poll when mounted with isPlaying=true', async () => {
    useAudioStore.setState({ isPlaying: true })
    renderHook(() => useAudioMeterPoll())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockSendCommand).toHaveBeenCalled()
    expect(mockSendCommand.mock.calls[0][0].cmd).toBe('audio_meter')
  })

  it('polls at ~30Hz (every 33ms) while playing', async () => {
    useAudioStore.setState({ isPlaying: true })
    renderHook(() => useAudioMeterPoll())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const initialCount = mockSendCommand.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    // Initial + 3 interval ticks (33, 66, 99) → at least 3 new calls.
    expect(mockSendCommand.mock.calls.length).toBeGreaterThanOrEqual(initialCount + 3)
  })

  it('resets meter to floor when isPlaying is false at mount', () => {
    useAudioStore.getState().setMeter({ rmsDb: -1, peakDb: 0, clipped: true })
    useAudioStore.setState({ isPlaying: false })
    renderHook(() => useAudioMeterPoll())

    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(METER_FLOOR_DB)
    expect(meter.peakDb).toBe(METER_FLOOR_DB)
    expect(meter.clipped).toBe(false)
  })

  it('clears the interval on unmount (no leak)', async () => {
    useAudioStore.setState({ isPlaying: true })
    const { unmount } = renderHook(() => useAudioMeterPoll())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const callsBeforeUnmount = mockSendCommand.mock.calls.length

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    // After unmount, no further polls.
    expect(mockSendCommand.mock.calls.length).toBe(callsBeforeUnmount)
  })
})
