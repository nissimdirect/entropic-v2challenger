import { describe, it, expect, beforeEach } from 'vitest'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { OperatorMapping } from '../../shared/types'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

describe('Operator Store', () => {
  beforeEach(resetStores)

  // --- Add / Remove ---

  it('starts with empty operators', () => {
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })

  it('addOperator creates an LFO', () => {
    useOperatorStore.getState().addOperator('lfo')
    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('lfo')
    expect(ops[0].isEnabled).toBe(true)
    expect(ops[0].parameters.waveform).toBe('sine')
  })

  it('addOperator creates an envelope', () => {
    useOperatorStore.getState().addOperator('envelope')
    const ops = useOperatorStore.getState().operators
    expect(ops[0].type).toBe('envelope')
    expect(ops[0].parameters.attack).toBe(10)
  })

  it('addOperator creates a step sequencer', () => {
    useOperatorStore.getState().addOperator('step_sequencer')
    const ops = useOperatorStore.getState().operators
    expect(ops[0].type).toBe('step_sequencer')
  })

  it('addOperator creates an audio follower', () => {
    useOperatorStore.getState().addOperator('audio_follower')
    const ops = useOperatorStore.getState().operators
    expect(ops[0].type).toBe('audio_follower')
    expect(ops[0].parameters.method).toBe('rms')
  })

  it('removeOperator removes by id', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().removeOperator(id)
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })

  it('removeOperator with invalid id does nothing', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().removeOperator('nonexistent')
    expect(useOperatorStore.getState().operators).toHaveLength(1)
  })

  // --- Update ---

  it('updateOperator changes label', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().updateOperator(id, { label: 'My LFO' })
    expect(useOperatorStore.getState().operators[0].label).toBe('My LFO')
  })

  it('setOperatorEnabled toggles enabled state', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().setOperatorEnabled(id, false)
    expect(useOperatorStore.getState().operators[0].isEnabled).toBe(false)
  })

  // --- Mappings ---

  it('addMapping adds to operator', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    const mapping: OperatorMapping = {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
    }
    useOperatorStore.getState().addMapping(id, mapping)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings[0].targetEffectId).toBe('fx1')
  })

  it('removeMapping removes by index', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    const mapping: OperatorMapping = {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
    }
    useOperatorStore.getState().addMapping(id, mapping)
    useOperatorStore.getState().removeMapping(id, 0)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
  })

  it('updateMapping updates depth', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    const mapping: OperatorMapping = {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
    }
    useOperatorStore.getState().addMapping(id, mapping)
    useOperatorStore.getState().updateMapping(id, 0, { depth: 0.5 })
    expect(useOperatorStore.getState().operators[0].mappings[0].depth).toBe(0.5)
  })

  // --- Reorder ---

  it('reorderOperators swaps positions', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const id0 = useOperatorStore.getState().operators[0].id
    const id1 = useOperatorStore.getState().operators[1].id
    useOperatorStore.getState().reorderOperators(0, 1)
    expect(useOperatorStore.getState().operators[0].id).toBe(id1)
    expect(useOperatorStore.getState().operators[1].id).toBe(id0)
  })

  // --- Undo/Redo ---

  it('undo addOperator', () => {
    useOperatorStore.getState().addOperator('lfo')
    expect(useOperatorStore.getState().operators).toHaveLength(1)
    useUndoStore.getState().undo()
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })

  it('redo addOperator', () => {
    useOperatorStore.getState().addOperator('lfo')
    useUndoStore.getState().undo()
    useUndoStore.getState().redo()
    expect(useOperatorStore.getState().operators).toHaveLength(1)
  })

  it('undo removeOperator restores operator', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().removeOperator(id)
    expect(useOperatorStore.getState().operators).toHaveLength(0)
    useUndoStore.getState().undo()
    expect(useOperatorStore.getState().operators).toHaveLength(1)
  })

  it('undo updateOperator reverts changes', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().updateOperator(id, { label: 'Changed' })
    useUndoStore.getState().undo()
    expect(useOperatorStore.getState().operators[0].label).toBe('LFO')
  })

  // --- Reset / Load ---

  it('resetOperators clears all', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    useOperatorStore.getState().resetOperators()
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })

  it('loadOperators replaces all', () => {
    const ops = [
      {
        id: 'op-1',
        type: 'lfo' as const,
        label: 'Loaded LFO',
        isEnabled: true,
        parameters: { waveform: 'saw', rate_hz: 2.0 },
        processing: [],
        mappings: [],
      },
    ]
    useOperatorStore.getState().loadOperators(ops)
    expect(useOperatorStore.getState().operators).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].label).toBe('Loaded LFO')
  })

  // --- Undo with ID-based closures ---

  it('undo updateOperator after reorder targets correct operator', () => {
    // Add 3 operators
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    useOperatorStore.getState().addOperator('step_sequencer')

    const ops = useOperatorStore.getState().operators
    const lfoId = ops[0].id
    const envId = ops[1].id
    const seqId = ops[2].id

    // Clear undo stack from adds
    useUndoStore.getState().clear()

    // Update LFO rate
    useOperatorStore.getState().updateOperator(lfoId, { parameters: { waveform: 'saw', rate_hz: 5.0, phase_offset: 0.0 } })

    // Reorder: move LFO to position 2 (it's now at the end)
    useOperatorStore.getState().reorderOperators(0, 2)

    // Undo the reorder
    useUndoStore.getState().undo()

    // Undo the updateOperator — should target LFO by ID, not whatever is at index 0
    useUndoStore.getState().undo()

    // LFO should be back to original rate
    const lfo = useOperatorStore.getState().operators.find((o) => o.id === lfoId)!
    expect(lfo.parameters.waveform).toBe('sine')
    expect(lfo.parameters.rate_hz).toBe(1.0)
  })

  // --- Serialization ---

  it('getSerializedOperators converts to snake_case', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.8,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
    })

    const serialized = useOperatorStore.getState().getSerializedOperators()
    expect(serialized).toHaveLength(1)
    expect(serialized[0].is_enabled).toBe(true)
    expect(serialized[0].type).toBe('lfo')
    const mappings = serialized[0].mappings as Record<string, unknown>[]
    expect(mappings[0].target_effect_id).toBe('fx1')
    expect(mappings[0].target_param_key).toBe('amount')
    expect(mappings[0].blend_mode).toBe('add')
  })
})
