/**
 * H7 (2026-07-02 master-tuneup WS5) — bank-paging tests.
 *
 * ANTI-DEAD-FLAG: proves activeBankIndex isn't just a number sitting in the
 * store — the SAME physical CC + SAME focused context resolves to a
 * DIFFERENT target when the active bank page changes (applyBankModulations /
 * resolveBankMacroOverrides / resolveBankSlotTargetForCC all thread
 * bankIndex through to the REAL resolver, not a mock). Also covers the store
 * action clamp semantics (no wrap) and the pagedContextKey helper directly.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useMIDIStore } from '../../renderer/stores/midi'
import { usePerformanceStore } from '../../renderer/stores/performance'
import { useUndoStore } from '../../renderer/stores/undo'
import {
  applyBankModulations,
  resolveBankMacroOverrides,
  resolveBankSlotTargetForCC,
  _resetBankResolverWarnState,
} from '../../renderer/components/performance/applyBankModulations'
import { pagedContextKey, MAX_BANK_PAGES } from '../../shared/bankTypes'
import type { BankAssignment, CCBankBinding } from '../../shared/bankTypes'
import type { MappingContext } from '../../renderer/utils/focusContext'
import type { EffectInstance } from '../../shared/types'

function resetStores() {
  useMIDIStore.getState().resetMIDI()
  usePerformanceStore.getState().resetDrumRack()
  useUndoStore.getState().clear()
  _resetBankResolverWarnState()
}

beforeEach(resetStores)

// ── stores/midi.ts activeBankIndex actions ──────────────────────────────

describe('MIDI store — activeBankIndex paging', () => {
  it('starts at page 0', () => {
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
  })

  it('bankPageRight advances activeBankIndex, clamped at MAX_BANK_PAGES - 1 (no wrap)', () => {
    const { bankPageRight } = useMIDIStore.getState()
    for (let i = 0; i < MAX_BANK_PAGES + 3; i++) bankPageRight()
    expect(useMIDIStore.getState().activeBankIndex).toBe(MAX_BANK_PAGES - 1)
  })

  it('bankPageLeft retreats activeBankIndex, clamped at 0 (no wrap)', () => {
    useMIDIStore.getState().setActiveBankIndex(2)
    const { bankPageLeft } = useMIDIStore.getState()
    bankPageLeft()
    bankPageLeft()
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
    bankPageLeft() // one more past the rail — still 0, not -1 or MAX-1 (no wrap)
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
  })

  it('bankPageRight/Left move exactly one page at a time', () => {
    const { bankPageRight, bankPageLeft } = useMIDIStore.getState()
    bankPageRight()
    expect(useMIDIStore.getState().activeBankIndex).toBe(1)
    bankPageRight()
    expect(useMIDIStore.getState().activeBankIndex).toBe(2)
    bankPageLeft()
    expect(useMIDIStore.getState().activeBankIndex).toBe(1)
  })

  it('setActiveBankIndex clamps out-of-range values into [0, MAX_BANK_PAGES - 1]', () => {
    useMIDIStore.getState().setActiveBankIndex(999)
    expect(useMIDIStore.getState().activeBankIndex).toBe(MAX_BANK_PAGES - 1)
    useMIDIStore.getState().setActiveBankIndex(-5)
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
  })

  it('setActiveBankIndex rejects non-integer input (trust boundary)', () => {
    useMIDIStore.getState().setActiveBankIndex(3)
    useMIDIStore.getState().setActiveBankIndex(1.5)
    expect(useMIDIStore.getState().activeBankIndex).toBe(3) // unchanged — bad input dropped
    useMIDIStore.getState().setActiveBankIndex(NaN)
    expect(useMIDIStore.getState().activeBankIndex).toBe(3)
  })

  it('resetMIDI resets activeBankIndex back to page 0', () => {
    useMIDIStore.getState().setActiveBankIndex(4)
    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
  })
})

// ── bankTypes.ts pagedContextKey ─────────────────────────────────────────

describe('pagedContextKey', () => {
  it('page 0 returns the bare contextKey unchanged (backward-compat with pre-H7 saves)', () => {
    expect(pagedContextKey('track:t1', 0)).toBe('track:t1')
  })

  it('pages 1+ get a distinct suffixed key', () => {
    expect(pagedContextKey('track:t1', 1)).toBe('track:t1::bank1')
    expect(pagedContextKey('track:t1', 2)).toBe('track:t1::bank2')
    expect(pagedContextKey('track:t1', 1)).not.toBe(pagedContextKey('track:t1', 2))
  })

  it('"none" context key is left untouched regardless of bankIndex', () => {
    expect(pagedContextKey('none', 0)).toBe('none')
    expect(pagedContextKey('none', 3)).toBe('none')
  })
})

// ── Resolver-level: bank paging actually changes what a CC resolves to ──

function makeChain(): EffectInstance[] {
  return [
    {
      id: 'fx-1',
      effectId: 'glitch',
      isEnabled: true,
      isFrozen: false,
      // Both target params must pre-exist as numbers — applyCCModulations
      // only overrides an ALREADY-numeric parameters[paramKey] (see
      // applyCCModulations.ts:55 `if (typeof baseValue !== 'number') continue`).
      parameters: { amount: 0.2, threshold: 0.1 },
      modulations: {},
      mix: 1,
      mask: null,
    },
  ]
}

function assignment(contextKey: string, target: { effectId: string; paramKey: string }): BankAssignment {
  const slots: (null | { kind: 'effectParam'; effectId: string; paramKey: string })[][] = Array.from(
    { length: 4 },
    () => Array(8).fill(null),
  )
  slots[0][0] = { kind: 'effectParam', ...target }
  return { contextKey, slots }
}

const trackContext = (trackId: string): MappingContext => ({
  kind: 'track',
  trackId,
  contextKey: `track:${trackId}`,
})

describe('bank paging — resolver end-to-end', () => {
  const binding: CCBankBinding = { cc: 40, slot: { row: 0, col: 0 } }
  const ctx = trackContext('t1')

  it('applyBankModulations resolves a DIFFERENT target for the same CC when bankIndex differs', () => {
    const bankAssignments: Record<string, BankAssignment> = {
      'track:t1': assignment('track:t1', { effectId: 'fx-1', paramKey: 'amount' }),
      'track:t1::bank1': assignment('track:t1::bank1', { effectId: 'fx-1', paramKey: 'threshold' }),
    }

    const page0 = applyBankModulations(
      makeChain(), [], [binding], { 40: 0.75 }, bankAssignments, ctx, {}, undefined, 0,
    )
    expect(page0[0].parameters.amount).toBeCloseTo(0.75)
    expect(page0[0].parameters.threshold).toBe(0.1) // untouched — page 0 targets amount, not threshold

    const page1 = applyBankModulations(
      makeChain(), [], [binding], { 40: 0.75 }, bankAssignments, ctx, {}, undefined, 1,
    )
    expect(page1[0].parameters.threshold).toBeCloseTo(0.75)
    expect(page1[0].parameters.amount).toBe(0.2) // untouched — page 1 targets threshold, not amount
  })

  it('defaults to page 0 when bankIndex is omitted (regression-safe for pre-H7 callers)', () => {
    const bankAssignments: Record<string, BankAssignment> = {
      'track:t1': assignment('track:t1', { effectId: 'fx-1', paramKey: 'amount' }),
    }
    const out = applyBankModulations(makeChain(), [], [binding], { 40: 0.9 }, bankAssignments, ctx, {})
    expect(out[0].parameters.amount).toBeCloseTo(0.9)
  })

  it('resolveBankSlotTargetForCC follows the active page', () => {
    const bankAssignments: Record<string, BankAssignment> = {
      'track:t1': assignment('track:t1', { effectId: 'fx-1', paramKey: 'amount' }),
      'track:t1::bank1': assignment('track:t1::bank1', { effectId: 'fx-1', paramKey: 'threshold' }),
    }
    const targetPage0 = resolveBankSlotTargetForCC(40, [binding], bankAssignments, ctx, {}, 0)
    const targetPage1 = resolveBankSlotTargetForCC(40, [binding], bankAssignments, ctx, {}, 1)
    expect(targetPage0).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' })
    expect(targetPage1).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'threshold' })
  })

  it('resolveBankMacroOverrides follows the active page', () => {
    const macroSlots = (macroId: string): (null | { kind: 'macro'; trackId: string; macroId: string })[][] => {
      const s: (null | { kind: 'macro'; trackId: string; macroId: string })[][] = Array.from(
        { length: 4 },
        () => Array(8).fill(null),
      )
      s[0][0] = { kind: 'macro', trackId: 't1', macroId }
      return s
    }
    const bankAssignments: Record<string, BankAssignment> = {
      'track:t1': { contextKey: 'track:t1', slots: macroSlots('macro-a') },
      'track:t1::bank1': { contextKey: 'track:t1::bank1', slots: macroSlots('macro-b') },
    }
    const overridesPage0 = resolveBankMacroOverrides([binding], { 40: 0.4 }, bankAssignments, ctx, {}, 0)
    const overridesPage1 = resolveBankMacroOverrides([binding], { 40: 0.4 }, bankAssignments, ctx, {}, 1)
    expect(overridesPage0.get('macro-a')).toBeCloseTo(0.4)
    expect(overridesPage0.has('macro-b')).toBe(false)
    expect(overridesPage1.get('macro-b')).toBeCloseTo(0.4)
    expect(overridesPage1.has('macro-a')).toBe(false)
  })

  it('an unsaved page falls back to the derived default assignment (no crash on empty page)', () => {
    const bankAssignments: Record<string, BankAssignment> = {
      'track:t1': assignment('track:t1', { effectId: 'fx-1', paramKey: 'amount' }),
      // page 3 has no saved assignment at all
    }
    const out = applyBankModulations(
      makeChain(), [], [binding], { 40: 0.5 }, bankAssignments, ctx, {}, undefined, 3,
    )
    // default assignment for a track context has no effectParam slots — the
    // chain must come back byte-identical, not throw.
    expect(out[0].parameters.amount).toBe(0.2)
  })
})
