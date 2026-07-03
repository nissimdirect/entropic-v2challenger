/**
 * H2 (2026-07-02 master-tuneup WS5) — bank-relative CC resolver.
 *
 * Wires ccBankBindings (physical CC -> BankSlotAddress, stores/midi.ts) to
 * the CURRENTLY FOCUSED MappingContext (focusContext.ts) via a BankAssignment
 * (saved, or the deriveDefaultAssignment.ts default), producing the ACTUAL
 * target for each bound CC THIS FRAME. "Focus-follows" means the same
 * physical knob resolves to a DIFFERENT target as focus changes, because the
 * assignment lookup is keyed by contextKey, re-derived every call.
 *
 * SEMANTIC MODEL: transient overlay only (bankTypes.ts doc). This module
 * never writes to a store. `applyBankModulations` returns a new EffectInstance
 * chain (mirrors applyCCModulations' pure-function contract exactly — it IS
 * applyCCModulations under the hood, fed a resolved CCMapping[]).
 * `resolveBankMacroOverrides` returns a transient macroId->value overlay
 * consumed by resolveRackMacros' optional overrides param (instruments/
 * resolveRackMacros.ts) — NOT a RackMacro.value store write.
 *
 * LEGACY PRECEDENCE: a CC with BOTH a direct ccMappings entry AND a bank
 * binding uses the bank binding; the direct mapping is suppressed for that
 * CC only (all other direct mappings keep working unchanged). Warned once
 * per CC (module-level dedup Set) — not per frame, to avoid console spam.
 *
 * v1 NO-OP TARGETS: 'transform' and 'mask' slot targets are resolved (the
 * bank binding IS matched, so its legacy-collision precedence still applies)
 * but produce no chain/macro change — H4 wires the live overlay. Warned once
 * per distinct target (not per frame).
 *
 * H7 — every entry point here now takes an optional trailing `bankIndex`
 * (default 0, matching pre-H7 behavior byte-for-byte): the assignment lookup
 * key becomes `pagedContextKey(context.contextKey, bankIndex)` instead of the
 * bare contextKey, so the SAME physical CC resolves to a DIFFERENT target as
 * the active bank page changes, exactly like it already does as focus
 * changes. See bankTypes.ts MAX_BANK_PAGES doc for the paging model.
 */
import type { EffectInstance, CCMapping, ParamDef } from '../../../shared/types'
import type { BankAssignment, CCBankBinding, SlotTarget } from '../../../shared/bankTypes'
import { pagedContextKey } from '../../../shared/bankTypes'
import type { MappingContext } from '../../utils/focusContext'
import {
  deriveDefaultAssignment,
  type DefaultAssignmentSources,
} from '../../utils/deriveDefaultAssignment'
import { applyCCModulations } from './applyCCModulations'

// Module-level warn-once dedup state (survives across frames/calls; cleared
// only by _resetBankResolverWarnState, exported for tests).
const _warnedNoopTargets = new Set<string>()
const _warnedLegacyCollisions = new Set<number>()

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

function resolveAssignment(
  bankAssignments: Record<string, BankAssignment>,
  context: MappingContext,
  sources: DefaultAssignmentSources,
  bankIndex: number,
): BankAssignment {
  const key = pagedContextKey(context.contextKey, bankIndex)
  return bankAssignments[key] ?? deriveDefaultAssignment(context, sources)
}

function getSlot(assignment: BankAssignment, row: number, col: number): SlotTarget | null {
  return assignment.slots[row]?.[col] ?? null
}

interface ResolvedBankTargets {
  effectParamMappings: CCMapping[]
  macroOverrides: Map<string, number>
  usedBankCcs: Set<number>
}

/** Shared core: for every bound CC with a live value, resolve its slot target
 * against the current context's assignment and bucket it by target kind. */
function resolveBankTargets(
  ccBankBindings: CCBankBinding[],
  ccValues: Record<number, number>,
  bankAssignments: Record<string, BankAssignment>,
  context: MappingContext,
  sources: DefaultAssignmentSources,
  bankIndex: number,
): ResolvedBankTargets {
  const effectParamMappings: CCMapping[] = []
  const macroOverrides = new Map<string, number>()
  const usedBankCcs = new Set<number>()

  if (ccBankBindings.length === 0 || context.kind === 'none') {
    return { effectParamMappings, macroOverrides, usedBankCcs }
  }

  const assignment = resolveAssignment(bankAssignments, context, sources, bankIndex)

  for (const binding of ccBankBindings) {
    const value = ccValues[binding.cc]
    if (value === undefined || !Number.isFinite(value)) continue

    const target = getSlot(assignment, binding.slot.row, binding.slot.col)
    if (!target) continue // empty slot at this context — legitimate no-op, not a warning

    usedBankCcs.add(binding.cc)

    switch (target.kind) {
      case 'effectParam':
        effectParamMappings.push({ cc: binding.cc, effectId: target.effectId, paramKey: target.paramKey })
        break
      case 'macro':
        macroOverrides.set(target.macroId, clamp01(value))
        break
      case 'transform':
      case 'mask':
      case 'instrument': {
        // v1 NO-OP targets (H4 wires the live overlay). 'instrument' (H3) joins
        // 'transform'/'mask' here: the binding IS matched (so legacy-collision
        // precedence still applies) but produces no chain/macro change yet.
        const id =
          target.kind === 'transform' ? target.clipId
          : target.kind === 'mask' ? target.nodeId
          : target.trackId
        const field =
          target.kind === 'transform' ? target.field
          : target.kind === 'mask' ? target.param
          : target.paramKey
        const key = `${target.kind}:${id}:${field}`
        if (!_warnedNoopTargets.has(key)) {
          _warnedNoopTargets.add(key)
          // eslint-disable-next-line no-console
          console.warn(
            `[bank-resolver] '${target.kind}' slot targets are not yet wired to the render path (H4) — CC ${binding.cc} is a no-op.`,
            target,
          )
        }
        break
      }
    }
  }

  return { effectParamMappings, macroOverrides, usedBankCcs }
}

