/**
 * A3 — Record clip-transform automation points from direct-manipulation gestures
 * (BoundingBoxOverlay drag, TransformPanel numeric-field commits).
 *
 * GATE — mirrors ParamPanel.tsx's handleKnobChange gate
 * (frontend/src/renderer/components/effects/ParamPanel.tsx:37-60) exactly for
 * mode / armedTrackId / lane-exists, PLUS one extra condition ParamPanel does
 * NOT check: transport must be PLAYING.
 *
 * That's a locked design decision for A3 (see packet): automation points are
 * keyed to playheadTime, which is only meaningful while the transport is
 * advancing. latch/touch record during playback; stopped-transport edits stay
 * plain store writes (byte-identical to today); Draw mode is the
 * stopped-transport authoring path. ParamPanel's existing effect-param
 * recording has no such gate today — this file does not change that; it adds
 * the stricter gate only for the new transform-recording path.
 *
 * `isPlaying` is passed in (rather than read from a store) because it is
 * UI-local composite state in App.tsx (`hasAudio ? audioStore.isPlaying :
 * isTimerPlaying`) — unlike `mode` / `armedTrackId`, which live in
 * useAutomationStore, there is no store to read it from directly.
 */
import type { ClipTransform } from '../../shared/types'
import { useAutomationStore } from '../stores/automation'
import { useTimelineStore } from '../stores/timeline'
import { recordPoint } from './automation-record'
import { TRANSFORM_FIELD_META, TRANSFORM_FIELDS, formatTransformLanePath, type TransformField } from './transformLanes'

/** Find the track that owns `clipId`, or null if the clip isn't on any track. */
function findTrackIdForClip(clipId: string): string | null {
  for (const track of useTimelineStore.getState().tracks) {
    if (track.clips.some((c) => c.id === clipId)) return track.id
  }
  return null
}

/**
 * Inverse of transformLanes' `denormalize` — maps a display-range value back
 * onto the lane's normalized 0..1 domain. Reuses TRANSFORM_FIELD_META (the
 * SAME range table evaluateTransformOverrides denormalizes against) so the
 * write path and read path never drift apart.
 */
function normalizeToLane(value: number, min: number, max: number): number {
  const normalized = max > min ? (value - min) / (max - min) : 0
  return Math.max(0, Math.min(1, normalized))
}

/**
 * Record one transform field's value as an automation point, if — and only
 * if — the gate passes. No-op (byte-identical to today) when:
 *   - transport is not playing
 *   - mode isn't 'latch' or 'touch'
 *   - no track is armed
 *   - the clip's track isn't the armed track
 *   - no lane exists for `clipTransform.<clipId>.<field>` on the armed track
 */
export function recordTransformField(
  clipId: string,
  field: TransformField,
  value: number,
  isPlaying: boolean,
): void {
  if (!isPlaying) return
  if (!Number.isFinite(value)) return

  const autoStore = useAutomationStore.getState()
  if (autoStore.mode !== 'latch' && autoStore.mode !== 'touch') return
  if (!autoStore.armedTrackId) return

  const clipTrackId = findTrackIdForClip(clipId)
  if (clipTrackId === null || clipTrackId !== autoStore.armedTrackId) return

  const paramPath = formatTransformLanePath(clipId, field)
  const lanes = autoStore.getLanesForTrack(autoStore.armedTrackId)
  const lane = lanes.find((l) => l.paramPath === paramPath)
  if (!lane) return

  const time = useTimelineStore.getState().playheadTime
  const meta = TRANSFORM_FIELD_META[field]
  const normalized = normalizeToLane(value, meta.displayMin, meta.displayMax)

  const newPoints = recordPoint(lane.points, time, normalized)
  autoStore.setPoints(autoStore.armedTrackId, lane.id, newPoints)
}

/**
 * Diff `next` against `prev` and record only the fields the gesture actually
 * changed (move -> x/y, scale -> scaleX/scaleY, rotate -> rotation). Shared by
 * both BoundingBoxOverlay's onChange (fires continuously during a drag) and
 * TransformPanel's numeric-field onChange (fires once per commit) — additive
 * to the existing setClipTransform store write, never a replacement for it.
 */
export function recordChangedTransformFields(
  clipId: string,
  prev: ClipTransform,
  next: ClipTransform,
  isPlaying: boolean,
): void {
  for (const field of TRANSFORM_FIELDS) {
    if (next[field] !== prev[field]) {
      recordTransformField(clipId, field, next[field], isPlaying)
    }
  }
}
