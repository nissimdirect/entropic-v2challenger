/**
 * H1 (2026-07-02 master-tuneup WS5) — focused-mapping-context selector.
 *
 * Foundation for the hardware-bank system (H2+): hardware banks key their
 * assignments off WHATEVER is "focused" right now. There is no single
 * "focused device" store field — focus is a composite derived from three
 * independent fields spread across two stores:
 *   - useTimelineStore.selectedTrackId / selectedClipIds  (stores/timeline.ts)
 *   - useProjectStore.selectedEffectId / selectedRackPad  (stores/project.ts)
 *
 * This module derives ONE `MappingContext` from those fields, pure and
 * synchronous (`deriveMappingContext` takes plain-object slices — no store
 * reach-through, easy to unit test), plus a subscribable `useMappingContext()`
 * hook for components.
 *
 * PRECEDENCE (highest wins), matching what DeviceChain.tsx actually shows
 * on screen — the mapping context should always point at what the user is
 * LOOKING AT, not just what's nominally "selected":
 *
 *   1. rack-pad  — selectedRackPad, but ONLY when scoped to the active track.
 *                  Mirrors DeviceChain.tsx `isPadTarget` (the qa-redteam
 *                  "Tiger fix"): a pad selected on track A must not steal
 *                  focus when track B is the active track (B's rack may not
 *                  even be mounted). `branchPath` is whatever the selection
 *                  already carries — B5.2 nested-rack drilling keeps
 *                  `selectedRackPad.branchPath` at the deepest pad the user
 *                  drilled into, so there's no separate "find the deepest"
 *                  step here.
 *   2. effect    — selectedEffectId. Unlike selectedRackPad, this field
 *                  carries no trackId of its own (project.ts:41), so its
 *                  track is resolved via the same D1 active-track rule
 *                  DeviceChain uses for its track-scoped chain
 *                  (getActiveTrackId, project.ts:679-684). Only reachable
 *                  when case 1 did not already claim the pad chain.
 *   3. clip      — the PRIMARY selected clip, gated to "selected on the
 *                  selected track" per the H1 spec. toggleClipSelection
 *                  appends new ids to the END of selectedClipIds
 *                  (timeline.ts:1652-1659), so the LAST element is the most
 *                  recently interacted-with clip — that's "primary" here,
 *                  deliberately different from the deprecated
 *                  `selectedClipId`, which timeline.ts documents as
 *                  returning the FIRST selected clip.
 *   4. track     — selectedTrackId alone.
 *   5. none      — nothing selected.
 */
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTimelineStore } from '../stores/timeline'
import { useProjectStore, type SelectedRackPad } from '../stores/project'
import type { Track } from '../../shared/types'

/** Narrow slice of timeline store state this module actually reads. */
export interface MappingTimelineSlice {
  selectedTrackId: string | null
  selectedClipIds: string[]
  tracks: Pick<Track, 'id' | 'type' | 'clips'>[]
}

/** Narrow slice of project store state this module actually reads. */
export interface MappingProjectSlice {
  selectedEffectId: string | null
  selectedRackPad: SelectedRackPad | null
}

export type MappingContext =
  | { kind: 'rack-pad'; trackId: string; padId: string; branchPath: string[]; contextKey: string }
  | { kind: 'effect'; trackId: string; effectId: string; contextKey: string }
  | { kind: 'track'; trackId: string; contextKey: string }
  | { kind: 'clip'; clipId: string; trackId: string; contextKey: string }
  | { kind: 'none'; contextKey: 'none' }

/**
 * Active-track resolution (D1), replicated from stores/project.ts
 * `getActiveTrackId` so this module stays a pure function of its inputs
 * (no reach-through to the live store singleton — keeps it testable with
 * plain objects). Resolution order: selectedTrackId (if valid) → first
 * video track → null.
 */
function resolveActiveTrackId(timeline: MappingTimelineSlice): string | null {
  if (timeline.selectedTrackId && timeline.tracks.some((t) => t.id === timeline.selectedTrackId)) {
    return timeline.selectedTrackId
  }
  return timeline.tracks.find((t) => t.type === 'video')?.id ?? null
}

function findClipTrackId(tracks: MappingTimelineSlice['tracks'], clipId: string): string | null {
  return tracks.find((t) => t.clips.some((c) => c.id === clipId))?.id ?? null
}

/** Fully-resolved inputs to the precedence table — store-shape-agnostic. */
interface ResolvedInputs {
  activeTrackId: string | null
  selectedTrackId: string | null
  primaryClipId: string | null
  primaryClipTrackId: string | null
  selectedEffectId: string | null
  selectedRackPad: SelectedRackPad | null
}

/** The precedence table itself, factored out so both `deriveMappingContext`
 * (full-tracks input, used by tests and the pure API) and `useMappingContext`
 * (pre-resolved-field input, used for cheap store subscriptions) share one
 * implementation. */
