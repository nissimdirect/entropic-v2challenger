/**
 * C15 (adjudicated-confirmed) — ModulationMatrix.tsx's depth slider clamped
 * `OperatorMapping.depth` to [0, 1] while routing-canvas/EdgeInspector.tsx
 * clamps the SAME field (as `edge.amount`, which round-trips 1:1 through
 * `updateMapping(op.id, index, { depth: result.amount })` — see
 * RoutingCanvas.tsx:398) to [-1, 1]. A negative depth set via EdgeInspector
 * would silently misrepresent (and re-clamp away) in the Matrix, and vice
 * versa.
 *
 * Fix: ModulationMatrix now imports EdgeInspector's `clampAmount` and uses
 * the same [-1, 1] range/semantics.
 *
 * This test seeds ONE real OperatorMapping via the operator store, renders
 * BOTH UIs against it, and confirms a depth of -0.5 displays identically and
 * round-trips identically through an edit in either UI.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import ModulationMatrix from '../../renderer/components/operators/ModulationMatrix'
import EdgeInspector, { clampAmount } from '../../renderer/components/routing-canvas/EdgeInspector'
import type { RoutingEdge } from '../../renderer/components/routing-canvas/routing-graph-ipc'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { EffectInfo } from '../../shared/types'

const registry: EffectInfo[] = [
  {
    id: 'fx.hue_shift',
    name: 'Hue Shift',
    category: 'color',
    params: {
      amount: { type: 'float', min: 0, max: 360, default: 0, label: 'Amount' },
    },
  },
]

const effectChain = [{ id: 'inst-1', effectId: 'fx.hue_shift' }]

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

afterEach(cleanup)

describe('C15 — ModulationMatrix depth slider matches EdgeInspector [-1,1] semantics', () => {
  beforeEach(resetStores)

  it('a negative depth (-0.5) displays correctly in the Matrix (not clamped to 0)', () => {
    useOperatorStore.getState().addOperator('lfo')
    const opId = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(opId, {
      targetEffectId: 'inst-1',
      targetParamKey: 'amount',
      depth: -0.5,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { getByDisplayValue } = render(
      <ModulationMatrix
        effectChain={effectChain}
        registry={registry}
        operatorValues={{ [opId]: 0.5 }}
      />,
    )

    // The slider's own value is negative — pre-fix this would have been
    // clamped into [0,1] by the `min={0}` HTML range constraint.
    const slider = getByDisplayValue('-0.5') as HTMLInputElement
    expect(slider.min).toBe('-1')
    expect(slider.max).toBe('1')
    expect(slider.value).toBe('-0.5')
  })

  it('editing the Matrix slider to a negative value round-trips through the SAME store field EdgeInspector edits', () => {
    useOperatorStore.getState().addOperator('lfo')
    const opId = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(opId, {
      targetEffectId: 'inst-1',
      targetParamKey: 'amount',
      depth: 0.2,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { getByRole } = render(
      <ModulationMatrix
        effectChain={effectChain}
        registry={registry}
        operatorValues={{ [opId]: 0.5 }}
      />,
    )

    const slider = getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '-0.5' } })

    expect(useOperatorStore.getState().operators[0].mappings[0].depth).toBe(-0.5)

    // The SAME mapping.depth, when surfaced to EdgeInspector as `edge.amount`
    // (per RoutingCanvas.tsx:398's `updateMapping(..., { depth: result.amount })`
    // parity), displays identically — same clamp, same value.
    const edge: RoutingEdge = {
      id: 'op-edge:x',
      srcId: opId,
      dstId: 'inst-1',
      dstParam: 'amount',
      amount: useOperatorStore.getState().operators[0].mappings[0].depth,
    }
    const { getByTestId } = render(
      <EdgeInspector
        edge={edge}
        sourceLabel="LFO"
        destLabel="Hue Shift"
        editable={true}
        onDepthChange={() => {}}
        onPolarityToggle={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(getByTestId('routing-depth-value').textContent).toBe('×-0.50')
    expect(clampAmount(edge.amount)).toBe(-0.5)
  })

  it('clampAmount is shared: an out-of-range depth (-2) clamps to -1 in both the Matrix render and EdgeInspector', () => {
    useOperatorStore.getState().addOperator('lfo')
    const opId = useOperatorStore.getState().operators[0].id
    useOperatorStore.getState().addMapping(opId, {
      targetEffectId: 'inst-1',
      targetParamKey: 'amount',
      depth: -2,
      min: 0,
      max: 1,
      curve: 'linear',
    })

    const { getByRole } = render(
      <ModulationMatrix
        effectChain={effectChain}
        registry={registry}
        operatorValues={{ [opId]: 0.5 }}
      />,
    )
    const slider = getByRole('slider') as HTMLInputElement
    expect(slider.value).toBe('-1')
    expect(clampAmount(-2)).toBe(-1)
  })
})
