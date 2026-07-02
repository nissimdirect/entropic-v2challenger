/**
 * H2 (2026-07-02 master-tuneup WS5) — default bank-slot assignment per focus
 * context. Pure function: (MappingContext, live-data slices) -> BankAssignment.
 * A user-saved assignment (stores/midi.ts bankAssignments[contextKey]) always
 * overrides this default — see applyBankModulations.ts's resolveAssignment.
 *
 * Layout, per context kind:
 *   rack-pad / track (rack present) -> row 3 (the fader row) = the rack's up
 *     to 8 macros, in RackMacro array order.
 *   effect  -> row 0 = the first 8 float/int params of that effect, in
 *     registry declaration order (Object.entries preserves insertion order
 *     for string keys — EffectInfo.params is authored as a literal object,
 *     so this is the registry's own declared order).
 *   clip    -> row 0 = the 5 transform fields (x, y, scaleX, scaleY,
 *     rotation), padded with nulls to 8. STORABLE, but a no-op until H4 wires
 *     the live-transform overlay (see bankTypes.ts SlotTarget doc).
 *   none    -> fully empty grid.
 *
 * All other rows/cols are null (unassigned) — this is a DEFAULT, not a
 * fully-populated bank; empty slots are a legitimate, common case.
 */
import type { MappingContext } from './focusContext'
import type { BankAssignment, SlotTarget } from '../../shared/bankTypes'
import { BANK_ROWS, BANK_COLS } from '../../shared/bankTypes'
import type { RackMacro } from '../components/instruments/types'
import type { ParamDef } from '../../shared/types'

/** Live-data slices deriveDefaultAssignment needs — supplied by the caller
 * (render-path call sites read these from getState() snapshots; tests pass
 * plain objects). Absent = no live data available for that context kind =
 * an empty default row (never throws). */
export interface DefaultAssignmentSources {
  /** The rack's macros, in display order. Used for rack-pad / track contexts. */
  rackMacros?: RackMacro[]
  /** [paramKey, ParamDef] entries for the focused effect, in registry order. */
  effectParamEntries?: Array<[string, ParamDef]>
}

const CLIP_TRANSFORM_FIELDS = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const

function emptyGrid(): (SlotTarget | null)[][] {
  return Array.from({ length: BANK_ROWS }, () => Array<SlotTarget | null>(BANK_COLS).fill(null))
}

export function deriveDefaultAssignment(
  context: MappingContext,
  sources: DefaultAssignmentSources,
): BankAssignment {
  const slots = emptyGrid()

  switch (context.kind) {
    case 'rack-pad':
    case 'track': {
      const macros = sources.rackMacros ?? []
      const row = slots[3]
      const count = Math.min(macros.length, BANK_COLS)
      for (let i = 0; i < count; i++) {
        row[i] = { kind: 'macro', trackId: context.trackId, macroId: macros[i].id }
      }
      break
    }
    case 'effect': {
      const entries = (sources.effectParamEntries ?? []).filter(
        ([, def]) => def.type === 'float' || def.type === 'int',
      )
      const row = slots[0]
      const count = Math.min(entries.length, BANK_COLS)
      for (let i = 0; i < count; i++) {
        row[i] = { kind: 'effectParam', effectId: context.effectId, paramKey: entries[i][0] }
      }
      break
    }
    case 'clip': {
      const row = slots[0]
      for (let i = 0; i < CLIP_TRANSFORM_FIELDS.length; i++) {
        row[i] = { kind: 'transform', clipId: context.clipId, field: CLIP_TRANSFORM_FIELDS[i] }
      }
      break
    }
    case 'none':
      break
  }

  return { contextKey: context.contextKey, slots }
}
