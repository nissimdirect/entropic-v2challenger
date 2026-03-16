/**
 * DeviceGroup store tests (Quality Fix 2).
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

describe('groupEffects', () => {
  beforeEach(reset)

  it('rejects grouping fewer than 2 effects', () => {
    const result = useProjectStore.getState().groupEffects(['fx-1'])
    expect(result).toBeNull()
    // Chain unchanged
    expect(useProjectStore.getState().effectChain).toHaveLength(3)
  })

  it('rejects grouping 0 effects', () => {
    const result = useProjectStore.getState().groupEffects([])
    expect(result).toBeNull()
  })

  it('groups 2 effects and returns group ID', () => {
    const groupId = useProjectStore.getState().groupEffects(['fx-1', 'fx-2'], 'My Group')
    expect(groupId).toBeTruthy()
    // Chain should now have 2 items: group + fx-3
    expect(useProjectStore.getState().effectChain).toHaveLength(2)
  })

  it('grouping is undoable', () => {
    useProjectStore.getState().groupEffects(['fx-1', 'fx-2'])
    expect(useProjectStore.getState().effectChain).toHaveLength(2)

    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(3)
    expect(useProjectStore.getState().effectChain[0].id).toBe('fx-1')
    expect(useProjectStore.getState().effectChain[1].id).toBe('fx-2')
  })

  it('rejects non-existent effect IDs', () => {
    const result = useProjectStore.getState().groupEffects(['fx-999', 'fx-888'])
    expect(result).toBeNull()
  })

  it('group replaces effects at first effect position', () => {
    useProjectStore.getState().groupEffects(['fx-2', 'fx-3'])
    const chain = useProjectStore.getState().effectChain
    // fx-1 should still be first, group should be second
    expect(chain[0].id).toBe('fx-1')
  })
})
