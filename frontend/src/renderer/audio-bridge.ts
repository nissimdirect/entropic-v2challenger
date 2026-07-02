/**
 * Audio bridge — frontend glue for the flag-gated multi-track audio path.
 *
 * Responsibilities:
 * 1. Query the backend once on startup to discover whether
 *    EXPERIMENTAL_AUDIO_TRACKS is enabled, cache the result.
 * 2. Subscribe to timeline-store audio changes and push them to the backend
 *    via `audio_tracks_set` (debounced) when the flag is on.
 * 3. Expose `playbackPlay / Pause / Seek` that route to project_clock_* when
 *    flag on, legacy audio_* otherwise.
 *
 * When the flag is off, this module is inert — no extra IPC, legacy paths
 * unchanged.
 */

import { useTimelineStore } from './stores/timeline'
import { useToastStore } from './stores/toast'
import { AUDIO_LIMITS } from '../shared/types'
import type { Track, AudioClip } from '../shared/types'

const AUDIO_TRACKS_SET_DEBOUNCE_MS = 100

let _flagEnabled: boolean | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _unsubTimeline: (() => void) | null = null
let _lastOverlapWarned: number = 0

function sendCommand(
  cmd: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (typeof window !== 'undefined' && window.entropic?.sendCommand) {
    return window.entropic.sendCommand(cmd)
  }
  return Promise.resolve({ ok: false, error: 'No bridge' })
}

/** Query the backend once to learn whether EXPERIMENTAL_AUDIO_TRACKS is set. */
export async function refreshFlag(): Promise<boolean> {
  const res = (await sendCommand({ cmd: 'project_clock_state' })) as {
    ok: boolean
    flag_enabled?: boolean
  }
  _flagEnabled = !!(res.ok && res.flag_enabled)
  return _flagEnabled
}

/** Synchronous flag read. Returns false until refreshFlag() has completed. */
export function isExperimentalAudioEnabled(): boolean {
  return _flagEnabled === true
}

/**
 * Scan audio tracks for the maximum number of clips active at any single
 * point on the timeline. Uses a sweep over clip boundaries (O(N log N) via
 * sort), which scales to thousands of clips trivially.
 */
export function maxConcurrentAudioClips(tracks: Track[]): number {
  // Collect per-clip (start, end) events. Muted clips don't produce audio, so
  // they don't count against the backend cap either.
  type Event = { t: number; delta: 1 | -1 }
  const events: Event[] = []
  for (const track of tracks) {
    if (track.type !== 'audio' || track.isMuted) continue
    for (const c of track.audioClips ?? []) {
      if (c.muted || c.missing) continue
      const dur = Math.max(0, c.outSec - c.inSec)
      if (dur <= 0) continue
      events.push({ t: c.startSec, delta: 1 })
      events.push({ t: c.startSec + dur, delta: -1 })
    }
  }
  // Sort: at a tied time, process ends before starts so a clip ending at t=5
  // and another starting at t=5 don't both count (they touch but don't overlap).
  events.sort((a, b) => (a.t - b.t) || (a.delta - b.delta))
  let active = 0
  let peak = 0
  for (const e of events) {
    active += e.delta
    if (active > peak) peak = active
  }
  return peak
}

/**
 * Fire an advisory toast when the user's project would exceed the backend's
 * concurrent-clip cap at any timeline point. Rate-limited to one warning per
 * 5 seconds per user edit so the toast store's dedup doesn't smother genuine
 * retriggers after the user fixes and then re-overlaps.
 */
function maybeWarnOverlap(tracks: Track[]): void {
  const peak = maxConcurrentAudioClips(tracks)
  if (peak <= AUDIO_LIMITS.MAX_ACTIVE_CLIPS) return
  const now = Date.now()
  if (now - _lastOverlapWarned < 5000) return
  _lastOverlapWarned = now
  useToastStore.getState().addToast({
    level: 'warning',
    message: `${peak} audio clips overlap — only ${AUDIO_LIMITS.MAX_ACTIVE_CLIPS} will play at once. Earlier clips win.`,
    source: 'audio-overlap',
  })
}

/** Test-only helper: reset the overlap-warning timestamp. */
export function __resetOverlapWarningForTests__(): void {
  _lastOverlapWarned = 0
}