function assembleMappingContext(r: ResolvedInputs): MappingContext {
  // 1. rack-pad — active-track-scoped (Tiger fix).
  const pad = r.selectedRackPad
  if (pad && pad.trackId === r.activeTrackId) {
    const branchPath = pad.branchPath ?? []
    return {
      kind: 'rack-pad',
      trackId: pad.trackId,
      padId: pad.padId,
      branchPath,
      contextKey: `rack-pad:${pad.trackId}:${pad.padId}:${branchPath.join('/')}`,
    }
  }

  // 2. effect — resolved against the active track (no pad chain in play).
  if (r.selectedEffectId && r.activeTrackId) {
    return {
      kind: 'effect',
      trackId: r.activeTrackId,
      effectId: r.selectedEffectId,
      contextKey: `effect:${r.activeTrackId}:${r.selectedEffectId}`,
    }
  }

  // 3. clip — primary (last-interacted) clip, only if it's on the selected track.
  if (r.primaryClipId && r.primaryClipTrackId && r.primaryClipTrackId === r.selectedTrackId) {
    return {
      kind: 'clip',
      clipId: r.primaryClipId,
      trackId: r.primaryClipTrackId,
      contextKey: `clip:${r.primaryClipTrackId}:${r.primaryClipId}`,
    }
  }

  // 4. track
  if (r.selectedTrackId) {
    return { kind: 'track', trackId: r.selectedTrackId, contextKey: `track:${r.selectedTrackId}` }
  }

  // 5. none
  return { kind: 'none', contextKey: 'none' }
}

/**
 * Pure derivation: (timeline slice, project slice) -> MappingContext.
 * See module doc comment for the full precedence table.
 */
export function deriveMappingContext(
  timeline: MappingTimelineSlice,
  project: MappingProjectSlice,
): MappingContext {
  const activeTrackId = resolveActiveTrackId(timeline)
  const clipIds = timeline.selectedClipIds
  const primaryClipId = clipIds.length > 0 ? clipIds[clipIds.length - 1] : null
  const primaryClipTrackId = primaryClipId ? findClipTrackId(timeline.tracks, primaryClipId) : null

  return assembleMappingContext({
    activeTrackId,
    selectedTrackId: timeline.selectedTrackId,
    primaryClipId,
    primaryClipTrackId,
    selectedEffectId: project.selectedEffectId,
    selectedRackPad: project.selectedRackPad,
  })
}

// ─── Reactive hook ────────────────────────────────────────────────────────

type TimelineResolved = Pick<
  ResolvedInputs,
  'activeTrackId' | 'selectedTrackId' | 'primaryClipId' | 'primaryClipTrackId'
>

function selectTimelineResolved(state: MappingTimelineSlice): TimelineResolved {
  const activeTrackId = resolveActiveTrackId(state)
  const clipIds = state.selectedClipIds
  const primaryClipId = clipIds.length > 0 ? clipIds[clipIds.length - 1] : null
  const primaryClipTrackId = primaryClipId ? findClipTrackId(state.tracks, primaryClipId) : null
  return { activeTrackId, selectedTrackId: state.selectedTrackId, primaryClipId, primaryClipTrackId }
}

/**
 * Reactive hook: subscribes to the store fields that feed the derivation.
 * `useShallow` wraps the timeline selector so the raw `tracks` array (which
 * gets a new reference on nearly every timeline edit — clip drags, param
 * changes, etc.) never itself triggers a re-render here; only an actual
 * change to one of the RESOLVED focus fields (a shallow, one-level-deep
 * plain object) does. `selectedEffectId` (primitive) and `selectedRackPad`
 * (an object, but only ever reassigned by explicit user actions —
 * setSelectedRackPad/clearSelectedRackPad — never on a per-frame tick) don't
 * need the same treatment. The final `MappingContext` object is then
 * memoized on those already-stable inputs, so its identity — and
 * `contextKey` — only changes when the focus itself changes, not on
 * unrelated store churn.
 */
export function useMappingContext(): MappingContext {
  const timelineResolved = useTimelineStore(useShallow(selectTimelineResolved))
  const selectedEffectId = useProjectStore((s) => s.selectedEffectId)
  const selectedRackPad = useProjectStore((s) => s.selectedRackPad)

  return useMemo(
    () => assembleMappingContext({ ...timelineResolved, selectedEffectId, selectedRackPad }),
    [timelineResolved, selectedEffectId, selectedRackPad],
  )
}

/**
 * Human-readable label for the statusbar chip. Kept separate from
 * `MappingContext` itself (a pure data shape) so display formatting can
 * evolve without touching the derivation or its precedence rules.
 */
export function mappingContextLabel(ctx: MappingContext): string | null {
  switch (ctx.kind) {
    case 'rack-pad':
      return `pad ${ctx.padId}`
    case 'effect':
      return `effect · ${ctx.effectId}`
    case 'clip':
      return `clip · ${ctx.clipId}`
    case 'track':
      return `track · ${ctx.trackId}`
    case 'none':
      return null
  }
}
