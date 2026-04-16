/**
 * Sprint 7: Device Group UI — store-level logic tests for group/ungroup context menu actions.
 *
 * Tests the groupEffects/ungroupEffects actions triggered from the DeviceChain context menu:
 * 1. "Group with Previous" — groups current effect with the one before it
 * 2. "Ungroup" — removes a group by ID
 * 3. Edge cases — first item (no previous), already-grouped pairs, nonexistent groups
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useProjectStore } from '../renderer/stores/project'
import { useUndoStore } from '../renderer/stores/undo'
import type { EffectInstance } from '../shared/types'

const FX1: EffectInstance = {
  id: 'fx-1', effectId: 'pixelsort', isEnabled: true, isFrozen: false,
  parameters: { threshold: 0.5 }, modulations: {}, mix: 1, mask: null,
}
const FX2: EffectInstance = {
  id: 'fx-2', effectId: 'datamosh', isEnabled: true, isFrozen: false,
  parameters: { entropy: 0.7 }, modulations: {}, mix: 1, mask: null,
}
const FX3: EffectInstance = {
  id: 'fx-3', effectId: 'blur', isEnabled: true, isFrozen: false,
  parameters: { radius: 5 }, modulations: {}, mix: 1, mask: null,
}
const FX4: EffectInstance = {
  id: 'fx-4', effectId: 'vhs', isEnabled: true, isFrozen: false,
  parameters: { tracking: 0.3 }, modulations: {}, mix: 1, mask: null,
}

function reset() {
  useProjectStore.setState({
    effectChain: [{ ...FX1 }, { ...FX2 }, { ...FX3 }, { ...FX4 }],
    deviceGroups: {},
    selectedEffectId: null,
    assets: {},
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
  useUndoStore.getState().clear()
}

// ============================================================
// 1. Group with Previous — simulates context menu "Group with Previous"
// ============================================================

describe('Group with Previous (context menu action)', () => {
  beforeEach(reset)

  it('groups effect with previous effect', () => {
    // User right-clicks fx-2 (index 1) and selects "Group with Previous"
    const chain = useProjectStore.getState().effectChain
    const prevId = chain[0].id // fx-1
    const currentId = chain[1].id // fx-2

    const groupId = useProjectStore.getState().groupEffects([prevId, currentId])
    expect(groupId).toBeTruthy()

    const groups = useProjectStore.getState().deviceGroups
    expect(groups[groupId!].effectIds).toEqual(['fx-1', 'fx-2'])
  })

  it('groups last effect with its predecessor', () => {
    const chain = useProjectStore.getState().effectChain
    const prevId = chain[2].id // fx-3
    const currentId = chain[3].id // fx-4

    const groupId = useProjectStore.getState().groupEffects([prevId, currentId])
    expect(groupId).toBeTruthy()

    const groups = useProjectStore.getState().deviceGroups
    expect(groups[groupId!].effectIds).toEqual(['fx-3', 'fx-4'])
  })

  it('chain order is unchanged after grouping', () => {
    useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])
    const chain = useProjectStore.getState().effectChain
    expect(chain.map((e) => e.id)).toEqual(['fx-1', 'fx-2', 'fx-3', 'fx-4'])
  })

  it('is undoable', () => {
    useProjectStore.getState().groupEffects(['fx-2', 'fx-3'])
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    useUndoStore.getState().undo()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })
})

// ============================================================
// 2. Ungroup — simulates context menu "Ungroup"
// ============================================================

describe('Ungroup (context menu action)', () => {
  beforeEach(reset)

  it('removes group when user selects Ungroup', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    useProjectStore.getState().ungroupEffects(groupId)
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })

  it('ungroup is undoable', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    useProjectStore.getState().ungroupEffects(groupId)
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)
  })

  it('no-ops for nonexistent group ID', () => {
    useProjectStore.getState().ungroupEffects('does-not-exist')
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })

  it('chain order preserved after ungroup', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-2', 'fx-3'])!
    useProjectStore.getState().ungroupEffects(groupId)

    const chain = useProjectStore.getState().effectChain
    expect(chain.map((e) => e.id)).toEqual(['fx-1', 'fx-2', 'fx-3', 'fx-4'])
  })
})

// ============================================================
// 3. Edge cases — context menu visibility logic
// ============================================================

describe('Context menu visibility logic', () => {
  beforeEach(reset)

  it('first effect has no "Group with Previous" (index 0)', () => {
    // The UI logic: index > 0 check means first effect never shows "Group with Previous"
    // Verify that trying to group only 1 effect is rejected
    const result = useProjectStore.getState().groupEffects(['fx-1'])
    expect(result).toBeNull()
  })

  it('effect already in same group as previous disables Group with Previous', () => {
    // Group fx-1 and fx-2
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    const groups = useProjectStore.getState().deviceGroups

    // Both effects are in the same group — UI logic checks this and disables the item
    const group = groups[groupId]
    expect(group.effectIds.includes('fx-1')).toBe(true)
    expect(group.effectIds.includes('fx-2')).toBe(true)
  })

  it('effect not in any group has no "Ungroup" option', () => {
    // No groups exist — findGroupForEffect should return null for any effect
    const groups = useProjectStore.getState().deviceGroups
    const hasGroup = Object.values(groups).some(
      (g) => g.effectIds.includes('fx-3'),
    )
    expect(hasGroup).toBe(false)
  })

  it('multiple groups can coexist', () => {
    const g1 = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    const g2 = useProjectStore.getState().groupEffects(['fx-3', 'fx-4'])!

    const groups = useProjectStore.getState().deviceGroups
    expect(Object.keys(groups)).toHaveLength(2)
    expect(groups[g1].effectIds).toEqual(['fx-1', 'fx-2'])
    expect(groups[g2].effectIds).toEqual(['fx-3', 'fx-4'])
  })

  it('ungrouping one group leaves other groups intact', () => {
    const g1 = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    const g2 = useProjectStore.getState().groupEffects(['fx-3', 'fx-4'])!

    useProjectStore.getState().ungroupEffects(g1)

    const groups = useProjectStore.getState().deviceGroups
    expect(Object.keys(groups)).toHaveLength(1)
    expect(groups[g2]).toBeDefined()
    expect(groups[g2].effectIds).toEqual(['fx-3', 'fx-4'])
  })
})
