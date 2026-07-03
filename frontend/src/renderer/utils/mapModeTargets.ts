/**
 * H-UI (2026-07-02 master-tuneup WS5) — pure helpers for the MIDI-Map overlay.
 *
 * These are the click-to-assign candidate list ("click a param") and the
 * default-vs-overridden comparison the overlay renders. Kept pure (plain-object
 * in, plain data out — no store reach-through) so they unit-test in isolation,
 * mirroring utils/deriveDefaultAssignment.ts and utils/focusContext.ts.
 *
 * enumerateCandidateTargets returns the FULL candidate set for a focus context
 * (deriveDefaultAssignment only fills the first 8 into a default row; the
 * overlay's param picker needs every assignable target). slotTargetsEqual is
 * the per-slot "is this the auto-default, or has the user overridden it?"
 * comparison the grid uses to badge each cell distinctly.
 */
import type { MappingContext } from './focusContext'
import type { SlotTarget } from '../../shared/bankTypes'
import type { DefaultAssignmentSources } from './deriveDefaultAssignment'

/** One assignable target plus its human-readable label for the picker. */
export interface CandidateTarget {
  target: SlotTarget
  label: string
}

/** The 5 clip transform fields, matching deriveDefaultAssignment. */
const CLIP_TRANSFORM_FIELDS = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const

/**
 * Short, stable label for a SlotTarget — the text shown in an assigned grid
 * cell and in the param picker. Pure function of the target itself (no store
 * lookups) so it can't drift out of sync with what was actually stored.
 */
export function slotTargetLabel(target: SlotTarget): string {
  switch (target.kind) {
    case 'effectParam':
      return target.paramKey
    case 'macro':
      return `macro ${target.macroId}`
    case 'transform':
      return target.field
    case 'mask':
      return target.param
    case 'instrument':
      return target.paramKey
  }
}

/**
 * Full list of targets assignable in the given focus context, in a stable
 * order. Empty for kind 'none' (nothing focused → nothing to assign). Mirrors
 * deriveDefaultAssignment's per-kind mapping but is NOT capped at 8.
 */
export function enumerateCandidateTargets(
  context: MappingContext,
  sources: DefaultAssignmentSources,
): CandidateTarget[] {
  switch (context.kind) {
    case 'effect': {
      const entries = (sources.effectParamEntries ?? []).filter(
        ([, def]) => def.type === 'float' || def.type === 'int',
      )
      return entries.map(([paramKey, def]) => ({
        target: { kind: 'effectParam', effectId: context.effectId, paramKey } as SlotTarget,
        label: def.label && def.label.length > 0 ? def.label : paramKey,
      }))
    }
    case 'rack-pad':
    case 'track': {
      const macros = sources.rackMacros ?? []
      return macros.map((m) => ({
        target: { kind: 'macro', trackId: context.trackId, macroId: m.id } as SlotTarget,
        label: m.name && m.name.length > 0 ? m.name : `macro ${m.id}`,
      }))
    }
    case 'clip': {
      return CLIP_TRANSFORM_FIELDS.map((field) => ({
        target: { kind: 'transform', clipId: context.clipId, field } as SlotTarget,
        label: field,
      }))
    }
    case 'none':
      return []
  }
}

/**
 * Structural equality of two slot targets (or nulls). Used to decide whether a
 * saved bank-assignment slot differs from the auto-derived default — i.e.
 * whether the cell is an OVERRIDE or still the DEFAULT.
 */
export function slotTargetsEqual(a: SlotTarget | null, b: SlotTarget | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'effectParam':
      return b.kind === 'effectParam' && a.effectId === b.effectId && a.paramKey === b.paramKey
    case 'macro':
      return b.kind === 'macro' && a.trackId === b.trackId && a.macroId === b.macroId
    case 'transform':
      return b.kind === 'transform' && a.clipId === b.clipId && a.field === b.field
    case 'mask':
      return b.kind === 'mask' && a.nodeId === b.nodeId && a.param === b.param
    case 'instrument':
      return b.kind === 'instrument' && a.trackId === b.trackId && a.paramKey === b.paramKey
  }
}
