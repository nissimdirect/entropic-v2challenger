/**
 * P4.6 — Browser op-tab drag sources + drop-target parsing.
 *
 * REUSED DnD MECHANISM (Research Gate / Rule 1.5):
 * This module deliberately introduces NO new drag system. It rides the ONE
 * established HTML5 dataTransfer channel defined in
 *   frontend/src/renderer/components/effects/EffectBrowser.tsx:17-74
 * namely EFFECT_DRAG_TYPE + CREATRIX_NONCE_TYPE + SESSION_NONCE, validated by
 * `parseDragPayload` (EffectBrowser.tsx:49). Operator entries are dragged with
 * the same JSON payload shape `{ kind, id }`, discriminated by the new
 * `kind: 'operator'` enum member (id = "builtin:<operatorType>").
 *
 * No new npm drag lib. No second dataTransfer MIME type.
 */
import type { OperatorType } from '../../../shared/types'
import {
  EFFECT_DRAG_TYPE,
  CREATRIX_NONCE_TYPE,
  SESSION_NONCE,
  parseDragPayload,
} from './EffectBrowser'

export interface OperatorEntry {
  type: OperatorType
  label: string
}

export type OperatorGroup = 'MODULATION' | 'INPUTS' | 'GATING'

/**
 * Operator entries shown in the op tab — IMPLEMENTED types ONLY (P4.6 scope).
 * Grouped MODULATION(6) / INPUTS(3) / GATING(1) = 10 total. Stub-only operators
 * (S&H / Random / MATH / MIDI-CC / Playhead) are intentionally excluded: they
 * have no backend implementation and are out of P4.6 scope.
 */
export const OPERATOR_GROUPS: { group: OperatorGroup; entries: OperatorEntry[] }[] = [
  {
    group: 'MODULATION',
    entries: [
      { type: 'lfo', label: 'LFO' },
      { type: 'envelope', label: 'Envelope' },
      { type: 'step_sequencer', label: 'Step Seq' },
      { type: 'fusion', label: 'Fusion' },
      { type: 'kentaroCluster', label: 'Kentaro Cluster' },
      { type: 'midiEnvStutter', label: 'MIDI Envelope Stutter' },
    ],
  },
  {
    group: 'INPUTS',
    entries: [
      { type: 'audio_follower', label: 'Audio Follower' },
      { type: 'video_analyzer', label: 'Video Analyzer' },
      { type: 'sidechain', label: 'Sidechain' },
    ],
  },
  {
    group: 'GATING',
    entries: [{ type: 'gate', label: 'Gate' }],
  },
]

/** Flat list of all 10 operator entries (display order = group order). */
export const OPERATOR_ENTRIES: OperatorEntry[] = OPERATOR_GROUPS.flatMap((g) => g.entries)

/** Valid operator-type set, derived from the grouped list (drop-target guard). */
const VALID_OPERATOR_TYPES = new Set<string>(OPERATOR_ENTRIES.map((e) => e.type))

/**
 * Begin an operator drag. Mirrors EffectBrowser.handleDragStart exactly:
 * sets the JSON payload on EFFECT_DRAG_TYPE, the session nonce on
 * CREATRIX_NONCE_TYPE, and a human-readable text/plain fallback. The only
 * difference is `kind: 'operator'` and id = "builtin:<operatorType>".
 */
export function startOperatorDrag(
  e: React.DragEvent<HTMLButtonElement>,
  entry: OperatorEntry,
): void {
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(
    EFFECT_DRAG_TYPE,
    JSON.stringify({ kind: 'operator', id: `builtin:${entry.type}` }),
  )
  e.dataTransfer.setData(CREATRIX_NONCE_TYPE, SESSION_NONCE)
  e.dataTransfer.setData('text/plain', entry.label)
}

/**
 * Parse a dropped operator payload. Returns the OperatorType if the drop is a
 * valid, nonce-authenticated operator drag whose type is one of the 10
 * implemented entries; otherwise null (so non-operator drags — fx, composite,
 * instruments, external/spoofed — are a clean no-op at operator drop targets).
 */
export function parseOperatorDrop(dataTransfer: DataTransfer): OperatorType | null {
  const payload = parseDragPayload(dataTransfer, SESSION_NONCE)
  if (!payload || payload.kind !== 'operator') return null
  const match = payload.id.match(/^builtin:(.+)$/)
  if (!match) return null
  const type = match[1]
  if (!VALID_OPERATOR_TYPES.has(type)) return null
  return type as OperatorType
}

/** True if a dragover carries our drag channel (used to light drop targets). */
export function dragHasOperatorChannel(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(EFFECT_DRAG_TYPE)
}
