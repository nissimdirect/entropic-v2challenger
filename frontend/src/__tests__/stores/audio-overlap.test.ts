/** Tests for the audio-bridge overlap detector + toast advisory. */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const sendCommand = vi.fn().mockResolvedValue({ ok: true })
;(globalThis as any).window = {
  entropic: {
    sendCommand,
    onEngineStatus: vi.fn(),
    onExportProgress: vi.fn().mockReturnValue(vi.fn()),
    selectFile: vi.fn(),
    selectSavePath: vi.fn(),
  },
}

import {
  __resetAudioBridgeForTests__,
  __resetOverlapWarningForTests__,
  flushAudioTracksSet,
  maxConcurrentAudioClips,
  refreshFlag,
} from '../../renderer/audio-bridge'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import { useUndoStore } from '../../renderer/stores/undo'
import { AUDIO_LIMITS } from '../../shared/types'

function baseClip(overrides: Record<string, unknown> = {}): any {
  return {
    path: '/tmp/kick.wav',
    inSec: 0,
    outSec: 4,
    startSec: 0,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    ...overrides,
  }
}

describe('maxConcurrentAudioClips', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  it('returns 0 for empty timeline', () => {
    expect(maxConcurrentAudioClips([])).toBe(0)
  })

  it('returns 0 when only video tracks exist', () => {
    useTimelineStore.getState().addTrack('Video', '#fff')
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(0)
  })

  it('counts non-overlapping clips as 1', () => {
    const t = useTimelineStore.getState().addAudioTrack()!
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 0, outSec: 1 }))
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 5, outSec: 1 }))
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(1)
  })

  it('counts 3 overlapping clips as 3', () => {
    const t = useTimelineStore.getState().addAudioTrack()!
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 0, outSec: 10 }))
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 2, outSec: 10 }))
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 5, outSec: 10 }))
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(3)
  })

  it('touching clips (end == start) do not count as overlap', () => {
    const t = useTimelineStore.getState().addAudioTrack()!
    // Clip 1: [0, 5]; Clip 2: [5, 10]. They touch at t=5 but don't overlap.
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 0, outSec: 5 }))
    useTimelineStore.getState().addAudioClip(t, baseClip({ startSec: 5, outSec: 5 }))
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(1)
  })

  it('excludes muted tracks from the count', () => {
    const t1 = useTimelineStore.getState().addAudioTrack('A')!
    const t2 = useTimelineStore.getState().addAudioTrack('B')!
    useTimelineStore.getState().addAudioClip(t1, baseClip())
    useTimelineStore.getState().addAudioClip(t2, baseClip())
    useTimelineStore.getState().toggleMute(t1)
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(1)
  })

  it('excludes muted clips', () => {
    const t = useTimelineStore.getState().addAudioTrack()!
    useTimelineStore.getState().addAudioClip(t, baseClip())
    useTimelineStore.getState().addAudioClip(t, baseClip({ muted: true }))
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(1)
  })

  it('excludes missing clips', () => {
    const t = useTimelineStore.getState().addAudioTrack()!
    useTimelineStore.getState().addAudioClip(t, baseClip())
    useTimelineStore.getState().addAudioClip(t, baseClip({ missing: true }))
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(1)
  })

  it('handles N clips across N tracks all starting at 0', () => {
    const N = 20
    for (let i = 0; i < N; i++) {
      const tid = useTimelineStore.getState().addAudioTrack(`t${i}`)!
      useTimelineStore.getState().addAudioClip(tid, baseClip())
    }
    expect(maxConcurrentAudioClips(useTimelineStore.getState().tracks)).toBe(N)
  })
})

describe('overlap advisory toast', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useToastStore.getState().clearAll()
    sendCommand.mockReset()
    sendCommand.mockResolvedValue({ ok: true })
    __resetAudioBridgeForTests__()
    __resetOverlapWarningForTests__()
  })

  it('does NOT fire when overlap is within cap', async () => {
    sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
    await refreshFlag()
    const t = useTimelineStore.getState().addAudioTrack()!
    useTimelineStore.getState().addAudioClip(t, baseClip())
    flushAudioTracksSet()
    const toasts = useToastStore.getState().toasts
    expect(toasts.filter((x) => x.source === 'audio-overlap')).toHaveLength(0)
  })

  it('fires once when overlap exceeds MAX_ACTIVE_CLIPS', async () => {
    sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
    await refreshFlag()
    // Create MAX_ACTIVE_CLIPS + 1 overlapping clips
    for (let i = 0; i < AUDIO_LIMITS.MAX_ACTIVE_CLIPS + 1; i++) {
      const tid = useTimelineStore.getState().addAudioTrack(`t${i}`)!
      useTimelineStore.getState().addAudioClip(tid, baseClip())
    }
    flushAudioTracksSet()
    const toasts = useToastStore.getState().toasts
    const overlapToasts = toasts.filter((x) => x.source === 'audio-overlap')
    expect(overlapToasts).toHaveLength(1)
    expect(overlapToasts[0].level).toBe('warning')
    expect(overlapToasts[0].message).toContain(`${AUDIO_LIMITS.MAX_ACTIVE_CLIPS + 1}`)
    expect(overlapToasts[0].message).toContain(`${AUDIO_LIMITS.MAX_ACTIVE_CLIPS}`)
  })

  it('rate-limits repeated warnings within 5 seconds', async () => {
    sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
    await refreshFlag()
    for (let i = 0; i < AUDIO_LIMITS.MAX_ACTIVE_CLIPS + 2; i++) {
      const tid = useTimelineStore.getState().addAudioTrack(`t${i}`)!
      useTimelineStore.getState().addAudioClip(tid, baseClip())
    }
    flushAudioTracksSet()
    flushAudioTracksSet()
    flushAudioTracksSet()
    const toasts = useToastStore.getState().toasts
    expect(toasts.filter((x) => x.source === 'audio-overlap')).toHaveLength(1)
  })

  it('is inert when flag is off', async () => {
    sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
    await refreshFlag()
    for (let i = 0; i < AUDIO_LIMITS.MAX_ACTIVE_CLIPS + 3; i++) {
      const tid = useTimelineStore.getState().addAudioTrack(`t${i}`)!
      useTimelineStore.getState().addAudioClip(tid, baseClip())
    }
    flushAudioTracksSet()
    // With flag off, flushAudioTracksSet bails out — no toast should fire.
    const toasts = useToastStore.getState().toasts
    expect(toasts.filter((x) => x.source === 'audio-overlap')).toHaveLength(0)
  })
})
