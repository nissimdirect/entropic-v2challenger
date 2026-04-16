/**
 * DeviceGroup store tests — metadata-only groups.
 * Groups are stored as metadata in deviceGroups, not mixed into effectChain.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import type { EffectInstance } from '../../shared/types'

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

function reset() {
  useProjectStore.setState({
    effectChain: [{ ...FX1 }, { ...FX2 }, { ...FX3 }],
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

describe('groupEffects (metadata-only)', () => {
  beforeEach(reset)

  it('rejects grouping fewer than 2 effects', () => {
    const result = useProjectStore.getState().groupEffects(['fx-1'])
    expect(result).toBeNull()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })

  it('rejects grouping 0 effects', () => {
    const result = useProjectStore.getState().groupEffects([])
    expect(result).toBeNull()
  })

  it('groups 2 effects and returns group ID', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'], 'My Group')
    expect(groupId).toBeTruthy()
    // Chain unchanged — groups are metadata only
    expect(useProjectStore.getState().effectChain).toHaveLength(3)
    // Group metadata created
    const groups = useProjectStore.getState().deviceGroups
    expect(groups[groupId!]).toBeDefined()
    expect(groups[groupId!].name).toBe('My Group')
    expect(groups[groupId!].effectIds).toEqual(['fx-1', 'fx-2'])
  })

  it('grouping is undoable', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    useUndoStore.getState().undo()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
    // Chain never changed
    expect(useProjectStore.getState().effectChain).toHaveLength(3)
  })

  it('rejects non-existent effect IDs', () => {
    const result = useProjectStore.getState().groupEffects(['fx-999', 'fx-888'])
    expect(result).toBeNull()
  })

  it('chain is not modified by grouping', () => {
    useProjectStore.getState().groupEffects(['fx-2', 'fx-3'])
    const chain = useProjectStore.getState().effectChain
    expect(chain[0].id).toBe('fx-1')
    expect(chain[1].id).toBe('fx-2')
    expect(chain[2].id).toBe('fx-3')
  })
})

describe('ungroupEffects', () => {
  beforeEach(reset)

  it('removes group metadata', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    useProjectStore.getState().ungroupEffects(groupId)
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })

  it('ungrouping is undoable', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    useProjectStore.getState().ungroupEffects(groupId)
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)
  })

  it('no-ops for non-existent group', () => {
    useProjectStore.getState().ungroupEffects('non-existent')
    // No error, no state change
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------------
// PR #18 /review P1 finding: removeEffect must prune deviceGroups[*].effectIds
// Without this cleanup, deleting an effect leaves orphan IDs in groups that
// persist to .glitch files and corrupt downstream lookups.
// -----------------------------------------------------------------------------

describe('removeEffect → deviceGroup cleanup', () => {
  beforeEach(reset)

  it('prunes the deleted effect from groups that still have ≥2 members', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2', 'fx-3'])!
    useProjectStore.getState().removeEffect('fx-2')

    const groups = useProjectStore.getState().deviceGroups
    expect(groups[groupId]).toBeDefined()
    expect(groups[groupId].effectIds).toEqual(['fx-1', 'fx-3'])
  })

  it('deletes the group when pruning drops it below 2 members', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(1)

    useProjectStore.getState().removeEffect('fx-2')

    const groups = useProjectStore.getState().deviceGroups
    expect(groups[groupId]).toBeUndefined()
    expect(Object.keys(groups)).toHaveLength(0)
  })

  it('leaves groups not containing the deleted effect untouched', () => {
    // Two separate groups
    const FX4: EffectInstance = {
      id: 'fx-4', effectId: 'noise', isEnabled: true, isFrozen: false,
      parameters: {}, modulations: {}, mix: 1, mask: null,
    }
    useProjectStore.setState({
      effectChain: [{ ...FX1 }, { ...FX2 }, { ...FX3 }, { ...FX4 }],
    })
    const g1 = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    const g2 = useProjectStore.getState().groupEffects(['fx-3', 'fx-4'])!

    useProjectStore.getState().removeEffect('fx-1')

    const groups = useProjectStore.getState().deviceGroups
    expect(groups[g1]).toBeUndefined() // dropped below 2
    expect(groups[g2]).toBeDefined()
    expect(groups[g2].effectIds).toEqual(['fx-3', 'fx-4']) // untouched
  })

  it('undo restores both the effect AND the groups that were pruned/deleted', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2', 'fx-3'])!
    useProjectStore.getState().removeEffect('fx-2')
    expect(useProjectStore.getState().deviceGroups[groupId].effectIds).toEqual(['fx-1', 'fx-3'])

    useUndoStore.getState().undo()

    expect(useProjectStore.getState().effectChain.map((e) => e.id)).toEqual(['fx-1', 'fx-2', 'fx-3'])
    expect(useProjectStore.getState().deviceGroups[groupId].effectIds).toEqual(['fx-1', 'fx-2', 'fx-3'])
  })

  it('undo restores a group that was deleted by the cleanup', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])!
    useProjectStore.getState().removeEffect('fx-1')
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)

    useUndoStore.getState().undo()

    const restored = useProjectStore.getState().deviceGroups
    expect(restored[groupId]).toBeDefined()
    expect(restored[groupId].effectIds).toEqual(['fx-1', 'fx-2'])
  })
})
