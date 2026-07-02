import { create } from 'zustand'
import type {
  AudioLoadResponse,
  ClockSyncResponse,
} from '../../shared/ipc-types'

// F-0516-6 phase 2: live meter reading. Polled by useAudioMeterPoll at ~30Hz
// while playing. METER_FLOOR_DB (-120) means silence — always finite, never
// -Infinity, to avoid downstream NaN/format-string crashes in the renderer.
export interface MeterReading {
  rmsDb: number
  peakDb: number
  clipped: boolean
}

export const METER_FLOOR_DB = -120

const METER_FLOOR_READING: MeterReading = {
  rmsDb: METER_FLOOR_DB,
  peakDb: METER_FLOOR_DB,
  clipped: false,
}

interface AudioState {
  // State
  isLoaded: boolean
  isPlaying: boolean
  isMuted: boolean
  volume: number
  previousVolume: number
  duration: number
  currentTime: number
  sampleRate: number
  channels: number
  fps: number
  targetFrame: number
  totalFrames: number
  meter: MeterReading

  // Actions
  loadAudio: (path: string) => Promise<boolean>
  play: () => Promise<void>
  pause: () => Promise<void>
  togglePlayback: () => Promise<void>
  seek: (time: number) => Promise<void>
  setVolume: (volume: number) => Promise<void>
  toggleMute: () => Promise<void>
  stop: () => Promise<void>
  setFps: (fps: number) => Promise<void>
  syncClock: () => Promise<void>
  reset: () => void
  setMeter: (reading: MeterReading) => void
  /** Fetch one meter reading from the backend. Returns false on error. */
  pollMeter: () => Promise<boolean>
}

function sendCommand(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof window !== 'undefined' && window.entropic) {
    return window.entropic.sendCommand(cmd)
  }
  return Promise.resolve({ ok: false, error: 'No bridge' })
}

let idCounter = 0
function nextId(): string {
  return `audio-${++idCounter}-${Date.now()}`
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isLoaded: false,
  isPlaying: false,
  isMuted: false,
  volume: 1.0,
  previousVolume: 1.0,
  duration: 0,
  currentTime: 0,
  sampleRate: 0,
  channels: 0,
  fps: 30,
  targetFrame: 0,
  totalFrames: 0,
  meter: METER_FLOOR_READING,

  setMeter: (reading: MeterReading) => {
    set({ meter: reading })
  },

  pollMeter: async () => {
    const resp = await sendCommand({ cmd: 'audio_meter', id: nextId() })
    if (!resp.ok) {
      // Don't clobber the existing reading on a transient IPC failure —
      // the meter UI would flash to silence on every dropped poll.
      return false
    }
    const rmsDb = typeof resp.rms_db === 'number' ? resp.rms_db : METER_FLOOR_DB
    const peakDb = typeof resp.peak_db === 'number' ? resp.peak_db : METER_FLOOR_DB
    const clipped = resp.clipped === true
    // Trust-boundary clamp: defend against NaN/Inf reaching the renderer.
    set({
      meter: {
        rmsDb: Number.isFinite(rmsDb) ? rmsDb : METER_FLOOR_DB,
        peakDb: Number.isFinite(peakDb) ? peakDb : METER_FLOOR_DB,
        clipped,
      },
    })
    return true
  },

  loadAudio: async (path: string) => {
    const resp = (await sendCommand({
      cmd: 'audio_load',
      id: nextId(),
      path,
    })) as unknown as AudioLoadResponse & { ok: boolean }

    if (resp.ok) {
      set({
        isLoaded: true,
        isPlaying: false,
        duration: resp.duration_s,
        sampleRate: resp.sample_rate,
        channels: resp.channels,
        currentTime: 0,
        targetFrame: 0,
      })
      return true
    }
    return false
  },

  play: async () => {
    const resp = await sendCommand({ cmd: 'audio_play', id: nextId() })
    if (resp.ok) {
      set({ isPlaying: true })
    }
  },

  pause: async () => {
    const resp = await sendCommand({ cmd: 'audio_pause', id: nextId() })
    if (resp.ok) {
      set({ isPlaying: false })
    }
  },

  togglePlayback: async () => {
    if (get().isPlaying) {
      await get().pause()
    } else {
      await get().play()
    }
  },

  seek: async (time: number) => {
    const resp = await sendCommand({ cmd: 'audio_seek', id: nextId(), time })
    if (resp.ok) {
      set({ currentTime: (resp as { position_s: number }).position_s })
    }
  },

  setVolume: async (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    const resp = await sendCommand({
      cmd: 'audio_volume',
      id: nextId(),
      volume: clamped,
    })
    if (resp.ok) {
      set({ volume: clamped, isMuted: clamped === 0 })
    }
  },

  toggleMute: async () => {
    const { isMuted, volume, previousVolume } = get()
    if (isMuted) {
      await get().setVolume(previousVolume > 0 ? previousVolume : 1.0)
      set({ isMuted: false })
    } else {
      set({ previousVolume: volume, isMuted: true })
      await get().setVolume(0)
    }
  },

  stop: async () => {
    await sendCommand({ cmd: 'audio_stop', id: nextId() })
    set({ isPlaying: false, currentTime: 0, targetFrame: 0 })
  },

  setFps: async (fps: number) => {
    const resp = await sendCommand({ cmd: 'clock_set_fps', id: nextId(), fps })
    if (resp.ok) {
      set({ fps: (resp as { fps: number }).fps })
    }
  },

  syncClock: async () => {
    const resp = (await sendCommand({
      cmd: 'clock_sync',
      id: nextId(),
    })) as unknown as ClockSyncResponse & { ok: boolean }

    if (resp.ok) {
      set({
        currentTime: resp.audio_time_s,
        targetFrame: resp.target_frame,
        totalFrames: resp.total_frames,
        isPlaying: resp.is_playing,
        duration: resp.duration_s,
        fps: resp.fps,
        volume: resp.volume,
      })
    }
  },

  reset: () => {
    set({
      isLoaded: false,
      isPlaying: false,
      isMuted: false,
      volume: 1.0,
      previousVolume: 1.0,
      duration: 0,
      currentTime: 0,
      sampleRate: 0,
      channels: 0,
      fps: 30,
      targetFrame: 0,
      totalFrames: 0,
      meter: METER_FLOOR_READING,
    })
  },
}))
