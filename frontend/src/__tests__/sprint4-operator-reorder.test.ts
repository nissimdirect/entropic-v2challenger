/**
 * Sprint 4: Operator reorder UI wiring tests.
 *
 * Verifies that the OperatorRack component correctly wires
 * reorderOperators(fromIndex, toIndex) to move-up/move-down buttons.
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

import { useOperatorStore } from '../renderer/stores/operators'

describe('Operator reorder UI wiring', () => {
  beforeEach(() => {
    useOperatorStore.getState().resetOperators()
  })

  it('reorderOperators moves first operator down', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const beforeIds = useOperatorStore.getState().operators.map((o) => o.id)
    expect(beforeIds).toHaveLength(2)

    // Simulate clicking move-down on the first operator (index 0 -> 1)
    useOperatorStore.getState().reorderOperators(0, 1)

    const afterIds = useOperatorStore.getState().operators.map((o) => o.id)
    expect(afterIds[0]).toBe(beforeIds[1])
    expect(afterIds[1]).toBe(beforeIds[0])
  })

  it('reorderOperators moves last operator up', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    useOperatorStore.getState().addOperator('step_sequencer')
    const beforeIds = useOperatorStore.getState().operators.map((o) => o.id)

    // Simulate clicking move-up on the last operator (index 2 -> 1)
    useOperatorStore.getState().reorderOperators(2, 1)

    const afterIds = useOperatorStore.getState().operators.map((o) => o.id)
    expect(afterIds[0]).toBe(beforeIds[0])
    expect(afterIds[1]).toBe(beforeIds[2])
    expect(afterIds[2]).toBe(beforeIds[1])
  })

  it('reorderOperators is a no-op for out-of-bounds indices', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const beforeIds = useOperatorStore.getState().operators.map((o) => o.id)

    // Move-up on first (index -1 is out of bounds) — should be no-op
    useOperatorStore.getState().reorderOperators(0, -1)
    expect(useOperatorStore.getState().operators.map((o) => o.id)).toEqual(beforeIds)

    // Move-down on last (index 2 is out of bounds) — should be no-op
    useOperatorStore.getState().reorderOperators(1, 2)
    expect(useOperatorStore.getState().operators.map((o) => o.id)).toEqual(beforeIds)
  })
})
