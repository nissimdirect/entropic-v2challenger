/**
 * P4.1 cap tests — operator count cap (64), mapping cap (32), and new type defaults.
 *
 * Coverage:
 *   - addOperator refuses the 65th operator (LIMITS.MAX_OPERATORS=64)
 *   - addMapping refuses the 33rd mapping per operator (32-mapping cap)
 *   - loadOperators clamps oversized mappings arrays to 32 entries
 *   - addOperator creates valid defaults for kentaroCluster, sidechain, gate, midiEnvStutter
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { OperatorMapping, Operator } from '../../shared/types'
import { LIMITS } from '../../shared/limits'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

const baseMapping = (): OperatorMapping => ({
  targetEffectId: 'fx1',
  targetParamKey: 'amount',
  depth: 1.0,
  min: 0.0,
  max: 1.0,
  curve: 'linear',
})

describe('Operator caps (P4.1)', () => {
  beforeEach(resetStores)

  it('addOperator refuses the 65th operator (LIMITS.MAX_OPERATORS=64)', () => {
    expect(LIMITS.MAX_OPERATORS).toBe(64)
    // Fill to cap
    for (let i = 0; i < LIMITS.MAX_OPERATORS; i++) {
      useOperatorStore.getState().addOperator('lfo')
    }
    expect(useOperatorStore.getState().operators).toHaveLength(LIMITS.MAX_OPERATORS)
    // 65th should be refused
    useOperatorStore.getState().addOperator('lfo')
    expect(useOperatorStore.getState().operators).toHaveLength(LIMITS.MAX_OPERATORS)
  })

  it('addMapping refuses the 33rd mapping per operator (32-mapping cap)', () => {
    expect(LIMITS.MAX_MAPPINGS_PER_OPERATOR).toBe(32)
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    // Fill to cap
    for (let i = 0; i < LIMITS.MAX_MAPPINGS_PER_OPERATOR; i++) {
      useOperatorStore.getState().addMapping(id, { ...baseMapping(), targetParamKey: `p${i}` })
    }
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(
      LIMITS.MAX_MAPPINGS_PER_OPERATOR,
    )
    // 33rd should be refused
    useOperatorStore.getState().addMapping(id, { ...baseMapping(), targetParamKey: 'overflow' })
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(
      LIMITS.MAX_MAPPINGS_PER_OPERATOR,
    )
  })

  it('loadOperators clamps oversized mappings arrays to 32 entries', () => {
    // Build an operator with 40 mappings (over the 32 cap)
    const oversizedMappings: OperatorMapping[] = Array.from({ length: 40 }, (_, i) => ({
      targetEffectId: 'fx1',
      targetParamKey: `param${i}`,
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear' as const,
    }))
    const op: Operator = {
      id: 'op-oversized',
      type: 'lfo',
      label: 'LFO',
      isEnabled: true,
      parameters: { waveform: 'sine', rate_hz: 1.0, phase_offset: 0.0 },
      processing: [],
      mappings: oversizedMappings,
    }
    useOperatorStore.getState().loadOperators([op])
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(32)
  })

  it('addOperator creates valid defaults for kentaroCluster', () => {
    useOperatorStore.getState().addOperator('kentaroCluster')
    const op = useOperatorStore.getState().operators[0]
    expect(op.type).toBe('kentaroCluster')
    expect(op.parameters.lfo_count).toBe(8)
    expect(op.parameters.master_rate_hz).toBe(1.0)
    expect(op.parameters.master_depth).toBe(1.0)
    expect(op.parameters.bpm_sync).toBe(false)
  })

  it('addOperator creates valid defaults for sidechain', () => {
    useOperatorStore.getState().addOperator('sidechain')
    const op = useOperatorStore.getState().operators[0]
    expect(op.type).toBe('sidechain')
    expect(op.parameters.source_track_id).toBe('')
    expect(op.parameters.sensitivity).toBe(1.4)
  })

  it('addOperator creates valid defaults for gate', () => {
    useOperatorStore.getState().addOperator('gate')
    const op = useOperatorStore.getState().operators[0]
    expect(op.type).toBe('gate')
    expect(op.parameters.threshold).toBe(0.5)
    expect(op.parameters.sources).toBe('')
  })

  it('addOperator creates valid defaults for midiEnvStutter', () => {
    useOperatorStore.getState().addOperator('midiEnvStutter')
    const op = useOperatorStore.getState().operators[0]
    expect(op.type).toBe('midiEnvStutter')
    expect(op.parameters.attack).toBe(5)
    expect(op.parameters.decay).toBe(10)
    expect(op.parameters.sustain).toBe(0.5)
    expect(op.parameters.release).toBe(15)
    expect(op.parameters.trigger_count).toBe(0)
  })
})
