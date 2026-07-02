/**
 * Tests for the frontend audio-bridge — flag detection + debounced sender +
 * flag-gated transport routing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const sendCommand = vi.fn()
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
  flushAudioTracksSet,
  isExperimentalAudioEnabled,
  playbackPause,
  playbackPlay,
  playbackSeek,
  refreshFlag,
  scheduleAudioTracksSet,
  startAudioBridge,
} from '../../renderer/audio-bridge'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'

function baseClip(overrides: Record<string, unknown> = {}): {
  path: string
  inSec: number
  outSec: number
  startSec: number
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  muted: boolean
} {
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
  } as any
}

describe('audio-bridge', () => {
  beforeEach(() => {
    sendCommand.mockReset()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    __resetAudioBridgeForTests__()
  })

  describe('refreshFlag', () => {
    it('returns true when backend reports flag_enabled', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      const enabled = await refreshFlag()
      expect(enabled).toBe(true)
      expect(isExperimentalAudioEnabled()).toBe(true)
    })

    it('returns false when backend reports flag off', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
      const enabled = await refreshFlag()
      expect(enabled).toBe(false)
      expect(isExperimentalAudioEnabled()).toBe(false)
    })

    it('returns false when backend call fails', async () => {
      sendCommand.mockResolvedValueOnce({ ok: false, error: 'boom' })
      const enabled = await refreshFlag()
      expect(enabled).toBe(false)
    })
  })

  describe('scheduleAudioTracksSet', () => {
    it('is inert when flag off', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
      await refreshFlag()
      scheduleAudioTracksSet()
      // Wait for any debounce window
      await new Promise((r) => setTimeout(r, 150))
      expect(sendCommand).toHaveBeenCalledTimes(1) // only the refreshFlag call
    })

    it('sends audio_tracks_set when flag on', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      const trackId = useTimelineStore.getState().addAudioTrack('Drums', '#4ade80')!
      useTimelineStore.getState().addAudioClip(trackId, baseClip())
      sendCommand.mockClear()
      scheduleAudioTracksSet()
      await new Promise((r) => setTimeout(r, 150))
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: 'audio_tracks_set' }),
      )
    })

    it('debounces rapid calls to one IPC', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      const trackId = useTimelineStore.getState().addAudioTrack()!
      useTimelineStore.getState().addAudioClip(trackId, baseClip())
      sendCommand.mockClear()
      // Fire 10 scheduler calls in quick succession
      for (let i = 0; i < 10; i++) scheduleAudioTracksSet()
      await new Promise((r) => setTimeout(r, 150))
      expect(sendCommand).toHaveBeenCalledTimes(1)
    })

    it('payload contains only audio tracks, not video', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      useTimelineStore.getState().addTrack('Video', '#ff0000') // video track
      const audioTrackId = useTimelineStore.getState().addAudioTrack('Drums')!
      useTimelineStore.getState().addAudioClip(audioTrackId, baseClip())
      sendCommand.mockClear()
      flushAudioTracksSet()
      const call = sendCommand.mock.calls.find(
        (c) => (c[0] as { cmd?: string }).cmd === 'audio_tracks_set',
      )
      expect(call).toBeDefined()
      const payload = (call![0] as { tracks: Array<{ type: string }> }).tracks
      expect(payload).toHaveLength(1)
      expect(payload[0].type).toBe('audio')
    })
  })

  describe('flushAudioTracksSet', () => {
    it('sends immediately, bypassing debounce', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      const trackId = useTimelineStore.getState().addAudioTrack()!
      useTimelineStore.getState().addAudioClip(trackId, baseClip())
      sendCommand.mockClear()
      flushAudioTracksSet()
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({ cmd: 'audio_tracks_set' }),
      )
    })
  })

  describe('playbackPlay', () => {
    it('routes to audio_play when flag off', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackPlay()
      expect(sendCommand).toHaveBeenCalledWith({ cmd: 'audio_play' })
    })

    it('routes to project_clock_play when flag on', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackPlay()
      const cmds = sendCommand.mock.calls.map((c) => (c[0] as { cmd: string }).cmd)
      expect(cmds).toContain('project_clock_play')
      expect(cmds).not.toContain('audio_play')
    })

    it('flushes pending track state before play', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      const trackId = useTimelineStore.getState().addAudioTrack()!
      useTimelineStore.getState().addAudioClip(trackId, baseClip())
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackPlay()
      const cmds = sendCommand.mock.calls.map((c) => (c[0] as { cmd: string }).cmd)
      // audio_tracks_set must come before project_clock_play
      const setIdx = cmds.indexOf('audio_tracks_set')
      const playIdx = cmds.indexOf('project_clock_play')
      expect(setIdx).toBeGreaterThanOrEqual(0)
      expect(playIdx).toBeGreaterThan(setIdx)
    })
  })

  describe('playbackPause', () => {
    it('routes to audio_pause when flag off', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackPause()
      expect(sendCommand).toHaveBeenCalledWith({ cmd: 'audio_pause' })
    })

    it('routes to project_clock_pause when flag on', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackPause()
      expect(sendCommand).toHaveBeenCalledWith({ cmd: 'project_clock_pause' })
    })
  })

  describe('playbackSeek', () => {
    it('rejects NaN', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: false })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackSeek(Number.NaN)
      expect(sendCommand).toHaveBeenCalledWith({ cmd: 'audio_seek', time: 0 })
    })

    it('routes to project_clock_seek when flag on', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      await playbackSeek(5)
      expect(sendCommand).toHaveBeenCalledWith({ cmd: 'project_clock_seek', time: 5 })
    })
  })

  describe('startAudioBridge subscription', () => {
    it('fires audio_tracks_set on timeline mutation when flag on', async () => {
      sendCommand.mockResolvedValueOnce({ ok: true, flag_enabled: true })
      await refreshFlag()
      sendCommand.mockClear()
      sendCommand.mockResolvedValue({ ok: true })
      startAudioBridge()
      const trackId = useTimelineStore.getState().addAudioTrack()!
      useTimelineStore.getState().addAudioClip(trackId, baseClip())
      await new Promise((r) => setTimeout(r, 150))
      const cmds = sendCommand.mock.calls.map((c) => (c[0] as { cmd: string }).cmd)
      expect(cmds).toContain('audio_tracks_set')
    })
  })
})
