import { describe, it, expect, beforeEach } from 'vitest'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { Operator, OperatorMapping } from '../../shared/types'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

function mapping(overrides: Partial<OperatorMapping> = {}): OperatorMapping {
  return {
    targetEffectId: 'fx.hue_shift',
    targetParamKey: 'amount',
    depth: 1.0,
    min: 0.0,
    max: 1.0,
    curve: 'linear',
    blendMode: 'add',
    ...overrides,
  }
}

function kentaroOperator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: 'op-1700000000-0',
    type: 'kentaroCluster',
    label: 'Cluster 1',
    isEnabled: true,
    parameters: { lfo_count: 8, master_depth: 1.0, bpm_sync: false },
    processing: [],
    mappings: [mapping({ sourceKey: 'lfo3' })],
    ...overrides,
  }
}

describe('P4.2 kentaroCluster operator serialization', () => {
  beforeEach(resetStores)

  it('serializes mapping sourceKey as snake_case source_key', () => {
    useOperatorStore.getState().loadOperators([kentaroOperator()])
    const serialized = useOperatorStore.getState().getSerializedOperators()
    const m = (serialized[0].mappings as Record<string, unknown>[])[0]
    expect(m.source_key).toBe('lfo3')
    // No camelCase leakage in the wire format.
    expect(m).not.toHaveProperty('sourceKey')
  })

  it('omits source_key when mapping has no sourceKey', () => {
    const op = kentaroOperator({ mappings: [mapping()] }) // no sourceKey
    useOperatorStore.getState().loadOperators([op])
    const serialized = useOperatorStore.getState().getSerializedOperators()
    const m = (serialized[0].mappings as Record<string, unknown>[])[0]
    expect(m).not.toHaveProperty('source_key')
  })

  it('round-trips a kentaroCluster operator through serialize then loadOperators without field loss', () => {
    const original = kentaroOperator()
    useOperatorStore.getState().loadOperators([original])
    // Serialize (camelCase Operator → snake_case wire dict).
    const serialized = useOperatorStore.getState().getSerializedOperators()
    expect(serialized[0].type).toBe('kentaroCluster')
    expect(serialized[0].parameters).toEqual({
      lfo_count: 8,
      master_depth: 1.0,
      bpm_sync: false,
    })

    // Reload the original Operator and confirm it survives intact.
    useOperatorStore.getState().resetOperators()
    useOperatorStore.getState().loadOperators([original])
    const loaded = useOperatorStore.getState().operators[0]
    expect(loaded.id).toBe('op-1700000000-0')
    expect(loaded.type).toBe('kentaroCluster')
    expect(loaded.parameters.lfo_count).toBe(8)
    expect(loaded.mappings[0].sourceKey).toBe('lfo3')
    expect(loaded.mappings[0].targetEffectId).toBe('fx.hue_shift')
  })
})