/** Serialize audio tracks from the timeline store into the IPC payload shape. */
function buildTracksPayload(tracks: Track[]): Array<Record<string, unknown>> {
  return tracks
    .filter((t) => t.type === 'audio')
    .map((t) => ({
      id: t.id,
      type: 'audio',
      name: t.name,
      color: t.color,
      isMuted: t.isMuted,
      isSoloed: t.isSoloed,
      gainDb: t.gainDb ?? 0,
      clips: [],
      audioClips: (t.audioClips ?? []).map((c: AudioClip) => ({
        id: c.id,
        trackId: c.trackId,
        path: c.path,
        inSec: c.inSec,
        outSec: c.outSec,
        startSec: c.startSec,
        gainDb: c.gainDb,
        fadeInSec: c.fadeInSec,
        fadeOutSec: c.fadeOutSec,
        muted: c.muted,
      })),
    }))
}

/** Push the current audio-track state to the backend. Debounced. */
export function scheduleAudioTracksSet(): void {
  if (!isExperimentalAudioEnabled()) return
  if (_debounceTimer !== null) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    const tracks = useTimelineStore.getState().tracks
    const payload = buildTracksPayload(tracks)
    void sendCommand({ cmd: 'audio_tracks_set', tracks: payload })
    maybeWarnOverlap(tracks)
  }, AUDIO_TRACKS_SET_DEBOUNCE_MS)
}

/** Immediately push the current state without waiting for debounce (used on
 * transport actions where sync matters). */
export function flushAudioTracksSet(): void {
  if (!isExperimentalAudioEnabled()) return
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
  const tracks = useTimelineStore.getState().tracks
  const payload = buildTracksPayload(tracks)
  void sendCommand({ cmd: 'audio_tracks_set', tracks: payload })
  maybeWarnOverlap(tracks)
}

/** Start watching the timeline store for audio-track mutations. */
export function startAudioBridge(): void {
  if (_unsubTimeline !== null) return
  // Fire once so the mixer starts in sync with whatever's already loaded.
  scheduleAudioTracksSet()
  _unsubTimeline = useTimelineStore.subscribe((state, prev) => {
    if (!isExperimentalAudioEnabled()) return
    // Cheap change-detection: compare tracks reference. The timeline store
    // replaces the tracks array on every mutation (immutable pattern), so
    // reference equality is a correct short-circuit.
    if (state.tracks !== prev.tracks) {
      scheduleAudioTracksSet()
    }
  })
}

/** Stop the subscription (used in tests and on app shutdown). */
export function stopAudioBridge(): void {
  if (_unsubTimeline !== null) {
    _unsubTimeline()
    _unsubTimeline = null
  }
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
}

/** Transport — play. Routes to project_clock_play when flag on, audio_play otherwise. */
export async function playbackPlay(): Promise<void> {
  if (isExperimentalAudioEnabled()) {
    // Flush any pending state so the mixer sees the latest clips BEFORE playback.
    flushAudioTracksSet()
    await sendCommand({ cmd: 'project_clock_play' })
    // Also set duration so auto-pause triggers at timeline end
    const duration = useTimelineStore.getState().getTimelineDuration()
    if (duration > 0) {
      await sendCommand({ cmd: 'project_clock_set_duration', duration_s: duration })
    }
  } else {
    await sendCommand({ cmd: 'audio_play' })
  }
}

/** Transport — pause. Routes by flag. */
export async function playbackPause(): Promise<void> {
  if (isExperimentalAudioEnabled()) {
    await sendCommand({ cmd: 'project_clock_pause' })
  } else {
    await sendCommand({ cmd: 'audio_pause' })
  }
}

/** Transport — seek. Routes by flag. */
export async function playbackSeek(time_s: number): Promise<void> {
  if (!Number.isFinite(time_s) || time_s < 0) time_s = 0
  if (isExperimentalAudioEnabled()) {
    await sendCommand({ cmd: 'project_clock_seek', time: time_s })
  } else {
    await sendCommand({ cmd: 'audio_seek', time: time_s })
  }
}

// Test-only reset helper
export function __resetAudioBridgeForTests__(): void {
  _flagEnabled = null
  stopAudioBridge()
}
