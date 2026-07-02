/**
 * trackStats selector — P3.3 polymorphic inspector.
 *
 * Reads per-track data from the timeline store (read-only, no store writes).
 * Provides a stable empty shape when the trackId is deleted / stale.
 *
 * NOTE: `useTrackStats` is provided for completeness but the inspector
 * state children use individual primitive selectors instead to avoid
 * Zustand v5's getSnapshot-cache requirement when returning new objects.
 * Use `getTrackStats` in event handlers / tests.
 */
import { useTimelineStore } from '../stores/timeline'
import type { EffectInstance } from '../../shared/types'

export interface TrackStats {
  trackId: string
  trackName: string
  trackType: string
  effectCount: number
  clipCount: number
  effectChain: EffectInstance[]
  isMuted: boolean
  isSoloed: boolean
}

/**
 * Returns TrackStats for the given trackId.
 * Returns a stable empty TrackStats when the trackId is not found (stale selection).
 * This function is non-reactive — call in event handlers / tests.
 */
export function getTrackStats(trackId: string | null | undefined): TrackStats {
  if (!trackId) {
    return { trackId: '', trackName: '', trackType: '', effectCount: 0, clipCount: 0, effectChain: [], isMuted: false, isSoloed: false }
  }
  const tracks = useTimelineStore.getState().tracks
  const track = tracks.find((t) => t.id === trackId)
  if (!track) {
    return { trackId, trackName: '', trackType: '', effectCount: 0, clipCount: 0, effectChain: [], isMuted: false, isSoloed: false }
  }
  return {
    trackId: track.id,
    trackName: track.name,
    trackType: track.type,
    effectCount: track.effectChain.length,
    clipCount: track.clips.length,
    effectChain: track.effectChain,
    isMuted: track.isMuted,
    isSoloed: track.isSoloed,
  }
}
