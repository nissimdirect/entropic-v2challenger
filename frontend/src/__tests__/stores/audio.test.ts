import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock sendCommand responses
let mockResponse: Record<string, unknown> = { ok: true }

;(globalThis as any).window = {
  entropic: {
    sendCommand: vi.fn(async () => mockResponse),
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useAudioStore } from '../../renderer/stores/audio'

function getStore() {
  return useAudioStore.getState()
}

describe('AudioStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    getStore().reset()
    mockResponse = { ok: true }
    vi.clearAllMocks()
  })

  // --- Initialization ---

  it('initializes with defaults (not loaded, not playing, volume=1)', () => {
    const s = getStore()
    expect(s.isLoaded).toBe(false)
    expect(s.isPlaying).toBe(false)
    expect(s.isMuted).toBe(false)
    expect(s.volume).toBe(1.0)
    expect(s.duration).toBe(0)
    expect(s.currentTime).toBe(0)
    expect(s.sampleRate).toBe(0)
    expect(s.channels).toBe(0)
    expect(s.fps).toBe(30)
    expect(s.targetFrame).toBe(0)
    expect(s.totalFrames).toBe(0)
  })

  // --- loadAudio ---

  it('loadAudio sends audio_load command and updates state on success', async () => {
    mockResponse = {
      ok: true,
      duration_s: 5.0,
      sample_rate: 44100,
      channels: 2,
      num_samples: 220500,
    }

    const result = await getStore().loadAudio('/path/to/audio.wav')

    expect(result).toBe(true)
    expect(window.entropic.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'audio_load', path: '/path/to/audio.wav' }),
    )

    const s = getStore()
    expect(s.isLoaded).toBe(true)
    expect(s.isPlaying).toBe(false)
    expect(s.duration).toBe(5.0)
    expect(s.sampleRate).toBe(44100)
    expect(s.channels).toBe(2)
    expect(s.currentTime).toBe(0)
  })

  it('loadAudio returns false on failure', async () => {
    mockResponse = { ok: false, error: 'file not found' }

    const result = await getStore().loadAudio('/bad/path')
    expect(result).toBe(false)
    expect(getStore().isLoaded).toBe(false)
  })

  // --- play / pause ---

  it('play sets isPlaying to true', async () => {
    mockResponse = { ok: true }
    await getStore().play()
    expect(getStore().isPlaying).toBe(true)
  })

  it('pause sets isPlaying to false', async () => {
    // Start playing first
    mockResponse = { ok: true }
    await getStore().play()
    expect(getStore().isPlaying).toBe(true)

    await getStore().pause()
    expect(getStore().isPlaying).toBe(false)
  })

  it('togglePlayback toggles between play and pause', async () => {
    mockResponse = { ok: true }

    await getStore().togglePlayback()
    expect(getStore().isPlaying).toBe(true)

    await getStore().togglePlayback()
    expect(getStore().isPlaying).toBe(false)
  })

  // --- setVolume ---

  it('setVolume clamps to [0, 1]', async () => {
    mockResponse = { ok: true }

    await getStore().setVolume(0.5)
    expect(getStore().volume).toBe(0.5)

    await getStore().setVolume(1.5)
    expect(getStore().volume).toBe(1.0)

    await getStore().setVolume(-0.5)
    expect(getStore().volume).toBe(0.0)
    expect(getStore().isMuted).toBe(true)
  })

  it('setVolume sends clamped value to backend', async () => {
    mockResponse = { ok: true }

    await getStore().setVolume(2.0)
    expect(window.entropic.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'audio_volume', volume: 1.0 }),
    )
  })

  // --- toggleMute ---

  it('toggleMute preserves previous volume value', async () => {
    mockResponse = { ok: true }

    // Set volume to 0.7
    await getStore().setVolume(0.7)
    expect(getStore().volume).toBe(0.7)

    // Mute — volume goes to 0, previousVolume saved
    await getStore().toggleMute()
    expect(getStore().isMuted).toBe(true)
    expect(getStore().volume).toBe(0)

    // Unmute — volume restored to 0.7
    await getStore().toggleMute()
    expect(getStore().isMuted).toBe(false)
    expect(getStore().volume).toBe(0.7)
  })

  // --- seek ---

  it('seek sends audio_seek and updates currentTime', async () => {
    mockResponse = { ok: true, position_s: 2.5 }

    await getStore().seek(2.5)

    expect(window.entropic.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'audio_seek', time: 2.5 }),
    )
    expect(getStore().currentTime).toBe(2.5)
  })

  // --- syncClock ---

  it('syncClock updates state from clock_sync response', async () => {
    mockResponse = {
      ok: true,
      audio_time_s: 1.5,
      target_frame: 45,
      total_frames: 150,
      is_playing: true,
      duration_s: 5.0,
      fps: 30,
      volume: 0.8,
    }

    await getStore().syncClock()

    const s = getStore()
    expect(s.currentTime).toBe(1.5)
    expect(s.targetFrame).toBe(45)
    expect(s.totalFrames).toBe(150)
    expect(s.isPlaying).toBe(true)
    expect(s.duration).toBe(5.0)
    expect(s.fps).toBe(30)
    expect(s.volume).toBe(0.8)
  })

  // --- setFps ---

  it('setFps sends clock_set_fps command and updates fps', async () => {
    mockResponse = { ok: true, fps: 24 }

    await getStore().setFps(24)

    expect(window.entropic.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'clock_set_fps', fps: 24 }),
    )
    expect(getStore().fps).toBe(24)
  })

  // --- stop ---

  it('stop resets playback state', async () => {
    mockResponse = { ok: true }
    await getStore().play()
    expect(getStore().isPlaying).toBe(true)

    await getStore().stop()
    expect(getStore().isPlaying).toBe(false)
    expect(getStore().currentTime).toBe(0)
    expect(getStore().targetFrame).toBe(0)
  })

  // --- reset ---

  it('reset returns all state to defaults', async () => {
    // Dirty the state
    mockResponse = {
      ok: true,
      duration_s: 10,
      sample_rate: 48000,
      channels: 1,
      num_samples: 480000,
    }
    await getStore().loadAudio('/test.wav')
    await getStore().play()

    getStore().reset()

    const s = getStore()
    expect(s.isLoaded).toBe(false)
    expect(s.isPlaying).toBe(false)
    expect(s.volume).toBe(1.0)
    expect(s.duration).toBe(0)
    expect(s.sampleRate).toBe(0)
    expect(s.fps).toBe(30)
  })
})
