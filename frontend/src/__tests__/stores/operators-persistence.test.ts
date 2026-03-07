import { describe, it, expect, beforeEach } from 'vitest'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { usePerformanceStore } from '../../renderer/stores/performance'
import {
  serializeProject,
  validateProject,
  hydrateStores,
} from '../../renderer/project-persistence'
import type { Operator } from '../../shared/types'

function resetAll() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  usePerformanceStore.getState().resetDrumRack()
}

describe('Operator Persistence', () => {
  beforeEach(resetAll)

  it('serializes operators into project JSON', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const json = serializeProject()
    const data = JSON.parse(json)
    expect(data.operators).toHaveLength(2)
    expect(data.operators[0].type).toBe('lfo')
    expect(data.operators[1].type).toBe('envelope')
  })

  it('round-trip: serialize → validate → hydrate → verify', () => {
    useOperatorStore.getState().addOperator('lfo')
    const id = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(id, {
      targetEffectId: 'fx1',
      targetParamKey: 'amount',
      depth: 0.8,
      min: 0.1,
      max: 0.9,
      curve: 'linear',
    })

    const json = serializeProject()
    const data = JSON.parse(json)

    expect(validateProject(data)).toBe(true)

    // Reset and hydrate
    resetAll()
    hydrateStores(data)

    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('lfo')
    expect(ops[0].mappings).toHaveLength(1)
    expect(ops[0].mappings[0].depth).toBe(0.8)
  })

  it('missing operators field → empty array (backward compat)', () => {
    const json = serializeProject()
    const data = JSON.parse(json)
    delete data.operators

    expect(validateProject(data)).toBe(true)
    hydrateStores(data)
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })

  it('invalid operators field → validation fails', () => {
    const json = serializeProject()
    const data = JSON.parse(json)
    data.operators = 'not an array'

    expect(validateProject(data)).toBe(false)
  })

  it('processing chain preserved through round-trip', () => {
    useOperatorStore.getState().loadOperators([
      {
        id: 'op-1',
        type: 'lfo',
        label: 'LFO',
        isEnabled: true,
        parameters: { waveform: 'sine', rate_hz: 2.0 },
        processing: [{ type: 'invert', params: {} }],
        mappings: [],
      },
    ])

    const json = serializeProject()
    resetAll()
    hydrateStores(JSON.parse(json))

    const ops = useOperatorStore.getState().operators
    expect(ops[0].processing).toHaveLength(1)
    expect(ops[0].processing[0].type).toBe('invert')
  })

  it('newProject resets operators', () => {
    useOperatorStore.getState().addOperator('lfo')
    expect(useOperatorStore.getState().operators).toHaveLength(1)

    // Simulate newProject — we can't call the real one (needs window.entropic)
    // so we test the store reset directly
    useOperatorStore.getState().resetOperators()
    expect(useOperatorStore.getState().operators).toHaveLength(0)
  })
})