/**
 * Render-path entry point for effect-param bank overlays. Drop-in replacement
 * for a bare `applyCCModulations(chain, ccMappings, ccValues, effectRegistry)`
 * call: merges legacy direct `ccMappings` with resolved bank-bound effectParam
 * targets (bank wins on CC collision) and applies the result exactly as
 * applyCCModulations always has. Chain reference is returned UNCHANGED when
 * there is nothing to apply (regression-safe, mirrors applyCCModulations).
 */
export function applyBankModulations(
  chain: EffectInstance[],
  ccMappings: CCMapping[],
  ccBankBindings: CCBankBinding[],
  ccValues: Record<number, number>,
  bankAssignments: Record<string, BankAssignment>,
  context: MappingContext,
  sources: DefaultAssignmentSources,
  effectRegistry?: Map<string, Record<string, ParamDef>>,
  bankIndex = 0,
): EffectInstance[] {
  const { effectParamMappings, usedBankCcs } = resolveBankTargets(
    ccBankBindings,
    ccValues,
    bankAssignments,
    context,
    sources,
    bankIndex,
  )

  let legacyMappings = ccMappings
  if (usedBankCcs.size > 0) {
    legacyMappings = ccMappings.filter((m) => {
      if (!usedBankCcs.has(m.cc)) return true
      if (!_warnedLegacyCollisions.has(m.cc)) {
        _warnedLegacyCollisions.add(m.cc)
        // eslint-disable-next-line no-console
        console.warn(
          `[bank-resolver] CC ${m.cc} has both a direct ccMapping and a bank binding — bank binding wins.`,
        )
      }
      return false
    })
  }

  const merged = [...legacyMappings, ...effectParamMappings]
  if (merged.length === 0) return chain
  return applyCCModulations(chain, merged, ccValues, effectRegistry)
}

/**
 * Render-path entry point for macro overlays. Returns a transient
 * macroId -> override value (0-1) map for the CURRENTLY FOCUSED context only
 * (a rack whose track isn't focused will have no entries here, since its
 * macro ids simply never appear — see resolveRackMacros.ts's optional
 * overrides param, which looks entries up by macro id). NEVER writes
 * RackMacro.value in the store — inject at the resolveRackMacros call site,
 * before resolveRackMacros runs for that frame.
 */
export function resolveBankMacroOverrides(
  ccBankBindings: CCBankBinding[],
  ccValues: Record<number, number>,
  bankAssignments: Record<string, BankAssignment>,
  context: MappingContext,
  sources: DefaultAssignmentSources,
  bankIndex = 0,
): Map<string, number> {
  return resolveBankTargets(ccBankBindings, ccValues, bankAssignments, context, sources, bankIndex).macroOverrides
}

/**
 * H4 — resolve ONE physical CC to the SlotTarget it drives for the CURRENTLY
 * FOCUSED context, or null if that CC has no bank binding / the bound slot is
 * empty at this focus / focus is 'none'. This is the recording counterpart of
 * the per-frame overlay: `applyBankModulations`/`resolveBankMacroOverrides`
 * answer "what value does every bound CC push this frame"; this answers "which
 * lane does THIS CC's move record into". Both go through the SAME
 * resolveAssignment + getSlot pair, so a knob records to exactly the lane it
 * modulates. "Focus-follows-records" falls straight out: the same CC resolves
 * to a DIFFERENT target as `context` changes, because the assignment lookup is
 * keyed by contextKey.
 *
 * Unlike the overlay resolvers this returns ALL slot kinds (including
 * transform/mask/instrument) — the H4 record dispatcher decides which kinds it
 * can commit; the v1 overlay no-op'd them because it had no store to write to.
 */
export function resolveBankSlotTargetForCC(
  cc: number,
  ccBankBindings: CCBankBinding[],
  bankAssignments: Record<string, BankAssignment>,
  context: MappingContext,
  sources: DefaultAssignmentSources,
  bankIndex = 0,
): SlotTarget | null {
  if (context.kind === 'none') return null
  const binding = ccBankBindings.find((b) => b.cc === cc)
  if (!binding) return null
  const assignment = resolveAssignment(bankAssignments, context, sources, bankIndex)
  return getSlot(assignment, binding.slot.row, binding.slot.col)
}

/** Test-only: reset warn-once dedup state between test cases. */
export function _resetBankResolverWarnState(): void {
  _warnedNoopTargets.clear()
  _warnedLegacyCollisions.clear()
}
