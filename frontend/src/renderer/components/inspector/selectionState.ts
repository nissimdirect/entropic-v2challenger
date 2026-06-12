/**
 * SelectionState discriminated union — P3.3 polymorphic inspector.
 *
 * This module defines the 8 selection states the inspector supports.
 * It derives the current state from existing stores (no useSelectionStore —
 * that store does not exist; see EXECUTION-PLAN §4 doc-discrepancy note).
 *
 * Selection sources:
 *   - track:    useTimelineStore.selectedTrackId
 *   - clip:     useTimelineStore.selectedClipIds (single)
 *   - multi:    useTimelineStore.selectedClipIds (>1)
 *   - effect:   useProjectStore.selectedEffectId
 *   - operator: no store field yet (aspirational in PLAN §3.8) → pass-through prop
 *   - marker:   no store field yet → pass-through prop
 *   - tool:     no store field yet → pass-through prop
 *   - none:     nothing selected
 */
export type SelectionState =
  | { type: 'none' }
  | { type: 'clip'; clipId: string }
  | { type: 'multi'; clipIds: string[] }
  | { type: 'track'; trackId: string }
  | { type: 'effect'; effectId: string }
  | { type: 'operator'; operatorId: string }
  | { type: 'marker'; markerId: string }
  | { type: 'tool'; toolMode: string }
